#!/usr/bin/env node

/**
 * GitHub Analyser — Developer Scorecard Generator
 *
 * Evaluates developers based on GitHub contributions and generates
 * a structured HTML scorecard report.
 */

import { writeFile, mkdtemp, rm as rmAsync } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseCliArgs } from './src/cli/parser.js';
import { loadConfig } from './src/cli/config.js';
import { initClient } from './src/github/client.js';
import { fetchRepoData, fetchCommitDetail, cloneRepository } from './src/github/fetcher.js';
import { runASTAnalysisForDeveloper } from './src/analysis/ast-orchestrator.js';
import { analyzeDuplication } from './src/analysis/duplication/index.js';
import { analyzeReadability } from './src/analysis/readability/index.js';
import { analyzeSolid } from './src/analysis/solid/index.js';
import { analyzePRSize } from './src/analysis/pr-size/index.js';
import { analyzePRReview } from './src/analysis/pr-review/index.js';
import { analyzeMaintainability } from './src/analysis/maintainability/index.js';
import { extractModifiedLineNumbers } from './src/analysis/diff-utils.js';
import { analyzeContribution, computeContributionBuckets } from './src/analysis/contribution/index.js';
import {
  calculateFinalScore,
  generateStrengths,
  generateImprovements,
  applyBayesianSmoothing,
} from './src/scoring/engine.js';
import { generateHTMLReport } from './src/report/generator.js';

async function main() {
  const startTime = Date.now();

  const args = parseCliArgs();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     GitHub Analyser — Scorecard Tool      ║');
  console.log('╚══════════════════════════════════════════╝\n');
  const { repos, days, output, exclude, token } = args;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  console.log(`Configuration:`);
  console.log(`  Repos: ${repos.join(', ')}`);
  console.log(`  Days:  ${days} (since ${sinceDate.toISOString().split('T')[0]})`);
  console.log(`  Output: ${output || '(auto-generated)'}\n`);

  initClient(token);

  console.log('📡 Fetching repository data...\n');

  const repoDataList = [];
  const localReposMap = new Map();
  const cleanupDirs = [];

  const cleanup = async () => {
    if (cleanupDirs.length > 0) process.stdout.write('\n🧹 Cleaning up temporary checkout directories... ');
    for (const dir of cleanupDirs) {
      try { await rmAsync(dir, { recursive: true, force: true }); } catch (e) { }
    }
    if (cleanupDirs.length > 0) console.log('Done.');
  };
  process.on('SIGINT', async () => { await cleanup(); process.exit(1); });

  for (const repo of repos) {
    const [owner, repoName] = repo.split('/');
    try {
      const data = await fetchRepoData(owner, repoName, sinceDate);
      repoDataList.push(data);

      const tempDir = await mkdtemp(join(tmpdir(), `github-analyser-${repoName}-`));
      cleanupDirs.push(tempDir);
      await cloneRepository(owner, repoName, token, tempDir);
      localReposMap.set(repo, tempDir);
    } catch (err) {
      console.error(`  Error fetching ${repo}: ${err.message}`);
      if (err.status === 404) {
        console.error(`  Repository not found or no access. Check the name and token permissions.`);
      }
    }
  }

  if (repoDataList.length === 0) {
    console.error('\nNo repository data retrieved. Exiting.');
    process.exit(1);
  }

  console.log('\n👥 Identifying contributors...\n');
  const config = loadConfig();
  const excludeSet = new Set([
    ...config.exclude_users.map((u) => u.toLowerCase()),
    ...exclude.map((u) => u.toLowerCase()),
  ]);

  const contributorMap = buildContributorMap(repoDataList);
  const allLogins = Object.keys(contributorMap);
  const excluded = allLogins.filter((l) => excludeSet.has(l.toLowerCase()));

  // Filter out developers who have no commits within the actual reporting window.
  // Multiple paths can pull in stale developers:
  //   1. GitHub commits API `since` filters by committer date, not author date.
  //      Rebased/squash-merged old commits get new committer timestamps, so the API
  //      returns them even though the author date is months/years old.
  //   2. PRs are fetched if updated_at >= sinceDate. An old PR getting a new comment
  //      or label pulls in the original PR author with all their file patches.
  //   3. PR reviewers/commenters on old PRs are also pulled in.
  // Fix: verify each developer has at least one commit with an author date >= sinceDate.
  const hasRecentCommit = (login) => {
    const commits = contributorMap[login].commits || [];
    return commits.some((c) => {
      if (!c.date) return false;
      return new Date(c.date) >= sinceDate;
    });
  };

  const staleLogins = allLogins.filter((l) =>
    !excludeSet.has(l.toLowerCase()) && !hasRecentCommit(l)
  );
  const contributorLogins = allLogins.filter((l) =>
    !excludeSet.has(l.toLowerCase()) && hasRecentCommit(l)
  );

  if (excluded.length > 0) {
    console.log(`  Excluded: ${excluded.join(', ')}`);
  }
  if (staleLogins.length > 0) {
    console.log(`  Filtered out ${staleLogins.length} developer(s) with no commits in the reporting window: ${staleLogins.join(', ')}`);
  }
  console.log(`  Found ${contributorLogins.length} unique contributors\n`);

  if (contributorLogins.length === 0) {
    console.error('No contributors found in the specified time range. Exiting.');
    process.exit(1);
  }

  console.log('🔍 Fetching commit details for analysis...\n');
  await enrichContributorPatches(contributorMap, repoDataList);

  console.log('📊 Analyzing contributions...\n');

  const baseStats = computeBaseStats(repoDataList, contributorLogins.length);
  console.log(`  Base stats: ${baseStats.totalPRs} PRs, ${baseStats.totalLinesChanged} lines changed, ${baseStats.totalDevelopers} developers\n`);

  const devContribData = {};
  for (const login of contributorLogins) {
    const patches = contributorMap[login].patches || [];
    let added = 0;
    let changed = 0;
    for (const p of patches) {
      const apiAdded = p.additions ?? 0;
      const apiDeleted = p.deletions ?? 0;
      const apiChanges = p.changes ?? 0;
      const { added: parsedAdded, deleted: parsedDeleted } = countLinesFromPatch(p.patch);
      if (apiAdded > 0 || apiDeleted > 0) {
        added += apiAdded;
        changed += apiDeleted;
      } else if (apiChanges > 0) {
        added += Math.ceil(apiChanges / 2);
        changed += Math.floor(apiChanges / 2);
      } else if (parsedAdded > 0 || parsedDeleted > 0) {
        added += parsedAdded;
        changed += parsedDeleted;
      }
    }
    devContribData[login] = { added, changed, total: added + changed };
  }
  const linesPerDev = Object.fromEntries(Object.entries(devContribData).map(([k, v]) => [k, v.total]));
  const contributionBuckets = computeContributionBuckets(linesPerDev);
  console.log(`  Contribution buckets: min=${contributionBuckets.min}, max=${contributionBuckets.max}, width=${Math.round(contributionBuckets.bucketWidth)} lines/bucket\n`);

  const activeLogins = contributorLogins.filter((login) => (devContribData[login]?.total || 0) > 0);
  const reviewOnlyLogins = contributorLogins.filter((login) => (devContribData[login]?.total || 0) === 0);

  if (reviewOnlyLogins.length > 0) {
    console.log(`  ${activeLogins.length} active contributors, ${reviewOnlyLogins.length} review-only (no code changes)\n`);
  }

  const developerScores = [];
  const CONCURRENCY_LIMIT = 2;

  for (let i = 0; i < activeLogins.length; i += CONCURRENCY_LIMIT) {
    const batchLogins = activeLogins.slice(i, i + CONCURRENCY_LIMIT);

    await Promise.all(batchLogins.map(async (login) => {
      const contrib = contributorMap[login];
      console.log(`  🔍 Analyzing ${login} concurrently...`);

      const patches = contrib.patches || [];
      const commits = contrib.commits || [];
      const pullRequests = contrib.authoredPRs || [];

      const reviewedPRs = contrib.reviewedPRs || [];
      const prsReviewed = new Set(reviewedPRs.map((pr) => pr.number)).size;
      const reviewComments = (contrib.reviewComments || []).length;
      const reviewedPRsLinesChanged = reviewedPRs.reduce(
        (sum, pr) => sum + (pr.additions || 0) + (pr.deletions || 0),
        0
      );

      const devContrib = devContribData[login] || { added: 0, changed: 0, total: 0 };

      const astMetrics = await runASTAnalysisForDeveloper(login, commits, patches, localReposMap);

      const metrics = {
        codeMaintainability: analyzeMaintainability(patches),
        prReview: analyzePRReview(
          { prsReviewed, reviewComments, reviewedPRsLinesChanged },
          baseStats
        ),
        duplication: analyzeDuplication(patches),
        prSize: analyzePRSize(pullRequests),
        solidPrinciples: analyzeSolid(patches),
        readability: analyzeReadability(patches),
        cyclomaticComplexity: astMetrics.cyclomaticComplexity,
        nplusone: astMetrics.nplusone,
        contribution: analyzeContribution(devContrib, contributionBuckets),
      };

      const finalScore = calculateFinalScore(metrics);
      const strengths = generateStrengths(metrics);
      const improvements = generateImprovements(metrics);

      developerScores.push({
        login,
        avatar: contrib.avatar,
        finalScore,
        contributionSize: devContrib.total,
        metrics,
        strengths,
        improvements,
        stats: {
          commits: commits.length,
          prsAuthored: pullRequests.length,
          reviewCommentsGiven: reviewComments,
          linesAdded: devContrib.added,
        },
      });

      console.log(`  ✅ ${login} complete: raw score ${finalScore}/100`);
    }));
  }

  const smoothedScores = applyBayesianSmoothing(developerScores);
  for (const dev of smoothedScores) {
    if (dev.rawScore !== dev.finalScore) {
      console.log(`  ${dev.login}: ${dev.rawScore} → ${dev.finalScore} (Bayesian adjusted)`);
    }
  }

  const reviewOnlyScores = [];

  for (const login of reviewOnlyLogins) {
    const contrib = contributorMap[login];
    process.stdout.write(`  Analyzing ${login} (review-only)...`);

    const reviewedPRs = contrib.reviewedPRs || [];
    const prsReviewed = new Set(reviewedPRs.map((pr) => pr.number)).size;
    const reviewComments = (contrib.reviewComments || []).length;
    const reviewedPRsLinesChanged = reviewedPRs.reduce(
      (sum, pr) => sum + (pr.additions || 0) + (pr.deletions || 0),
      0
    );

    const prReview = analyzePRReview(
      { prsReviewed, reviewComments, reviewedPRsLinesChanged },
      baseStats
    );

    reviewOnlyScores.push({
      login,
      avatar: contrib.avatar,
      prReview,
      stats: {
        prsReviewed,
        reviewComments,
      },
    });

    console.log(` PR review: ${prReview.score}/10`);
  }

  console.log('\n📝 Generating HTML report...\n');

  const reportData = {
    repos,
    days,
    sinceDate: sinceDate.toISOString(),
    generatedAt: new Date().toISOString(),
    developers: smoothedScores,
    reviewOnlyDevelopers: reviewOnlyScores,
  };

  const html = generateHTMLReport(reportData);
  const resolvedOutput = output || generateOutputFilename(repos, days);
  const outputPath = resolve(process.cwd(), resolvedOutput);
  await writeFile(outputPath, html, 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`✅ Report generated successfully!`);
  console.log(`   File: ${outputPath}`);
  console.log(`   Contributors: ${smoothedScores.length} active, ${reviewOnlyScores.length} review-only`);
  console.log(`   Time: ${elapsed}s\n`);
  await cleanup();
}

function countLinesFromPatch(patch) {
  if (!patch || typeof patch !== 'string') return { added: 0, deleted: 0 };
  let added = 0;
  let deleted = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) deleted++;
  }
  return { added, deleted };
}

function computeBaseStats(repoDataList, totalDevelopers) {
  let totalPRs = 0;
  let totalLinesChanged = 0;

  for (const repo of repoDataList) {
    for (const pr of repo.pullRequests) {
      totalPRs++;
      totalLinesChanged += (pr.additions || 0) + (pr.deletions || 0);
    }
  }

  return { totalPRs, totalLinesChanged, totalDevelopers };
}

function buildContributorMap(repoDataList) {
  const map = {};

  for (const repo of repoDataList) {
    for (const commit of repo.commits) {
      const login = commit.author;
      if (!login || login === 'unknown') continue;
      if (!map[login]) {
        map[login] = {
          avatar: commit.authorAvatar || '',
          commits: [],
          authoredPRs: [],
          reviewedPRs: [],
          reviewComments: [],
          patches: [],
        };
      }
      map[login].commits.push({ ...commit, repo: `${repo.owner}/${repo.repo}` });
    }

    for (const pr of repo.pullRequests) {
      const author = pr.author;
      if (author && author !== 'unknown') {
        if (!map[author]) {
          map[author] = {
            avatar: pr.authorAvatar || '',
            commits: [],
            authoredPRs: [],
            reviewedPRs: [],
            reviewComments: [],
            patches: [],
          };
        }
        map[author].authoredPRs.push(pr);

        if (pr.files) {
          for (const file of pr.files) {
            map[author].patches.push(file);
          }
        }
      }

      for (const review of (pr.reviews || [])) {
        const reviewer = review.user;
        if (reviewer && reviewer !== 'unknown' && reviewer !== author) {
          if (!map[reviewer]) {
            map[reviewer] = {
              avatar: '',
              commits: [],
              authoredPRs: [],
              reviewedPRs: [],
              reviewComments: [],
              patches: [],
            };
          }
          map[reviewer].reviewedPRs.push(pr);
        }
      }

      for (const comment of (pr.reviewComments || [])) {
        const commenter = comment.user;
        if (commenter && commenter !== 'unknown') {
          if (!map[commenter]) {
            map[commenter] = {
              avatar: '',
              commits: [],
              authoredPRs: [],
              reviewedPRs: [],
              reviewComments: [],
              patches: [],
            };
          }
          map[commenter].reviewComments.push(comment);
        }
      }
    }
  }

  return map;
}

async function enrichContributorPatches(contributorMap, repoDataList) {
  const commitFetchPromises = [];

  // Build a lookup of owner/repo from the repo data list
  const repoLookup = {};
  for (const repo of repoDataList) {
    repoLookup[`${repo.owner}/${repo.repo}`] = { owner: repo.owner, repo: repo.repo };
  }

  let enrichedCount = 0;
  let failedCount = 0;
  let deduplicatedCount = 0;

  // Iterate over the contributorMap commits (the copies we actually pass to the AST pipeline)
  for (const [login, contributor] of Object.entries(contributorMap)) {
    const commitsToFetch = contributor.commits.slice(0, 10);

    // Build a deduplication set from any PR-level patches already in the array.
    // Key: "filename|patch_content" — if a commit-level patch matches an existing
    // PR-level patch, we skip it to avoid counting the same code change twice.
    const existingPatchKeys = new Set(
      contributor.patches.map((p) => `${p.filename}|${simplePatchHash(p.patch)}`)
    );

    for (const commit of commitsToFetch) {
      const repoInfo = repoLookup[commit.repo];
      if (!repoInfo) continue;

      commitFetchPromises.push(
        fetchCommitDetail(repoInfo.owner, repoInfo.repo, commit.sha).then((detail) => {
          if (detail?.files) {
            commit.parentSha = detail.parentSha || '';
            commit.files = detail.files.map((f) => ({
              filename: f.filename,
              addedLines: extractModifiedLineNumbers(f.patch)
            }));
            // Deduplicate: only add commit-level patches that don't duplicate
            // existing PR-level patches (same filename + same patch content).
            for (const file of detail.files) {
              const key = `${file.filename}|${simplePatchHash(file.patch)}`;
              if (!existingPatchKeys.has(key)) {
                contributor.patches.push(file);
                existingPatchKeys.add(key);
              } else {
                deduplicatedCount++;
              }
            }
            enrichedCount++;
          } else {
            failedCount++;
            if (process.env.DEBUG) {
              console.warn(`    ⚠ fetchCommitDetail returned null for ${commit.sha.substring(0, 7)} (${login})`);
            }
          }
        }).catch((err) => {
          failedCount++;
          if (process.env.DEBUG) {
            console.warn(`    ⚠ fetchCommitDetail failed for ${commit.sha.substring(0, 7)} (${login}): ${err.message}`);
          }
        })
      );
    }
  }

  const batchSize = 10;
  for (let i = 0; i < commitFetchPromises.length; i += batchSize) {
    const batch = commitFetchPromises.slice(i, i + batchSize);
    await Promise.allSettled(batch);
  }

  if (failedCount > 0 || deduplicatedCount > 0) {
    console.warn(`  ⚠ Commit enrichment: ${enrichedCount} succeeded, ${failedCount} failed, ${deduplicatedCount} duplicate patches skipped`);
  }

  // Debug: log how many commits per developer have file data populated
  if (process.env.DEBUG) {
    for (const [login, contributor] of Object.entries(contributorMap)) {
      const withFiles = contributor.commits.filter((c) => c.files && c.files.length > 0).length;
      const total = contributor.commits.length;
      if (withFiles === 0 && total > 0) {
        console.warn(`  ⚠ ${login}: ${total} commits but none have file data (enrichment may have failed)`);
      } else {
        console.log(`  ${login}: ${withFiles}/${total} commits enriched with file data`);
      }
    }
  }
}

/**
 * Simple hash for patch content deduplication.
 * Used to detect when the same file change appears in both PR-level and commit-level patches.
 */
function simplePatchHash(patch) {
  if (!patch || typeof patch !== 'string') return '';
  let hash = 0;
  for (let i = 0; i < patch.length; i++) {
    const char = patch.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function generateOutputFilename(repos, days) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}:${pad(now.getDate())}:${pad(now.getMonth() + 1)}:${pad(now.getHours())}:${pad(now.getSeconds())}`;
  return `developer-report-${days}days-${ts}.html`;
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
