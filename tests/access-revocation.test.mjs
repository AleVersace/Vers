import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { asUser, claims, securityDb, CAMPAIGN, OTHER_CAMPAIGN, SCENE } from "./helpers/security-db.mjs";
let db;
const token = "30000000-0000-4000-8000-000000000001";
before(async () => {
  db = await securityDb();
  for (const uid of ["master", "player", "outsider"]) {
    await asUser(db, claims(uid), () => db.query("select * from public.bootstrap_current_user()"));
  }
  await db.exec(`
    insert into public.scenes(id,campaign_id,name) values('${SCENE}','${CAMPAIGN}','Active');
    update public.campaigns set player_scene_id='${SCENE}' where id='${CAMPAIGN}';
    insert into public.tokens(id,scene_id,owner_user_id,created_by_uid,name)
      values('${token}','${SCENE}','player','master','Player token');
    insert into public.token_stats(token_id,hp_current,hp_max) values('${token}',10,20);
  `);
});
after(async () => { await db?.close(); });

test("active members keep scene access, token movement and private stats", async () => {
  await asUser(db, claims("player"), async () => {
    assert.equal((await db.query(`select * from public.tokens where id='${token}'`)).rows.length, 1);
    assert.equal((await db.query(`update public.tokens set x=2 where id='${token}' returning x`)).rows[0].x, "2");
    assert.equal((await db.query(`select * from public.token_stats where token_id='${token}'`)).rows.length, 1);
    assert.equal((await db.query(`select public.is_campaign_member('${OTHER_CAMPAIGN}') as allowed`)).rows[0].allowed, false);
  });
});

test("revocation blocks an existing session immediately, including owned token updates and stats", async () => {
  await db.exec("update public.campaign_access_grants set enabled=false where email='player@example.test'");
  try {
    await asUser(db, claims("player"), async () => {
      assert.equal((await db.query(`select public.is_campaign_member('${CAMPAIGN}') as allowed`)).rows[0].allowed, false);
      assert.equal((await db.query(`select * from public.tokens where id='${token}'`)).rows.length, 0);
      assert.equal((await db.query(`update public.tokens set x=99 where id='${token}' returning id`)).rows.length, 0);
      assert.equal((await db.query(`select * from public.token_stats where token_id='${token}'`)).rows.length, 0);
      assert.equal((await db.query("select * from public.bootstrap_current_user()")).rows.length, 0);
      assert.equal((await db.query(`select public.is_campaign_member('${CAMPAIGN}') as allowed`)).rows[0].allowed, false);
    });
  } finally { await db.exec("update public.campaign_access_grants set enabled=true where email='player@example.test'"); }
});

test("demoting a master takes effect before login or bootstrap repeats", async () => {
  await db.exec("update public.campaign_access_grants set role='player' where email='master@example.test'");
  try {
    await asUser(db, claims(), async () => {
      assert.equal((await db.query(`select public.is_campaign_master('${CAMPAIGN}') as allowed`)).rows[0].allowed, false);
      assert.equal((await db.query(`select public.is_campaign_member('${CAMPAIGN}') as allowed`)).rows[0].allowed, true);
    });
  } finally { await db.exec("update public.campaign_access_grants set role='master' where email='master@example.test'"); }
});

test("editing a profile email cannot obtain another identity's invitation", async () => {
  await asUser(db, claims("player"), async () => {
    await assert.rejects(db.query("update public.app_users set email='outsider@example.test' where firebase_uid='player'"), /permission denied/);
    assert.equal((await db.query(`select public.is_campaign_master('${OTHER_CAMPAIGN}') as allowed`)).rows[0].allowed, false);
  });
});
