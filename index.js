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
import { initClient } from './src/github/client.js';
import { fetchRepoData, fetchCommitDetail } from './src/github/fetcher.js';
import { analyzeCodeQuality } from './src/analysis/quality/index.js';
import { analyzeComplexity } from './src/analysis/complexity/index.js';
import { analyzeDuplication } from './src/analysis/duplication/index.js';
import { analyzeNPlusOne } from './src/analysis/nplusone/index.js';
import { analyzeReadability } from './src/analysis/readability/index.js';
import { analyzeSolid } from './src/analysis/solid/index.js';
import { analyzeCopilotDependency } from './src/analysis/copilot/index.js';
import { analyzePRSize } from './src/analysis/pr-size/index.js';
import { analyzePRReview } from './src/analysis/pr-review/index.js';
import { analyzeMaintainability } from './src/analysis/maintainability/index.js';
import { analyzeStructural } from './src/analysis/structural/index.js';
import {
  calculateFinalScore,
  generateStrengths,
  generateImprovements,
} from './src/scoring/engine.js';
import { generateHTMLReport } from './src/report/generator.js';

async function main() {
  const startTime = Date.now();

  const args = parseCliArgs();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     GitHub Analyser — Scorecard Tool      ║');
  console.log('╚══════════════════════════════════════════╝\n');
  const { repos, days, output, token } = args;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  console.log(`Configuration:`);
  console.log(`  Repos: ${repos.join(', ')}`);
  console.log(`  Days:  ${days} (since ${sinceDate.toISOString().split('T')[0]})`);
  console.log(`  Output: ${output}\n`);

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
  const contributorMap = buildContributorMap(repoDataList);
  const contributorLogins = Object.keys(contributorMap);
  console.log(`  Found ${contributorLogins.length} unique contributors\n`);

  if (contributorLogins.length === 0) {
    console.error('No contributors found in the specified time range. Exiting.');
    process.exit(1);
  }

  console.log('🔍 Fetching commit details for analysis...\n');
  await enrichContributorPatches(contributorMap, repoDataList);

  console.log('📊 Analyzing contributions...\n');
  const developerScores = [];

  for (const login of contributorLogins) {
    const contrib = contributorMap[login];
    process.stdout.write(`  Analyzing ${login}...`);

    const patches = contrib.patches || [];
    const commits = contrib.commits || [];
    const pullRequests = contrib.authoredPRs || [];
    const reviewComments = contrib.reviewComments || [];

    const metrics = {
      codeQuality: analyzeCodeQuality(patches),
      codeMaintainability: analyzeMaintainability(patches),
      prReview: analyzePRReview(reviewComments, contrib.reviewedPRs || []),
      duplication: analyzeDuplication(patches),
      copilotDependency: analyzeCopilotDependency(commits, pullRequests, patches),
      prSize: analyzePRSize(pullRequests),
      solidPrinciples: analyzeSolid(patches),
      readability: analyzeReadability(patches),
      structuralMaintainability: analyzeStructural(patches),
      cyclomaticComplexity: analyzeComplexity(patches),
      nplusone: analyzeNPlusOne(patches),
    };

    const finalScore = calculateFinalScore(metrics);
    const strengths = generateStrengths(metrics);
    const improvements = generateImprovements(metrics);

    developerScores.push({
      login,
      avatar: contrib.avatar,
      finalScore,
      metrics,
      strengths,
      improvements,
      stats: {
        commits: commits.length,
        prsAuthored: pullRequests.length,
        reviewCommentsGiven: reviewComments.length,
        linesAdded: patches.reduce((sum, p) => sum + (p.additions || 0), 0),
      },
    });

    console.log(` score: ${finalScore}/100`);
  }

  console.log('\n📝 Generating HTML report...\n');

  const reportData = {
    repos,
    days,
    sinceDate: sinceDate.toISOString(),
    generatedAt: new Date().toISOString(),
    developers: developerScores,
  };

  const html = generateHTMLReport(reportData);
  const outputPath = resolve(process.cwd(), output);
  await writeFile(outputPath, html, 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`✅ Report generated successfully!`);
  console.log(`   File: ${outputPath}`);
  console.log(`   Contributors: ${developerScores.length}`);
  console.log(`   Time: ${elapsed}s\n`);
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

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
