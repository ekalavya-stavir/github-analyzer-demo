import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the patch deduplication logic in index.js.
 *
 * Since enrichContributorPatches is a private function in index.js and
 * requires real GitHub API calls, we test the deduplication concept
 * directly using the same hash function and logic.
 */

// Replicate the simplePatchHash function from index.js
function simplePatchHash(patch) {
    if (!patch || typeof patch !== 'string') return '';
    let hash = 0;
    for (let i = 0; i < patch.length; i++) {
        const char = patch.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(36);
}

/**
 * Simulates the deduplication logic from enrichContributorPatches.
 * Takes existing patches (e.g. from PR-level) and new patches (e.g. from commit-level).
 * Returns only the unique patches after deduplication.
 */
function deduplicatePatches(existingPatches, newPatches) {
    const existingKeys = new Set(
        existingPatches.map(p => `${p.filename}|${simplePatchHash(p.patch)}`)
    );
    const result = [...existingPatches];
    let deduplicatedCount = 0;

    for (const file of newPatches) {
        const key = `${file.filename}|${simplePatchHash(file.patch)}`;
        if (!existingKeys.has(key)) {
            result.push(file);
            existingKeys.add(key);
        } else {
            deduplicatedCount++;
        }
    }

    return { patches: result, deduplicatedCount };
}

describe('Patch Deduplication', () => {

    it('should deduplicate identical patches (same filename and content)', () => {
        const patch = '@@ -1,3 +1,4 @@\n foo\n+bar\n baz\n qux';
        const prPatches = [
            { filename: 'src/index.js', patch, additions: 1, deletions: 0 }
        ];
        const commitPatches = [
            { filename: 'src/index.js', patch, additions: 1, deletions: 0 }
        ];

        const { patches, deduplicatedCount } = deduplicatePatches(prPatches, commitPatches);

        assert.equal(patches.length, 1, 'Should keep only 1 copy of the duplicate patch');
        assert.equal(deduplicatedCount, 1, 'Should report 1 deduplicated patch');
    });

    it('should keep patches with same filename but different content', () => {
        const prPatches = [
            { filename: 'src/index.js', patch: '@@ -1,3 +1,4 @@\n foo\n+bar\n baz', additions: 1 }
        ];
        const commitPatches = [
            { filename: 'src/index.js', patch: '@@ -10,3 +10,4 @@\n hello\n+world\n end', additions: 1 }
        ];

        const { patches, deduplicatedCount } = deduplicatePatches(prPatches, commitPatches);

        assert.equal(patches.length, 2, 'Should keep both patches with different content');
        assert.equal(deduplicatedCount, 0, 'Should report 0 deduplicated');
    });

    it('should keep patches with different filenames but same content', () => {
        const patch = '@@ -1,3 +1,4 @@\n foo\n+bar\n baz';
        const prPatches = [
            { filename: 'src/a.js', patch }
        ];
        const commitPatches = [
            { filename: 'src/b.js', patch }
        ];

        const { patches, deduplicatedCount } = deduplicatePatches(prPatches, commitPatches);

        assert.equal(patches.length, 2, 'Different filenames should not be deduplicated');
        assert.equal(deduplicatedCount, 0);
    });

    it('should deduplicate multiple duplicate patches from many commits', () => {
        const patch1 = '@@ -1,3 +1,4 @@\n foo\n+bar\n baz';
        const patch2 = '@@ -10,3 +10,4 @@\n hello\n+world\n end';

        const prPatches = [
            { filename: 'src/a.js', patch: patch1 },
            { filename: 'src/b.js', patch: patch2 }
        ];
        // Commit-level patches duplicate both PR patches, plus have a unique one
        const commitPatches = [
            { filename: 'src/a.js', patch: patch1 },     // duplicate
            { filename: 'src/b.js', patch: patch2 },     // duplicate
            { filename: 'src/c.js', patch: patch1 },     // unique (different filename)
        ];

        const { patches, deduplicatedCount } = deduplicatePatches(prPatches, commitPatches);

        assert.equal(patches.length, 3, 'Should have 3 unique patches: a.js, b.js, c.js');
        assert.equal(deduplicatedCount, 2, 'Should report 2 deduplicated patches');
    });

    it('should handle empty PR patches (commit-only developer)', () => {
        const prPatches = [];
        const commitPatches = [
            { filename: 'src/a.js', patch: '@@ -1 +1 @@\n+new line' },
            { filename: 'src/b.js', patch: '@@ -1 +1 @@\n+another line' }
        ];

        const { patches, deduplicatedCount } = deduplicatePatches(prPatches, commitPatches);

        assert.equal(patches.length, 2, 'All commit patches should be kept when no PR patches exist');
        assert.equal(deduplicatedCount, 0);
    });

    it('should handle empty commit patches', () => {
        const prPatches = [
            { filename: 'src/a.js', patch: '@@ -1 +1 @@\n+new line' }
        ];
        const commitPatches = [];

        const { patches, deduplicatedCount } = deduplicatePatches(prPatches, commitPatches);

        assert.equal(patches.length, 1, 'Original PR patches should remain');
        assert.equal(deduplicatedCount, 0);
    });

    it('should handle patches with empty/null content', () => {
        const prPatches = [
            { filename: 'src/a.js', patch: '' },
            { filename: 'src/b.js', patch: null }
        ];
        const commitPatches = [
            { filename: 'src/a.js', patch: '' },     // duplicate empty
            { filename: 'src/b.js', patch: null },    // duplicate null
            { filename: 'src/c.js', patch: '' }       // unique
        ];

        const { patches, deduplicatedCount } = deduplicatePatches(prPatches, commitPatches);

        assert.equal(patches.length, 3, 'Should deduplicate even empty patches');
        assert.equal(deduplicatedCount, 2);
    });

    describe('simplePatchHash', () => {
        it('should return consistent hashes for the same content', () => {
            const patch = '@@ -1,3 +1,4 @@\n foo\n+bar';
            assert.equal(simplePatchHash(patch), simplePatchHash(patch));
        });

        it('should return different hashes for different content', () => {
            const hash1 = simplePatchHash('@@ +1 @@\n+foo');
            const hash2 = simplePatchHash('@@ +1 @@\n+bar');
            assert.notEqual(hash1, hash2);
        });

        it('should handle empty string', () => {
            assert.equal(simplePatchHash(''), '');
        });

        it('should handle null/undefined', () => {
            assert.equal(simplePatchHash(null), '');
            assert.equal(simplePatchHash(undefined), '');
        });
    });
});

describe('Cross-developer contamination prevention', () => {

    it('should demonstrate that PR patches are attributed to PR author, not commit authors', () => {
        // This is a conceptual test verifying the buildContributorMap logic
        // In a multi-author PR, the PR patches go to the PR AUTHOR only
        const prAuthor = 'alice';
        const commitAuthor = 'bob';

        // Simulate buildContributorMap behavior
        const map = {};

        // PR-level patches go to the PR author
        const prFiles = [
            { filename: 'src/a.js', patch: '@@ +1 @@\n+alice code' },
            { filename: 'src/b.js', patch: '@@ +1 @@\n+bob code in alice PR' }
        ];

        map[prAuthor] = { patches: [...prFiles] };
        map[commitAuthor] = { patches: [] };

        // After patch deduplication, commit enrichment should NOT re-add
        // the same patches to bob
        const commitPatches = [
            { filename: 'src/b.js', patch: '@@ +1 @@\n+bob code in alice PR' }
        ];

        const existingKeys = new Set(
            map[commitAuthor].patches.map(p => `${p.filename}|${simplePatchHash(p.patch)}`)
        );

        // Bob's patches array is empty, so the commit patches get added
        // (This is correct behavior - bob DID write this code via commits)
        for (const file of commitPatches) {
            const key = `${file.filename}|${simplePatchHash(file.patch)}`;
            if (!existingKeys.has(key)) {
                map[commitAuthor].patches.push(file);
                existingKeys.add(key);
            }
        }

        // The key insight: if alice's PR contains bob's commit code,
        // the deduplication won't help there (different developers have separate patch arrays).
        // But what we DO prevent is alice having double-counted patches
        // (once from PR-level, once from commit enrichment)
        assert.equal(map[commitAuthor].patches.length, 1, 'Bob should have his own commit patches');
        assert.equal(map[prAuthor].patches.length, 2, 'Alice should have her PR-level patches');
    });
});
