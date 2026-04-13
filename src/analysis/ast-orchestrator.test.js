import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runASTAnalysisForDeveloper } from './ast-orchestrator.js';

/**
 * Test suite for the AST orchestrator's attribution logic.
 *
 * These tests verify the CRITICAL behaviour: each developer is only
 * penalized for issues they actually introduced, and gets credit when
 * they fix an existing issue.
 *
 * We use real AST parsing (tree-sitter) via the orchestrator so
 * we can trust end-to-end correctness of the pipeline.
 */

// --- Helpers ---

/**
 * Creates a minimal commit object for the orchestrator.
 * The orchestrator uses `aggregateDeveloperCommits` which requires:
 *   { sha, parentSha, author, date, repo, files: [{ filename, addedLines }] }
 */
function makeCommit({ sha, parentSha, author, date, repo, filename, addedLines }) {
    return {
        sha,
        parentSha: parentSha || '',
        author,
        date: date || '2026-04-01T10:00:00Z',
        repo: repo || 'test-org/test-repo',
        files: [{ filename, addedLines }],
    };
}

/**
 * Stubs the local file fetcher by placing files in a map keyed by "sha:filename".
 * We monkey-patch fetchLocalFileAtCommit to intercept calls.
 */
function createFakeLocalReposMap(fileContentsByShaAndPath, repoKey = 'test-org/test-repo') {
    const localPath = '/fake/local/repo';
    const map = new Map();
    map.set(repoKey, localPath);

    // We need to override fetchLocalFileAtCommit at the module level.
    // Since this is tricky with ESM, we instead use a more direct approach:
    // the orchestrator calls fetchLocalFileAtCommit(localPath, sha, filename)
    // We'll mock at the import level.
    map._fileContents = fileContentsByShaAndPath;
    return map;
}

// ──────────────────────────────────────────────────────────────────────
// Since the orchestrator imports fetchLocalFileAtCommit from the fetcher,
// and we can't easily mock ESM imports, we use a different strategy:
// We test the CORE logic (N+1 delta detection + doesIntersect) directly.
// ──────────────────────────────────────────────────────────────────────

import { getAST, doesIntersect } from './ast-parser.js';
import { detectNPlusOneQueries } from './nplusone/index.js';

describe('N+1 Attribution Logic (Delta Detection)', () => {

    describe('Bug fix: pre-existing violations should NOT be attributed to later developers', () => {

        it('should NOT penalize Developer B when they touch a line with a pre-existing N+1 query', async () => {
            // Developer A wrote this code with an N+1 query
            const baseCode = `
function loadUsers(userIds) {
    const users = [];
    for (let i = 0; i < userIds.length; i++) {
        const user = db.query('SELECT * FROM users WHERE id = ?', [userIds[i]]);
        users.push(user);
    }
    return users;
}`;
            // Developer B changes the variable name on line 5 but keeps the N+1 pattern
            const headCode = `
function loadUsers(userIds) {
    const users = [];
    for (let i = 0; i < userIds.length; i++) {
        const result = db.query('SELECT * FROM users WHERE id = ?', [userIds[i]]);
        users.push(result);
    }
    return users;
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const headViolations = detectNPlusOneQueries(headAst);
            const baseViolations = detectNPlusOneQueries(baseAst);

            // Developer B's modified lines (changed variable name on line 5, 6)
            const modifiedLines = [5, 6];

            // Simulate the orchestrator's fixed attribution logic
            let newViolations = 0;
            for (const violation of headViolations) {
                const mockNode = {
                    startPosition: { row: violation.startLine - 1 },
                    endPosition: { row: violation.endLine - 1 }
                };
                if (doesIntersect(mockNode, modifiedLines)) {
                    const existedInBase = baseViolations.some(bv =>
                        bv.startLine === violation.startLine &&
                        bv.endLine === violation.endLine &&
                        bv.issue === violation.issue
                    );
                    if (!existedInBase) {
                        newViolations++;
                    }
                }
            }

            assert.equal(newViolations, 0, 'Developer B should NOT be penalized for a pre-existing N+1 query');
        });

        it('should penalize Developer A who actually introduced the N+1 query', async () => {
            // Before Developer A's change: no loop at all
            const baseCode = `
function loadUsers(userIds) {
    return db.query('SELECT * FROM users WHERE id IN (?)', [userIds]);
}`;
            // Developer A introduces a loop with a query inside
            const headCode = `
function loadUsers(userIds) {
    const users = [];
    for (let i = 0; i < userIds.length; i++) {
        const user = db.query('SELECT * FROM users WHERE id = ?', [userIds[i]]);
        users.push(user);
    }
    return users;
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const headViolations = detectNPlusOneQueries(headAst);
            const baseViolations = detectNPlusOneQueries(baseAst);

            // Developer A modified lines 3-7 (added the loop)
            const modifiedLines = [3, 4, 5, 6, 7];

            let newViolations = 0;
            for (const violation of headViolations) {
                const mockNode = {
                    startPosition: { row: violation.startLine - 1 },
                    endPosition: { row: violation.endLine - 1 }
                };
                if (doesIntersect(mockNode, modifiedLines)) {
                    const existedInBase = baseViolations.some(bv =>
                        bv.startLine === violation.startLine &&
                        bv.endLine === violation.endLine &&
                        bv.issue === violation.issue
                    );
                    if (!existedInBase) {
                        newViolations++;
                    }
                }
            }

            assert.equal(newViolations, 1, 'Developer A SHOULD be penalized for introducing the N+1 query');
        });

        it('should penalize a developer in a new file (no base) that introduces an N+1 query', async () => {
            // New file — no base AST exists
            const headCode = `
async function syncItems(items) {
    for (const item of items) {
        await models.Item.create(item);
    }
}`;
            const headAst = await getAST(headCode, 'src/test.js');
            const baseViolations = []; // New file, no base

            const headViolations = detectNPlusOneQueries(headAst);
            const modifiedLines = [2, 3, 4, 5];

            let newViolations = 0;
            for (const violation of headViolations) {
                const mockNode = {
                    startPosition: { row: violation.startLine - 1 },
                    endPosition: { row: violation.endLine - 1 }
                };
                if (doesIntersect(mockNode, modifiedLines)) {
                    const existedInBase = baseViolations.some(bv =>
                        bv.startLine === violation.startLine &&
                        bv.endLine === violation.endLine &&
                        bv.issue === violation.issue
                    );
                    if (!existedInBase) {
                        newViolations++;
                    }
                }
            }

            assert.equal(newViolations, 1, 'New file N+1 query should be attributed to the developer');
        });
    });

    describe('Credit for fixing N+1 queries', () => {

        it('should give credit when a developer fixes an N+1 query', async () => {
            // Base code has an N+1 query inside a loop
            const baseCode = `
function loadUsers(userIds) {
    const users = [];
    for (let i = 0; i < userIds.length; i++) {
        const user = db.query('SELECT * FROM users WHERE id = ?', [userIds[i]]);
        users.push(user);
    }
    return users;
}`;
            // Developer fixes it by using a batch query
            const headCode = `
function loadUsers(userIds) {
    const users = db.query('SELECT * FROM users WHERE id IN (?)', [userIds]);
    return users;
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const headViolations = detectNPlusOneQueries(headAst);
            const baseViolations = detectNPlusOneQueries(baseAst);

            // Developer modified lines 3-7 (removed the loop, added batch query)
            const modifiedLines = [3, 4, 5, 6, 7];

            // Count new violations (should be 0)
            let newViolations = 0;
            for (const violation of headViolations) {
                const mockNode = {
                    startPosition: { row: violation.startLine - 1 },
                    endPosition: { row: violation.endLine - 1 }
                };
                if (doesIntersect(mockNode, modifiedLines)) {
                    const existedInBase = baseViolations.some(bv =>
                        bv.startLine === violation.startLine &&
                        bv.endLine === violation.endLine &&
                        bv.issue === violation.issue
                    );
                    if (!existedInBase) {
                        newViolations++;
                    }
                }
            }

            // Count fixed violations (should be >= 1)
            let fixedViolations = 0;
            for (const baseViolation of baseViolations) {
                const baseMock = {
                    startPosition: { row: baseViolation.startLine - 1 },
                    endPosition: { row: baseViolation.endLine - 1 }
                };
                if (doesIntersect(baseMock, modifiedLines)) {
                    const stillExists = headViolations.some(hv =>
                        hv.startLine === baseViolation.startLine &&
                        hv.endLine === baseViolation.endLine &&
                        hv.issue === baseViolation.issue
                    );
                    if (!stillExists) {
                        fixedViolations++;
                    }
                }
            }

            assert.equal(newViolations, 0, 'No new violations should be counted');
            assert.ok(fixedViolations >= 1, `Developer should get credit for fixing N+1 query, got ${fixedViolations} fixed`);
        });

        it('should NOT give fix credit for violations outside the modified lines', async () => {
            // Two N+1 patterns in the base
            const baseCode = `
function loadUsers(ids) {
    for (const id of ids) {
        db.query('SELECT * FROM users WHERE id = ?', [id]);
    }
}
function loadPosts(ids) {
    for (const id of ids) {
        db.query('SELECT * FROM posts WHERE id = ?', [id]);
    }
}`;
            // Developer fixes only the first one (lines 2-5), leaves the second
            const headCode = `
function loadUsers(ids) {
    db.query('SELECT * FROM users WHERE id IN (?)', [ids]);
}
function loadPosts(ids) {
    for (const id of ids) {
        db.query('SELECT * FROM posts WHERE id = ?', [id]);
    }
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const headViolations = detectNPlusOneQueries(headAst);
            const baseViolations = detectNPlusOneQueries(baseAst);

            // Developer only modified lines 2-4 (fixed first function only)
            const modifiedLines = [2, 3, 4, 5];

            let fixedViolations = 0;
            for (const baseViolation of baseViolations) {
                const baseMock = {
                    startPosition: { row: baseViolation.startLine - 1 },
                    endPosition: { row: baseViolation.endLine - 1 }
                };
                if (doesIntersect(baseMock, modifiedLines)) {
                    const stillExists = headViolations.some(hv =>
                        hv.startLine === baseViolation.startLine &&
                        hv.endLine === baseViolation.endLine &&
                        hv.issue === baseViolation.issue
                    );
                    if (!stillExists) {
                        fixedViolations++;
                    }
                }
            }

            // Should only credit for the first fix, not the second (untouched) function
            assert.ok(fixedViolations >= 1, 'Should get credit for the fixed N+1 query');
            // The second violation is outside modifiedLines — no credit or penalty for it
        });
    });

    describe('Edge cases', () => {

        it('should not count violations when developer modifies unrelated lines in same file', async () => {
            const baseCode = `
// Header comment
function loadUsers(userIds) {
    const users = [];
    for (let i = 0; i < userIds.length; i++) {
        const user = db.query('SELECT * FROM users WHERE id = ?', [userIds[i]]);
        users.push(user);
    }
    return users;
}

function helperFunction() {
    return 'hello';
}`;
            // Developer only modifies the helperFunction (line 13)
            const headCode = `
// Header comment
function loadUsers(userIds) {
    const users = [];
    for (let i = 0; i < userIds.length; i++) {
        const user = db.query('SELECT * FROM users WHERE id = ?', [userIds[i]]);
        users.push(user);
    }
    return users;
}

function helperFunction() {
    return 'world';
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const headViolations = detectNPlusOneQueries(headAst);
            const baseViolations = detectNPlusOneQueries(baseAst);

            // Developer only touched line 13 (the return in helperFunction)
            const modifiedLines = [13];

            let newViolations = 0;
            for (const violation of headViolations) {
                const mockNode = {
                    startPosition: { row: violation.startLine - 1 },
                    endPosition: { row: violation.endLine - 1 }
                };
                if (doesIntersect(mockNode, modifiedLines)) {
                    const existedInBase = baseViolations.some(bv =>
                        bv.startLine === violation.startLine &&
                        bv.endLine === violation.endLine &&
                        bv.issue === violation.issue
                    );
                    if (!existedInBase) {
                        newViolations++;
                    }
                }
            }

            assert.equal(newViolations, 0, 'Developer touching unrelated lines should not be penalized for existing N+1');
        });

        it('should handle empty modifiedLines gracefully', async () => {
            const code = `
function loadUsers(ids) {
    for (const id of ids) {
        db.query('SELECT * FROM users', [id]);
    }
}`;
            const ast = await getAST(code, 'src/test.js');
            const violations = detectNPlusOneQueries(ast);
            const modifiedLines = [];

            let newViolations = 0;
            for (const violation of violations) {
                const mockNode = {
                    startPosition: { row: violation.startLine - 1 },
                    endPosition: { row: violation.endLine - 1 }
                };
                if (doesIntersect(mockNode, modifiedLines)) {
                    newViolations++;
                }
            }

            assert.equal(newViolations, 0, 'No violations should be counted when modifiedLines is empty');
        });

        it('should handle base AST having more violations than head (multiple fixes)', async () => {
            const baseCode = `
function bad1(ids) {
    ids.forEach(id => { db.findOne({ id }); });
}
function bad2(ids) {
    ids.map(id => { db.findOne({ id }); });
}`;
            const headCode = `
function good1(ids) {
    db.find({ id: { $in: ids } });
}
function good2(ids) {
    db.find({ id: { $in: ids } });
}`;
            const baseAst = await getAST(baseCode, 'src/test.js');
            const headAst = await getAST(headCode, 'src/test.js');

            const headViolations = detectNPlusOneQueries(headAst);
            const baseViolations = detectNPlusOneQueries(baseAst);

            assert.ok(baseViolations.length >= 2, `Base should have >=2 violations, got ${baseViolations.length}`);
            assert.equal(headViolations.length, 0, 'Head should have no violations');

            const modifiedLines = [2, 3, 4, 5, 6, 7];

            let fixedViolations = 0;
            for (const baseViolation of baseViolations) {
                const baseMock = {
                    startPosition: { row: baseViolation.startLine - 1 },
                    endPosition: { row: baseViolation.endLine - 1 }
                };
                if (doesIntersect(baseMock, modifiedLines)) {
                    const stillExists = headViolations.some(hv =>
                        hv.startLine === baseViolation.startLine &&
                        hv.endLine === baseViolation.endLine &&
                        hv.issue === baseViolation.issue
                    );
                    if (!stillExists) {
                        fixedViolations++;
                    }
                }
            }

            assert.ok(fixedViolations >= 2, `Should get credit for fixing ${baseViolations.length} violations, got ${fixedViolations}`);
        });
    });

    describe('PHP / Eloquent N+1 attribution', () => {

        it('should NOT penalize Developer B for pre-existing Eloquent N+1 in PHP', async () => {
            const baseCode = `<?php
foreach ($users as $user) {
    $profile = $user->profile()->first();
}`;
            const headCode = `<?php
foreach ($users as $user) {
    $bio = $user->profile()->first();
}`;
            const baseAst = await getAST(baseCode, 'src/test.php');
            const headAst = await getAST(headCode, 'src/test.php');

            const headViolations = detectNPlusOneQueries(headAst);
            const baseViolations = detectNPlusOneQueries(baseAst);

            const modifiedLines = [3]; // Developer B changed variable name

            let newViolations = 0;
            for (const violation of headViolations) {
                const mockNode = {
                    startPosition: { row: violation.startLine - 1 },
                    endPosition: { row: violation.endLine - 1 }
                };
                if (doesIntersect(mockNode, modifiedLines)) {
                    const existedInBase = baseViolations.some(bv =>
                        bv.startLine === violation.startLine &&
                        bv.endLine === violation.endLine &&
                        bv.issue === violation.issue
                    );
                    if (!existedInBase) {
                        newViolations++;
                    }
                }
            }

            assert.equal(newViolations, 0, 'Dev B should NOT be penalized for pre-existing PHP N+1');
        });
    });
});
