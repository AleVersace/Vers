import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { auditFindings } from '../scripts/audit-dependencies.mjs';

const advisory = 'https://github.com/advisories/GHSA-g3hv-75wg-m249';
const hash = '746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d';
const reviewedDate = new Date('2026-11-02T00:00:00Z');
const packages = { 'node_modules/minimatch': { version: '3.1.5', dev: true } };
function report(url = advisory) {
  return { auditReportVersion: 2, vulnerabilities: {
    minimatch: { nodes: ['node_modules/minimatch'], via: [{ name: 'minimatch', url }] },
    eslint: { nodes: ['node_modules/eslint'], via: ['minimatch'] },
  } };
}
const inspect = (value, pkgs = packages, source = () => hash, date = reviewedDate) =>
  auditFindings(value, pkgs, source, date);

test('audit accepts only the reviewed dev-only legacy minimatch finding and its inherited risk', () => {
  assert.equal(inspect(report()).reviewed.length, 1);
  assert.deepEqual(inspect(report()).failures, []);
});
test('audit blocks another advisory even on the reviewed package', () => {
  assert.equal(inspect(report('https://github.com/advisories/GHSA-new-issue')).failures.length, 1);
  const both = report();
  both.vulnerabilities.minimatch.via.push({ name: 'minimatch', url: 'https://github.com/advisories/GHSA-new-issue' });
  assert.equal(inspect(both).failures.length, 1);
});
test('audit blocks modern versions, production copies, changed source, missing entries and expired review', () => {
  for (const pkg of [{ version: '10.2.5', dev: true }, { version: '3.1.5' }, { version: '3.1.4', dev: true }]) {
    assert.equal(inspect(report(), { 'node_modules/minimatch': pkg }).failures.length, 1);
  }
  assert.equal(inspect(report(), {}).failures.length, 1);
  assert.equal(inspect(report(), packages, () => 'changed').failures.length, 1);
  assert.equal(inspect(report(), packages, () => hash, new Date('2026-12-02T00:00:00Z')).failures.length, 1);
  const mixed = report(); mixed.vulnerabilities.minimatch.nodes.push('node_modules/another/node_modules/minimatch');
  assert.equal(inspect(mixed).failures.length, 1);
});
test('audit fails closed on malformed responses and unresolved or cyclic-only findings', () => {
  for (const value of [{}, { error: 'registry failure' }, { auditReportVersion: 3, vulnerabilities: {} }]) {
    assert.throws(() => inspect(value));
  }
  const missing = report(); missing.vulnerabilities.eslint.via = ['missing'];
  assert.throws(() => inspect(missing));
  const empty = report(); empty.vulnerabilities.minimatch.via = [];
  assert.throws(() => inspect(empty));
  const cyclic = report(); cyclic.vulnerabilities.minimatch.via = ['eslint'];
  assert.throws(() => inspect(cyclic));
});
test('installed legacy parser matches the reviewed source and has no amplification preprocessing', () => {
  const require = createRequire(import.meta.url);
  const file = require.resolve('minimatch');
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), hash);
  const { Minimatch } = require('minimatch');
  assert.equal(Minimatch.prototype.firstPhasePreProcess, undefined);
  for (const depth of [1, 8, 64]) {
    const pattern = '**/../'.repeat(depth) + '*.txt';
    const matcher = new Minimatch(pattern, { optimizationLevel: 2 });
    assert.equal(matcher.globParts.length, 1);
    assert.equal(matcher.globParts[0].length, depth * 2 + 1);
  }
});
test('updated glob retains rimraf matching APIs and rejects a pre-aborted walk', async () => {
  const require = createRequire(import.meta.url);
  const rimrafRequire = createRequire(require.resolve('rimraf'));
  const { glob, globSync } = rimrafRequire('glob');
  const options = { cwd: new URL('../', import.meta.url), nodir: true };
  assert.deepEqual(await glob('tests/dependency-audit.test.mjs', options), ['tests/dependency-audit.test.mjs']);
  assert.deepEqual(globSync('tests/dependency-audit.test.mjs', options), ['tests/dependency-audit.test.mjs']);
  await assert.rejects(glob('**/*', { ...options, signal: AbortSignal.abort(new Error('review abort')) }), /review abort/);
});
