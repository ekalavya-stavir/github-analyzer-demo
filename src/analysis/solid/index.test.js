import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeSolid } from './index.js';

/**
 * Helper: create a fake patch object with the given added lines.
 * Lines are formatted as unified diff (prefixed with '+').
 */
function makePatch(filename, lines) {
  const patch = lines.map((l) => `+${l}`).join('\n');
  return { filename, patch };
}

describe('SOLID Analyzer – deep-property-chain detection', () => {
  it('should NOT flag config keys inside quoted strings as deep-property-chain', () => {
    const patches = [
      makePatch('app/Config/PusherCheck.php', [
        "'cluster' => config('broadcasting.connections.pusher.options.cluster'),",
        "'host' => config('broadcasting.connections.pusher.options.host'),",
      ]),
    ];

    const result = analyzeSolid(patches);
    const chainEvidence = result.details.evidence.filter(
      (e) => e.issue === 'deep-property-chain'
    );
    assert.strictEqual(chainEvidence.length, 0, 'Config keys in quotes should not be flagged');
  });

  it('should NOT flag double-quoted config keys as deep-property-chain', () => {
    const patches = [
      makePatch('app/Config/App.php', [
        '$value = config("app.services.mail.host.port");',
      ]),
    ];

    const result = analyzeSolid(patches);
    const chainEvidence = result.details.evidence.filter(
      (e) => e.issue === 'deep-property-chain'
    );
    assert.strictEqual(chainEvidence.length, 0, 'Double-quoted config keys should not be flagged');
  });

  it('should flag actual JS property chains as deep-property-chain', () => {
    const patches = [
      makePatch('src/service.js', [
        'const val = obj.foo.bar.baz.qux;',
        'const a = 1;',
        'const b = 2;',
        'const c = 3;',
        'const d = 4;',
        'const e = 5;',
        'const f = 6;',
        'const g = 7;',
        'const h = 8;',
        'const i = 9;',
      ]),
    ];

    const result = analyzeSolid(patches);
    const chainEvidence = result.details.evidence.filter(
      (e) => e.issue === 'deep-property-chain'
    );
    assert.ok(chainEvidence.length > 0, 'JS dot chains should be flagged');
  });

  it('should flag chain but not quoted string on the same line', () => {
    const lines = ["obj.foo.bar.baz.qux = config('a.b.c.d.e');"];
    for (let i = 0; i < 10; i++) lines.push(`const pad${i} = ${i};`);
    const patches = [makePatch('src/mixed.js', lines)];

    const result = analyzeSolid(patches);
    const chainEvidence = result.details.evidence.filter(
      (e) => e.issue === 'deep-property-chain'
    );
    // The real chain (obj.foo.bar.baz.qux) should be detected
    assert.ok(chainEvidence.length > 0, 'Real chain on mixed line should be flagged');
  });

  it('should NOT flag translation keys or route names inside quotes', () => {
    const patches = [
      makePatch('app/Http/Routes.php', [
        "Route::get(trans('routes.admin.users.settings.profile'));",
        "$url = route('api.v1.users.settings.update');",
      ]),
    ];

    const result = analyzeSolid(patches);
    const chainEvidence = result.details.evidence.filter(
      (e) => e.issue === 'deep-property-chain'
    );
    assert.strictEqual(chainEvidence.length, 0, 'Route/translation keys in quotes should not be flagged');
  });
});

describe('SOLID Analyzer – basic behavior', () => {
  it('should return score 5 with no-data message for empty input', () => {
    const result = analyzeSolid([]);
    assert.strictEqual(result.score, 5);
  });

  it('should return score 5 for non-code files', () => {
    const patches = [makePatch('README.md', ['# Hello'])];
    const result = analyzeSolid(patches);
    assert.strictEqual(result.score, 5);
  });

  it('should return score 5 with insufficient-data for very few lines of code', () => {
    const patches = [makePatch('src/tiny.js', ['const x = 1;'])];
    const result = analyzeSolid(patches);
    assert.strictEqual(result.score, 5);
    assert.strictEqual(result.details.linesAnalyzed, 1);
    assert.ok(
      result.details.evidence.some((e) => e.issue === 'insufficient-data'),
      'Should include insufficient-data evidence'
    );
  });

  it('should score 10 for clean code with enough lines and no violations', () => {
    const lines = [];
    for (let i = 0; i < 25; i++) lines.push(`const val${i} = ${i};`);
    const patches = [makePatch('src/clean.js', lines)];
    const result = analyzeSolid(patches);
    assert.strictEqual(result.score, 10, 'Zero violations should yield score 10');
  });

  it('should detect SRP violation and produce a lower score', () => {
    // Generate 20 method signatures → high SRP violation weight over 60 lines
    const lines = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`function method${i}() {`);
      lines.push(`  return ${i};`);
      lines.push('}');
    }
    const patches = [makePatch('src/GodClass.js', lines)];
    const result = analyzeSolid(patches);
    assert.ok(result.details.srpViolations > 0, 'Should detect SRP violations');
    assert.ok(result.score <= 5, `SRP violations should lower score, got ${result.score}`);
  });

  it('should detect direct instantiation as DIP violation', () => {
    const lines = [
      '$sms = new BulkSms();',
      '$type = new MaintenanceType();',
    ];
    for (let i = 0; i < 10; i++) lines.push(`$val${i} = ${i};`);
    const patches = [makePatch('src/service.php', lines)];
    const result = analyzeSolid(patches);
    assert.ok(result.details.dipViolations > 0, 'Should detect DIP violations');
  });
});
