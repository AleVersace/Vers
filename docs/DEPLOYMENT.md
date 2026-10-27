# Install and deploy Vers

This guide reproduces the reference architecture: **GitHub → Vercel** for the
application, **Firebase Authentication** for Google login, and **Supabase** for
PostgreSQL, Realtime and private files. Use your own accounts and projects.

For an existing installation, read [upgrades](OPERATIONS.md#upgrades) before
running migrations and [the naming compatibility steps](RENAMING.md) before
deploying this client. The new-install command deliberately refuses a database
that already contains campaigns.

## 1. Prerequisites and repository

You need Git, a current Node.js 22 patch release, npm, a Google account, and
accounts on GitHub, Firebase, Supabase and Vercel. Node 22.22.2/npm 10.9.7 were
used for the documented local verification; CI selects Node 22. The package
pins the supported major to Node 22 in `package.json`. Vercel honors this engine
range; a broad minimum-only range can select a newer, untested major.

Clone the repository or an authorized fork, then run:

```sh
npm ci
```

Copy the configuration template:

```sh
# macOS / Linux
cp .env.example .env.local
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

Commands below use `npm`; on Windows, `npm.cmd` is equivalent if shell policy
blocks `npm.ps1`. Docker is not required for hosted setup or the current test
suite. A local Supabase stack would require additional tooling and is not the
reference production path.

Record project IDs, account ownership, recovery methods and credentials in a
private password manager or operations record, outside Git. Do not copy the
original operator's project settings into your own deployment.

## 2. Create Firebase identity

1. Create a Firebase project and register a **Web app** in Project settings.
2. Enable **Authentication → Sign-in method → Google** and configure its
   support email. Use your deployment's own branding. Firebase uses the
   underlying Google Cloud project; a second independent Google identity
   service is not needed.
3. Copy the web app's `apiKey`, `authDomain`, `projectId` and `appId` into the
   four corresponding public variables in [the configuration reference](CONFIGURATION.md).
4. For a development project, explicitly authorize `localhost` in
   Authentication settings. Later authorize the exact production hostname
   (without scheme, path or port) in the production project. Do not enter
   `*.vercel.app`; use the actual hostname assigned to your application.

The app uses Google's popup sign-in flow. Leave the Firebase-provided
`authDomain` in place for this setup. A custom OAuth auth domain is a separate
advanced configuration. See
[Google sign-in](https://firebase.google.com/docs/auth/web/google-signin) and
[authorized-domain guidance](https://firebase.google.com/docs/auth/faq-and-troubleshooting).

### Server credentials

In Firebase Project settings → Service accounts, generate/download an Admin SDK
service-account key through the official console. Save it securely outside the
checkout. Map its `project_id`, `client_email` and `private_key` fields to
`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL` and
`FIREBASE_ADMIN_PRIVATE_KEY`. See [key formatting](CONFIGURATION.md#private-key-formatting)
and [Firebase Admin setup](https://firebase.google.com/docs/admin/setup).

The server must be allowed to read Auth users and update their custom claims.
A dedicated service account with Firebase Authentication administration
permissions can be used; it does not need access to game files or Firestore.
Do not grant a browser access to the account key.

Vers's server route assigns the Supabase technical role to invited Google
users. Do not add a separate Firebase Cloud Function or manually create every
player in Firebase. Successful Google sign-in creates the Firebase user;
campaign authorization remains controlled by Supabase invitations.

## 3. Create Supabase and connect identity

1. Create a Supabase project, choose an appropriate region, and retain its
   database password privately.
2. Copy the project URL and **publishable key** into the public Supabase
   variables. Put its **secret key** in `SUPABASE_SECRET_KEY`. These keys have
   different privileges; never interchange them.
3. Under Authentication settings, add a **Third-Party Auth → Firebase**
   integration with the exact Firebase project ID from step 2.
4. Disable native Supabase user signup, anonymous sign-in and unused providers.
   Enable email confirmation as defense in depth. Do not disable the Firebase
   third-party integration. Do not enable Supabase's native Google provider:
   this app signs in through Firebase.

Dashboard labels may change. The required relationship is documented in
[Supabase's Firebase integration](https://supabase.com/docs/guides/auth/third-party/firebase-auth).
The integration verifies Firebase tokens; Vers supplies its own
`role: authenticated` assignment and additional database checks.
No Supabase JWT signing secret needs to be copied into Firebase.

## 4. Install the database, Storage and Realtime schema

From the repository root, authenticate and select **your new project**:

```sh
npm run supabase:login
npm run supabase:link -- --project-ref YOUR_SUPABASE_PROJECT_REF
npm run supabase -- projects list
npm run supabase:push -- --dry-run
```

Replace the uppercase placeholder with the ref shown by your Supabase project.
Check the linked project before applying anything. Then:

```sh
npm run supabase:push
npm run supabase -- migration list --linked
```

The CLI applies the SQL files in version order and records their versions.
Do not run `db reset --linked` against production. Do not create application
tables manually or skip the security migrations. See
[Supabase's migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

Migrations create:

- application tables, indexes, RPCs, triggers, grants and Row Level Security;
- the private `vers-assets` Storage bucket and its file policies;
- publication membership for persisted Realtime data and private Broadcast
  authorization policies;
- server-only installation configuration and setup RPCs.

The bucket permits PNG, JPEG and WebP with a 15 MiB object limit. Some UI upload
controls accept a narrower set. New installations use `vers-assets`; existing installations must configure
`NEXT_PUBLIC_ASSET_BUCKET` with their actual bucket ID. **Keep the bucket private**
and do not rename files or Storage metadata as part of a source rename.

The distributed seed is intentionally empty. It contains no campaign, user,
email or real artwork. Local `config.toml` settings do not replace the hosted
Auth configuration in step 3.

## 5. Initialize the first campaign

Fill the setup-only fields in your private `.env.local`:

```dotenv
VERS_INITIAL_MASTER_EMAIL=master@example.com
VERS_INITIAL_CAMPAIGN_NAME="My campaign"
```

Replace the example address with the exact Google account that will be the
master. Run:

```sh
npm run setup:initialize
```

Expected output: `Installation initialized. Sign in with the invited Google account.`

This uses your server-side Supabase key to perform one transaction: configure
the trusted Firebase project, create a system creator record, create the first
campaign and scene, and invite the first master. It does not overwrite existing
campaigns or depend on an existing Firebase user.

Keep setup fields local; they are not required in Vercel. Add further users through
[administration](OPERATIONS.md#invite-a-player-or-another-master).

## 6. Run and check a development installation

For local development, perform steps 2–5 using **development** cloud projects
and authorize `localhost` there. Then:

```sh
npm run dev
```

Open `http://localhost:3000`, sign in with the invited account and open the
created campaign. A different, uninvited Google account must not see it.
There is no local password or default master account.

For the production environment, repeat setup with production projects. The
setup command can configure that database without enabling localhost access to
production; perform its login check on the final production hostname.

## 7. Deploy the production application on Vercel

1. Import your GitHub repository into the intended Vercel account/team. Grant
   access only to the repository you intend to deploy.
2. Use framework **Next.js**, repository root as the root directory,
   `npm ci` as install command and `npm run build` as build command.
   Leave Next.js output handling at its framework default.
3. Select **Node.js 22.x** and `main` as the production branch.
4. Add the six required public and four required server variables from
   [CONFIGURATION.md](CONFIGURATION.md) to **Production only**. Add
   `NEXT_PUBLIC_SOURCE_URL` when providing the source to users. For an existing
   installation, also set `NEXT_PUBLIC_ASSET_BUCKET` to its actual bucket ID
   before the build; new installations use the `vers-assets` default.
5. Keep the committed `vercel.json`. It sets
   `NODE_OPTIONS=--experimental-require-module`, required by the tested
   Firebase Admin dependency chain on Vercel. See
   [Vercel's Node configuration](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration).
6. Deploy, note the assigned hostname, and authorize that exact hostname in
   Firebase Authentication. A custom domain is optional; if you add one, also
   authorize it and verify its HTTPS configuration.
7. Sign in on the production URL with the invited Google account.

A successful build alone does not prove authentication works. Check the server
route and an actual authorized session as described below.

Vercel's Git deployment does **not** apply Supabase migrations or initialize
campaigns. Those are deliberate administrative steps. Configure the production
check below before relying on unattended releases: GitHub CI and Vercel builds
are separate until explicitly connected.

## 8. Secure the deployment workflow

Keep production credentials out of Preview and Development scopes. Configure
separate Firebase/Supabase test projects if you want functioning previews.
Keep Git Fork Protection and Build Logs and Source Protection enabled; review
contributor changes before allowing them to run with any cloud credentials.
Variable changes require a new deployment.

### Require CI before production promotion

After the first successful GitHub Actions run, open Vercel **Settings → Build
and Deployment → Deployment Checks → Add Checks**. Select GitHub, import the
`verify` check from that tested commit, and set **Production / Blocking**. Keep
automatic production domain assignment enabled. Use the Actions job `verify`,
not Vercel's own status, which would create a circular dependency.

On the next push to `main`, GitHub verifies the commit while Vercel builds it.
The new deployment must pass both its build and `verify` before receiving the
production domains. A failed required check keeps the previous version serving.
Inspect that next deployment's Checks panel to confirm the connection works.
The job name must remain stable; update the Vercel check deliberately if it is
renamed. A skipped/missing check or provider outage can delay a release.
See [Deployment Checks](https://vercel.com/docs/deployment-checks).

This gates promotion, **not execution of the build**: trusted commits on the
production branch can access production build variables before CI completes.
Only trusted maintainers should have write access. Review external contributions
before merging or authorizing any credentialed build.

In GitHub, keep Actions permissions read-only and disable workflow PR
approvals. Enable vulnerability alerts. Require reviews and passing `verify`
CI on `main` where your plan permits it. If protection is unavailable on a
private-repository plan, the Vercel blocking check still gates production
promotion; it does not protect the Git branch itself. Do not bypass a failed
check by manually promoting an unverified deployment. No paid upgrade is
required by this guide without an operator decision.

A public repository can keep this automatic deployment workflow. Reading,
forking or opening a pull request does not grant permission to push to `main`.
Public-source launch steps and their limits are in
[the publication checklist](PUBLICATION.md).

Vercel's PR comments and deployment links may reveal the account/team slug.
Review these metadata before publication. You can disable Pull Request Comments
and Commit Comments under **Settings → Git** while retaining Commit Status and
the CI check. This does not erase old comments or existing deployment records.
For a personal installation that must not be linked from a public source
repository, follow the [metadata separation procedure](PUBLICATION.md#public-source-and-a-personal-installation),
including Commit Status and deployment event settings, historical records and
verification that automatic deployment still works. Keep invitation-based
access; publishing source does not offer the personal service to the public.

The reference deployment uses Vercel Hobby. Its terms limit it to personal,
non-commercial use; open-source licensing does not override hosting terms.
Choose a suitable plan for your use and monitor each provider's current quotas.
See [Vercel Hobby](https://vercel.com/docs/plans/hobby). This guide promises no
fixed price or unlimited free hosting.

## 9. Acceptance checklist

Use synthetic test assets and a test campaign for actions that change data.

- [ ] The page and icon load over HTTPS.
- [ ] Missing/invalid bearer tokens to `POST /api/auth/authorize` return 401.
- [ ] The invited Google master can open the campaign and sees master tools.
- [ ] An invited player can access the player scene; an uninvited account cannot.
- [ ] A map/token upload works and remains available after reload.
- [ ] Two signed-in browsers receive token movement, dice and initiative changes.
- [ ] A revoked invitation cannot authorize new data requests.
- [ ] No production key is configured for a preview build.
- [ ] CI, dependency audit and secret/privacy checks pass.
- [ ] The production deployment shows the blocking `verify` check passing.
- [ ] The operator has backups and a tested restore procedure.
- [ ] Before public source distribution, review [repository privacy](REPOSITORY-PRIVACY.md).
- [ ] Before offering a modified version, verify its source link is accessible
      to the relevant users and matches what is deployed.

Automated tests simulate identity claims and database roles. They do not perform
a real Google OAuth exchange or verify your provider dashboard settings.

## Alternative hosts and local Supabase

The application can run with `npm run build` followed by `npm start` on a
compatible Node host. You must supply HTTPS, environment variables, process
supervision, deployment controls and the same external identity/data services.
This route is not the reference Vercel setup and has not been validated on every
host.

A local Supabase stack is optional advanced development work. It needs Docker
and a correctly configured Firebase third-party integration in a private local
configuration. This repository does not configure a Firebase emulator or an
anonymous/offline bypass. Changing local settings must not leak project IDs or
credentials back into the distributed template.
