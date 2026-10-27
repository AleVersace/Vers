import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationGuards } from '../scripts/publication-guards.mjs';

function fixture({ privateRepo = false, existing = null, success = true, moved = false, ineffective = false } = {}) {
  const calls = [];
  let repoReads = 0;
  let protection = existing;
  const states = new Map();
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method !== 'GET') {
      if (path.endsWith('/protection') && !ineffective) protection = {
        enforce_admins: { enabled: true }, required_status_checks: body.required_status_checks,
        allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false },
      };
      states.set(path, body ?? { enabled: true });
      return null;
    }
    if (path === 'repos/Example/Project') return { id: 1, private: privateRepo || (moved && ++repoReads > 1), default_branch: 'main' };
    if (path.endsWith('/branches/main')) return { commit: { sha: 'a'.repeat(40) } };
    if (path.includes('/check-runs')) return { check_runs: [{ name: 'verify', app: { slug: 'github-actions', id: 123 }, status: 'completed', conclusion: success ? 'success' : 'failure' }] };
    if (path.endsWith('/protection')) return protection;
    return states.get(path);
  };
  return { api, calls, writes: () => calls.filter(c => c.method !== 'GET') };
}

test('private repositories remain private in both plan and apply modes', async () => {
  const f = fixture({ privateRepo: true });
  assert.equal((await publicationGuards('Example/Project', f)).status, 'waiting_for_publication');
  await assert.rejects(publicationGuards('Example/Project', { ...f, apply: true }), /private/);
  assert.equal(f.writes().length, 0);
});

test('the default mode only prepares a plan and binds verify to GitHub Actions', async () => {
  const f = fixture();
  const plan = await publicationGuards('Example/Project', f);
  assert.equal(plan.status, 'plan_only');
  assert.equal(f.writes().length, 0);
  assert.deepEqual(plan.changes[0].body.required_status_checks.checks, [{ context: 'verify', app_id: 123 }]);
  // GitHub rejects requests matching both the legacy contexts and checks schemas.
  assert.equal(Object.hasOwn(plan.changes[0].body.required_status_checks, 'contexts'), false);
});

test('failed CI and existing custom branch rules are not bypassed or overwritten', async () => {
  for (const options of [{ success: false }, { existing: { enforce_admins: { enabled: false } } }]) {
    const f = fixture(options);
    await assert.rejects(publicationGuards('Example/Project', { ...f, apply: true }));
    assert.equal(f.writes().length, 0);
  }
});

test('a repository visibility change between review and apply prevents writes', async () => {
  const f = fixture({ moved: true });
  await assert.rejects(publicationGuards('Example/Project', { ...f, apply: true }), /state changed/);
  assert.equal(f.writes().length, 0);
});

test('public launch controls are read back and never modify repository visibility', async () => {
  const f = fixture();
  assert.equal((await publicationGuards('Example/Project', { ...f, apply: true })).status, 'verified');
  assert.equal(f.writes().length, 4);
  assert.ok(f.writes().every(c => c.method === 'PUT' && c.path !== 'repos/Example/Project'));
  const before = f.writes().filter(c => c.path.endsWith('/protection')).length;
  await publicationGuards('Example/Project', { ...f, apply: true });
  assert.equal(f.writes().filter(c => c.path.endsWith('/protection')).length, before);
});

test('a provider response that did not enforce the settings cannot be reported as success', async () => {
  const f = fixture({ ineffective: true });
  await assert.rejects(publicationGuards('Example/Project', { ...f, apply: true }), /not confirmed/);
});

test('invalid repository targets make no API request', async () => {
  for (const target of [undefined, 'Example', '../Project', 'https://github.com/Example/Project']) {
    const f = fixture();
    await assert.rejects(publicationGuards(target, f), /explicit OWNER/);
    assert.equal(f.calls.length, 0);
  }
});

test('an older successful check cannot hide a later failed rerun', async () => {
  const f = fixture();
  const api = (method, path, ...args) => path.includes('/check-runs') ? Promise.resolve({ check_runs: [
    { id: 1, name: 'verify', app: { slug: 'github-actions', id: 123 }, status: 'completed', conclusion: 'success' },
    { id: 2, name: 'verify', app: { slug: 'github-actions', id: 123 }, status: 'completed', conclusion: 'failure' },
  ] }) : f.api(method, path, ...args);
  await assert.rejects(publicationGuards('Example/Project', { api, apply: true }), /latest/);
  assert.equal(f.writes().length, 0);
});
