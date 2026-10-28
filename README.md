# Vers

**Watch the trailer · 45 seconds · English**

https://github.com/user-attachments/assets/ffe94639-4f7d-4321-9fed-53ef975484c4

**Download the original Full HD videos:** [English (MP4)](https://github.com/AleVersace/Vers/releases/download/trailer-v2/vers-trailer-v2-en-1080p.mp4) · [Italiano (MP4)](https://github.com/AleVersace/Vers/releases/download/trailer-v2/vers-trailer-v2-it-1080p.mp4) · [Credits and details](docs/TRAILER.md)

Music: “Pathfinder” by Scott Buckley · CC BY 4.0. [Credits and permissions](docs/TRAILER.md#music-credit-and-permission).

<details>
<summary>Cover artwork</summary>

![Vers cover illustration: a gold-lined tactical map, round tokens and a twenty-sided die.](docs/assets/vers-cover.webp)

</details>

**[Try the browser demo on itch.io](https://aleversace.itch.io/vers)** — no account needed.
Try macros (saved dice-roll buttons), maps and tokens with fictional data.
The demo runs independently in each browser and resets on reload; it has no
multiplayer or lasting session saves. Its corresponding source is downloadable
on the demo page. It is separate from the maintainer's personal installation.

Vers is an **opinionated virtual tabletop** for role-playing games that benefit
from maps, distance measurements, tokens and shared dice. It is useful across
many tabletop RPGs, with familiar tools for tactical play and no requirement to
adopt one particular game's rules engine.

I build Vers around the way I like to run games: practical interactions that keep
the session moving, with as little setup and unnecessary complexity as possible.
Features are deliberately chosen and shaped for that workflow. The aim is to
make playing faster and easier, not to cover every possible rule or setting.

### What makes Vers different

- **A map you can work on quickly:** zoom toward the cursor, measure distances,
  place tokens and props, draw, ping and reveal fog without leaving the table.
- **Controls that stay close to play:** token details remain selected while you
  use map tools; panels can be docked, resized and rearranged, and macro docks
  can be reordered by dragging.
- **Fast, flexible rolls:** reusable macros and an adjustable quick die, with
  temporary bonuses, damage types and a shared roll log. ADV/DIS compare two
  complete base-dice totals and apply bonuses only once.
- **A shared table, separate views:** live player scenes, a master view, reusable
  characters and NPCs, and initiative tools for encounters.
- **Your own installation:** invitation-based access, Italian, English, French and German UI,
  and documented deployment using Firebase, Supabase and Vercel.

Vers is a flexible tabletop toolkit, not a complete rules engine for every RPG.
Some conveniences reflect my own play style, including HP, armor class, saving
throws and ADV/DIS; use the parts that fit your game.
Vers is licensed under **AGPL-3.0-only**. You operate your own installation
and control its campaigns and user access. The interface supports Italian, English, French and German: use the **ITA / ENG / FRA / DEU** selector at sign-in
or in the tabletop header. Your choice is saved in this browser.
The source is publicly available for anyone to inspect, install and contribute
to under that license.

The maintainer's personal installation is a separate, invitation-only service.
It is not a public demo or a shared hosted service for repository visitors.
Reading, cloning or contributing to this repository grants no access to that
installation, its accounts, campaigns or files. Follow the setup guide to run
your own instance with your own cloud projects and invitations.

[Install and deploy](docs/DEPLOYMENT.md) · [Configuration](docs/CONFIGURATION.md) ·
[Administration](docs/OPERATIONS.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) ·
[Italian introduction](README.it.md)

## What you can do

- Organize campaigns and scenes, with a separate master view and player scene.
- Upload maps, character tokens and reusable scene assets; remove your assets.
- Pan and zoom toward the cursor; measure movement, draw, ping and reveal fog.
- Manage reusable characters, NPCs, token statistics, temporary HP and initiative.
- Build macros with dice, bonuses, temporary bonuses, damage types and sections.
- Reorder macro panels by dragging them.
- Roll macros or a configurable quick die with advantage/disadvantage. Two dice
  totals are compared; bonuses are applied once. Results appear in the roll log.
- Keep selected-token details visible while using map tools.
- Switch all interface labels, menus, confirmations and roll explanations between
  Italian, English, French and German without reloading or changing campaign content.

Fog is visual, not a way to hide downloaded map pixels from a determined player.
Use separate master-only scenes for confidential images. Read the
[security model](docs/SECURITY-MODEL.md) before inviting players.

## Services used by the reference deployment

| Component | Responsibility | Needed for the documented deployment? |
| --- | --- | --- |
| GitHub | Source repository, pull requests, Actions CI and Dependabot | Yes |
| Vercel | Next.js hosting, HTTPS, builds, Git deployments and the server authorization route | Yes |
| Firebase Authentication / Google | Google sign-in, user identity and signed ID tokens | Yes |
| Supabase | PostgreSQL, Data API, Row Level Security, Realtime and private file Storage | Yes |
| Node.js + npm | Local tooling, builds and dependency installation | Yes |
| Gitleaks | Local and CI secret scanning; not an application service | For security checks |
| Domain registrar / DNS | A custom public hostname | Optional; the Vercel hostname works |

This is the same service architecture used by the reference production
installation, expressed with placeholders rather than its account details.
Firebase Firestore, Firebase Storage, Firebase Hosting, Firebase Cloud Functions,
Supabase Edge Functions, SMTP, Redis, OpenAI and payment services are **not
required by the current application**. The default Supabase local configuration
mentions optional services that the app does not use.

The app is Next.js + React + TypeScript. Dependencies are locked in
[package-lock.json](package-lock.json); use `npm ci`. See
[architecture](docs/architecture.md) for the data and authentication flow.

## Start here

1. Install a current **Node.js 22** patch release and Git.
2. Clone this repository or your fork:
   ```sh
   git clone https://github.com/AleVersace/Vers.git
   cd Vers
   npm ci
   ```
   Forks should replace the clone URL with their own repository. Private forks
   require an authorized GitHub account.
3. Follow [the production setup guide](docs/DEPLOYMENT.md) to create your own
   Firebase and Supabase projects, apply migrations and initialize the first
   campaign. There are no bundled accounts, maps or campaign invitations.
4. With a configured `.env.local`, run:
   ```sh
   npm run dev
   ```
   Open `http://localhost:3000`. For development, use separate cloud projects
   from production.

The browser demo above is a separate sandbox. Running `npm run dev` for the full app does not create cloud
resources, apply migrations or grant access to a Google account. The automated
test suite, however, uses disposable local data and does not require cloud keys.

## Documentation

| Task | Guide |
| --- | --- |
| Reproduce the hosted production setup from zero | [Installation and deployment](docs/DEPLOYMENT.md) |
| Find every environment variable and understand its scope | [Configuration reference](docs/CONFIGURATION.md) |
| Invite/revoke users, create campaigns, back up and upgrade | [Operations](docs/OPERATIONS.md) |
| Work locally, run checks and contribute | [Development](docs/DEVELOPMENT.md), [Contributing](CONTRIBUTING.md) |
| Diagnose login, database, Storage, Realtime and deployment errors | [Troubleshooting](docs/TROUBLESHOOTING.md) |
| Understand what the security controls do and do not protect | [Security model](docs/SECURITY-MODEL.md) |
| Inspect application structure and safely upgrade naming | [Architecture](docs/architecture.md), [Naming compatibility](docs/RENAMING.md) |
| Review privacy checks and prepare a source publication | [Repository privacy](docs/REPOSITORY-PRIVACY.md) |
| Publish source while retaining automatic production releases | [Publication checklist](docs/PUBLICATION.md) |

## Verification

```sh
npm run lint
npm test
npm audit --audit-level=low
npm run security:check
```

`npm test` builds the app, then runs the tests. Build-time font downloads need
network access. Install Gitleaks before the last command; see
[development tooling](docs/DEVELOPMENT.md). CI runs these checks with synthetic
data and read-only GitHub permissions, without production credentials.

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
vulnerabilities through the private process in [SECURITY.md](SECURITY.md).
For ordinary bug reports, include reproduction steps, the commit and a sanitized
error message. Never attach tokens, service-account files, database exports or
real campaign data to an issue.

## License and content

Copyright 2026 AleVersace and contributors. Code is distributed under
[GNU Affero General Public License v3.0 only](LICENSE). When offering a modified
version over a network, provide its corresponding source as required by the
license, including your changes and installation instructions. Configure
`NEXT_PUBLIC_SOURCE_URL` for that exact version.

Dependencies keep their own licenses; retain [third-party notices](THIRD_PARTY_NOTICES.txt).
User-uploaded maps, artwork and campaign material are not included in this
repository or automatically licensed under AGPL. Operators must have permission
to use the content they upload. Vers is an independent project, with no
claimed affiliation with game publishers or hosting providers.
