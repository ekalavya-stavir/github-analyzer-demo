/**
 * Duplicate Code Analyzer
 *
 * Detects duplicate code blocks introduced in PRs using token-based similarity.
 * Uses normalized line comparison to find repeated blocks.
 *
 * Score: 0-10 (10 = no duplication, inverse scoring)
 */

const MIN_DUPLICATE_LINES = 6;
const MIN_DUPLICATE_CHARS = 61;
const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|rb|rs|c|cpp|cs|php|swift|kt)$/;

export function analyzeDuplication(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: { duplicateBlocks: 0, duplicateLines: 0, totalLines: 0, evidence: [{ file: 'Summary', line: 0, snippet: 'No patches available for analysis', issue: 'no-data' }] } };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 7, details: { duplicateBlocks: 0, duplicateLines: 0, totalLines: 0, note: 'No code files', evidence: [{ file: 'Summary', line: 0, snippet: `${patches.length} files analyzed, none are code files`, issue: 'no-code-files' }] } };
  }

  const allAddedBlocks = [];
  let totalLines = 0;

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;

    const withNorm = addedLines
      .map((al) => ({ ...al, norm: normalizeLine(al.text) }))
      .filter((al) => al.norm.length > 0);

    for (let i = 0; i <= withNorm.length - MIN_DUPLICATE_LINES; i++) {
      const slice = withNorm.slice(i, i + MIN_DUPLICATE_LINES);
      const block = slice.map((s) => s.norm).join('\n');
      if (block.length < MIN_DUPLICATE_CHARS) continue;
      allAddedBlocks.push({
        hash: simpleHash(block),
        block,
        originalLines: slice.map((s) => s.text),
        file: file.filename,
        repo: file.repo,
        startLine: slice[0].line,
        endLine: slice[slice.length - 1].line,
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
            locations: items.map((i) => ({
              file: i.file,
              repo: i.repo,
              startLine: i.startLine,
              endLine: i.endLine,
            })),
            occurrences: items.length,
            originalLines: items[0].originalLines,
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
      evidence: [
        { file: 'Summary', line: 0, snippet: `${duplicateBlocks} duplicate blocks, ${duplicateLines} duplicate lines out of ${totalLines} total (${Math.round(duplicationRatio * 1000) / 10}% duplication)`, issue: duplicateBlocks === 0 ? 'clean' : 'overview' },
        ...duplicateExamples.slice(0, 5).flatMap((ex) => {
          const uniqueFiles = new Set(ex.locations.map((l) => l.file));
          const header = `duplicate-block (${ex.occurrences}x across ${uniqueFiles.size} file${uniqueFiles.size > 1 ? 's' : ''})`;
          return ex.locations.map((loc) => ({
            file: loc.file,
            repo: loc.repo,
            line: loc.startLine,
            snippet: ex.originalLines.map((l, i) => `${loc.startLine + i} | ${l}`).join('\n'),
            issue: header,
          }));
        }),
      ],
    },
  };
}

function extractAddedLines(patch) {
  if (!patch) return [];
  const results = [];
  let currentLine = 0;
  for (const raw of patch.split('\n')) {
    const hunkMatch = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      results.push({ line: currentLine, text: raw.substring(1) });
      currentLine++;
    } else if (!raw.startsWith('-')) {
      currentLine++;
    }
  }
  return results;
}

const SKIP_LINE_PATTERN = /^\s*(import\s|export\s.*from|require\s*\(|using\s|use\s|from\s+\S+\s+import|#include|package\s|\/\/|\/\*|\*\/|\*\s|return\s|return;|return$)/;

function normalizeLine(line) {
  if (SKIP_LINE_PATTERN.test(line)) return '';
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
