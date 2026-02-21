/**
 * Code Maintainability Analyzer
 *
 * Quantitative metrics:
 * - Maintainability Index estimate
 * - Average file size and function length
 * - Documentation coverage
 * - Module structure quality
 * - Technical debt: any type, TODO/FIXME/HACK, empty catch blocks
 *
 * Structural metrics:
 * - Abstraction patterns (interfaces, abstract classes, type aliases)
 * - Anti-patterns (long if-chains, callback nesting, numbered variables)
 * - Refactoring indicators (design patterns, utility modules)
 * - Directory organization quality
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

const TECH_DEBT_PATTERNS = [
  { pattern: /\bany\b/g, weight: 0.3, name: 'any-type' },
  { pattern: /\/\/\s*TODO/gi, weight: 0.2, name: 'todo-comment' },
  { pattern: /\/\/\s*FIXME/gi, weight: 0.5, name: 'fixme-comment' },
  { pattern: /\/\/\s*HACK/gi, weight: 0.7, name: 'hack-comment' },
  { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, weight: 1.5, name: 'empty-catch' },
];

const ABSTRACTION_PATTERNS = [
  { pattern: /\bclass\s+\w+\s+(extends|implements)\b/g, weight: 1, name: 'inheritance' },
  { pattern: /\binterface\s+\w+/g, weight: 1.5, name: 'interface-definition' },
  { pattern: /\btype\s+\w+\s*=/g, weight: 0.5, name: 'type-alias' },
  { pattern: /\babstract\s+class\b/g, weight: 1.5, name: 'abstract-class' },
  { pattern: /\bexport\s+(default\s+)?function\b/g, weight: 0.5, name: 'exported-function' },
  { pattern: /\bexport\s+(default\s+)?class\b/g, weight: 0.5, name: 'exported-class' },
  { pattern: /\bmodule\.exports\b/g, weight: 0.5, name: 'module-export' },
];

const STRUCTURAL_ANTI_PATTERNS = [
  { pattern: /if\s*\([^)]*\)\s*\{[^}]*\}\s*else\s+if\s*\([^)]*\)\s*\{[^}]*\}\s*else\s+if/g, weight: 1, name: 'long-if-chain' },
  { pattern: /case\s+['"][^'"]*['"]\s*:/g, weight: 0.3, name: 'string-case' },
  { pattern: /\.then\s*\([^)]*\.then/g, weight: 0.5, name: 'promise-chain' },
  { pattern: /callback\s*\(/g, weight: 0.3, name: 'callback-pattern' },
  { pattern: /\b(data|info|result|response|item|element|value)\d+\b/g, weight: 0.5, name: 'numbered-variable' },
];

const REFACTORING_POSITIVE = [
  { pattern: /\bextract\w*(?:Method|Function|Component|Class)\b/gi, weight: 1, name: 'extract-refactor' },
  { pattern: /\b(util|helper|shared|common|lib)\b/gi, weight: 0.3, name: 'utility-module' },
  { pattern: /\b(factory|builder|strategy|observer|adapter)\b/gi, weight: 0.5, name: 'design-pattern' },
  { pattern: /\b(middleware|plugin|hook|decorator)\b/gi, weight: 0.5, name: 'extensibility-pattern' },
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
  let totalExports = 0;
  let techDebtWeight = 0;
  let techDebtCount = 0;
  const techDebtByType = {};

  let abstractionScore = 0;
  let antiPatternScore = 0;
  let refactoringScore = 0;
  const antiPatternDetails = [];
  const abstractionDetails = [];
  const directoryStructure = new Map();
  const evidence = [];

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;
    const code = addedLines.join('\n');

    if (addedLines.length > 300) {
      longFiles++;
      evidence.push({ file: file.filename, line: 1, snippet: `File has ${addedLines.length} lines`, issue: 'large-file' });
    }

    const dir = file.filename.split('/').slice(0, -1).join('/') || '/';
    directoryStructure.set(dir, (directoryStructure.get(dir) || 0) + 1);

    for (let lineIndex = 0; lineIndex < addedLines.length; lineIndex++) {
      const line = addedLines[lineIndex];
      for (const rule of TECH_DEBT_PATTERNS) {
        const matches = line.match(rule.pattern);
        if (matches) {
          techDebtCount += matches.length;
          techDebtWeight += matches.length * rule.weight;
          techDebtByType[rule.name] = (techDebtByType[rule.name] || 0) + matches.length;
          evidence.push({ file: file.filename, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: rule.name });
        }
      }
    }

    for (const pattern of ABSTRACTION_PATTERNS) {
      const matches = code.match(pattern.pattern);
      if (matches) {
        abstractionScore += matches.length * pattern.weight;
        abstractionDetails.push({ type: pattern.name, file: file.filename, count: matches.length });
      }
    }

    for (let lineIndex = 0; lineIndex < addedLines.length; lineIndex++) {
      const line = addedLines[lineIndex];
      for (const pattern of STRUCTURAL_ANTI_PATTERNS) {
        const matches = line.match(pattern.pattern);
        if (matches) {
          antiPatternScore += matches.length * pattern.weight;
          antiPatternDetails.push({ type: pattern.name, file: file.filename, count: matches.length });
          evidence.push({ file: file.filename, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: pattern.name });
        }
      }
    }

    for (const pattern of REFACTORING_POSITIVE) {
      const matches = code.match(pattern.pattern);
      if (matches) {
        refactoringScore += matches.length * pattern.weight;
      }
    }

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
  const techDebtRate = totalLines > 0 ? techDebtWeight / totalLines : 0;
  const abstractionRate = totalLines > 0 ? abstractionScore / totalLines : 0;
  const antiPatternRate = totalLines > 0 ? antiPatternScore / totalLines : 0;
  const refactoringRate = totalLines > 0 ? refactoringScore / totalLines : 0;

  const dirCount = directoryStructure.size;
  const avgFilesPerDir = codePatches.length / Math.max(dirCount, 1);
  const isWellOrganized = dirCount > 1 && avgFilesPerDir < 10;

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

  // --- Quantitative scoring (half the weight) ---
  let quantScore = 5;

  if (normalizedMI > 80) quantScore += 2;
  else if (normalizedMI > 60) quantScore += 1;
  else if (normalizedMI < 30) quantScore -= 2;
  else if (normalizedMI < 50) quantScore -= 1;

  if (avgFileSize < 100) quantScore += 0.8;
  else if (avgFileSize > 500) quantScore -= 1.2;
  else if (avgFileSize > 300) quantScore -= 0.5;

  if (avgFunctionLength < 15) quantScore += 0.8;
  else if (avgFunctionLength > 40) quantScore -= 0.8;

  if (docCoverage > 0.5) quantScore += 0.5;
  else if (docCoverage < 0.1) quantScore -= 0.5;

  if (moduleRatio > 0.5) quantScore += 0.4;
  else if (moduleRatio < 0.1 && totalFiles > 2) quantScore -= 0.4;

  if (techDebtRate > 0.05) quantScore -= 1.2;
  else if (techDebtRate > 0.02) quantScore -= 0.6;
  else if (techDebtRate > 0.01) quantScore -= 0.3;

  quantScore = Math.max(1, Math.min(10, quantScore));

  // --- Structural scoring (half the weight) ---
  let structScore = 5;

  if (abstractionRate > 0.02) structScore += 1.5;
  else if (abstractionRate > 0.01) structScore += 0.8;

  if (antiPatternRate > 0.05) structScore -= 2;
  else if (antiPatternRate > 0.02) structScore -= 1;
  else if (antiPatternRate > 0.01) structScore -= 0.5;

  if (refactoringRate > 0.01) structScore += 1;
  else if (refactoringRate > 0.005) structScore += 0.5;

  if (isWellOrganized) structScore += 1;
  if (avgFilesPerDir > 15) structScore -= 1;

  structScore = Math.max(1, Math.min(10, structScore));

  // --- Combined score: 50/50 blend ---
  const score = Math.max(1, Math.min(10, (quantScore + structScore) / 2));

  const techDebtItems = Object.entries(techDebtByType)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

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
      techDebtItems,
      techDebtCount,
      techDebtRate: Math.round(techDebtRate * 1000) / 1000,
      abstractionScore: Math.round(abstractionScore * 10) / 10,
      antiPatternScore: Math.round(antiPatternScore * 10) / 10,
      refactoringScore: Math.round(refactoringScore * 10) / 10,
      directories: dirCount,
      avgFilesPerDirectory: Math.round(avgFilesPerDir * 10) / 10,
      wellOrganized: isWellOrganized,
      topAntiPatterns: antiPatternDetails.slice(0, 5),
      abstractions: abstractionDetails.slice(0, 5),
      totalFiles,
      totalFunctions,
      totalLines,
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
