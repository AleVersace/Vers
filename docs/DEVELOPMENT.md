# Development and verification

Use a current Node.js 22 patch release and `npm ci`. The reference production
runtime and CI use Node 22; do not accept a dependency's new Node requirement
without testing and planning a runtime upgrade.

## Local application

Configure a separate development Firebase/Supabase pair by following
[deployment](DEPLOYMENT.md). Copy `.env.example` to a private `.env.local`,
authorize localhost in the development Firebase project, and run:

```sh
npm run dev
```

Next.js serves port 3000 by default. Use `npm run dev -- --port 3001` if occupied.
After a build, `npm start` serves the production build locally. Restart after
changing server configuration; public variables also require a rebuild for
production output.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Installs the committed dependency lockfile |
| `npm run dev` | Starts local Next.js development |
| `npm run build` | Builds and type-checks the application |
| `npm start` | Serves an existing production build |
| `npm run lint` | Runs ESLint |
| `npm test` | Builds, then runs Node's test suite |
| `npm audit --audit-level=low` | Checks known dependency advisories |
| `npm run security:check` | Scans distributable files for secrets and privacy issues |
| `node scripts/publication-guards.mjs OWNER/REPO` | Reads the public-launch state; never changes visibility or settings without `--apply` |
| `npm run supabase -- COMMAND` | Runs the project-pinned Supabase CLI |
| `npm run setup:initialize` | Initializes a new, empty hosted installation |
| `npm run setup:auth` | Configures the trusted Firebase project in an existing database |
| `node scripts/generate-third-party-notices.mjs` | Regenerates production dependency notices after dependency changes |

Setup commands make real administrative writes to the selected Supabase project.
Tests do not. Do not substitute real keys or campaign records into test fixtures.

## What the tests cover

Database tests run migrations in disposable PGlite PostgreSQL with synthetic
Auth/Storage/Realtime schemas. They test RLS, identity claims, membership
revocation, profile privacy, file authorization and initialization.
Other tests exercise dice/advantage, macros, token movement/selection, fog,
broadcast handling, UI source contracts, Firebase Admin runtime loading,
repository privacy checks and the executable SQL examples in the operations guide.

The fixture replaces extension/publication declarations that require a full
Supabase server. This verifies database logic, not the hosted Realtime transport,
OAuth signatures, provider settings or every browser interaction. Follow the
[acceptance checklist](DEPLOYMENT.md#9-acceptance-checklist) on a test installation
as well. A green build is not proof of a working Google login.

`next/font/google` fetches Geist fonts during the build and bundles them with
the application. Offline or restricted-network builds may fail at this step.
The repository has no Firebase emulator integration. Running automated tests
without cloud credentials is supported; running the full UI offline is not.

## Gitleaks and the pre-push hook

Install Gitleaks from the [official project](https://github.com/gitleaks/gitleaks)
or its official release artifacts. The CI workflow pins version 8.30.1 and
checks its archive checksum. A compatible Gitleaks with the `dir` and `git`
subcommands is required locally.

On macOS with Homebrew:

```sh
brew install gitleaks
```

On Linux/Windows, use an appropriate official release binary and add its
directory to PATH. Alternatively set `GITLEAKS_BINARY` to its executable path.

```sh
git config core.hooksPath .githooks
npm run security:check
gitleaks git --redact --no-banner --log-opts=--all
```

The hook checks the working tree and non-ignored new files. CI also scans the
reachable checkout history. Local Git hook configuration is not cloned
automatically and cannot replace server-side branch protection.

The scanner prints filenames/categories rather than personal email values.
Dependency/license notices retain necessary upstream attribution; they still
undergo secret scanning. See [repository privacy](REPOSITORY-PRIVACY.md).

## Contribution workflow

Use a focused branch and pull request, explain behavior changes and test
evidence, and include new migrations where schema changes are needed.
Do not modify applied migration versions to change production behavior.
Regenerate third-party notices when production dependencies change.
Do not blindly merge Dependabot major upgrades; validate Node compatibility,
the Firebase Admin runtime and the application tests.

Production secrets must not be configured in Actions. New contributors can run
tests without cloud accounts, and maintainers can review code before granting
any access to test infrastructure. Read [CONTRIBUTING.md](../CONTRIBUTING.md).


## Interface translations

The interface supports Italian (`it`, the default) and English (`en`). The
**ITA / ENG** control is available at sign-in, in the tabletop header and in the
profile. Switching language updates the UI immediately and preserves the open
campaign, selected token, drafts and dice results. The preference is stored in
`localStorage` under `vers:language`, and synchronized across tabs on the same
origin. With storage blocked, switching still works for the current page.
Each participant chooses independently; this preference requires no database
migration, provider configuration or extra translation service.

- Add Italian copy and its English translation to `lib/i18n/messages.ts`, then
  render it through `t()` from `lib/i18n/store.ts`. Include accessibility labels,
  tooltips, empty states, dialogs and validation messages, not just buttons.
- Use the catalog's `{p0}`, `{p1}`, etc. placeholders for dynamic values. Translate
  system-owned fragments explicitly; never translate user-authored names,
  descriptions, notes or filenames just because they match a catalog entry.
- Keep machine identifiers and stored data stable. Saving-throw keys remain
  `FOR`, `DES`, `COS`, `INT`, `SAG`, `CAR`; only their English labels become
  `STR`, `DEX`, `CON`, `INT`, `WIS`, `CHA`. Damage-type values and mode enums
  likewise remain unchanged.
- Store roll payloads in their existing canonical notation. Localize generated
  explanations with `localizeRollBreakdown()` at render time. Translation must
  never invoke the random generator, resave a roll, repeat bonuses or change
  which ADV/DIS result won. Historical dice results use the same formatter.
- Keep error and notification state in canonical form so an open message can
  follow a language change. Render errors through `errorText()`; unsupported
  provider diagnostics receive a localized generic error instead of raw output.
- Use `useLanguage()` when subscribing a component to locale changes. Locale
  changes must not become dependencies of authentication, data loading or
  mutation callbacks. Memoized display formatting may depend on the locale.
- Server rendering starts in Italian for consistent hydration. `LanguageEffects`
  restores the browser preference and updates document language and metadata.
  Shared-link previews use the server's Italian metadata.

Run `node --test tests/i18n.test.mjs` for catalog, placeholders, persistence,
provider errors, saving-throw handlers and ADV/DIS localization, followed by the
complete checks above. Manually check ITA → ENG → reload → ITA; inspect the
selected token, unsaved form fields, right-click menus and roll log in both
languages. The UI translation catalog is not a campaign-content translator.
