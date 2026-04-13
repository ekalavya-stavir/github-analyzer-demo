/**
 * Shared diff-parsing utilities for analysis modules.
 *
 * Two extraction modes:
 * - extractAddedLines:   Only `+` lines (new code the developer wrote)
 * - extractVisibleLines: Context + added lines (code as it exists post-change)
 *
 * Use extractAddedLines for quality/style checks (only judge new code).
 * Use extractVisibleLines for structural analysis like function counting,
 * where you need the surrounding code context to understand structure.
 */

export function extractAddedLines(patch) {
  if (!patch) return [];
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.substring(1));
}

export function extractVisibleLines(patch) {
  if (!patch) return [];
  const lines = patch.split('\n');
  const result = [];
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@') || line === '\\ No newline at end of file') continue;
    if (line.startsWith('-')) continue;
    if (line.startsWith('+')) {
      result.push(line.substring(1));
    } else {
      result.push(line.startsWith(' ') ? line.substring(1) : line);
    }
  }
  return result;
}

/**
 * Extracts the exact line numbers (integers) that were added or modified
 * in a Git unified diff patch.
 */
export function extractModifiedLineNumbers(patch) {
  if (!patch) return [];
  const lines = patch.split('\n');
  const lineNumbers = [];
  let currentLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // e.g. @@ -10,3 +10,5 @@
      const match = line.match(/\+([0-9]+)(?:,[0-9]+)?/);
      if (match) {
        currentLine = parseInt(match[1], 10);
      }
      continue;
    }

    if (line.startsWith('---') || line.startsWith('+++') || line === '\\ No newline at end of file') {
      continue;
    }

    if (line.startsWith('+')) {
      lineNumbers.push(currentLine);
      currentLine++;
    } else if (line.startsWith(' ')) {
      currentLine++;
    } else if (line.startsWith('-')) {
      // Deletions don't increment the line number in the target file
    }
  }

  return lineNumbers;
}

/**
 * Count function/method definitions in code text.
 * Targets actual declarations, not method calls.
 */
export function countFunctions(codeText) {
  let count = 0;

  const funcKeyword = codeText.match(/\bfunction\s+\w+\s*\(/g);
  if (funcKeyword) count += funcKeyword.length;

  const anonFuncs = codeText.match(/\bfunction\s*\(/g);
  if (anonFuncs) count += anonFuncs.length;

  const arrowFuncs = codeText.match(/=>\s*[{(]/g);
  if (arrowFuncs) count += arrowFuncs.length;

  const pyFuncs = codeText.match(/\bdef\s+\w+\s*\(/g);
  if (pyFuncs) count += pyFuncs.length;

  const rsFuncs = codeText.match(/\bfn\s+\w+\s*\(/g);
  if (rsFuncs) count += rsFuncs.length;

  const goFuncs = codeText.match(/\bfunc\s+\w+\s*\(/g);
  if (goFuncs) count += goFuncs.length;

  const classMethodLines = codeText.match(/^\s*(?:(?:public|private|protected|internal)\s+)(?:static\s+)?(?:async\s+)?(?:\w+\s+)*\w+\s*\([^)]*\)\s*[{:]/gm);
  if (classMethodLines) {
    for (const line of classMethodLines) {
      if (!/\bfunction\b/.test(line)) count++;
    }
  }

  return count;
}
