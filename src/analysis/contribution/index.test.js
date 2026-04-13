import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDeveloperCommits } from './index.js';

describe('Commit Aggregation and Line Union', () => {
    it('should group continuous back-to-back commits for the same file by the same developer', () => {
        // Arrange
        const rawCommits = [
            {
                sha: 'commit1',
                parentSha: 'base0',
                author: 'dev1',
                date: '2026-03-01T10:00:00Z',
                files: [
                    { filename: 'src/index.js', addedLines: [10, 11] }
                ]
            },
            {
                sha: 'commit2', // Back-to-back edit of index.js by dev1
                parentSha: 'commit1',
                author: 'dev1',
                date: '2026-03-01T10:05:00Z',
                files: [
                    { filename: 'src/index.js', addedLines: [11, 12, 13] },
                    { filename: 'src/utils.js', addedLines: [5] }
                ]
            },
            {
                sha: 'commit3', // Different developer breaks the chain
                parentSha: 'commit2',
                author: 'dev2',
                date: '2026-03-01T10:10:00Z',
                files: [
                    { filename: 'src/index.js', addedLines: [50] }
                ]
            },
            {
                sha: 'commit4', // dev1 again, but broken chain
                parentSha: 'commit3',
                author: 'dev1',
                date: '2026-03-01T10:15:00Z',
                files: [
                    { filename: 'src/index.js', addedLines: [80] }
                ]
            }
        ];

        // Act
        const result = aggregateDeveloperCommits(rawCommits);

        // Assert for dev1
        assert.ok(result['dev1']);
        assert.equal(result['dev1'].length, 3); // 2 groups: [commit1+commit2 for index.js], [commit2 for utils], [commit4 for index.js]

        // Check the aggregated group for src/index.js (commit1 + commit2)
        const indexGroup1 = result['dev1'].find(g => g.filename === 'src/index.js' && g.headSha === 'commit2');
        assert.ok(indexGroup1);
        assert.equal(indexGroup1.baseSha, 'base0');
        assert.equal(indexGroup1.headSha, 'commit2');
        assert.deepEqual(indexGroup1.modifiedLines, [10, 11, 12, 13]); // Union of lines from commit1 and commit2

        // Check the standalone group for utils.js
        const utilsGroup = result['dev1'].find(g => g.filename === 'src/utils.js');
        assert.equal(utilsGroup.baseSha, 'commit1');
        assert.equal(utilsGroup.headSha, 'commit2');
        assert.deepEqual(utilsGroup.modifiedLines, [5]);

        // Check the standalone group for index.js after chain break
        const indexGroup2 = result['dev1'].find(g => g.filename === 'src/index.js' && g.headSha === 'commit4');
        assert.equal(indexGroup2.baseSha, 'commit3');
        assert.equal(indexGroup2.headSha, 'commit4');
        assert.deepEqual(indexGroup2.modifiedLines, [80]);

        // Assert for dev2
        assert.equal(result['dev2'].length, 1);
        assert.equal(result['dev2'][0].baseSha, 'commit2');
        assert.equal(result['dev2'][0].headSha, 'commit3');
    });
});
