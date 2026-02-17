/**
 * Structural Maintainability Analyzer
 *
 * Evaluates:
 * - Repeated logic patterns
 * - Clear abstraction boundaries
 * - Refactoring patterns (extract method, rename, etc.)
 *
 * Score: 0-10 (10 = best structural quality)
 */

const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|c|cpp|cs|php)$/;

const ABSTRACTION_PATTERNS = [
  { pattern: /\bclass\s+\w+\s+(extends|implements)\b/g, weight: 1, name: 'inheritance' },
  { pattern: /\binterface\s+\w+/g, weight: 1.5, name: 'interface-definition' },
  { pattern: /\btype\s+\w+\s*=/g, weight: 0.5, name: 'type-alias' },
  { pattern: /\babstract\s+class\b/g, weight: 1.5, name: 'abstract-class' },
  { pattern: /\bexport\s+(default\s+)?function\b/g, weight: 0.5, name: 'exported-function' },
  { pattern: /\bexport\s+(default\s+)?class\b/g, weight: 0.5, name: 'exported-class' },
  { pattern: /\bmodule\.exports\b/g, weight: 0.5, name: 'module-export' },
];

const ANTI_PATTERNS = [
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

export function analyzeStructural(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: {} };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 7, details: { note: 'No code files' } };
  }

  let totalLines = 0;
  let abstractionScore = 0;
  let antiPatternScore = 0;
  let refactoringScore = 0;
  const antiPatternDetails = [];
  const abstractionDetails = [];

  const directoryStructure = new Map();

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;
    const code = addedLines.join('\n');

    const dir = file.filename.split('/').slice(0, -1).join('/') || '/';
    directoryStructure.set(dir, (directoryStructure.get(dir) || 0) + 1);

    for (const pattern of ABSTRACTION_PATTERNS) {
      const matches = code.match(pattern.pattern);
      if (matches) {
        abstractionScore += matches.length * pattern.weight;
        abstractionDetails.push({ type: pattern.name, file: file.filename, count: matches.length });
      }
    }

    for (const pattern of ANTI_PATTERNS) {
      const matches = code.match(pattern.pattern);
      if (matches) {
        antiPatternScore += matches.length * pattern.weight;
        antiPatternDetails.push({ type: pattern.name, file: file.filename, count: matches.length });
      }
    }

    for (const pattern of REFACTORING_POSITIVE) {
      const matches = code.match(pattern.pattern);
      if (matches) {
        refactoringScore += matches.length * pattern.weight;
      }
    }
  }

  const dirCount = directoryStructure.size;
  const avgFilesPerDir = codePatches.length / Math.max(dirCount, 1);
  const isWellOrganized = dirCount > 1 && avgFilesPerDir < 10;

  const abstractionRate = totalLines > 0 ? abstractionScore / totalLines : 0;
  const antiPatternRate = totalLines > 0 ? antiPatternScore / totalLines : 0;
  const refactoringRate = totalLines > 0 ? refactoringScore / totalLines : 0;

  let score = 5;

  if (abstractionRate > 0.02) score += 1.5;
  else if (abstractionRate > 0.01) score += 0.8;

  if (antiPatternRate > 0.05) score -= 2;
  else if (antiPatternRate > 0.02) score -= 1;
  else if (antiPatternRate > 0.01) score -= 0.5;

  if (refactoringRate > 0.01) score += 1;
  else if (refactoringRate > 0.005) score += 0.5;

  if (isWellOrganized) score += 1;
  if (avgFilesPerDir > 15) score -= 1;

  score = Math.max(1, Math.min(10, score));

  return {
    score: Math.round(score * 10) / 10,
    details: {
      abstractionScore: Math.round(abstractionScore * 10) / 10,
      antiPatternScore: Math.round(antiPatternScore * 10) / 10,
      refactoringScore: Math.round(refactoringScore * 10) / 10,
      directories: dirCount,
      avgFilesPerDirectory: Math.round(avgFilesPerDir * 10) / 10,
      wellOrganized: isWellOrganized,
      topAntiPatterns: antiPatternDetails.slice(0, 5),
      abstractions: abstractionDetails.slice(0, 5),
      linesAnalyzed: totalLines,
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
