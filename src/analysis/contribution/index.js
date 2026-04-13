/**
 * Contributor Score Analyzer (Bucket-based)
 *
 * Scoring method:
 *   1. Calculate total lines of code changed (additions + deletions) per developer
 *   2. Find min and max contributions across all developers
 *   3. Create 10 equal-width buckets from min to max
 *   4. Place each developer into a bucket: bucket 1 = least code, bucket 10 = most code
 *   5. The bucket number IS the score (1-10)
 *
 * Evidence shows: lines added + lines changed (deletions) by developer vs team totals
 *
 * Score: 1-10 (10 = highest contributor)
 */

/**
 * Pre-computes bucket boundaries from all developers' line counts.
 * Call once before scoring individual developers.
 *
 * @param {Record<string, number>} linesPerDev - map of login -> total lines (added + changed)
 * @returns {{ min, max, bucketWidth, totalLines, devCount }}
 */
export function computeContributionBuckets(linesPerDev) {
  const entries = Object.entries(linesPerDev);
  const devCount = entries.length;

  if (devCount === 0) {
    return { min: 0, max: 0, bucketWidth: 0, totalLines: 0, devCount: 0 };
  }

  const values = entries.map(([, v]) => v);
  const totalLines = values.reduce((sum, v) => sum + v, 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bucketWidth = max > min ? (max - min) / 10 : 0;

  return { min, max, bucketWidth, totalLines, devCount };
}

/**
 * Scores a single developer based on pre-computed bucket boundaries.
 *
 * @param {{ added: number, changed: number, total: number, commitCount?: number, totalLinesCommitted?: number, avgCommitSize?: number }} developerData
 * @param {{ min, max, bucketWidth, totalLines, devCount }} bucketStats
 */
export function analyzeContribution(developerData, bucketStats) {
  const { added, changed, total, commitCount = 0, totalLinesCommitted = 0, avgCommitSize = 0 } = developerData;
  const { min, max, bucketWidth, totalLines, devCount } = bucketStats;

  if (devCount === 0 || totalLines === 0) {
    return {
      score: 5,
      details: {
        added: 0,
        changed: 0,
        total: 0,
        bucket: 0,
        evidence: [{
          file: 'Summary', line: 0,
          snippet: 'No contribution data available',
          issue: 'no-data',
        }],
      },
    };
  }

  let bucket;
  if (bucketWidth === 0) {
    bucket = 5;
  } else {
    bucket = Math.floor((total - min) / bucketWidth) + 1;
    bucket = Math.max(1, Math.min(10, bucket));
  }

  const score = bucket;
  const percentage = Math.round((total / totalLines) * 1000) / 10;

  const bucketLo = Math.round(min + bucketWidth * (bucket - 1));
  const bucketHi = bucket < 10 ? Math.round(min + bucketWidth * bucket - 1) : Math.round(max);

  return {
    score,
    details: {
      added,
      changed,
      total,
      totalLines,
      devCount,
      min,
      max,
      bucket,
      bucketWidth: Math.round(bucketWidth),
      percentage,
      commitCount,
      totalLinesCommitted,
      avgCommitSize,
      evidence: [
        {
          file: 'Lines Added', line: 0,
          snippet: 'This developer: +' + added + ' lines added | Team total: +' + totalLines + ' lines',
          issue: 'overview',
        },
        {
          file: 'Lines Changed', line: 0,
          snippet: 'This developer: ~' + changed + ' lines changed (deleted/modified) | Total (added + changed): ' + total,
          issue: 'overview',
        },
        {
          file: 'Contribution Volume', line: 0,
          snippet: commitCount + ' commits | ' + totalLinesCommitted + ' total lines committed | Avg ' + avgCommitSize + ' lines/commit',
          issue: 'volume',
        },
        {
          file: 'Contribution Share', line: 0,
          snippet: total + ' / ' + totalLines + ' total lines (' + percentage + '%) across ' + devCount + ' developers',
          issue: percentage >= (100 / devCount) ? 'above-average' : 'below-average',
        },
        {
          file: 'Bucket Placement', line: 0,
          snippet: 'Bucket ' + bucket + '/10 (range: ' + bucketLo + '-' + bucketHi + ' lines) | Min: ' + min + ', Max: ' + max + ', Width: ' + Math.round(bucketWidth) + '/bucket',
          issue: bucket >= 7 ? 'high-contributor' : bucket >= 4 ? 'mid-contributor' : 'low-contributor',
        },
      ],
    },
  };
}

/**
 * Aggregates back-to-back commits by the same developer into groups exactly
 * as defined in the AST Algorithm Phase 1 Optimization.
 *
 * @param {Array<{sha, parentSha, author, date, files: Array<{filename, addedLines}>}>} commits 
 * @returns {Record<string, Array<{file, headSha, baseSha, unionModifiedLines}>>}
 */
export function aggregateDeveloperCommits(commits) {
  // Sort chronologically just in case
  const sorted = [...commits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const devGroups = {};

  for (const commit of sorted) {
    const author = commit.author;
    if (!devGroups[author]) {
      devGroups[author] = [];
    }

    // Extract owner/repo from the commit's repo field (e.g. "owner/repoName")
    let owner = '';
    let repo = '';
    if (commit.repo) {
      const parts = commit.repo.split('/');
      owner = parts[0] || '';
      repo = parts.slice(1).join('/') || '';
    }

    for (const file of commit.files || []) {
      const existingGroup = devGroups[author].find(g => g.filename === file.filename && g.headSha === commit.parentSha);

      if (existingGroup) {
        // Continuous edit on the same file! Update the head and union the lines.
        existingGroup.headSha = commit.sha;
        const unionSet = new Set([...existingGroup.modifiedLines, ...file.addedLines]);
        existingGroup.modifiedLines = Array.from(unionSet).sort((a, b) => a - b);
      } else {
        // Broken chain or new file, start a new group
        devGroups[author].push({
          owner,
          repo,
          filename: file.filename,
          baseSha: commit.parentSha,
          headSha: commit.sha,
          modifiedLines: [...file.addedLines].sort((a, b) => a - b)
        });
      }
    }
  }

  return devGroups;
}
