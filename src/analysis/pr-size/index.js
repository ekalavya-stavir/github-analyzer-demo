/**
 * PR Size Discipline Analyzer
 *
 * Evaluates whether developers submit small, focused PRs.
 * Smaller incremental PRs score higher.
 * Extremely large PRs are penalized.
 *
 * Score: 0-10 (10 = small focused PRs)
 */

const SIZE_THRESHOLDS = {
  xs: 10,
  small: 100,
  medium: 300,
  large: 700,
  xl: 1500,
};

export function analyzePRSize(pullRequests) {
  if (!pullRequests || pullRequests.length === 0) {
    return { score: 5, details: { totalPRs: 0, note: 'No PRs found' } };
  }

  const prSizes = pullRequests.map((pr) => {
    const totalChanges = (pr.additions || 0) + (pr.deletions || 0);
    return {
      number: pr.number,
      title: pr.title,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      totalChanges,
      filesChanged: pr.changedFiles || (pr.files?.length || 0),
      category: categorizeSize(totalChanges),
    };
  });

  const avgChanges = prSizes.reduce((sum, pr) => sum + pr.totalChanges, 0) / prSizes.length;
  const medianChanges = median(prSizes.map((pr) => pr.totalChanges));
  const maxChanges = Math.max(...prSizes.map((pr) => pr.totalChanges));

  const distribution = {
    xs: prSizes.filter((pr) => pr.category === 'xs').length,
    small: prSizes.filter((pr) => pr.category === 'small').length,
    medium: prSizes.filter((pr) => pr.category === 'medium').length,
    large: prSizes.filter((pr) => pr.category === 'large').length,
    xl: prSizes.filter((pr) => pr.category === 'xl').length,
  };

  const xlRatio = distribution.xl / prSizes.length;
  const largeRatio = (distribution.xl + distribution.large) / prSizes.length;
  const smallRatio = (distribution.xs + distribution.small) / prSizes.length;

  let score;
  if (medianChanges <= SIZE_THRESHOLDS.small) {
    score = 10;
  } else if (medianChanges <= SIZE_THRESHOLDS.medium) {
    score = 8;
  } else if (medianChanges <= SIZE_THRESHOLDS.large) {
    score = 6;
  } else {
    score = 4;
  }

  if (xlRatio > 0.3) score -= 2;
  else if (xlRatio > 0.1) score -= 1;

  if (largeRatio > 0.5) score -= 1.5;
  else if (largeRatio > 0.3) score -= 0.5;

  if (smallRatio > 0.7) score += 1;
  else if (smallRatio > 0.5) score += 0.5;

  score = Math.max(1, Math.min(10, score));

  return {
    score: Math.round(score * 10) / 10,
    details: {
      totalPRs: prSizes.length,
      avgChangesPerPR: Math.round(avgChanges),
      medianChangesPerPR: Math.round(medianChanges),
      maxChangesInPR: maxChanges,
      distribution,
      largestPRs: prSizes
        .sort((a, b) => b.totalChanges - a.totalChanges)
        .slice(0, 3)
        .map((pr) => ({
          number: pr.number,
          title: pr.title?.substring(0, 60),
          changes: pr.totalChanges,
        })),
      evidence: prSizes
        .sort((a, b) => b.totalChanges - a.totalChanges)
        .slice(0, 15)
        .map((pr) => ({
          file: `PR #${pr.number}`,
          line: 0,
          snippet: `${pr.title?.substring(0, 80)} — +${pr.additions}/-${pr.deletions} (${pr.category})`,
          issue: pr.category === 'xl' ? 'xl-pr' : pr.category === 'large' ? 'large-pr' : `${pr.category}-pr`,
        })),
    },
  };
}

function categorizeSize(changes) {
  if (changes <= SIZE_THRESHOLDS.xs) return 'xs';
  if (changes <= SIZE_THRESHOLDS.small) return 'small';
  if (changes <= SIZE_THRESHOLDS.medium) return 'medium';
  if (changes <= SIZE_THRESHOLDS.large) return 'large';
  return 'xl';
}

function median(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
