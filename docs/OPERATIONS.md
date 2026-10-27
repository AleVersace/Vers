# Operations

These actions are for the installation owner using the trusted Supabase SQL
Editor or administrative tooling. Run examples only against your own project.
Replace example addresses and UUIDs privately; never commit the resulting SQL
with real users in a migration, issue, screenshot or support log.

## Identify the target

Confirm the Supabase project name/ref and the application environment. In SQL
Editor, inspect campaign IDs:

```sql
select id, name from public.campaigns order by created_at;
```

Copy the intended ID into examples below. The example UUID is a
placeholder, not a campaign installed by the repository.

## Invite a player or another master

Invitations are database records, not email messages. There is no SMTP invite
delivery and no self-service campaign signup. A user needs the application URL
and their authorized Google account.

<!-- example: invite -->
```sql
insert into public.campaign_access_grants
  (campaign_id, email, role, character_name, enabled)
values (
  '00000000-0000-4000-8000-000000000001',
  lower(trim('player@example.com')),
  'player',
  'Example hero',
  true
)
on conflict (campaign_id, email) do update
set role = excluded.role,
    character_name = excluded.character_name,
    enabled = excluded.enabled;
```

Use `'master'` instead of `'player'` only when deliberately granting campaign
administration. The player signs in and reloads the campaign list.
`bootstrap_current_user()` creates or refreshes their membership; do not
manually create a Firebase UID or insert a membership as a substitute for an
enabled invitation.

Google email must match the invitation after lowercasing/trimming. The Firebase
custom claim remains `role: authenticated` for both players and masters. It is
a technical database role, not a campaign permission.

## Revoke or change access

<!-- example: revoke -->
```sql
update public.campaign_access_grants
set enabled = false
where campaign_id = '00000000-0000-4000-8000-000000000001'
  and email = lower(trim('player@example.com'));
```

New database/file authorization checks reject the revoked user even with an
existing login. Their saved characters and past activity are retained. Already
downloaded data cannot be recalled; issued signed asset URLs remain usable until
expiry (new URLs last 15 minutes). Re-enable the invitation to restore access.

<!-- example: promote -->
```sql
update public.campaign_access_grants
set role = 'master', enabled = true
where campaign_id = '00000000-0000-4000-8000-000000000001'
  and email = lower(trim('player@example.com'));
```

Use `role = 'player'` to demote. The database trigger synchronizes existing
membership roles. Reload the application when checking the resulting UI.
Disabling a user in Firebase alone is not the immediate campaign revocation
mechanism; disable their invitation in every campaign that must be revoked.

## Create an additional campaign

The first master must have signed in once so an `app_users` row exists.
`setup:initialize` is deliberately not a multi-campaign creation command.
Use an administrative transaction such as this, substituting the intended
master's Google email and campaign name:

<!-- example: create-campaign -->
```sql
do $campaign$
declare
  creator_uid text;
  new_campaign uuid := gen_random_uuid();
  new_scene uuid := gen_random_uuid();
  invited_email text := lower(trim('master@example.com'));
begin
  select firebase_uid into strict creator_uid
  from public.app_users
  where lower(trim(email)) = invited_email;

  insert into public.campaigns (id, name, created_by_uid)
  values (new_campaign, 'Another campaign', creator_uid);

  insert into public.scenes (id, campaign_id, name, fog_enabled)
  values (new_scene, new_campaign, 'Scena 1', false);

  update public.campaigns
  set player_scene_id = new_scene
  where id = new_campaign;

  insert into public.campaign_access_grants (campaign_id, email, role)
  values (new_campaign, invited_email, 'master');
end;
$campaign$;
```

If there is no matching user, or more than one, the block fails atomically.
Check the intended identity rather than removing the strict check. The new
master reloads the campaign list; add other invitations using the new campaign
ID.

## Assets and data retention

Master uploads are stored in the private Supabase bucket selected by
`NEXT_PUBLIC_ASSET_BUCKET` (`vers-assets` for new installations).
Metadata and relationships live in Postgres. Use the application controls for
ordinary asset deletion so metadata, scene references and file cleanup follow
the application's logic. Do not make the bucket public to repair a failed URL.

Removing an invitation does not delete a person's account, characters or past
rolls. Account erasure is a separate operator process with foreign-key and shared
history consequences; there is no generic safe delete-all command in this
guide. Treat uploaded game content and player records as private operational
data.

## Backups and recovery

Back up three separate kinds of state:

1. Supabase PostgreSQL data, schema, migration history and installation settings.
2. Supabase Storage **file contents**, including their original object paths.
3. Firebase Authentication identities plus private infrastructure configuration,
   environment variables and the deployed commit.

A database-only restore does not restore Storage file bytes. Preserve identity
UIDs when planning recovery: character ownership and memberships refer to them.
A Git checkout contains application/schema source, not campaign backups or
Firebase accounts. Do not assume your cloud plan includes a particular backup
frequency or retention period; check your provider settings.

Use a private, access-controlled backup location outside the repository.
Exercise recovery with a disposable environment before relying on it:
restore the database and files, configure the matching identity project, deploy
the corresponding application version, and test an authorized master/player.
Do not point an experimental restore at production identities without a planned
access boundary. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).

## Upgrades

For the source naming update, also follow [naming compatibility](RENAMING.md);
set the existing bucket ID before deploying and do not replay historical SQL.

### Normal releases after the current security baseline

1. Record the deployed commit and migration versions. Back up the data/files.
2. Read the diff and test with development projects.
3. Run `npm ci`, `npm run lint`, `npm test`, `npm audit --audit-level=low`
   and `npm run security:check`.
4. Check the target with `npm run supabase -- projects list` and
   `npm run supabase -- migration list --linked`.
5. Review `npm run supabase:push -- --dry-run`. Apply new migrations only in the
   order required by that release, then deploy the compatible application.
6. Verify real login, asset access and Realtime before considering the release
   complete.

There is no automatic cloud migration in GitHub CI or Vercel. Do not run
`setup:initialize` again, replay all old migrations, or use a remote reset.
Historical migrations that once configured installation-specific access have
been sanitized into no-ops; their numeric versions remain intact.

### Upgrading from before the October 2026 security migrations

This older upgrade requires the private security-baseline checkout retained by
the original installation operator; it is not part of this fresh source snapshot.
That checkout still targets the original infrastructure labels. Do not apply
the current fresh-install SQL templates directly to that older database.
Use that retained checkout (with your private local configuration)
for the following maintenance procedure, then return to the current source and
follow [naming compatibility](RENAMING.md).

The simplest supported operational path is a **maintenance window**:

1. Back up and stop user traffic to the old client.
2. Apply pending migrations through `202610270007` with the CLI.
3. Fill the existing installation's matching Supabase URL, server secret key and
   Firebase project ID in a private `.env.local`, then run
   `npm run setup:auth`.
4. Deploy the updated application; verify identity, roster, profile privacy and
   file access before reopening traffic.

Migration `202610270001` fails closed until the trusted project is configured.
The interruption between migrations and `setup:auth` is intentional during this
maintenance procedure. `setup:auth` changes only the trusted Firebase project;
it does not recreate campaigns or migrate Firebase identities.

An online staged migration requires applying `001` and
`configure_firebase_auth` in the same transaction, then `002`–`006`,
deploying the compatible security-baseline client, and finally `007`. It also requires correctly
recording migration history. Use a rehearsed operator-specific plan instead of
blindly running the full push while the old client is serving users.

### Rollback

Rolling back the Vercel deployment rolls back application code only. It does
not revert schema, data, environment settings or Google/Supabase configuration.
Do not deploy a client that relies on profile fields removed from its allowed
queries. Prefer a compatible forward fix; coordinate any data restore with a
maintenance window and the matching application release.

## Credential rotation and monitoring

After an exposure, rotate the relevant secret at its issuing provider; deleting
a commit or making a repository private does not invalidate copied credentials.
Update the corresponding server variable, redeploy, verify actual authorized
login, and then revoke the old credential according to the provider's process.

Monitor Vercel builds/function errors, Supabase database/Auth/Storage/Realtime
health and quotas, Firebase Authentication errors, and GitHub CI/Dependabot.
No separate monitoring vendor is configured by this repository. Review logs
before sharing: provider errors may contain user identity, paths or request data.

Changes to the Firebase project itself are an identity migration, not an
ordinary key rotation. They affect all four matching settings listed in
[configuration](CONFIGURATION.md#firebase-project-consistency) and potentially
every stored user UID.

## Optional role repair

Normally the authorization route assigns the role automatically. For a user
already created in Firebase, an administrator can run:

```sh
node --env-file=.env.local scripts/set-firebase-role.mjs player@example.com
```

Set `GOOGLE_APPLICATION_CREDENTIALS` to a private JSON path and
`FIREBASE_ADMIN_PROJECT_ID` to its project. This command only assigns the
technical `authenticated` claim; it does not invite a user or make them master.
Do not use it to bypass a missing/disabled campaign invitation.
