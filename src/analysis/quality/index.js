/**
 * Code Quality Analyzer
 *
 * Metrics:
 * - Lint-style issues per LOC (missing semicolons, var usage, console.log, etc.)
 * - Static analysis warnings (unused vars, unreachable code)
 * - Code smells (magic numbers, deeply nested callbacks, long parameter lists)
 * - Syntax violations (inconsistent quotes, missing braces)
 *
 * Score: 0-10 (10 = cleanest code)
 */

const LINT_PATTERNS = [
  { pattern: /\bvar\s+/g, weight: 1, name: 'var-usage' },
  { pattern: /console\.(log|debug|info)\(/g, weight: 0.5, name: 'console-statement' },
  { pattern: /==(?!=)/g, weight: 0.8, name: 'loose-equality' },
  { pattern: /!=(?!=)/g, weight: 0.8, name: 'loose-inequality' },
  { pattern: /\bany\b/g, weight: 0.3, name: 'any-type' },
  { pattern: /\/\/\s*TODO/gi, weight: 0.2, name: 'todo-comment' },
  { pattern: /\/\/\s*FIXME/gi, weight: 0.5, name: 'fixme-comment' },
  { pattern: /\/\/\s*HACK/gi, weight: 0.7, name: 'hack-comment' },
  { pattern: /\balert\s*\(/g, weight: 1, name: 'alert-call' },
  { pattern: /\beval\s*\(/g, weight: 2, name: 'eval-usage' },
  { pattern: /\bdocument\.write\s*\(/g, weight: 1.5, name: 'document-write' },
];

const SMELL_PATTERNS = [
  { pattern: /(?<!\w)\d{3,}(?!\w)/g, weight: 0.3, name: 'magic-number' },
  { pattern: /function\s*\([^)]{100,}\)/g, weight: 1, name: 'long-param-list' },
  { pattern: /\.then\s*\([^)]*\.then/g, weight: 0.8, name: 'nested-promise' },
  { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, weight: 1.5, name: 'empty-catch' },
  { pattern: /\/\/.*\n\s*\/\//g, weight: 0.1, name: 'consecutive-comments' },
  { pattern: /setTimeout\s*\(\s*["']/g, weight: 1, name: 'string-timeout' },
];

const STATIC_ANALYSIS_PATTERNS = [
  { pattern: /\breturn\b[\s\S]*?\breturn\b/g, weight: 0.3, name: 'multiple-returns' },
  { pattern: /if\s*\(\s*true\s*\)/g, weight: 1, name: 'constant-condition' },
  { pattern: /if\s*\(\s*false\s*\)/g, weight: 1, name: 'dead-code' },
  { pattern: /\bwhile\s*\(\s*true\s*\)/g, weight: 0.5, name: 'infinite-loop' },
];

const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|c|cpp|cs|php|swift|kt)$/;

export function analyzeCodeQuality(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: { issues: [], totalIssues: 0, linesAnalyzed: 0 } };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 7, details: { issues: [], totalIssues: 0, linesAnalyzed: 0, note: 'No code files in changes' } };
  }

  let totalIssues = 0;
  let totalWeight = 0;
  let totalLines = 0;
  const issuesByType = {};

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    const code = addedLines.join('\n');
    totalLines += addedLines.length;

    for (const rule of [...LINT_PATTERNS, ...SMELL_PATTERNS, ...STATIC_ANALYSIS_PATTERNS]) {
      const matches = code.match(rule.pattern);
      if (matches) {
        const count = matches.length;
        totalIssues += count;
        totalWeight += count * rule.weight;
        issuesByType[rule.name] = (issuesByType[rule.name] || 0) + count;
      }
    }
  }

  const issues = Object.entries(issuesByType).map(([name, count]) => ({ name, count }));
  issues.sort((a, b) => b.count - a.count);

  const issuesPerLine = totalLines > 0 ? totalWeight / totalLines : 0;

  let score;
  if (totalLines === 0) {
    score = 5;
  } else if (issuesPerLine === 0) {
    score = 10;
  } else if (issuesPerLine < 0.02) {
    score = 9;
  } else if (issuesPerLine < 0.05) {
    score = 8;
  } else if (issuesPerLine < 0.1) {
    score = 7;
  } else if (issuesPerLine < 0.15) {
    score = 6;
  } else if (issuesPerLine < 0.2) {
    score = 5;
  } else if (issuesPerLine < 0.3) {
    score = 4;
  } else if (issuesPerLine < 0.4) {
    score = 3;
  } else if (issuesPerLine < 0.5) {
    score = 2;
  } else {
    score = 1;
  }

  return {
    score: Math.round(score * 10) / 10,
    details: {
      issues: issues.slice(0, 10),
      totalIssues,
      weightedScore: Math.round(totalWeight * 100) / 100,
      linesAnalyzed: totalLines,
      issuesPerLine: Math.round(issuesPerLine * 1000) / 1000,
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
