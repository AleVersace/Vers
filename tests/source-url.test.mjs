import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { resolveSourceUrl } from '../scripts/source-url.mjs';

const commit = 'a'.repeat(40);

test('private preparation keeps the source link absent; fixed URLs remain supported', () => {
  assert.equal(resolveSourceUrl(undefined), '');
  assert.equal(resolveSourceUrl('  '), '');
  assert.equal(resolveSourceUrl(' https://example.com/source/release.zip '), 'https://example.com/source/release.zip');
});

test('source templates point at the exact build revision across successive releases', () => {
  for (const revision of [commit, 'b'.repeat(40)]) {
    assert.equal(resolveSourceUrl('https://example.com/source/tree/{commit}', revision), `https://example.com/source/tree/${revision}`);
  }
});

test('missing or ambiguous revisions cannot silently publish a broken source link', () => {
  for (const revision of [undefined, 'main', 'a'.repeat(7), '../../main', 'g'.repeat(40)]) {
    assert.throws(() => resolveSourceUrl('https://example.com/tree/{commit}', revision), /full 40-character/);
  }
});

test('invalid links and embedded credentials are rejected without echoing their values', () => {
  for (const value of ['javascript:alert(1)', '/relative', 'https://user:private-canary@example.com/', 'https://example.com/{unknown}']) {
    assert.throws(() => resolveSourceUrl(value, commit), error => !error.message.includes(value) && /source URL/.test(error.message));
  }
});

test('Next configuration exposes only the resolved URL and uses the Vercel revision first', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import config from './next.config.ts'; console.log(JSON.stringify(config.env));"], {
    encoding: 'utf8', env: { ...process.env, NEXT_PUBLIC_SOURCE_URL: 'https://example.com/tree/{commit}',
      VERCEL_GIT_COMMIT_SHA: commit, SOURCE_COMMIT: 'b'.repeat(40), PRIVATE_BUILD_CANARY: 'never-bundle-this' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { NEXT_PUBLIC_SOURCE_URL: `https://example.com/tree/${commit}` });
});
