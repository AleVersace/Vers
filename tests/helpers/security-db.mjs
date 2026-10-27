import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export const PROJECT = "vers-test-project";
export const CAMPAIGN = "10000000-0000-4000-8000-000000000001";
export const OTHER_CAMPAIGN = "10000000-0000-4000-8000-000000000002";
export const SCENE = "20000000-0000-4000-8000-000000000001";
export const HIDDEN_SCENE = "20000000-0000-4000-8000-000000000002";

export function claims(uid = "master", extra = {}) {
  return {
    sub: uid, email: `${uid}@example.test`, email_verified: true,
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT,
    firebase: { sign_in_provider: "google.com" }, role: "authenticated", ...extra,
  };
}

export async function asUser(db, identity, fn) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(identity)]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); }
}

export async function securityDb({ configure = true, fixtures = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    create schema realtime;
    create table realtime.messages(topic text);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as
      $$ select current_setting('realtime.topic',true) $$;
  `);
  const migrations = new URL("../../supabase/migrations/", import.meta.url);
  for (const filename of (await readdir(migrations)).filter(f => f.endsWith(".sql")).sort()) {
    let sql = await readFile(new URL(filename, migrations), "utf8");
    sql = sql.replace(/create extension if not exists pgcrypto;/gi, "");
    sql = sql.replace(/alter publication supabase_realtime add table [\s\S]*?;/gi, "");
    await db.exec(sql);
  }
  if (configure) await db.query("select public.configure_firebase_auth($1)", [PROJECT]);
  if (!fixtures) return db;
  await db.exec(`
    insert into public.app_users(firebase_uid,email,display_name)
    values ('fixture-system',null,'System');
    insert into public.campaigns(id,name,created_by_uid)
    values ('${CAMPAIGN}','Test campaign','fixture-system'),
           ('${OTHER_CAMPAIGN}','Other campaign','fixture-system');
    insert into public.campaign_access_grants(campaign_id,email,role)
    values ('${CAMPAIGN}','master@example.test','master'),
           ('${CAMPAIGN}','player@example.test','player'),
           ('${OTHER_CAMPAIGN}','outsider@example.test','master');
  `);
  return db;
}
