import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { asUser, claims, securityDb, CAMPAIGN, SCENE, HIDDEN_SCENE } from "./helpers/security-db.mjs";
import { refreshAssetUrls, ASSET_URL_TTL_SECONDS } from "../lib/vers/asset-urls.ts";
let db;
const id = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
before(async () => {
  db = await securityDb();
  for (const uid of ['master','player','outsider']) await asUser(db, claims(uid), () => db.query('select * from public.bootstrap_current_user()'));
  await db.exec(`
    insert into public.scenes(id,campaign_id,name) values('${SCENE}','${CAMPAIGN}','Active'),('${HIDDEN_SCENE}','${CAMPAIGN}','Hidden');
    update public.campaigns set player_scene_id='${SCENE}' where id='${CAMPAIGN}';
    insert into public.assets(id,campaign_id,kind,name,storage_path,created_by_uid) values
      ('${id(1)}','${CAMPAIGN}','map','Active map','${CAMPAIGN}/maps/active.png','master'),
      ('${id(2)}','${CAMPAIGN}','map','Hidden map','${CAMPAIGN}/maps/hidden.png','master'),
      ('${id(3)}','${CAMPAIGN}','prop','Visible prop','${CAMPAIGN}/props/visible.png','master'),
      ('${id(4)}','${CAMPAIGN}','prop','Hidden prop','${CAMPAIGN}/props/hidden.png','master'),
      ('${id(5)}','${CAMPAIGN}','token','Token','${CAMPAIGN}/tokens/token.png','player');
    update public.scenes set map_asset_id='${id(1)}' where id='${SCENE}';
    update public.scenes set map_asset_id='${id(2)}' where id='${HIDDEN_SCENE}';
    insert into public.scene_assets(scene_id,asset_id,created_by_uid,visible_to_players) values
      ('${SCENE}','${id(3)}','master',true),('${SCENE}','${id(4)}','master',false);
    insert into storage.objects(bucket_id,name) select 'vers-assets',storage_path from public.assets;
    insert into public.characters(id,owner_user_id,name,token_storage_path) values
      ('${id(6)}','player','Hero','characters/${id(6)}/token.png'),
      ('${id(7)}','master','Hidden character','characters/${id(7)}/token.png');
    insert into storage.objects(bucket_id,name) select 'vers-assets',token_storage_path from public.characters;
  `);
});
after(async () => { await db?.close(); });

test('players can read active map, visible props, tokens and their characters, but not hidden or unrelated files', async () => {
  await asUser(db, claims('player'), async () => {
    const { rows } = await db.query('select name from storage.objects order by name');
    assert.deepEqual(rows.map(r => r.name).sort(), [
      `${CAMPAIGN}/maps/active.png`, `${CAMPAIGN}/props/visible.png`, `${CAMPAIGN}/tokens/token.png`, `characters/${id(6)}/token.png`
    ].sort());
  });
  await asUser(db, claims('outsider'), async () => assert.equal((await db.query('select * from storage.objects')).rows.length, 0));
});

test('master uploads before metadata and storage deletion after metadata deletion still work', async () => {
  await asUser(db, claims(), async () => {
    const path = `${CAMPAIGN}/maps/new.png`;
    await db.query("insert into storage.objects(bucket_id,name) values('vers-assets',$1)", [path]);
    assert.equal((await db.query('select name from storage.objects where name=$1', [path])).rows.length, 1);
    await db.query("insert into public.assets(campaign_id,kind,name,storage_path,created_by_uid) values($1,'map','New',$2,'master')", [CAMPAIGN,path]);
    await db.query('delete from public.assets where storage_path=$1', [path]);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name', [path])).rows.length, 1);
  });
});

test('player token uploads remain possible but cannot overwrite or delete master maps', async () => {
  await asUser(db, claims('player'), async () => {
    await db.query("insert into storage.objects(bucket_id,name) values('vers-assets',$1)", [`${CAMPAIGN}/tokens/new.png`]);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('vers-assets',$1)", [`${CAMPAIGN}/maps/forbidden.png`]), /row-level security/);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name', [`${CAMPAIGN}/maps/active.png`])).rows.length, 0);
  });
});

test('revocation denies new storage reads and signatures to existing campaign sessions', async () => {
  await db.exec("update public.campaign_access_grants set enabled=false where email='player@example.test'");
  await asUser(db, claims('player'), async () => {
    const rows = (await db.query('select name from storage.objects')).rows;
    assert.deepEqual(rows.map(r => r.name), [`characters/${id(6)}/token.png`]);
  });
});

test('short-lived asset URLs are cached, renewed for long sessions, and removed on expiry or path change', async () => {
  const rows = [{ id: 'map', storage_path: 'active.png' }];
  const urls = { other: 'other-url' }, leases = {};
  const calls = [];
  const sign = async (path, ttl) => { calls.push({path,ttl}); return `url-${calls.length}`; };
  await refreshAssetUrls(rows, urls, leases, sign, 0);
  await refreshAssetUrls(rows, urls, leases, sign, 1000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ttl, ASSET_URL_TTL_SECONDS);
  assert.equal(ASSET_URL_TTL_SECONDS, 900);
  await refreshAssetUrls(rows, urls, leases, sign, 850_000);
  assert.equal(urls.map, 'url-2');
  await refreshAssetUrls(rows, urls, leases, async () => undefined, 1_800_000);
  assert.equal(urls.map, undefined);
  assert.equal(urls.other, 'other-url');
  await refreshAssetUrls(rows, urls, leases, sign, 2_000_000);
  await refreshAssetUrls([{ id:'map',storage_path:'changed.png' }], urls, leases, async () => undefined, 2_000_001);
  assert.equal(urls.map, undefined);
});
