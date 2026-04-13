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

/**
 * Calculates the Cyclomatic Complexity and number of functions within an AST node.
 * 
 * @param {import('tree-sitter').SyntaxNode} node 
 * @returns {{ decisionPoints: number, functions: number }}
 */
export function calculateNodeComplexity(node) {
  let decisionPoints = 0;
  let functions = 0;

  function traverse(n) {
    if (!n) return;

    if (
      n.type === 'function_declaration' ||
      n.type === 'function_definition' ||    // PHP
      n.type === 'arrow_function' ||
      n.type === 'method_definition' ||
      n.type === 'method_declaration' ||     // PHP
      n.type === 'function_expression' // anonymous function expression
    ) {
      functions++;
    }

    if (isDecisionNode(n)) {
      decisionPoints++;
    }

    for (let i = 0; i < n.childCount; i++) {
      traverse(n.child(i));
    }
  }

  traverse(node);
  return { decisionPoints, functions: Math.max(functions, 1) };
}

/**
 * Checks if an AST node is a decision point (branching/complexity-adding construct).
 * @param {import('tree-sitter').SyntaxNode} n
 * @returns {boolean}
 */
function isDecisionNode(n) {
  if (
    n.type === 'if_statement' ||
    n.type === 'for_statement' ||
    n.type === 'for_in_statement' ||
    n.type === 'for_of_statement' ||
    n.type === 'foreach_statement' ||      // PHP
    n.type === 'while_statement' ||
    n.type === 'do_statement' ||
    n.type === 'catch_clause' ||
    n.type === 'ternary_expression' ||
    n.type === 'switch_case' ||
    n.type === 'switch_default' ||
    n.type === 'elseif_clause'             // PHP elseif
  ) {
    return true;
  }
  if (n.type === 'binary_expression') {
    const operator = n.child(1);
    if (operator && ['&&', '||', '??', 'and', 'or'].includes(operator.text)) {
      return true;
    }
  }
  return false;
}

/**
 * Counts decision points in the AST that fall within specific line ranges.
 * Lines are 1-indexed to match git diff conventions.
 * 
 * @param {import('tree-sitter').SyntaxNode} rootNode
 * @param {number[]} lines - 1-indexed line numbers to scope the count to
 * @returns {number} count of decision points within those lines
 */
export function countDecisionPointsInLines(rootNode, lines) {
  if (!rootNode || !lines || lines.length === 0) return 0;

  const lineSet = new Set(lines);
  let count = 0;

  function traverse(n) {
    if (!n) return;

    if (isDecisionNode(n)) {
      // tree-sitter rows are 0-indexed, modifiedLines are 1-indexed
      const nodeLine = n.startPosition.row + 1;
      if (lineSet.has(nodeLine)) {
        count++;
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      traverse(n.child(i));
    }
  }

  traverse(rootNode);
  return count;
}

/**
 * Calculates the delta complexity between a base commit AST and a head commit AST,
 * scoped to the developer's modified lines.
 * 
 * Only counts decision points that fall on lines the developer actually touched.
 * This prevents a developer from being credited/penalized for complexity they didn't write.
 * 
 * @param {import('tree-sitter').SyntaxNode} baseAst 
 * @param {import('tree-sitter').SyntaxNode} headAst 
 * @param {number[]} modifiedLines - 1-indexed line numbers the developer modified
 * @returns {number} The difference in complexity (delta)
 */
export function calculateDeltaComplexity(baseAst, headAst, modifiedLines) {
  if (!modifiedLines || modifiedLines.length === 0) {
    return 0;
  }

  // Count decision points in the head AST that fall on modified lines.
  // These are the decision points the developer's code currently contains.
  const headComplexityInModifiedLines = countDecisionPointsInLines(headAst, modifiedLines);

  // For the base AST, count decision points on the same line numbers.
  // If these lines existed before and had decision points, we subtract them
  // to get the net new complexity the developer introduced.
  const baseComplexityInModifiedLines = baseAst
    ? countDecisionPointsInLines(baseAst, modifiedLines)
    : 0;

  return headComplexityInModifiedLines - baseComplexityInModifiedLines;
}

