#!/usr/bin/env node

/**
 * GitHub Analyser — Developer Scorecard Generator
 *
 * Evaluates developers based on GitHub contributions and generates
 * a structured HTML scorecard report.
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseCliArgs } from './src/cli/parser.js';
import { loadConfig } from './src/cli/config.js';
import { initClient } from './src/github/client.js';
import { fetchRepoData, fetchCommitDetail } from './src/github/fetcher.js';
import { analyzeComplexity } from './src/analysis/complexity/index.js';
import { analyzeDuplication } from './src/analysis/duplication/index.js';
import { analyzeNPlusOne } from './src/analysis/nplusone/index.js';
import { analyzeReadability } from './src/analysis/readability/index.js';
import { analyzeSolid } from './src/analysis/solid/index.js';
import { analyzePRSize } from './src/analysis/pr-size/index.js';
import { analyzePRReview } from './src/analysis/pr-review/index.js';
import { analyzeMaintainability } from './src/analysis/maintainability/index.js';
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
  for (const repo of repos) {
    const [owner, repoName] = repo.split('/');
    try {
      const data = await fetchRepoData(owner, repoName, sinceDate);
      repoDataList.push(data);
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
  const contributorLogins = allLogins.filter((l) => !excludeSet.has(l.toLowerCase()));

  if (excluded.length > 0) {
    console.log(`  Excluded: ${excluded.join(', ')}`);
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

  for (const login of activeLogins) {
    const contrib = contributorMap[login];
    process.stdout.write(`  Analyzing ${login}...`);

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
      cyclomaticComplexity: analyzeComplexity(patches),
      nplusone: analyzeNPlusOne(patches),
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

    console.log(` raw score: ${finalScore}/100`);
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

  for (const repo of repoDataList) {
    const commitsByAuthor = {};

    for (const commit of repo.commits) {
      const login = commit.author;
      if (!login || login === 'unknown') continue;
      if (!commitsByAuthor[login]) commitsByAuthor[login] = [];
      commitsByAuthor[login].push(commit);
    }

    for (const [login, commits] of Object.entries(commitsByAuthor)) {
      const contributor = contributorMap[login];
      if (!contributor) continue;

      const hasPRPatches = contributor.patches.length > 0;
      if (hasPRPatches) continue;

      const commitsToFetch = commits.slice(0, 10);
      for (const commit of commitsToFetch) {
        commitFetchPromises.push(
          fetchCommitDetail(repo.owner, repo.repo, commit.sha).then((detail) => {
            if (detail?.files) {
              for (const file of detail.files) {
                contributor.patches.push(file);
              }
            }
          })
        );
      }
    }
  }

  const batchSize = 10;
  for (let i = 0; i < commitFetchPromises.length; i += batchSize) {
    const batch = commitFetchPromises.slice(i, i + batchSize);
    await Promise.allSettled(batch);
  }
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
