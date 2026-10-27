import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { securityDb, asUser, claims, PROJECT } from './helpers/security-db.mjs';

const guide = await readFile(new URL('../docs/OPERATIONS.md', import.meta.url), 'utf8');
function example(name, campaignId) {
  const match = guide.match(new RegExp(`<!-- example: ${name} -->\\s*\x60\x60\x60sql\\n([\\s\\S]*?)\x60\x60\x60`));
  assert.ok(match, `Missing executable SQL example: ${name}`);
  return match[1].replaceAll('00000000-0000-4000-8000-000000000001', campaignId);
}

test('documented SQL invites, revokes and promotes a player, then creates a working second campaign', async () => {
  const db = await securityDb({ configure: false, fixtures: false });
  const master = claims('documentation-master', { email: 'master@example.com' });
  const player = claims('documentation-player', { email: 'player@example.com' });
  try {
    await db.query('select public.initialize_installation($1,$2,$3)', [PROJECT, 'master@example.com', 'Documentation test']);
    const campaign = (await db.query('select id from public.campaigns')).rows[0].id;
    await asUser(db, master, () => db.query('select * from public.bootstrap_current_user()'));

    await db.exec(example('invite', campaign));
    await db.exec(example('invite', campaign)); // The documented upsert is safe to repeat.
    await asUser(db, player, async () => {
      const { rows } = await db.query('select * from public.bootstrap_current_user()');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].role, 'player');
      assert.equal(rows[0].character_name, 'Example hero');
    });

    await db.exec(example('revoke', campaign));
    await asUser(db, player, async () => {
      assert.equal((await db.query('select public.is_campaign_member($1) as allowed', [campaign])).rows[0].allowed, false);
      assert.equal((await db.query('select * from public.bootstrap_current_user()')).rows.length, 0);
    });

    await db.exec(example('promote', campaign));
    await asUser(db, player, async () => {
      assert.equal((await db.query('select public.is_campaign_master($1) as allowed', [campaign])).rows[0].allowed, true);
    });

    const createCampaign = example('create-campaign', campaign);
    await assert.rejects(db.exec(createCampaign.replace('master@example.com', 'missing@example.com')), /query returned no rows/);
    assert.equal((await db.query('select count(*)::int as n from public.campaigns')).rows[0].n, 1);
    await db.exec(createCampaign);
    const created = (await db.query("select * from public.campaigns where name = 'Another campaign'")).rows[0];
    assert.ok(created.player_scene_id);
    assert.equal(created.created_by_uid, master.sub);
    await asUser(db, master, async () => {
      const { rows } = await db.query('select * from public.bootstrap_current_user()');
      assert.equal(rows.length, 2);
      assert.equal((await db.query('select public.is_campaign_master($1) as allowed', [created.id])).rows[0].allowed, true);
      const scene = (await db.query('select * from public.scenes where id=$1', [created.player_scene_id])).rows[0];
      assert.equal(scene.name, 'Scena 1');
      assert.equal(scene.fog_enabled, false);
    });
  } finally { await db.close(); }
});
