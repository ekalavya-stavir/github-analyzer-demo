/**
 * Duplicate Code Analyzer
 *
 * Detects duplicate code blocks introduced in PRs using token-based similarity.
 * Uses normalized line comparison to find repeated blocks.
 *
 * Score: 0-10 (10 = no duplication, inverse scoring)
 */

const MIN_DUPLICATE_LINES = 4;
const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|c|cpp|cs|php|swift|kt)$/;

export function analyzeDuplication(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: { duplicateBlocks: 0, duplicateLines: 0, totalLines: 0 } };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 7, details: { duplicateBlocks: 0, duplicateLines: 0, totalLines: 0, note: 'No code files' } };
  }

  const allAddedBlocks = [];
  let totalLines = 0;

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;

    const normalized = addedLines.map(normalizeLine).filter((l) => l.length > 0);

    for (let i = 0; i <= normalized.length - MIN_DUPLICATE_LINES; i++) {
      const block = normalized.slice(i, i + MIN_DUPLICATE_LINES).join('\n');
      allAddedBlocks.push({
        hash: simpleHash(block),
        block,
        file: file.filename,
        startLine: i,
      });
    }
  }

  const hashCounts = {};
  const duplicateExamples = [];

  for (const item of allAddedBlocks) {
    if (!hashCounts[item.hash]) {
      hashCounts[item.hash] = [];
    }
    hashCounts[item.hash].push(item);
  }

  let duplicateBlocks = 0;
  let duplicateLines = 0;

  for (const [, items] of Object.entries(hashCounts)) {
    if (items.length > 1) {
      const uniqueFiles = new Set(items.map((i) => i.file));
      if (uniqueFiles.size > 1 || items.length > 2) {
        duplicateBlocks += items.length - 1;
        duplicateLines += (items.length - 1) * MIN_DUPLICATE_LINES;

        if (duplicateExamples.length < 5) {
          duplicateExamples.push({
            files: [...uniqueFiles],
            occurrences: items.length,
            snippet: items[0].block.split('\n').slice(0, 3).join(' | '),
          });
        }
      }
    }
  }

  const duplicationRatio = totalLines > 0 ? duplicateLines / totalLines : 0;

  let score;
  if (duplicationRatio === 0) {
    score = 10;
  } else if (duplicationRatio < 0.03) {
    score = 9;
  } else if (duplicationRatio < 0.06) {
    score = 8;
  } else if (duplicationRatio < 0.1) {
    score = 7;
  } else if (duplicationRatio < 0.15) {
    score = 6;
  } else if (duplicationRatio < 0.2) {
    score = 5;
  } else if (duplicationRatio < 0.3) {
    score = 4;
  } else if (duplicationRatio < 0.4) {
    score = 3;
  } else if (duplicationRatio < 0.5) {
    score = 2;
  } else {
    score = 1;
  }

  return {
    score: Math.round(score * 10) / 10,
    details: {
      duplicateBlocks,
      duplicateLines,
      totalLines,
      duplicationRatio: Math.round(duplicationRatio * 1000) / 1000,
      examples: duplicateExamples,
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

function normalizeLine(line) {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/['"`]/g, '"')
    .trim();
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}
