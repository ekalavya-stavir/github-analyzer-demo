/**
 * Scoring Engine
 *
 * Aggregates individual metric scores into a final developer score.
 * Uses configurable weights that sum to 1.0.
 * Final score is scaled to 0-100.
 */

export const DEFAULT_WEIGHTS = {
  codeQuality: 0.12,
  codeMaintainability: 0.10,
  prReview: 0.08,
  duplication: 0.08,
  copilotDependency: 0.05,
  prSize: 0.08,
  solidPrinciples: 0.10,
  readability: 0.10,
  structuralMaintainability: 0.08,
  cyclomaticComplexity: 0.12,
  nplusone: 0.09,
};

export const METRIC_LABELS = {
  codeQuality: 'Code Quality',
  codeMaintainability: 'Code Maintainability',
  prReview: 'PR Review Contribution',
  duplication: 'Duplicate Code',
  copilotDependency: 'Copilot Dependency',
  prSize: 'PR Size Discipline',
  solidPrinciples: 'SOLID Principles',
  readability: 'Code Readability',
  structuralMaintainability: 'Structural Maintainability',
  cyclomaticComplexity: 'Cyclomatic Complexity',
  nplusone: 'N+1 Query Detection',
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
    codeQuality: `Clean code with only ${data.details?.totalIssues || 0} issues detected.`,
    codeMaintainability: `Well-structured code with maintainability index of ${data.details?.maintainabilityIndex || 'N/A'}.`,
    prReview: `Active reviewer with ${data.details?.substantiveComments || 0} substantive comments.`,
    duplication: `Minimal code duplication (${data.details?.duplicationRatio || 0} ratio).`,
    copilotDependency: `Low AI dependency indicators (${data.details?.totalIndicators || 0} found).`,
    prSize: `Well-sized PRs with median ${data.details?.medianChangesPerPR || 0} changes.`,
    solidPrinciples: `Good adherence to SOLID principles.`,
    readability: `Readable code with ${data.details?.commentDensity || 0} comment density.`,
    structuralMaintainability: `Good structural organization with clear abstractions.`,
    cyclomaticComplexity: `Low complexity with average ${data.details?.avgComplexity || 0} per function.`,
    nplusone: `No N+1 query patterns detected.`,
  };
  return descriptions[metric] || 'Good performance in this area.';
}

function getImprovementSuggestion(metric, data) {
  const suggestions = {
    codeQuality: `Address ${data.details?.totalIssues || 'the'} code quality issues. Consider using a linter.`,
    codeMaintainability: `Reduce file sizes and function lengths. Add documentation to public APIs.`,
    prReview: `Provide more detailed, substantive review feedback on PRs.`,
    duplication: `Reduce code duplication (${data.details?.duplicateBlocks || 0} blocks found). Extract shared logic.`,
    copilotDependency: `Review AI-generated code more carefully for correctness and maintainability.`,
    prSize: `Break down large PRs (median: ${data.details?.medianChangesPerPR || 0} changes) into smaller, focused ones.`,
    solidPrinciples: `Address ${data.details?.srpViolations || 0} SRP violations. Reduce class/module responsibilities.`,
    readability: `Improve naming, reduce nesting depth (max: ${data.details?.maxNestingDepth || 0}), add comments.`,
    structuralMaintainability: `Improve code organization. Extract common patterns into reusable modules.`,
    cyclomaticComplexity: `Reduce function complexity (avg: ${data.details?.avgComplexity || 0}). Break complex logic into smaller functions.`,
    nplusone: `Fix ${data.details?.totalViolations || 0} potential N+1 query patterns. Use eager loading or batching.`,
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
