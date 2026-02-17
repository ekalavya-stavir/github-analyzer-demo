/**
 * Code Maintainability Analyzer
 *
 * Metrics:
 * - Maintainability Index estimate
 * - Average file size and function length
 * - Module structure quality
 * - Documentation coverage
 *
 * Score: 0-10 (10 = most maintainable)
 */

const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|c|cpp|cs|php|swift|kt)$/;

const DOC_PATTERNS = [
  /\/\*\*[\s\S]*?\*\//g,
  /\/\/\/.*$/gm,
  /"""/g,
  /'''/g,
  /#\s+\w+/g,
];

export function analyzeMaintainability(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: {} };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 7, details: { note: 'No code files' } };
  }

  let totalLines = 0;
  let totalFiles = codePatches.length;
  let totalFunctions = 0;
  let totalFunctionLength = 0;
  let documentedFunctions = 0;
  let totalDocLines = 0;
  let longFiles = 0;
  let longFunctions = 0;
  let totalImports = 0;
  let totalExports = 0;

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;
    const code = addedLines.join('\n');

    if (addedLines.length > 300) longFiles++;

    const functionStarts = code.match(/\b(function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(|=>\s*\{|def\s+\w+|fn\s+\w+|func\s+\w+)/g);
    const funcCount = functionStarts ? functionStarts.length : 0;
    totalFunctions += funcCount;

    if (funcCount > 0) {
      const avgFuncLength = addedLines.length / funcCount;
      totalFunctionLength += avgFuncLength * funcCount;
      if (avgFuncLength > 40) longFunctions += funcCount;
    }

    for (const docPattern of DOC_PATTERNS) {
      const docMatches = code.match(docPattern);
      if (docMatches) {
        totalDocLines += docMatches.length;
      }
    }

    const jsdocBlocks = code.match(/\/\*\*[\s\S]*?\*\//g);
    if (jsdocBlocks) documentedFunctions += jsdocBlocks.length;

    const imports = code.match(/\b(import|require|from)\b/g);
    if (imports) totalImports += imports.length;

    const exports = code.match(/\b(export|module\.exports)\b/g);
    if (exports) totalExports += exports.length;
  }

  const avgFileSize = totalFiles > 0 ? totalLines / totalFiles : 0;
  const avgFunctionLength = totalFunctions > 0 ? totalFunctionLength / totalFunctions : 0;
  const docCoverage = totalFunctions > 0 ? documentedFunctions / totalFunctions : 0;
  const docDensity = totalLines > 0 ? totalDocLines / totalLines : 0;
  const longFileRatio = totalFiles > 0 ? longFiles / totalFiles : 0;
  const longFuncRatio = totalFunctions > 0 ? longFunctions / totalFunctions : 0;
  const moduleRatio = totalFiles > 0 ? totalExports / totalFiles : 0;

  const halsteadVolume = totalLines > 0 ? Math.log2(totalLines) * totalLines : 0;
  const avgComplexity = totalFunctions > 0 ? totalLines / totalFunctions * 0.5 : 5;
  const maintainabilityIndex = Math.max(
    0,
    171 -
      5.2 * Math.log(Math.max(halsteadVolume, 1)) -
      0.23 * avgComplexity -
      16.2 * Math.log(Math.max(totalLines, 1)) +
      50 * Math.sin(Math.sqrt(2.4 * docCoverage))
  );
  const normalizedMI = Math.min(100, Math.max(0, maintainabilityIndex));

  let score = 5;

  if (normalizedMI > 80) score += 2;
  else if (normalizedMI > 60) score += 1;
  else if (normalizedMI < 30) score -= 2;
  else if (normalizedMI < 50) score -= 1;

  if (avgFileSize < 100) score += 1;
  else if (avgFileSize > 500) score -= 1.5;
  else if (avgFileSize > 300) score -= 0.5;

  if (avgFunctionLength < 15) score += 1;
  else if (avgFunctionLength > 40) score -= 1;

  if (docCoverage > 0.5) score += 0.5;
  else if (docCoverage < 0.1) score -= 0.5;

  if (moduleRatio > 0.5) score += 0.5;
  else if (moduleRatio < 0.1 && totalFiles > 2) score -= 0.5;

  score = Math.max(1, Math.min(10, score));

  return {
    score: Math.round(score * 10) / 10,
    details: {
      maintainabilityIndex: Math.round(normalizedMI * 10) / 10,
      avgFileSize: Math.round(avgFileSize),
      avgFunctionLength: Math.round(avgFunctionLength * 10) / 10,
      docCoverage: Math.round(docCoverage * 100) / 100,
      docDensity: Math.round(docDensity * 1000) / 1000,
      longFileRatio: Math.round(longFileRatio * 100) / 100,
      longFunctionRatio: Math.round(longFuncRatio * 100) / 100,
      totalFiles,
      totalFunctions,
      totalLines,
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
