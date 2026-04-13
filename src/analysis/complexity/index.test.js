import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAST } from '../ast-parser.js';
import { calculateNodeComplexity, calculateDeltaComplexity, countDecisionPointsInLines } from './index.js';

describe('AST Complexity Analyzer', () => {

    describe('calculateNodeComplexity', () => {
        it('should calculate cyclomatic complexity for a simple function (V(G) = 1)', async () => {
            const code = `
        function simple() {
          return 42;
        }
      `;
            const ast = await getAST(code, 'src/test.js');

            const { decisionPoints, functions } = calculateNodeComplexity(ast);
            assert.equal(decisionPoints, 0); // 1 base path, 0 extra decisions
            assert.equal(functions, 1);
        });

        it('should correctly count branching logic (if, switch, loops)', async () => {
            const code = `
        function complex(a, b) {
          if (a > 10) {
            for (let i = 0; i < a; i++) {
              console.log(b || 'default');
            }
          } else if (a < 0) {
            return a ? true : false;
          }
        }
      `;
            const ast = await getAST(code, 'src/test.js');

            const { decisionPoints, functions } = calculateNodeComplexity(ast);
            // Decisions: 
            // 1: if (a > 10)
            // 2: for (...)
            // 3: b || 'default'
            // 4: else if (a < 0)
            // 5: a ? true : false
            assert.equal(decisionPoints, 5);
            assert.equal(functions, 1);
        });
    });

    describe('countDecisionPointsInLines', () => {
        it('should count only decision points on specified lines', async () => {
            const code = `function test(a, b) {
  if (a > 10) {
    for (let i = 0; i < a; i++) {
      console.log(i);
    }
  }
  if (b > 5) {
    return true;
  }
}`;
            const ast = await getAST(code, 'src/test.js');

            // Only count lines 2-3 (the first if and for)
            const count = countDecisionPointsInLines(ast, [2, 3]);
            assert.equal(count, 2); // if on line 2, for on line 3

            // Only count line 7 (the second if)
            const count2 = countDecisionPointsInLines(ast, [7]);
            assert.equal(count2, 1); // if on line 7
        });

        it('should return 0 for lines with no decision points', async () => {
            const code = `function test() {
  if (true) {
    console.log('hello');
  }
}`;
            const ast = await getAST(code, 'src/test.js');

            // Line 3 is just console.log, not a decision point
            const count = countDecisionPointsInLines(ast, [3]);
            assert.equal(count, 0);
        });

        it('should return 0 for empty lines array', async () => {
            const code = `function test() { if (true) {} }`;
            const ast = await getAST(code, 'src/test.js');

            const count = countDecisionPointsInLines(ast, []);
            assert.equal(count, 0);
        });

        it('should return 0 for null rootNode', () => {
            const count = countDecisionPointsInLines(null, [1, 2, 3]);
            assert.equal(count, 0);
        });
    });

    describe('calculateDeltaComplexity', () => {
        it('should return a positive delta when complexity is added within modified lines', async () => {
            const baseCode = `function process(data) {
  return data.map(d => d * 2);
}`;
            const headCode = `function process(data) {
  if (!data) return [];
  return data.map(d => d * 2);
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            // The developer modified line 2 (added the if statement)
            const modifiedLines = [2];

            const delta = calculateDeltaComplexity(baseAst, headAst, modifiedLines);
            assert.equal(delta > 0, true, `Expected positive delta but got ${delta}`);
        });

        it('should return 0 when complexity is added outside modified lines', async () => {
            const baseCode = `function process(data) {
  return data.map(d => d * 2);
}
function other(x) {
  return x;
}`;
            const headCode = `function process(data) {
  return data.map(d => d * 2);
}
function other(x) {
  if (x > 0) return x;
  return -x;
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            // Developer only "modified" line 2 (no complexity change there)
            const modifiedLines = [2];

            const delta = calculateDeltaComplexity(baseAst, headAst, modifiedLines);
            assert.equal(delta, 0, `Expected 0 delta for unmodified complexity, got ${delta}`);
        });

        it('should return a negative delta when complexity is reduced (refactoring)', async () => {
            const baseCode = `function process(data) {
  if (data) {
     if (data.length > 0) {
        for(let i=0; i<data.length; i++) {
           console.log(data[i]);
        }
     }
  }
}`;
            const headCode = `function process(data) {
  if (!data || data.length === 0) return;
  data.forEach(d => console.log(d));
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const modifiedLines = [2, 3, 4, 5, 6, 7];

            const delta = calculateDeltaComplexity(baseAst, headAst, modifiedLines);
            assert.equal(delta < 0, true, `Expected negative delta for reduced complexity, got ${delta}`);
        });

        it('should return 0 when complexity is unchanged on modified lines', async () => {
            const baseCode = `function process(data) {
  if (data) return true;
  return false;
}`;
            const headCode = `function process(data) {
  if (data) return "yes";
  return "no";
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const modifiedLines = [2, 3];

            const delta = calculateDeltaComplexity(baseAst, headAst, modifiedLines);
            assert.equal(delta, 0);
        });

        it('should return 0 when modifiedLines is empty', async () => {
            const baseCode = `function a() { if (true) {} }`;
            const headCode = `function a() { if (true) {} if (false) {} }`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const delta = calculateDeltaComplexity(baseAst, headAst, []);
            assert.equal(delta, 0);
        });

        it('should count all head complexity as added when base is null (new file)', async () => {
            const headCode = `function test(x) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      console.log(i);
    }
  }
}`;
            const headAst = await getAST(headCode, 'src/test.js');

            const modifiedLines = [1, 2, 3, 4, 5, 6, 7];

            const delta = calculateDeltaComplexity(null, headAst, modifiedLines);
            assert.equal(delta, 2); // if + for on the modified lines
        });
    });
});
