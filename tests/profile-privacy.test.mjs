import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { asUser, claims, securityDb, CAMPAIGN, OTHER_CAMPAIGN } from "./helpers/security-db.mjs";
let db;
before(async () => {
  db = await securityDb();
  for (const uid of ["master", "player", "outsider"]) {
    await asUser(db, claims(uid), () => db.query("select * from public.bootstrap_current_user()"));
  }
});
after(async () => { await db?.close(); });

test("account email, names and layout are private, including to campaign masters", async () => {
  for (const uid of ["master", "player", "outsider"]) {
    await asUser(db, claims(uid), async () => {
      const { rows } = await db.query("select firebase_uid,email,first_name,last_name,table_layout from public.app_users");
      assert.deepEqual(rows.map(r => r.firebase_uid), [uid]);
    });
  }
});

test("the campaign roster preserves display names, avatars and roles without account fields", async () => {
  await asUser(db, claims("player"), async () => {
    const { rows } = await db.query("select * from public.list_campaign_members($1)", [CAMPAIGN]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(r => r.role).sort(), ["master", "player"]);
    for (const row of rows) assert.deepEqual(Object.keys(row.app_users).sort(), ["avatar_url", "display_name"]);
    assert.equal((await db.query("select * from public.list_campaign_members($1)", [OTHER_CAMPAIGN])).rows.length, 0);
    assert.deepEqual((await db.query("select user_id from public.tabletop_profiles order by user_id")).rows.map(r => r.user_id), ["master", "player"]);
  });
});

test("editing one's profile and layout still works and synchronizes the shared projection", async () => {
  await asUser(db, claims("player"), async () => {
    await db.query("update public.app_users set display_name='Hero',first_name='Private',nickname='Hero',table_layout=$1 where firebase_uid='player'", [{ version: 2 }]);
    assert.equal((await db.query("select display_name from public.tabletop_profiles where user_id='player'")).rows[0].display_name, "Hero");
    assert.equal((await db.query("select first_name from public.app_users where firebase_uid='player'")).rows[0].first_name, "Private");
    await assert.rejects(db.query("update public.tabletop_profiles set display_name='Spoof' where user_id='master'"), /permission denied/);
  });
  await asUser(db, claims(), async () => {
    assert.equal((await db.query("select * from public.list_campaign_members($1)", [CAMPAIGN])).rows.find(r => r.user_id === "player").app_users.display_name, "Hero");
  });
});

test("revoked members can no longer read the shared projection or roster", async () => {
  await db.exec("update public.campaign_access_grants set enabled=false where email='player@example.test'");
  await asUser(db, claims("player"), async () => {
    assert.equal((await db.query("select * from public.list_campaign_members($1)", [CAMPAIGN])).rows.length, 0);
    assert.deepEqual((await db.query("select user_id from public.tabletop_profiles")).rows.map(r => r.user_id), ["player"]);
  });
});
