import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, copyFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { repositoryPrivacyViolations as violations, redactRepositoryPath } from '../scripts/repository-privacy.mjs';

const contact = ['privacy-canary', 'mail.invalid'].join('@');

test('installation hostnames are blocked in docs, filenames and generated previews', () => {
  for (const label of ['private-table', 'private-table-build123-personal-team', 'x']) {
    const host = [label, 'vercel', 'app'].join('.');
    for (const content of [`https://${host}/`, host.toUpperCase(), `https://${host}/?source=readme`]) {
      assert.deepEqual(violations('README.md', content), ['installation deployment hostname']);
    }
    assert.deepEqual(violations(`docs/${host}.md`, ''), ['installation deployment hostname']);
    assert.equal(redactRepositoryPath(`docs/${host}.md`), 'docs/[redacted-host].md');
  }
});

test('provider documentation and reserved example URLs remain usable in setup guides', () => {
  for (const url of ['https://vercel.com/docs/deployments', 'https://example.com/table', 'http://localhost:3000']) {
    assert.deepEqual(violations('docs/DEPLOYMENT.md', url), []);
  }
});

test('privacy checks cover documentation and arbitrary first-party files without echoing the address', () => {
  for (const path of ['README.md', 'docs/OPERATIONS.md', 'notes.txt', 'app/page.tsx']) {
    assert.deepEqual(violations(path, `Contact: ${contact}`), ['non-example email address']);
  }
  assert.deepEqual(violations(`${contact}.md`, 'Notes'), ['non-example email address']);
});

test('documented example addresses and escaped example domains are allowed', () => {
  for (const domain of ['example.com', 'example.net', 'example.org', 'example.test', 'example.invalid']) {
    assert.deepEqual(violations('docs/setup.md', `player@${domain}`), []);
    assert.deepEqual(violations('tests/fixture.mjs', `player@${domain.replace('.', '\\.')}`), []);
  }
});

test('macOS, Linux and Windows personal home paths are rejected', () => {
  const paths = [
    ['', 'Users', 'canary', 'project'].join('/'),
    ['', 'home', 'canary', 'project'].join('/'),
    ['C:', 'Users', 'Canary User', 'project'].join('\\'),
    ['C:', 'Users', 'Canary User', 'project'].join('\\\\'),
  ];
  for (const path of paths) {
    assert.deepEqual(violations('docs/setup.md', path), ['personal home-directory path']);
  }
});

test('credential and backup names are rejected even when their contents look harmless', () => {
  for (const path of ['.env.local', 'nested/.env', 'credentials/admin.json', 'service-account.json',
    'project-firebase-adminsdk-x.json', 'private.pem', 'backup-campaign.sql', 'data.sqlite', 'archive.bundle']) {
    assert.ok(violations(path, '').includes('credential or backup filename'), path);
  }
  assert.deepEqual(violations('.env.example', 'KEY=example'), []);
});

test('only designated legal attribution files are exempt from the email heuristic', () => {
  assert.deepEqual(violations('THIRD_PARTY_NOTICES.txt', contact), []);
  assert.deepEqual(violations('LICENSE', contact), []);
  assert.deepEqual(violations('docs/LICENSE', contact), ['non-example email address']);
  const home = ['', 'Users', 'canary', 'file'].join('/');
  assert.deepEqual(violations('THIRD_PARTY_NOTICES.txt', home), ['personal home-directory path']);
});

test('lockfile exception is limited to upstream package deprecation notices', () => {
  const lock = { packages: { '': { name: 'vers' }, 'node_modules/dependency': { deprecated: contact } } };
  assert.deepEqual(violations('package-lock.json', JSON.stringify(lock)), []);
  lock.packages[''].description = contact;
  assert.deepEqual(violations('package-lock.json', JSON.stringify(lock)), ['non-example email address']);
  assert.deepEqual(violations('package-lock.json', `{broken ${contact}`), ['non-example email address']);
  assert.deepEqual(violations('lock-copy.json', JSON.stringify(lock)), ['non-example email address']);
});

async function scannerFixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'vers-privacy-test-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    await mkdir(join(root, 'scripts'));
    for (const name of ['security-check.mjs', 'repository-privacy.mjs']) {
      await copyFile(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
    }
    const scanner = join(root, '.git', 'test-scanner');
    await writeFile(scanner, '#!/bin/sh\necho scanner-invoked\nexit 0\n', { mode: 0o700 });
    const run = (binary = scanner) => spawnSync(process.execPath, ['scripts/security-check.mjs'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, GITLEAKS_BINARY: binary },
    });
    await fn(root, run);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('scanner checks untracked docs and redacts findings; upstream notices still reach Gitleaks', async () => {
  await scannerFixture(async (root, run) => {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs', 'draft.md'), contact);
    const namedFile = join(root, `${contact}.md`);
    await writeFile(namedFile, 'Notes');
    await writeFile(join(root, 'THIRD_PARTY_NOTICES.txt'), contact);
    const rejected = run();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /docs\/draft.md: non-example email address/);
    assert.equal((rejected.stdout + rejected.stderr).includes(contact), false);
    assert.match(rejected.stdout, /scanner-invoked/);
    assert.match(rejected.stderr, /\[redacted-email\]/);
    await rm(namedFile);
    await writeFile(join(root, 'docs', 'draft.md'), 'player@example.com');
    assert.equal(run().status, 0);
  });
});

test('scanner fails closed when Gitleaks is unavailable or a dangling symlink is present', async () => {
  await scannerFixture(async (root, run) => {
    const missing = run(join(root, 'missing-scanner'));
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Install gitleaks/);
    await symlink('missing-target', join(root, 'dangling-link'));
    const linked = run();
    assert.equal(linked.status, 1);
    assert.match(linked.stderr, /dangling-link: not a regular file/);
  });
});
