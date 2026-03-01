/**
 * Cyclomatic Complexity Analyzer
 *
 * Detects decision points in code to estimate cyclomatic complexity.
 * Also detects complexity anti-patterns: nested .then() chains, constant conditions, dead code.
 * Lower complexity = higher score.
 *
 * Score: 0-10 (10 = simplest code)
 */

import { extractAddedLines, extractVisibleLines, countFunctions } from '../diff-utils.js';

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


const COMPLEXITY_ANTI_PATTERNS = [
  { pattern: /\.then\s*\([^)]*\.then/g, weight: 1, name: 'nested-promise-chain' },
  { pattern: /if\s*\(\s*true\s*\)/g, weight: 1.5, name: 'constant-condition-true' },
  { pattern: /if\s*\(\s*false\s*\)/g, weight: 1.5, name: 'dead-code-false' },
  { pattern: /\bwhile\s*\(\s*true\s*\)/g, weight: 0.5, name: 'infinite-loop' },
];

const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|c|cpp|cs|php)$/;

export function analyzeComplexity(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: { avgComplexity: 0, functionsFound: 0, linesAnalyzed: 0, evidence: [{ file: 'Summary', line: 0, snippet: 'No patches available for analysis', issue: 'no-data' }] } };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 7, details: { avgComplexity: 0, functionsFound: 0, linesAnalyzed: 0, note: 'No code files', evidence: [{ file: 'Summary', line: 0, snippet: `${patches.length} files analyzed, none are code files`, issue: 'no-code-files' }] } };
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
    const visibleLines = extractVisibleLines(file.patch);
    const visibleCode = visibleLines.join('\n');
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

    let functions = countFunctions(visibleCode);

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
  const maxComplexity = fileComplexities.length > 0 ? fileComplexities[0].complexity : 0;
  const antiPatternRate = totalLines > 0 ? antiPatternWeight / totalLines : 0;

  let score;
  if (maxComplexity < 10) score = 10;
  else if (maxComplexity < 15) score = 9;
  else if (maxComplexity < 20) score = 8;
  else if (maxComplexity < 25) score = 7;
  else if (maxComplexity < 30) score = 6;
  else if (maxComplexity < 35) score = 5;
  else if (maxComplexity < 40) score = 5;
  else if (maxComplexity < 45) score = 4;
  else if (maxComplexity < 50) score = 3;
  else if (maxComplexity < 55) score = 2;
  else if (maxComplexity < 60) score = 1;
  else score = 0;

  if (antiPatternRate > 0.02) score -= 1;
  else if (antiPatternRate > 0.005) score -= 0.5;

  score = Math.max(0, Math.min(10, score));

  const antiPatterns = Object.entries(antiPatternsByType)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    score: Math.round(score * 10) / 10,
    details: {
      avgComplexity: Math.round(avgComplexity * 10) / 10,
      maxComplexity: Math.round(maxComplexity * 10) / 10,
      totalDecisionPoints,
      functionsFound: totalFunctions,
      antiPatterns,
      antiPatternCount,
      linesAnalyzed: totalLines,
      topComplexFiles: fileComplexities.slice(0, 5),
      evidence: [
        { file: 'Summary', line: 0, snippet: `Max complexity: ${Math.round(maxComplexity * 10) / 10}, avg: ${Math.round(avgComplexity * 10) / 10} per function, ${totalDecisionPoints} decision points across ${totalFunctions} functions in ${codePatches.length} files`, issue: 'overview' },
        ...fileComplexities.slice(0, 3).map((fc) => ({ file: fc.filename, line: 0, snippet: `Complexity: ${fc.complexity} (${fc.decisionPoints} decisions / ${fc.functions} functions)`, issue: fc.complexity > 10 ? 'high-complexity' : 'file-stats' })),
        ...evidence,
      ].slice(0, 15),
    },
  };
}

