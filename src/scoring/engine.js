/**
 * Scoring Engine
 *
 * Aggregates individual metric scores into a final developer score.
 * Uses configurable weights that sum to 1.0.
 * Final score is scaled to 0-100.
 */

export const DEFAULT_WEIGHTS = {
  readability: 0.15,
  cyclomaticComplexity: 0.08,
  codeMaintainability: 0.16,
  solidPrinciples: 0.12,
  nplusone: 0.12,
  prSize: 0.08,
  prReview: 0.14,
  duplication: 0.15,
};

export const METRIC_LABELS = {
  readability: 'Code Readability',
  cyclomaticComplexity: 'Cyclomatic Complexity',
  codeMaintainability: 'Code Maintainability',
  solidPrinciples: 'SOLID Principles',
  nplusone: 'N+1 Query Detection',
  prSize: 'PR Size Discipline',
  prReview: 'PR Review Contribution',
  duplication: 'Duplicate Code',
};

export function calculateFinalScore(metricScores, weights = DEFAULT_WEIGHTS) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [metric, weight] of Object.entries(weights)) {
    const score = metricScores[metric]?.score ?? 5;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 5;
  const finalScore = normalizedScore * 10;

  return Math.round(finalScore * 10) / 10;
}

export function generateStrengths(metricScores) {
  const strengths = [];

  const sorted = Object.entries(metricScores)
    .filter(([key]) => METRIC_LABELS[key])
    .sort((a, b) => (b[1]?.score ?? 0) - (a[1]?.score ?? 0));

  for (const [key, data] of sorted) {
    if ((data?.score ?? 0) >= 7) {
      strengths.push({
        metric: METRIC_LABELS[key],
        score: data.score,
        description: getStrengthDescription(key, data),
      });
    }
  }

  return strengths.slice(0, 5);
}

export function generateImprovements(metricScores) {
  const improvements = [];

  const sorted = Object.entries(metricScores)
    .filter(([key]) => METRIC_LABELS[key])
    .sort((a, b) => (a[1]?.score ?? 10) - (b[1]?.score ?? 10));

  for (const [key, data] of sorted) {
    if ((data?.score ?? 10) < 7) {
      improvements.push({
        metric: METRIC_LABELS[key],
        score: data.score,
        suggestion: getImprovementSuggestion(key, data),
      });
    }
  }

  return improvements.slice(0, 5);
}

function getStrengthDescription(metric, data) {
  const descriptions = {
    readability: `Readable code with ${data.details?.commentDensity || 0} comment density.`,
    cyclomaticComplexity: `Low complexity with average ${data.details?.avgComplexity || 0} per function.`,
    codeMaintainability: `Well-structured code with MI of ${data.details?.maintainabilityIndex || 'N/A'} and good structural organization.`,
    solidPrinciples: `Good adherence to SOLID principles.`,
    nplusone: `No N+1 query patterns detected.`,
    prSize: `Well-sized PRs with median ${data.details?.medianChangesPerPR || 0} changes.`,
    prReview: `Strong reviewer — reviewed ${data.details?.prsReviewed || 0} PRs with ${data.details?.reviewComments || 0} comments.`,
    duplication: `Minimal code duplication (${data.details?.duplicationRatio || 0} ratio).`,
  };
  return descriptions[metric] || 'Good performance in this area.';
}

function getImprovementSuggestion(metric, data) {
  const suggestions = {
    readability: `Improve naming, reduce nesting depth (max: ${data.details?.maxNestingDepth || 0}), add comments.`,
    cyclomaticComplexity: `Reduce function complexity (avg: ${data.details?.avgComplexity || 0}). Break complex logic into smaller functions.`,
    codeMaintainability: `Reduce file sizes, add documentation, and improve code organization with clear abstractions.`,
    solidPrinciples: `Address ${data.details?.srpViolations || 0} SRP violations. Reduce class/module responsibilities.`,
    nplusone: `Fix ${data.details?.totalViolations || 0} potential N+1 query patterns. Use eager loading or batching.`,
    prSize: `Break down large PRs (median: ${data.details?.medianChangesPerPR || 0} changes) into smaller, focused ones.`,
    prReview: `Review more PRs (${data.details?.prsReviewed || 0}/${data.details?.totalPRs || '?'}) and add more comments (${data.details?.reviewComments || 0} given, expect 1 per 50 lines).`,
    duplication: `Reduce code duplication (${data.details?.duplicateBlocks || 0} blocks found). Extract shared logic.`,
  };
  return suggestions[metric] || 'Focus on improving this metric.';
}

export function getGrade(score) {
  if (score >= 90) return { grade: 'A+', color: '#10b981' };
  if (score >= 80) return { grade: 'A', color: '#34d399' };
  if (score >= 70) return { grade: 'B', color: '#60a5fa' };
  if (score >= 60) return { grade: 'C', color: '#fbbf24' };
  if (score >= 50) return { grade: 'D', color: '#f97316' };
  return { grade: 'F', color: '#ef4444' };
}
