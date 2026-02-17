/**
 * Code Readability Analyzer
 *
 * Metrics:
 * - Naming quality heuristics (camelCase, PascalCase, SCREAMING_CASE consistency)
 * - Comment density
 * - Nesting depth
 * - Function length
 * - Indentation consistency
 *
 * Score: 0-10 (10 = most readable)
 */

const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|c|cpp|cs|php|swift|kt)$/;

const POOR_NAMING_PATTERNS = [
  { pattern: /\b[a-z]\b(?=\s*[=:])/g, weight: 0.5, name: 'single-char-var' },
  { pattern: /\b(tmp|temp|foo|bar|baz|xxx|yyy|data|obj|val|res|ret)\b/g, weight: 0.3, name: 'vague-name' },
  { pattern: /\b[a-z]+\d+\b/g, weight: 0.2, name: 'numbered-name' },
  { pattern: /\b[A-Z]{2,}[a-z]/g, weight: 0.1, name: 'inconsistent-case' },
];

export function analyzeReadability(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: {} };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 7, details: { note: 'No code files' } };
  }

  let totalLines = 0;
  let commentLines = 0;
  let maxNestingDepth = 0;
  let totalNestingDepth = 0;
  let nestingMeasurements = 0;
  let namingIssues = 0;
  let longFunctions = 0;
  let totalFunctions = 0;
  let inconsistentIndentation = 0;
  let totalIndentedLines = 0;

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;

    let currentFunctionLength = 0;
    let inFunction = false;
    let functionBraceDepth = 0;
    let prevIndentType = null;

    for (const line of addedLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^\s*(\/\/|#|\/\*|\*|<!--)/.test(line)) {
        commentLines++;
      }

      const depth = countNestingDepth(line);
      totalNestingDepth += depth;
      nestingMeasurements++;
      if (depth > maxNestingDepth) maxNestingDepth = depth;

      for (const np of POOR_NAMING_PATTERNS) {
        const matches = trimmed.match(np.pattern);
        if (matches) namingIssues += matches.length * np.weight;
      }

      const isFunctionStart = /\b(function|=>|def |fn )\b/.test(trimmed);
      if (isFunctionStart) {
        if (inFunction && currentFunctionLength > 30) longFunctions++;
        totalFunctions++;
        inFunction = true;
        currentFunctionLength = 0;
        functionBraceDepth = 0;
      }
      if (inFunction) {
        currentFunctionLength++;
        functionBraceDepth += (trimmed.match(/\{/g) || []).length;
        functionBraceDepth -= (trimmed.match(/\}/g) || []).length;
        if (functionBraceDepth <= 0 && currentFunctionLength > 1) {
          if (currentFunctionLength > 30) longFunctions++;
          inFunction = false;
        }
      }

      const leadingWhitespace = line.match(/^(\s+)/);
      if (leadingWhitespace) {
        totalIndentedLines++;
        const indent = leadingWhitespace[1];
        const usesTab = indent.includes('\t');
        const currentType = usesTab ? 'tab' : 'space';
        if (prevIndentType && currentType !== prevIndentType) {
          inconsistentIndentation++;
        }
        prevIndentType = currentType;
      }
    }

    if (inFunction && currentFunctionLength > 30) longFunctions++;
  }

  const commentDensity = totalLines > 0 ? commentLines / totalLines : 0;
  const avgNesting = nestingMeasurements > 0 ? totalNestingDepth / nestingMeasurements : 0;
  const longFunctionRatio = totalFunctions > 0 ? longFunctions / totalFunctions : 0;
  const namingIssueRate = totalLines > 0 ? namingIssues / totalLines : 0;
  const indentInconsistencyRate = totalIndentedLines > 0
    ? inconsistentIndentation / totalIndentedLines : 0;

  let score = 10;

  if (commentDensity < 0.02) score -= 1;
  else if (commentDensity < 0.05) score -= 0.3;
  else if (commentDensity > 0.4) score -= 0.5;

  if (maxNestingDepth > 6) score -= 2;
  else if (maxNestingDepth > 4) score -= 1;
  else if (maxNestingDepth > 3) score -= 0.5;

  if (avgNesting > 3) score -= 1.5;
  else if (avgNesting > 2) score -= 0.8;

  if (longFunctionRatio > 0.5) score -= 2;
  else if (longFunctionRatio > 0.3) score -= 1;
  else if (longFunctionRatio > 0.1) score -= 0.5;

  if (namingIssueRate > 0.1) score -= 2;
  else if (namingIssueRate > 0.05) score -= 1;
  else if (namingIssueRate > 0.02) score -= 0.5;

  if (indentInconsistencyRate > 0.2) score -= 1.5;
  else if (indentInconsistencyRate > 0.1) score -= 0.8;

  score = Math.max(1, Math.min(10, score));

  return {
    score: Math.round(score * 10) / 10,
    details: {
      commentDensity: Math.round(commentDensity * 1000) / 1000,
      maxNestingDepth,
      avgNestingDepth: Math.round(avgNesting * 10) / 10,
      longFunctions,
      totalFunctions,
      longFunctionRatio: Math.round(longFunctionRatio * 100) / 100,
      namingIssueRate: Math.round(namingIssueRate * 1000) / 1000,
      indentationInconsistency: Math.round(indentInconsistencyRate * 100) / 100,
      linesAnalyzed: totalLines,
    },
  };
}

function countNestingDepth(line) {
  const leadingWhitespace = line.match(/^(\s*)/);
  if (!leadingWhitespace) return 0;
  const ws = leadingWhitespace[1];
  const tabs = (ws.match(/\t/g) || []).length;
  const spaces = ws.replace(/\t/g, '').length;
  return tabs + Math.floor(spaces / 2);
}

function extractAddedLines(patch) {
  if (!patch) return [];
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.substring(1));
}
