/**
 * N+1 Query Detection Analyzer
 *
 * Detects potential N+1 query anti-patterns:
 * - ORM queries inside loops (Sequelize, TypeORM, Prisma, Mongoose)
 * - SQL queries inside loops
 * - API calls inside loops
 * - Missing eager loading patterns
 *
 * Score: 0-10 (10 = no N+1 patterns, inverse scoring)
 */

const LOOP_PATTERNS = [
  /\bfor\s*\(/,
  /\bfor\s+of\b/,
  /\bfor\s+in\b/,
  /\bwhile\s*\(/,
  /\.forEach\s*\(/,
  /\.map\s*\(/,
  /\.filter\s*\(/,
  /\.reduce\s*\(/,
  /\.flatMap\s*\(/,
  /for\s+\w+\s+in\s+/,
  /for\s+\w+,?\s*\w*\s+:?=?\s+range/,
];

const QUERY_PATTERNS = [
  { pattern: /\.find\s*\(/g, name: 'orm-find' },
  { pattern: /\.findOne\s*\(/g, name: 'orm-findOne' },
  { pattern: /\.findAll\s*\(/g, name: 'orm-findAll' },
  { pattern: /\.findMany\s*\(/g, name: 'prisma-findMany' },
  { pattern: /\.findUnique\s*\(/g, name: 'prisma-findUnique' },
  { pattern: /\.findFirst\s*\(/g, name: 'prisma-findFirst' },
  { pattern: /\.findById\s*\(/g, name: 'orm-findById' },
  { pattern: /\.findByPk\s*\(/g, name: 'sequelize-findByPk' },
  { pattern: /\.query\s*\(/g, name: 'raw-query' },
  { pattern: /\.execute\s*\(/g, name: 'execute-query' },
  { pattern: /\.getRepository\s*\(/g, name: 'typeorm-getRepository' },
  { pattern: /\.createQueryBuilder\s*\(/g, name: 'typeorm-queryBuilder' },
  { pattern: /\bSELECT\b.*\bFROM\b/gi, name: 'sql-select' },
  { pattern: /\bINSERT\b.*\bINTO\b/gi, name: 'sql-insert' },
  { pattern: /\bUPDATE\b.*\bSET\b/gi, name: 'sql-update' },
  { pattern: /\bDELETE\b.*\bFROM\b/gi, name: 'sql-delete' },
  { pattern: /\bfetch\s*\(/g, name: 'api-fetch' },
  { pattern: /\baxios\.\w+\s*\(/g, name: 'api-axios' },
  { pattern: /\.get\s*\(\s*['"`]https?:/g, name: 'api-get' },
  { pattern: /\.post\s*\(\s*['"`]https?:/g, name: 'api-post' },
  { pattern: /\.populate\s*\(/g, name: 'mongoose-populate' },
  { pattern: /\.aggregate\s*\(/g, name: 'mongoose-aggregate' },
];

const EAGER_LOADING_PATTERNS = [
  /include\s*:/,
  /\.populate\s*\(/,
  /\.join\s*\(/,
  /\.leftJoin\s*\(/,
  /\.innerJoin\s*\(/,
  /relations\s*:/,
  /\.eager\s*\(/,
  /with\s*:/,
  /preload\s*:/,
];

const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|cs|php)$/;

export function analyzeNPlusOne(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: { violations: [], totalViolations: 0, linesAnalyzed: 0 } };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 8, details: { violations: [], totalViolations: 0, linesAnalyzed: 0, note: 'No code files' } };
  }

  const violations = [];
  let totalLines = 0;

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;
    const fileViolations = detectNPlusOneInFile(addedLines, file.filename);
    violations.push(...fileViolations);
  }

  const totalViolations = violations.length;
  const violationsPerKLOC = totalLines > 0 ? (totalViolations / totalLines) * 1000 : 0;

  let score;
  if (totalViolations === 0) {
    score = 10;
  } else if (violationsPerKLOC < 1) {
    score = 9;
  } else if (violationsPerKLOC < 3) {
    score = 8;
  } else if (violationsPerKLOC < 5) {
    score = 7;
  } else if (violationsPerKLOC < 8) {
    score = 6;
  } else if (violationsPerKLOC < 12) {
    score = 5;
  } else if (violationsPerKLOC < 18) {
    score = 4;
  } else if (violationsPerKLOC < 25) {
    score = 3;
  } else {
    score = 2;
  }

  return {
    score: Math.round(score * 10) / 10,
    details: {
      violations: violations.slice(0, 20),
      evidence: violations.slice(0, 15).map((v) => ({
        file: v.file,
        line: v.line,
        snippet: v.snippet,
        issue: v.type,
      })),
      totalViolations,
      linesAnalyzed: totalLines,
      violationsPerKLOC: Math.round(violationsPerKLOC * 10) / 10,
    },
  };
}

function detectNPlusOneInFile(lines, filename) {
  const violations = [];
  let insideLoop = false;
  let loopDepth = 0;
  let loopStartLine = 0;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const isLoopStart = LOOP_PATTERNS.some((p) => p.test(trimmed));

    if (isLoopStart) {
      if (!insideLoop) {
        insideLoop = true;
        loopStartLine = i;
        braceCount = 0;
      }
      loopDepth++;
    }

    if (insideLoop) {
      braceCount += (trimmed.match(/\{/g) || []).length;
      braceCount -= (trimmed.match(/\}/g) || []).length;

      for (const qp of QUERY_PATTERNS) {
        if (qp.pattern.test(trimmed)) {
          const hasEagerLoading = EAGER_LOADING_PATTERNS.some((ep) => {
            const context = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
            return ep.test(context);
          });

          if (!hasEagerLoading) {
            violations.push({
              file: filename,
              line: i + 1,
              type: qp.name,
              snippet: trimmed.substring(0, 120),
              loopStartLine: loopStartLine + 1,
            });
          }
          break;
        }
      }

      if (braceCount <= 0 && i > loopStartLine) {
        loopDepth--;
        if (loopDepth <= 0) {
          insideLoop = false;
          loopDepth = 0;
        }
      }
    }
  }

  return violations;
}

function extractAddedLines(patch) {
  if (!patch) return [];
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.substring(1));
}
