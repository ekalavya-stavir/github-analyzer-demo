import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import PHP from 'tree-sitter-php';

const parsers = {
    js: new Parser(),
    ts: new Parser(),
    jsx: new Parser(),
    tsx: new Parser(),
    php: new Parser(),
};

parsers.js.setLanguage(JavaScript);
parsers.jsx.setLanguage(JavaScript);
parsers.ts.setLanguage(TypeScript.typescript);
parsers.tsx.setLanguage(TypeScript.tsx);
parsers.php.setLanguage(PHP.php);

// Cache structure: { "commit_sha_path": ASTNode }
const astCache = new Map();

/**
 * Parses code into an AST or retrieves it from cache.
 *
 * @param {string} code - The raw source code
 * @param {string} filepath - To determine the language parser
 * @param {string} [cacheKey] - Optional key for caching (usually commit + path)
 * @returns {import('tree-sitter').SyntaxNode | null} The root node of the AST
 */
export async function getAST(code, filepath, cacheKey) {
    if (cacheKey && astCache.has(cacheKey)) {
        return astCache.get(cacheKey);
    }

    const ext = filepath.split('.').pop().toLowerCase();
    const parser = parsers[ext];
    if (!parser) return null; // Unsupported language

    if (typeof code !== 'string' || code.length === 0) return null;

    // Tree-sitter parse is synchronous in Node, but we wrap in async for API consistency
    let tree;
    try {
        // Fix 'Invalid argument' by increasing buffer size dynamically for large files
        const bufferSize = Math.max(1024 * 1024, code.length * 4);
        tree = parser.parse(code, null, { bufferSize });
    } catch (err) {
        console.warn(`    Warning: tree-sitter failed to parse ${filepath}: ${err.message}`);
        return null;
    }
    const rootNode = tree.rootNode;

    if (cacheKey) {
        astCache.set(cacheKey, rootNode);
    }

    return rootNode;
}

/**
 * Checks if a Tree-sitter AST Node's line range overlaps with an array of modified lines.
 * Tree-sitter lines are 0-indexed (row). The modified lines array is 1-indexed.
 *
 * @param {import('tree-sitter').SyntaxNode} node 
 * @param {number[]} modifiedLines 
 * @returns {boolean}
 */
export function doesIntersect(node, modifiedLines) {
    if (!node || !modifiedLines || modifiedLines.length === 0) return false;

    const nodeStartLine = node.startPosition.row + 1;
    const nodeEndLine = node.endPosition.row + 1;

    for (const line of modifiedLines) {
        if (line >= nodeStartLine && line <= nodeEndLine) {
            return true;
        }
    }

    return false;
}
