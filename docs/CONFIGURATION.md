# Configuration reference

Copy [.env.example](../.env.example) to `.env.local` for local execution.
Next.js loads this file; the setup commands explicitly load it with Node's
`--env-file` option. Keep it untracked. Use the Vercel environment-variable UI
for hosted execution instead of uploading this file.

## Application variables

| Variable | Source | Scope and requirement |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project Connect dialog / API settings, project URL | Required, browser-visible |
| `NEXT_PUBLIC_ASSET_BUCKET` | Existing Storage bucket ID; `vers-assets` for a new install | Optional with default `vers-assets`; explicitly set the existing ID when upgrading a differently named bucket |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase API Keys, publishable key | Required, browser-visible; never use a secret key here |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Project settings → General → your web app, `apiKey` | Required, browser-visible |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same web configuration, `authDomain` | Required, browser-visible; normally the Firebase-provided auth hostname |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same web configuration, `projectId` | Required, browser-visible |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same web configuration, `appId` | Required, browser-visible |
| `SUPABASE_SECRET_KEY` | Supabase API Keys, secret key | Required on server and for setup; bypasses RLS |
| `FIREBASE_ADMIN_PROJECT_ID` | Service-account JSON `project_id` | Required on server and for setup |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service-account JSON `client_email` | Required on server; account identity, not the owner's Google email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service-account JSON `private_key` | Required on server; confidential signing credential |
| `NEXT_PUBLIC_SOURCE_URL` | URL of the source for your deployed version | Optional during private preparation; configure before distributing a hosted modified version |

The current client reads four Firebase web fields. The additional
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` and
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` fields in the example file are
**unused compatibility fields** from the original Firebase configuration.
Leaving them empty does not enable or break file storage: all application files
are in Supabase Storage. No Firebase Storage setup is needed.

Public configuration is intentionally sent to browsers. Its visibility is not
an authorization bypass: database and file permissions depend on signed
identity and RLS. Nevertheless, distribute placeholders rather than another
operator's project identifiers.

## Setup and administrative variables

| Variable | Purpose | Where to set it |
| --- | --- | --- |
| `VERS_INITIAL_MASTER_EMAIL` | Google email of the first invited master | Local `.env.local`, only for a new installation |
| `VERS_INITIAL_CAMPAIGN_NAME` | Name of the first campaign | Local `.env.local`, only for a new installation |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to a private service-account JSON used by the optional role repair script | Local administrative shell / private env file only |
| `GITLEAKS_BINARY` | Path to the Gitleaks executable if not on PATH | Developer shell or CI; not an app setting |
| `NODE_OPTIONS` | Node interoperability needed by Firebase Admin on Vercel | Already configured in [vercel.json](../vercel.json) |

`VERS_INITIAL_*` settings are local first-install inputs, not production server variables.
The normal web login uses the three `FIREBASE_ADMIN_*` variables; it does not use
`GOOGLE_APPLICATION_CREDENTIALS`. The optional repair script does the opposite:
it needs the JSON path plus `FIREBASE_ADMIN_PROJECT_ID`.

The Supabase project ref, database password and CLI account token are
**administrative CLI credentials**, separate from the application variables.
Use the CLI's interactive login/password prompts. Do not put them in package
scripts, tracked files or command examples with real values.

## Firebase project consistency

These must all identify the same Firebase project:

1. Browser `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
2. Server `FIREBASE_ADMIN_PROJECT_ID` and its service account.
3. Supabase's Firebase Third-Party Auth integration.
4. The trusted project saved by `setup:initialize` or `setup:auth`.

The server validates Google sign-in and verified email; the database additionally
checks issuer, audience and the technical `authenticated` role. Changing only
one of these settings can prevent login.

## Private-key formatting

For a local env file, quote the complete PEM string, using literal `\n`
sequences between lines as represented in the downloaded JSON. Preserve the
BEGIN/END markers and every key character. Do not include the surrounding JSON
object or a trailing JSON comma.

In Vercel, paste the private-key value into the server-only variable. The
application accepts real line breaks and converts literal `\n` sequences.
Use Vercel's secret/sensitive handling where available. Do not prefix this key
with `NEXT_PUBLIC_`, paste it into a browser console, or commit an illustrative
real key. See [Firebase Admin setup](https://firebase.google.com/docs/admin/setup).

## Environment separation

| Context | Firebase / Supabase projects | Vercel variable scope |
| --- | --- | --- |
| Production | Production projects | Production only |
| Preview | Dedicated test projects and synthetic users/assets | Preview only, for reviewed code |
| Local development | Development projects | Local `.env.local`; Development scope only if deliberately using Vercel's local tooling |
| CI | None; synthetic PostgreSQL fixtures | No application secrets |

All production variables, including public project configuration, are scoped to
Production in the reference setup. A preview without its own complete
configuration is expected to be unusable; it must not silently use production.

Next.js embeds `NEXT_PUBLIC_*` values at build time. Redeploy after changing
them. Update a server secret with a fresh deployment too, then check login before
revoking the old credential. See
[Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
and [Vercel environment variables](https://vercel.com/docs/environment-variables).

## What is not an application setting

`supabase/config.toml` configures the local Supabase stack. `project_id = "vers"`
is a local stack identifier, not the hosted project's ref. Linking/pushing
migrations does not copy every local Auth/Storage setting into the hosted
dashboard. Configure the hosted Firebase integration and native signup settings
explicitly as described in [deployment](DEPLOYMENT.md).

The Studio `OPENAI_API_KEY` reference and optional S3, SMS and other provider
entries in that file are Supabase template options. They do not mean Vers
requires those services or sends game data to them.
