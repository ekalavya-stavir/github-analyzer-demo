import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAST, doesIntersect } from './ast-parser.js';

describe('AST Parser Utility', () => {
    it('should parse JavaScript code and return an AST node', async () => {
        const code = `
      function hello() {
        if (true) {
          console.log('world');
        }
      }
    `;

        // Act
        const ast = await getAST(code, 'src/index.js');

        // Assert
        assert.ok(ast);
        assert.equal(ast.type, 'program');
        assert.ok(ast.children.length > 0);
        assert.equal(ast.children[0].type, 'function_declaration');
    });

    it('should hit the cache for subsequent calls with the same key', async () => {
        const code = 'const x = 1;';
        const cacheKey = 'commitABC123_src/foo.js';

        // Act
        const ast1 = await getAST(code, 'src/foo.js', cacheKey);
        const ast2 = await getAST('different code, should be ignored because cache hits', 'src/foo.js', cacheKey);

        // Assert
        assert.ok(ast1);
        assert.strictEqual(ast2, ast1); // Must be the exact same object reference from cache
    });

    describe('doesIntersect', () => {
        it('should return true if the node range overlaps with modified lines', () => {
            // simulate a node from line 10 to 20
            const node = { startPosition: { row: 9 }, endPosition: { row: 19 } }; // tree-sitter uses 0-indexed rows
            const modifiedLines = [5, 15, 25]; // Line 15 is row 14, inside the 9-19 range

            assert.equal(doesIntersect(node, modifiedLines), true);
        });

        it('should return false if the node range does not overlap', () => {
            const node = { startPosition: { row: 9 }, endPosition: { row: 19 } }; // Lines 10-20
            const modifiedLines = [5, 25]; // Outside the range

            assert.equal(doesIntersect(node, modifiedLines), false);
        });

        it('should return true on the exact boundaries', () => {
            const node = { startPosition: { row: 9 }, endPosition: { row: 19 } }; // Lines 10-20

            assert.equal(doesIntersect(node, [10]), true);
            assert.equal(doesIntersect(node, [20]), true);
        });
    });
});
