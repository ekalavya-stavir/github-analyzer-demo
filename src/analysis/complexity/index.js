/**
 * Cyclomatic Complexity Analyzer
 *
 * Detects decision points in code to estimate cyclomatic complexity.
 * Also detects complexity anti-patterns: nested .then() chains, constant conditions, dead code.
 * Lower complexity = higher score.
 *
 * Score: 0-10 (10 = simplest code)
 */

const DECISION_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\s+if\s*\(/g,
  /\belse\s*\{/g,
  /\bswitch\s*\(/g,
  /\bcase\s+/g,
  /\bfor\s*\(/g,
  /\bfor\s+of\b/g,
  /\bfor\s+in\b/g,
  /\bwhile\s*\(/g,
  /\bdo\s*\{/g,
  /\bcatch\s*\(/g,
  /\?\s*/g,
  /&&/g,
  /\|\|/g,
  /\?\?/g,
];

const FUNCTION_PATTERNS = [
  /\bfunction\s+\w+\s*\(/g,
  /\bfunction\s*\(/g,
  /=>\s*[{(]/g,
  /\b(async\s+)?function\b/g,
  /\w+\s*:\s*function/g,
  /\w+\s*\([^)]*\)\s*\{/g,
];

const COMPLEXITY_ANTI_PATTERNS = [
  { pattern: /\.then\s*\([^)]*\.then/g, weight: 1, name: 'nested-promise-chain' },
  { pattern: /if\s*\(\s*true\s*\)/g, weight: 1.5, name: 'constant-condition-true' },
  { pattern: /if\s*\(\s*false\s*\)/g, weight: 1.5, name: 'dead-code-false' },
  { pattern: /\bwhile\s*\(\s*true\s*\)/g, weight: 0.5, name: 'infinite-loop' },
];

const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|c|cpp|cs|php)$/;

export function analyzeComplexity(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: { avgComplexity: 0, functionsFound: 0, linesAnalyzed: 0 } };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 7, details: { avgComplexity: 0, functionsFound: 0, linesAnalyzed: 0, note: 'No code files' } };
  }

  let totalDecisionPoints = 0;
  let totalFunctions = 0;
  let totalLines = 0;
  let antiPatternWeight = 0;
  let antiPatternCount = 0;
  const antiPatternsByType = {};
  const fileComplexities = [];
  const evidence = [];

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    const code = addedLines.join('\n');
    totalLines += addedLines.length;

    let decisionPoints = 0;
    for (let lineIndex = 0; lineIndex < addedLines.length; lineIndex++) {
      const line = addedLines[lineIndex];
      let lineDecisionPoints = 0;
      for (const pattern of DECISION_PATTERNS) {
        const matches = line.match(pattern);
        if (matches) lineDecisionPoints += matches.length;
      }
      decisionPoints += lineDecisionPoints;
      if (lineDecisionPoints >= 2) {
        evidence.push({ file: file.filename, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: 'high-complexity-line' });
      }
    }

    let functions = 0;
    for (const pattern of FUNCTION_PATTERNS) {
      const matches = code.match(pattern);
      if (matches) functions += matches.length;
    }

    for (let lineIndex = 0; lineIndex < addedLines.length; lineIndex++) {
      const line = addedLines[lineIndex];
      for (const rule of COMPLEXITY_ANTI_PATTERNS) {
        const matches = line.match(rule.pattern);
        if (matches) {
          antiPatternCount += matches.length;
          antiPatternWeight += matches.length * rule.weight;
          antiPatternsByType[rule.name] = (antiPatternsByType[rule.name] || 0) + matches.length;
          evidence.push({ file: file.filename, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: rule.name });
        }
      }
    }

    functions = Math.max(functions, 1);
    totalDecisionPoints += decisionPoints;
    totalFunctions += functions;

    const avgFileComplexity = decisionPoints / functions;
    fileComplexities.push({
      filename: file.filename,
      complexity: Math.round(avgFileComplexity * 10) / 10,
      decisionPoints,
      functions,
    });
  }

  fileComplexities.sort((a, b) => b.complexity - a.complexity);

  const avgComplexity = totalFunctions > 0 ? totalDecisionPoints / totalFunctions : 0;
  const antiPatternRate = totalLines > 0 ? antiPatternWeight / totalLines : 0;

  let score;
  if (avgComplexity <= 2) {
    score = 10;
  } else if (avgComplexity <= 4) {
    score = 9;
  } else if (avgComplexity <= 6) {
    score = 8;
  } else if (avgComplexity <= 8) {
    score = 7;
  } else if (avgComplexity <= 10) {
    score = 6;
  } else if (avgComplexity <= 14) {
    score = 5;
  } else if (avgComplexity <= 18) {
    score = 4;
  } else if (avgComplexity <= 22) {
    score = 3;
  } else if (avgComplexity <= 30) {
    score = 2;
  } else {
    score = 1;
  }

  if (antiPatternRate > 0.02) score -= 1;
  else if (antiPatternRate > 0.005) score -= 0.5;

  score = Math.max(1, Math.min(10, score));

  const antiPatterns = Object.entries(antiPatternsByType)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    score: Math.round(score * 10) / 10,
    details: {
      avgComplexity: Math.round(avgComplexity * 10) / 10,
      totalDecisionPoints,
      functionsFound: totalFunctions,
      antiPatterns,
      antiPatternCount,
      linesAnalyzed: totalLines,
      topComplexFiles: fileComplexities.slice(0, 5),
      evidence: evidence.slice(0, 15),
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
