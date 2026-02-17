/**
 * PR Review Contribution Analyzer
 *
 * Evaluates the quality and quantity of code review feedback given by a developer.
 * - Number of review comments given
 * - Average comment length
 * - Filters trivial comments (LGTM, etc.)
 * - Substantive feedback ratio
 *
 * Score: 0-10 (10 = excellent reviewer)
 */

const TRIVIAL_PATTERNS = [
  /^\s*lgtm\s*[.!]?\s*$/i,
  /^\s*looks?\s+good\s*(to\s+me)?\s*[.!]?\s*$/i,
  /^\s*\+1\s*$/,
  /^\s*nice\s*[.!]?\s*$/i,
  /^\s*great\s*[.!]?\s*$/i,
  /^\s*thanks?\s*[.!]?\s*$/i,
  /^\s*thank\s+you\s*[.!]?\s*$/i,
  /^\s*approved?\s*[.!]?\s*$/i,
  /^\s*shipit\s*[.!]?\s*$/i,
  /^\s*:(\+1|thumbsup|shipit|rocket|100):\s*$/i,
  /^\s*👍\s*$/,
  /^\s*🚀\s*$/,
  /^\s*✅\s*$/,
  /^\s*ok\s*[.!]?\s*$/i,
  /^\s*nit:?\s*$/i,
  /^\s*done\s*[.!]?\s*$/i,
];

const SUBSTANTIVE_INDICATORS = [
  /\bwhy\b/i,
  /\bhow\b/i,
  /\bshould\b/i,
  /\bcould\b/i,
  /\bwould\b/i,
  /\bsuggest\b/i,
  /\bconsider\b/i,
  /\binstead\b/i,
  /\balternative\b/i,
  /\brefactor\b/i,
  /\bperformance\b/i,
  /\bsecurity\b/i,
  /\bbug\b/i,
  /\bedge\s*case\b/i,
  /\brace\s*condition\b/i,
  /\bmemory\b/i,
  /\bnull\s*check\b/i,
  /\berror\s*handl/i,
  /\btest\b/i,
  /\bvalidat/i,
  /```/,
];

export function analyzePRReview(reviewComments, pullRequests) {
  if (!reviewComments || reviewComments.length === 0) {
    return {
      score: 5,
      details: {
        totalComments: 0,
        substantiveComments: 0,
        trivialComments: 0,
        note: 'No review comments found',
      },
    };
  }

  let totalComments = reviewComments.length;
  let trivialCount = 0;
  let substantiveCount = 0;
  let totalLength = 0;
  let substantiveLength = 0;

  for (const comment of reviewComments) {
    const body = (comment.body || '').trim();
    const length = body.length;
    totalLength += length;

    const isTrivial = TRIVIAL_PATTERNS.some((p) => p.test(body)) || length < 10;

    if (isTrivial) {
      trivialCount++;
    } else {
      const hasSubstance = SUBSTANTIVE_INDICATORS.some((p) => p.test(body));
      if (hasSubstance || length > 50) {
        substantiveCount++;
        substantiveLength += length;
      } else {
        trivialCount++;
      }
    }
  }

  const avgCommentLength = totalComments > 0 ? totalLength / totalComments : 0;
  const avgSubstantiveLength = substantiveCount > 0 ? substantiveLength / substantiveCount : 0;
  const substantiveRatio = totalComments > 0 ? substantiveCount / totalComments : 0;

  const reviewsGiven = pullRequests
    ? pullRequests.reduce((count, pr) => {
        const reviews = pr.reviews || [];
        return count + reviews.filter((r) => r.state !== 'PENDING').length;
      }, 0)
    : 0;

  let score;

  if (totalComments === 0) {
    score = 3;
  } else {
    score = 5;

    if (substantiveRatio > 0.8) score += 2.5;
    else if (substantiveRatio > 0.6) score += 1.5;
    else if (substantiveRatio > 0.4) score += 0.5;
    else score -= 1;

    if (avgSubstantiveLength > 200) score += 1;
    else if (avgSubstantiveLength > 100) score += 0.5;
    else if (avgSubstantiveLength < 30) score -= 0.5;

    if (totalComments > 20) score += 1;
    else if (totalComments > 10) score += 0.5;
    else if (totalComments < 3) score -= 0.5;
  }

  score = Math.max(1, Math.min(10, score));

  return {
    score: Math.round(score * 10) / 10,
    details: {
      totalComments,
      substantiveComments: substantiveCount,
      trivialComments: trivialCount,
      substantiveRatio: Math.round(substantiveRatio * 100) / 100,
      avgCommentLength: Math.round(avgCommentLength),
      avgSubstantiveLength: Math.round(avgSubstantiveLength),
      reviewsGiven,
    },
  };
}
