# Vers naming and existing installations

The current source uses **Vers** throughout: application copy and metadata,
components, module paths, CSS, drag formats, diagnostics, test fixtures, setup
variables and new-installation SQL labels.

This source rename does not require moving production files or changing user
identities. Existing installations can keep their current cloud resources.

## Before deploying to an existing installation

1. In Supabase Storage, read the exact ID of the bucket that already holds your
   campaign and character images. Do not create a replacement or edit Storage
   metadata to rename it.
2. Set `NEXT_PUBLIC_ASSET_BUCKET` to that existing ID in the production hosting
   environment and the matching private local configuration. Set it **before**
   building/deploying this client. Leave production credentials out of Preview.
3. Keep the existing Firebase project, Supabase project, service credentials and
   authorized hostnames. Renaming the product does not migrate identities or
   change the ownership UIDs in saved campaigns.
4. Rename the two local first-install settings to `VERS_INITIAL_MASTER_EMAIL`
   and `VERS_INITIAL_CAMPAIGN_NAME` if you retain them. Do not run initialization
   again on an existing campaign database.
5. Run the checks in [development](DEVELOPMENT.md), deploy, and verify map and
   character images, uploads/deletions, two-client Realtime and dice preferences.

`NEXT_PUBLIC_ASSET_BUCKET` is embedded at build time. Omitting it on an existing
installation whose bucket has a different name would make file operations use
the wrong bucket. A rebuild is required after correcting it. The bucket remains
private and its existing RLS policies continue to apply; this setting does not
grant extra access.

## Fresh installations and migration history

A fresh installation creates `vers-assets`, `vers_private` and a `system:vers`
setup identity. The default client bucket matches that schema.

Historical SQL files were normalized for fresh installations, including their
brand-bearing filename. Their **numeric migration versions are unchanged**.
The migration ledger identifies versions: a branding update does not replay
those files on an existing database. Do not reset production, repair migration
history merely to change descriptive labels, or replay old migrations.

Previously installed private schemas and the system creator UID can keep their
original identifiers. Their server-side functions already refer to them and
the browser does not use those names. Existing rows, object paths, policies and
campaign ownership are left intact. A physical resource rename is a separate
data migration with its own backups and rollback plan.

Future behavior or permission changes must use a new migration version. This
rename is not a new security migration and does not replace pending migrations
from an earlier security release. Install those updates first from the original operator’s retained private security-baseline checkout (outside this fresh source snapshot), using the
[documented upgrade procedure](OPERATIONS.md#upgrades), before switching to this source.

## Browser state and Realtime

New quick-die preferences use the `vers:` namespace. On the same origin, the
client copies a uniquely matching previous preference for die sides/count when
no new preference exists. Existing Vers values take precedence. Ambiguous
previous values use normal defaults. Old keys are not deleted, so an open tab
running the earlier client is not disrupted.

Panel layouts, characters, macros and campaign IDs retain their saved data
format. Database-channel names are local subscription identifiers; the shared
campaign Broadcast topic is unchanged, so older and newer clients can still
receive shared events during rollout. Refresh existing tabs to use the new UI.

Changing the public hostname is optional and separate. It affects Firebase's
authorized domains and browser storage origins; preferences cannot be read
across origins. Keep an existing working URL or plan its redirect/login setup
before moving users to a new hostname.
