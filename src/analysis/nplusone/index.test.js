import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAST } from '../ast-parser.js';
import { detectNPlusOneQueries } from './index.js';

describe('AST N+1 Query Analyzer', () => {

    it('should detect a query inside a standard for-loop', async () => {
        // Arrange
        const code = `
      function loadUsers(userIds) {
        const users = [];
        for (let i = 0; i < userIds.length; i++) {
          // This is a direct N+1 violation
          const user = db.query('SELECT * FROM users WHERE id = ?', [userIds[i]]);
          users.push(user);
        }
        return users;
      }
    `;
        const ast = await getAST(code, 'src/test.js');

        // Act
        const violations = detectNPlusOneQueries(ast);

        // Assert
        assert.equal(violations.length, 1);
        assert.equal(violations[0].issue, 'n-plus-one-query');
        assert.ok(violations[0].startLine > 0);
        assert.ok(violations[0].endLine > 0);
    });

    it('should detect a query inside a for...of loop', async () => {
        // Arrange
        const code = `
      async function syncData(items) {
        for (const item of items) {
          await models.Item.create(item);
        }
      }
    `;
        const ast = await getAST(code, 'src/test.js');

        // Act
        const violations = detectNPlusOneQueries(ast);

        // Assert
        assert.equal(violations.length, 1);
    });

    it('should detect a query inside a .map() callback', async () => {
        // Arrange
        const code = `
      function getProfiles(users) {
        return users.map(user => {
          return db.collection('profiles').findOne({ userId: user.id });
        });
      }
    `;
        const ast = await getAST(code, 'src/test.js');

        // Act
        const violations = detectNPlusOneQueries(ast);

        // Assert
        assert.equal(violations.length, 1);
    });

    it('should ignore queries outside of loops', async () => {
        // Arrange
        const code = `
      function getUser(id) {
        return db.query('SELECT * FROM users WHERE id = ?', [id]);
      }
    `;
        const ast = await getAST(code, 'src/test.js');

        // Act
        const violations = detectNPlusOneQueries(ast);

        // Assert
        assert.equal(violations.length, 0);
    });

    it('should ignore loop variables that just look like queries (avoid false positives from regex)', async () => {
        // Arrange
        const code = `
      function buildQueryString(params) {
        let query = '';
        for (const key in params) {
            query += key + '=' + params[key];
        }
        return query;
      }
    `;
        const ast = await getAST(code, 'src/test.js');

        // Act
        const violations = detectNPlusOneQueries(ast);

        // Assert
        assert.equal(violations.length, 0); // Regex would have previously flagged this
    });

    // --- PHP / Eloquent tests ---

    it('should detect Eloquent ->first() inside PHP foreach', async () => {
        const code = `<?php
foreach ($users as $user) {
    $profile = $user->profile()->first();
}`;
        const ast = await getAST(code, 'src/test.php');
        const violations = detectNPlusOneQueries(ast);
        assert.equal(violations.length, 1);
        assert.equal(violations[0].issue, 'n-plus-one-query');
    });

    it('should detect static ::find() inside PHP foreach', async () => {
        const code = `<?php
foreach ($ids as $id) {
    $item = Item::find($id);
}`;
        const ast = await getAST(code, 'src/test.php');
        const violations = detectNPlusOneQueries(ast);
        assert.equal(violations.length, 1);
    });

    it('should detect ->load() inside PHP ->each()', async () => {
        const code = `<?php
$users->each(function($user) {
    $user->load('profile');
});`;
        const ast = await getAST(code, 'src/test.php');
        const violations = detectNPlusOneQueries(ast);
        assert.equal(violations.length, 1);
    });

    it('should detect chained ->where()->get() inside PHP for loop', async () => {
        const code = `<?php
for ($i = 0; $i < count($depts); $i++) {
    $employees = Employee::where('dept_id', $depts[$i])->get();
}`;
        const ast = await getAST(code, 'src/test.php');
        const violations = detectNPlusOneQueries(ast);
        assert.equal(violations.length >= 1, true, `Expected at least 1 violation, got ${violations.length}`);
    });

    it('should ignore PHP queries outside of loops', async () => {
        const code = `<?php
$user = User::find($id);
$items = Item::where('active', true)->get();
`;
        const ast = await getAST(code, 'src/test.php');
        const violations = detectNPlusOneQueries(ast);
        assert.equal(violations.length, 0);
    });
});
