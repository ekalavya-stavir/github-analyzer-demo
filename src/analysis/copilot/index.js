/**
 * Copilot Dependency Analyzer
 *
 * Detects indicators of AI/Copilot-generated code in commits and comments.
 * Fewer Copilot indicators = higher score.
 *
 * Score: 0-10 (10 = no Copilot dependency detected, inverse scoring)
 */

const COPILOT_COMMIT_PATTERNS = [
  { pattern: /\bcopilot\b/gi, weight: 2, name: 'copilot-mention' },
  { pattern: /\bco-authored-by:.*copilot/gi, weight: 3, name: 'copilot-co-author' },
  { pattern: /\bco-authored-by:.*\[bot\]/gi, weight: 2, name: 'bot-co-author' },
  { pattern: /\bgenerated\s+by\s+(ai|copilot|gpt|chatgpt|claude)/gi, weight: 3, name: 'ai-generated' },
  { pattern: /\bai[\s-]generated\b/gi, weight: 2, name: 'ai-generated-tag' },
  { pattern: /\bauto[\s-]generated\b/gi, weight: 1, name: 'auto-generated' },
];

const COPILOT_CODE_PATTERNS = [
  { pattern: /\/\/\s*generated\s+by\s+(copilot|ai|gpt)/gi, weight: 3, name: 'ai-comment' },
  { pattern: /\/\/\s*copilot\s+suggestion/gi, weight: 2, name: 'copilot-suggestion' },
  { pattern: /\/\*\s*@generated\s*\*\//gi, weight: 2, name: 'generated-annotation' },
  { pattern: /#\s*generated\s+by\s+(copilot|ai|gpt)/gi, weight: 3, name: 'ai-comment-hash' },
  { pattern: /\/\/\s*TODO:\s*refactor\s+copilot/gi, weight: 1, name: 'copilot-todo' },
];

const COPILOT_PR_PATTERNS = [
  { pattern: /\bcopilot\b/gi, weight: 1.5, name: 'pr-copilot-mention' },
  { pattern: /\bgenerated\s+by\s+(ai|copilot|gpt|chatgpt|claude)/gi, weight: 2, name: 'pr-ai-generated' },
  { pattern: /\bai[\s-]assisted\b/gi, weight: 1, name: 'ai-assisted' },
  { pattern: /\bcopilot[\s-]generated\b/gi, weight: 2, name: 'copilot-generated' },
  { pattern: /\bgithub\s+copilot\b/gi, weight: 2, name: 'github-copilot' },
];

export function analyzeCopilotDependency(commits, pullRequests, patches) {
  let totalIndicators = 0;
  let totalWeight = 0;
  const detections = [];

  for (const commit of commits) {
    const message = commit.message || '';
    for (const cp of COPILOT_COMMIT_PATTERNS) {
      const matches = message.match(cp.pattern);
      if (matches) {
        totalIndicators += matches.length;
        totalWeight += matches.length * cp.weight;
        detections.push({
          source: 'commit',
          ref: commit.sha?.substring(0, 7),
          type: cp.name,
          count: matches.length,
        });
      }
    }
  }

  for (const pr of pullRequests) {
    const body = pr.body || '';
    const title = pr.title || '';
    const text = `${title} ${body}`;
    for (const cp of COPILOT_PR_PATTERNS) {
      const matches = text.match(cp.pattern);
      if (matches) {
        totalIndicators += matches.length;
        totalWeight += matches.length * cp.weight;
        detections.push({
          source: 'pr',
          ref: `#${pr.number}`,
          type: cp.name,
          count: matches.length,
        });
      }
    }

    for (const comment of (pr.reviewComments || [])) {
      const commentBody = comment.body || '';
      for (const cp of COPILOT_PR_PATTERNS) {
        const matches = commentBody.match(cp.pattern);
        if (matches) {
          totalIndicators += matches.length;
          totalWeight += matches.length * cp.weight;
        }
      }
    }
  }

  if (patches) {
    for (const file of patches) {
      const addedLines = extractAddedLines(file.patch);
      const code = addedLines.join('\n');
      for (const cp of COPILOT_CODE_PATTERNS) {
        const matches = code.match(cp.pattern);
        if (matches) {
          totalIndicators += matches.length;
          totalWeight += matches.length * cp.weight;
          detections.push({
            source: 'code',
            ref: file.filename,
            type: cp.name,
            count: matches.length,
          });
        }
      }
    }
  }

  let score;
  if (totalWeight === 0) {
    score = 10;
  } else if (totalWeight <= 2) {
    score = 9;
  } else if (totalWeight <= 5) {
    score = 8;
  } else if (totalWeight <= 10) {
    score = 7;
  } else if (totalWeight <= 15) {
    score = 6;
  } else if (totalWeight <= 25) {
    score = 5;
  } else if (totalWeight <= 35) {
    score = 4;
  } else if (totalWeight <= 50) {
    score = 3;
  } else {
    score = 2;
  }

  return {
    score: Math.round(score * 10) / 10,
    details: {
      totalIndicators,
      totalWeight: Math.round(totalWeight * 10) / 10,
      detections: detections.slice(0, 10),
    },
  };
}

function extractAddedLines(patch) {
  if (!patch) return [];
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.substring(1));
}
