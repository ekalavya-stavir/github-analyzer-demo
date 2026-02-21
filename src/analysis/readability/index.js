/**
 * Code Readability Analyzer
 *
 * Metrics:
 * - Naming quality heuristics
 * - Comment density
 * - Nesting depth
 * - Function length
 * - Indentation consistency
 * - Anti-patterns: var usage, console.log, loose equality, eval/alert, magic numbers, string setTimeout
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

const STYLE_ANTI_PATTERNS = [
  { pattern: /\bvar\s+/g, weight: 0.8, name: 'var-usage' },
  { pattern: /console\.(log|debug|info)\(/g, weight: 0.5, name: 'console-statement' },
  { pattern: /==(?!=)/g, weight: 0.6, name: 'loose-equality' },
  { pattern: /!=(?!=)/g, weight: 0.6, name: 'loose-inequality' },
  { pattern: /\balert\s*\(/g, weight: 1, name: 'alert-call' },
  { pattern: /\beval\s*\(/g, weight: 1.5, name: 'eval-usage' },
  { pattern: /\bdocument\.write\s*\(/g, weight: 1.2, name: 'document-write' },
  { pattern: /(?<!\w)\d{3,}(?!\w)/g, weight: 0.3, name: 'magic-number' },
  { pattern: /setTimeout\s*\(\s*["']/g, weight: 1, name: 'string-timeout' },
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
  let styleIssueWeight = 0;
  let styleIssueCount = 0;
  const styleIssuesByType = {};
  const evidence = [];

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;

    for (let lineIndex = 0; lineIndex < addedLines.length; lineIndex++) {
      const line = addedLines[lineIndex];
      for (const rule of STYLE_ANTI_PATTERNS) {
        const matches = line.match(rule.pattern);
        if (matches) {
          styleIssueCount += matches.length;
          styleIssueWeight += matches.length * rule.weight;
          styleIssuesByType[rule.name] = (styleIssuesByType[rule.name] || 0) + matches.length;
          evidence.push({ file: file.filename, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: rule.name });
        }
      }
    }

    let currentFunctionLength = 0;
    let inFunction = false;
    let functionBraceDepth = 0;
    let prevIndentType = null;
    let functionStartLine = 0;

    for (let lineIndex = 0; lineIndex < addedLines.length; lineIndex++) {
      const line = addedLines[lineIndex];
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^\s*(\/\/|#|\/\*|\*|<!--)/.test(line)) {
        commentLines++;
      }

      const depth = countNestingDepth(line);
      totalNestingDepth += depth;
      nestingMeasurements++;
      if (depth > maxNestingDepth) maxNestingDepth = depth;
      if (depth > 4) {
        evidence.push({ file: file.filename, line: lineIndex + 1, snippet: trimmed.substring(0, 120), issue: 'deep-nesting' });
      }

      for (const np of POOR_NAMING_PATTERNS) {
        const matches = trimmed.match(np.pattern);
        if (matches) {
          namingIssues += matches.length * np.weight;
          evidence.push({ file: file.filename, line: lineIndex + 1, snippet: trimmed.substring(0, 120), issue: np.name });
        }
      }

      const isFunctionStart = /\b(function|=>|def |fn )\b/.test(trimmed);
      if (isFunctionStart) {
        if (inFunction && currentFunctionLength > 30) {
          longFunctions++;
          evidence.push({ file: file.filename, line: functionStartLine + 1, snippet: addedLines[functionStartLine].trim().substring(0, 120), issue: 'long-function' });
        }
        totalFunctions++;
        inFunction = true;
        currentFunctionLength = 0;
        functionBraceDepth = 0;
        functionStartLine = lineIndex;
      }
      if (inFunction) {
        currentFunctionLength++;
        functionBraceDepth += (trimmed.match(/\{/g) || []).length;
        functionBraceDepth -= (trimmed.match(/\}/g) || []).length;
        if (functionBraceDepth <= 0 && currentFunctionLength > 1) {
          if (currentFunctionLength > 30) {
            longFunctions++;
            evidence.push({ file: file.filename, line: functionStartLine + 1, snippet: addedLines[functionStartLine].trim().substring(0, 120), issue: 'long-function' });
          }
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

    if (inFunction && currentFunctionLength > 30) {
      longFunctions++;
      evidence.push({ file: file.filename, line: functionStartLine + 1, snippet: addedLines[functionStartLine].trim().substring(0, 120), issue: 'long-function' });
    }
  }

  const commentDensity = totalLines > 0 ? commentLines / totalLines : 0;
  const avgNesting = nestingMeasurements > 0 ? totalNestingDepth / nestingMeasurements : 0;
  const longFunctionRatio = totalFunctions > 0 ? longFunctions / totalFunctions : 0;
  const namingIssueRate = totalLines > 0 ? namingIssues / totalLines : 0;
  const indentInconsistencyRate = totalIndentedLines > 0
    ? inconsistentIndentation / totalIndentedLines : 0;
  const styleIssueRate = totalLines > 0 ? styleIssueWeight / totalLines : 0;

  let score = 10;

  if (commentDensity < 0.02) score -= 0.8;
  else if (commentDensity < 0.05) score -= 0.3;
  else if (commentDensity > 0.4) score -= 0.4;

  if (maxNestingDepth > 6) score -= 1.5;
  else if (maxNestingDepth > 4) score -= 0.8;
  else if (maxNestingDepth > 3) score -= 0.4;

  if (avgNesting > 3) score -= 1.2;
  else if (avgNesting > 2) score -= 0.6;

  if (longFunctionRatio > 0.5) score -= 1.5;
  else if (longFunctionRatio > 0.3) score -= 0.8;
  else if (longFunctionRatio > 0.1) score -= 0.4;

  if (namingIssueRate > 0.1) score -= 1.5;
  else if (namingIssueRate > 0.05) score -= 0.8;
  else if (namingIssueRate > 0.02) score -= 0.4;

  if (indentInconsistencyRate > 0.2) score -= 1;
  else if (indentInconsistencyRate > 0.1) score -= 0.5;

  if (styleIssueRate > 0.15) score -= 1.5;
  else if (styleIssueRate > 0.08) score -= 1;
  else if (styleIssueRate > 0.03) score -= 0.5;
  else if (styleIssueRate > 0.01) score -= 0.2;

  score = Math.max(1, Math.min(10, score));

  const styleIssues = Object.entries(styleIssuesByType)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

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
      styleIssues: styleIssues.slice(0, 8),
      styleIssueCount,
      styleIssueRate: Math.round(styleIssueRate * 1000) / 1000,
      linesAnalyzed: totalLines,
      evidence: evidence.slice(0, 15),
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
