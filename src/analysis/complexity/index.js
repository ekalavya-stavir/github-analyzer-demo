/**
 * Cyclomatic Complexity Analyzer
 *
 * Detects decision points in code to estimate cyclomatic complexity.
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
  const fileComplexities = [];

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    const code = addedLines.join('\n');
    totalLines += addedLines.length;

    let decisionPoints = 0;
    for (const pattern of DECISION_PATTERNS) {
      const matches = code.match(pattern);
      if (matches) decisionPoints += matches.length;
    }

    let functions = 0;
    for (const pattern of FUNCTION_PATTERNS) {
      const matches = code.match(pattern);
      if (matches) functions += matches.length;
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

  return {
    score: Math.round(score * 10) / 10,
    details: {
      avgComplexity: Math.round(avgComplexity * 10) / 10,
      totalDecisionPoints,
      functionsFound: totalFunctions,
      linesAnalyzed: totalLines,
      topComplexFiles: fileComplexities.slice(0, 5),
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
