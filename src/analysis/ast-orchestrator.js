import { aggregateDeveloperCommits } from './contribution/index.js';
import { fetchFileAtCommit, fetchLocalFileAtCommit } from '../github/fetcher.js';
import { getAST, doesIntersect } from './ast-parser.js';
import { detectNPlusOneQueries } from './nplusone/index.js';
import { analyzeComplexity, calculateNodeComplexity, calculateDeltaComplexity } from './complexity/index.js';

export async function runASTAnalysisForDeveloper(login, commits, patches, localReposMap = new Map()) {
    const devGroups = aggregateDeveloperCommits(commits);
    const commitGroups = devGroups[login] || [];

    let totalAddedComplexity = 0;
    let totalNPlusOneViolations = 0;
    let totalLinesEvaluated = 0;

    const nPlusOneEvidence = [];

    for (const group of commitGroups) {
        const { owner, repo, filename, baseSha, headSha, modifiedLines } = group;
        const localPath = localReposMap.get(`${owner}/${repo}`);

        try {
            // 1. Fetch File Content at Head & Base
            let headContent;
            if (localPath) {
                headContent = await fetchLocalFileAtCommit(localPath, headSha, filename);
            } else {
                headContent = await fetchFileAtCommit(owner, repo, filename, headSha);
            }
            if (!headContent) continue; // File might have been deleted

            let baseContent = '';
            if (baseSha) {
                try {
                    if (localPath) {
                        baseContent = await fetchLocalFileAtCommit(localPath, baseSha, filename);
                    } else {
                        baseContent = await fetchFileAtCommit(owner, repo, filename, baseSha);
                    }
                } catch (e) {
                    // Base file might not exist (newly created file)
                }
            }

            // 2. Parse ASTs
            const headAstKey = `${headSha}_${filename}`;
            const baseAstKey = baseSha ? `${baseSha}_${filename}` : null;

            const headAst = await getAST(headContent, filename, headAstKey);
            let baseAst = null;
            if (baseContent && baseAstKey) {
                baseAst = await getAST(baseContent, filename, baseAstKey);
            }

            if (!headAst) continue;

            totalLinesEvaluated += modifiedLines.length;

            // 3. Complexity Delta Analysis
            let fileDeltaComplexity = 0;
            if (baseAst) {
                fileDeltaComplexity = calculateDeltaComplexity(baseAst, headAst, modifiedLines);
            } else {
                // If it's a completely new file, all of its complexity is "added" by this dev
                fileDeltaComplexity = calculateNodeComplexity(headAst).decisionPoints;
            }

            // If they made the code WORSE (delta > 0), penalize them.
            // If they made it BETTER (delta < 0), they get a bonus (we subtract from total penalty).
            // We sum this across all files.
            // Wait, what if they reduce 10 points in one file but add 50 in another?
            // Their net is +40 tech debt. 
            totalAddedComplexity += fileDeltaComplexity;

            // 4. N+1 Query Analysis — Delta-based attribution
            // Detect violations in BOTH base and head ASTs so we only attribute
            // violations the developer actually INTRODUCED (not pre-existing ones).
            const headViolations = detectNPlusOneQueries(headAst);
            const baseViolations = baseAst ? detectNPlusOneQueries(baseAst) : [];

            for (const violation of headViolations) {
                const mockNode = {
                    startPosition: { row: violation.startLine - 1 },
                    endPosition: { row: violation.endLine - 1 }
                };

                if (doesIntersect(mockNode, modifiedLines)) {
                    // Check if this violation already existed in the base commit.
                    // If it did, this developer did NOT introduce it — skip.
                    const existedInBase = baseViolations.some(bv =>
                        bv.startLine === violation.startLine &&
                        bv.endLine === violation.endLine &&
                        bv.issue === violation.issue
                    );

                    if (!existedInBase) {
                        totalNPlusOneViolations++;
                        nPlusOneEvidence.push({
                            file: filename,
                            repo: `${owner}/${repo}`,
                            line: violation.startLine,
                            snippet: violation.snippet,
                            issue: violation.issue
                        });
                    }
                }
            }

            // Credit: detect N+1 violations that existed in base but were FIXED in head.
            // If the developer removed an N+1 pattern, reward them.
            for (const baseViolation of baseViolations) {
                const baseMock = {
                    startPosition: { row: baseViolation.startLine - 1 },
                    endPosition: { row: baseViolation.endLine - 1 }
                };

                if (doesIntersect(baseMock, modifiedLines)) {
                    const stillExistsInHead = headViolations.some(hv =>
                        hv.startLine === baseViolation.startLine &&
                        hv.endLine === baseViolation.endLine &&
                        hv.issue === baseViolation.issue
                    );

                    if (!stillExistsInHead) {
                        // Developer fixed an N+1 pattern — give credit
                        totalNPlusOneViolations--;
                        nPlusOneEvidence.push({
                            file: filename,
                            repo: `${owner}/${repo}`,
                            line: baseViolation.startLine,
                            snippet: baseViolation.snippet,
                            issue: 'n-plus-one-fix'
                        });
                    }
                }
            }

        } catch (err) {
            console.error(`Failed to analyze ${filename} for ${login} at head ${headSha}: ${err.message}`);
            if (process.env.DEBUG) console.error(err.stack);
        }
    }

    // Diagnostic logging for empty AST evaluations
    if (totalLinesEvaluated === 0 && commitGroups.length > 0) {
        console.warn(`  ⚠ ${login}: ${commitGroups.length} commit groups but 0 lines evaluated (AST pipeline found no parseable files)`);
    } else if (commitGroups.length === 0 && commits.length > 0) {
        const withFiles = commits.filter((c) => c.files && c.files.length > 0).length;
        console.warn(`  ⚠ ${login}: No commit groups found. ${withFiles}/${commits.length} commits have file data (check enrichContributorPatches)`);
    } else if (commitGroups.length === 0) {
        console.warn(`  ⚠ ${login}: No commit groups found (check enrichContributorPatches)`);
    }

    // Calculate 0-10 Scores for the generic metrics

    // -- Complexity Score (Delta Based) --
    // If net zero or negative, perfect score 10.
    // We'll scale penalty using log-based curve off of totalAddedComplexity per KLOC edited.
    let complexityScore = 10;
    if (totalAddedComplexity > 0) {
        // Use a minimum KLOC of 0.5 (500 lines) to prevent tiny diffs from producing
        // extreme per-KLOC rates that would immediately clamp the score to 0.
        const kloc = Math.max(totalLinesEvaluated / 1000, 0.5);
        const addedPerKLOC = totalAddedComplexity / kloc;

        // Log-based scaling: produces a gentler, more gradual curve.
        // ~5/KLOC → 8.5, ~10/KLOC → 7.3, ~20/KLOC → 5.7, ~50/KLOC → 3.5, ~100/KLOC → 0.9
        complexityScore = Math.max(0, 10 - Math.log2(1 + addedPerKLOC) * 1.5);
    }

    // Fallback: if AST pipeline found nothing useful (0 lines evaluated) but the developer
    // has patches, fall back to the regex-based complexity analyzer as a secondary signal.
    if (totalLinesEvaluated === 0 && patches && patches.length > 0) {
        const regexResult = analyzeComplexity(patches);
        complexityScore = regexResult.score;
        totalAddedComplexity = regexResult.details?.totalDecisionPoints || 0;
        console.warn(`  ℹ ${login}: Used regex fallback complexity score: ${complexityScore}`);
    }

    // -- N+1 Query Score --
    let nplusoneScore = 10;
    if (totalNPlusOneViolations > 0 && totalLinesEvaluated > 0) {
        const vPerKloc = (totalNPlusOneViolations / totalLinesEvaluated) * 1000;
        nplusoneScore = Math.max(0, 10 - (vPerKloc * 0.5));
    } else if (totalNPlusOneViolations > 0) {
        nplusoneScore = Math.max(0, 10 - totalNPlusOneViolations);
    }

    return {
        cyclomaticComplexity: {
            score: Math.round(complexityScore * 10) / 10,
            details: {
                addedComplexity: totalAddedComplexity,
                linesEvaluated: totalLinesEvaluated,
                evidence: totalAddedComplexity > 0 ? [{ file: 'Summary', issue: 'high-complexity', line: 0, snippet: `Net +${totalAddedComplexity} decision points added across commits.` }] : []
            }
        },
        nplusone: {
            score: Math.round(nplusoneScore * 10) / 10,
            details: {
                totalViolations: totalNPlusOneViolations,
                evidence: nPlusOneEvidence
            }
        }
    };
}

