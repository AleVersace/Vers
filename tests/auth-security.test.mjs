import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { isAllowedFirebaseIdentity } from "../lib/vers/auth-identity.ts";
import { asUser, claims, securityDb, PROJECT, CAMPAIGN } from "./helpers/security-db.mjs";

let db;
before(async () => { db = await securityDb(); });
after(async () => { await db?.close(); });

test("Google login preserves the master and player roles of enabled invitations", async () => {
  for (const uid of ["master", "player"]) {
    await asUser(db, claims(uid), async () => {
      const { rows } = await db.query("select * from public.bootstrap_current_user()");
      assert.deepEqual(rows.map(r => [r.campaign_id, r.role]), [[CAMPAIGN, uid]]);
    });
  }
});

test("database rejects native Auth, unverified email, wrong project and non-Google identities", async () => {
  for (const override of [
    { iss: "https://native-auth.example.test/auth/v1", aud: "authenticated", firebase: undefined },
    { email_verified: false }, { email_verified: undefined },
    { iss: "https://securetoken.google.com/other-project", aud: "other-project" },
    { aud: "other-project" }, { firebase: { sign_in_provider: "password" } },
    { role: "service_role" },
  ]) {
    await asUser(db, claims("untrusted", { email: "master@example.test", ...override }), async () => {
      const { rows } = await db.query("select public.current_firebase_uid() as uid");
      assert.equal(rows[0].uid, null);
      await assert.rejects(db.query("select * from public.bootstrap_current_user()"), /identity is incomplete/);
    });
  }
  const { rows } = await db.query("select * from public.campaign_members where user_id='untrusted'");
  assert.equal(rows.length, 0);
});

test("users cannot change the installation trust configuration", async () => {
  await asUser(db, claims(), async () => {
    await assert.rejects(db.query("select public.configure_firebase_auth('other-project')"), /permission denied/);
    await assert.rejects(db.query("select * from vers_private.installation_settings"), /permission denied/);
  });
});

test("server authorization accepts the same verified Google identity contract", () => {
  assert.equal(isAllowedFirebaseIdentity(claims(), PROJECT), true);
  for (const override of [{ email_verified: false }, { firebase: {} }, { email: "" }, { aud: "other" }, { iss: "other" }]) {
    assert.equal(isAllowedFirebaseIdentity(claims("master", override), PROJECT), false);
  }
  assert.equal(isAllowedFirebaseIdentity(claims(), undefined), false);
});

test("an unconfigured installation fails closed", async () => {
  await db.exec("delete from vers_private.installation_settings");
  try {
    await asUser(db, claims(), async () => {
      assert.equal((await db.query("select public.current_firebase_uid() as uid")).rows[0].uid, null);
      await assert.rejects(db.query("select * from public.bootstrap_current_user()"), /identity is incomplete/);
    });
  } finally {
    await db.query("select public.configure_firebase_auth($1)", [PROJECT]);
  }
});
