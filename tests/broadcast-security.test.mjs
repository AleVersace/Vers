import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../app/VersTable.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('VersTable.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map();
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'on' && node.arguments[0]?.text === 'broadcast') {
    const event = node.arguments[1].properties.find(p => p.name?.getText(ast) === 'event')?.initializer?.text;
    if (event === 'dice_roll' || event === 'token_visibility') handlers.set(event, node.arguments[2].getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
for (const [event, resource] of [['dice_roll','dice'],['token_visibility','scene']]) {
  test(`${event} broadcast cannot inject a roll or hide another player's token`, () => {
    assert.ok(handlers.has(event));
    const queued = [];
    const handler = new Function('queueRefreshForAttempt', `return (${handlers.get(event)});`)((...args) => queued.push(args));
    for (const payload of [null, { tokenId:'someone-else',visible:false }, { total:999,roller_user_id:'master',roller_name:'Master' }]) handler({ payload });
    assert.deepEqual(queued, Array.from({length:3}, () => [[resource],false]));
  });
}
