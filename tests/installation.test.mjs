import assert from 'node:assert/strict';
import test from 'node:test';
import { securityDb, asUser, claims, PROJECT } from './helpers/security-db.mjs';
test('fresh install is empty, setup is explicit and atomic, and first Google master can sign in', async () => {
  const db = await securityDb({configure:false,fixtures:false});
  try {
    for (const table of ['campaigns','app_users','campaign_access_grants']) assert.equal((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n, 0);
    await asUser(db, claims(), async () => {
      await assert.rejects(db.query('select public.initialize_installation($1,$2,$3)',[PROJECT,'master@example.test','Test']),/permission denied/);
    });
    await assert.rejects(db.query('select public.initialize_installation($1,$2,$3)',[PROJECT,'invalid','Test']), /valid master/);
    assert.equal((await db.query('select count(*)::int as n from public.campaigns')).rows[0].n,0);
    await db.query('select public.initialize_installation($1,$2,$3)',[PROJECT,'master@example.test','Test']);
    await asUser(db, claims(), async () => {
      const { rows } = await db.query('select * from public.bootstrap_current_user()');
      assert.equal(rows.length,1); assert.equal(rows[0].role,'master');
    });
    await assert.rejects(db.query('select public.initialize_installation($1,$2,$3)',[PROJECT,'another@example.test','Another']), /already contains campaigns/);
    assert.equal((await db.query('select count(*)::int as n from public.campaigns')).rows[0].n,1);
  } finally { await db.close(); }
});
