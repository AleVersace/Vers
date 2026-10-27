import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('the deployed Node configuration loads Firebase Admin and rejects malformed tokens', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  // Vercel disables require(ESM) by default, unlike a normal local Node process.
  // Use the actual deployment option to load the real Admin -> JWKS -> JOSE chain.
  const result = spawnSync(process.execPath, ['-e', `
    const {initializeApp} = require('firebase-admin/app');
    const {getAuth} = require('firebase-admin/auth');
    const app = initializeApp({projectId:'vers-test-project'});
    getAuth(app).verifyIdToken('not-a-jwt').then(() => process.exit(2), error => {
      if (error.code !== 'auth/argument-error') { console.error(error.code); process.exit(3); }
    });
  `], {
    encoding:'utf8',
    env:{...process.env,NODE_OPTIONS:`--no-experimental-require-module ${config.env?.NODE_OPTIONS ?? ''}`},
  });
  assert.equal(result.status,0,result.stderr);
});
