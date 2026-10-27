import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readBrowserPreference } from '../lib/vers/browser-preferences.ts';
import ts from 'typescript';

function storage(initial, writable = true) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (!writable) throw new Error('quota exceeded'); values.set(key, value); },
  };
}

test('quick dice recover saved sides and count from the previous namespace', () => {
  const saved = storage({ 'previous:quick-die-sides': '8', 'previous:quick-die-count': '5', unrelated: 'keep' });
  assert.equal(readBrowserPreference(saved, 'vers:quick-die-sides'), '8');
  assert.equal(readBrowserPreference(saved, 'vers:quick-die-count'), '5');
  assert.equal(saved.getItem('vers:quick-die-sides'), '8');
  assert.equal(saved.getItem('vers:quick-die-count'), '5');
  assert.equal(saved.getItem('previous:quick-die-sides'), '8');
  assert.equal(saved.getItem('unrelated'), 'keep');
});

test('a saved Vers preference takes priority and an empty browser uses the existing defaults', () => {
  const saved = storage({ 'previous:quick-die-sides': '8', 'vers:quick-die-sides': '12' });
  assert.equal(readBrowserPreference(saved, 'vers:quick-die-sides'), '12');
  assert.equal(readBrowserPreference(storage({}), 'vers:quick-die-count'), null);
  assert.equal(readBrowserPreference(storage({}), 'unscoped'), null);
});

test('ambiguous previous preferences are not imported', () => {
  const saved = storage({ 'one:quick-die-count': '3', 'two:quick-die-count': '8' });
  assert.equal(readBrowserPreference(saved, 'vers:quick-die-count'), null);
  assert.equal(saved.getItem('vers:quick-die-count'), null);
});

test('readable preferences survive a storage write failure', () => {
  assert.equal(readBrowserPreference(storage({ 'previous:quick-die-sides': '10' }, false), 'vers:quick-die-sides'), '10');
});

test('asset bucket configuration supports both a fresh installation and existing hosted files', () => {
  for (const [value, expected] of [[undefined, 'vers-assets'], ['', 'vers-assets'], ['  previous-assets  ', 'previous-assets']]) {
    const env = { ...process.env };
    delete env.NEXT_PUBLIC_ASSET_BUCKET;
    if (value !== undefined) env.NEXT_PUBLIC_ASSET_BUCKET = value;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      "import { ASSET_BUCKET } from './lib/vers/storage.ts'; process.stdout.write(ASSET_BUCKET);"], { encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected);
  }
});

test('every tabletop file operation uses the same configured bucket', () => {
  const source = readFileSync(new URL('../app/VersTable.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('VersTable.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let operations = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'from'
      && node.expression.expression.getText(ast).endsWith('.storage')) {
      operations++;
      assert.equal(node.arguments[0]?.getText(ast), 'ASSET_BUCKET');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(operations, 7, 'signing, uploads and all deletion paths remain covered');
});
