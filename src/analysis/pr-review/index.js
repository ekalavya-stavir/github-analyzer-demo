/**
 * PR Review Contribution Analyzer
 *
 * Two equally-weighted sub-scores (50/50):
 *
 * 1. PR Review Ratio
 *    - actual = PRs this developer reviewed / total PRs in duration
 *    - expected = total developers / total PRs in duration
 *    - ratio >= expected → full score (10)
 *    - ratio < expected → proportional (actual / expected * 10)
 *
 * 2. Comment Density
 *    - actual = comments given / total lines changed in PRs they reviewed
 *    - expected = 1 comment per 50 lines (0.02)
 *    - ratio >= expected → full score (10)
 *    - ratio < expected → proportional (actual / expected * 10)
 *
 * Score: 0-10 (10 = excellent reviewer)
 */

const EXPECTED_COMMENTS_PER_LINE = 1 / 50; // 0.02

export function analyzePRReview(developerData, baseStats) {
  const { prsReviewed, reviewComments, reviewedPRsLinesChanged } = developerData;
  const { totalPRs, totalDevelopers } = baseStats;

  if (totalPRs === 0 || totalDevelopers === 0) {
    return {
      score: 5,
      details: { note: 'Insufficient data to evaluate', totalPRs, totalDevelopers, evidence: [{ file: 'Summary', line: 0, snippet: `No PRs (${totalPRs}) or developers (${totalDevelopers}) in analysis period`, issue: 'no-data' }] },
    };
  }

  // --- Sub-score 1: PR Review Ratio ---
  const actualReviewRatio = prsReviewed / totalPRs;
  const expectedReviewRatio = totalDevelopers / totalPRs;
  const cappedExpectedReviewRatio = Math.min(expectedReviewRatio, 1);

  let reviewRatioScore;
  if (cappedExpectedReviewRatio <= 0) {
    reviewRatioScore = 10;
  } else if (actualReviewRatio >= cappedExpectedReviewRatio) {
    reviewRatioScore = 10;
  } else {
    reviewRatioScore = (actualReviewRatio / cappedExpectedReviewRatio) * 10;
  }
  reviewRatioScore = Math.max(0, Math.min(10, reviewRatioScore));

  // --- Sub-score 2: Comment Density ---
  const totalLinesReviewed = reviewedPRsLinesChanged;
  let commentDensityScore;

  if (totalLinesReviewed === 0) {
    commentDensityScore = prsReviewed > 0 ? 5 : 0;
  } else {
    const actualCommentRatio = reviewComments / totalLinesReviewed;
    if (actualCommentRatio >= EXPECTED_COMMENTS_PER_LINE) {
      commentDensityScore = 10;
    } else {
      commentDensityScore = (actualCommentRatio / EXPECTED_COMMENTS_PER_LINE) * 10;
    }
  }
  commentDensityScore = Math.max(0, Math.min(10, commentDensityScore));

  // --- Combined: 50/50 blend ---
  const score = (reviewRatioScore + commentDensityScore) / 2;

  return {
    score: Math.round(score * 10) / 10,
    details: {
      reviewRatioScore: Math.round(reviewRatioScore * 10) / 10,
      commentDensityScore: Math.round(commentDensityScore * 10) / 10,
      prsReviewed,
      totalPRs,
      actualReviewRatio: Math.round(actualReviewRatio * 1000) / 1000,
      expectedReviewRatio: Math.round(cappedExpectedReviewRatio * 1000) / 1000,
      reviewComments,
      totalLinesReviewed,
      actualCommentRatio: totalLinesReviewed > 0
        ? Math.round((reviewComments / totalLinesReviewed) * 10000) / 10000
        : 0,
      expectedCommentRatio: EXPECTED_COMMENTS_PER_LINE,
      evidence: [
        {
          file: 'Review Ratio',
          line: 0,
          snippet: `Reviewed ${prsReviewed}/${totalPRs} PRs (${Math.round(actualReviewRatio * 100)}%), expected ${Math.round(cappedExpectedReviewRatio * 100)}%`,
          issue: reviewRatioScore >= 10 ? 'meets-target' : 'below-target',
        },
        {
          file: 'Comment Density',
          line: 0,
          snippet: `${reviewComments} comments on ${totalLinesReviewed} lines reviewed (${totalLinesReviewed > 0 ? Math.round((reviewComments / totalLinesReviewed) * 10000) / 100 : 0} per 100 LOC, expected 2.0)`,
          issue: commentDensityScore >= 10 ? 'meets-target' : 'below-target',
        },
      ],
    },
  };
}
