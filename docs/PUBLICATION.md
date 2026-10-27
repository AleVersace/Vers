# Publishing Vers and keeping automatic deployment

The repository remains private until the maintainer explicitly changes its
visibility. An open-source license does not publish GitHub data or authorize
access to a hosted campaign.

## Public source and a personal installation

Source publication and service access are separate decisions. The maintainer's
personal installation remains invitation-only and is not offered as a public
demo. Repository readers install their own copy using independent Firebase,
Supabase and hosting projects. Publishing the code must not create invitations,
make Storage public, enable self-service campaign access or change any live
authorization rule.

Keep the personal site's address out of the repository's Website field, README,
screenshots and examples. Review GitHub deployment records, check target URLs,
comments and workflow logs as well: a direct hosting integration can publish
those links even when source files contain no production hostname. Disabling
comments alone does not remove deployment records or historical commit statuses.
Use the source repository's README or a documentation site as the Website URL.
Some hosting integrations populate an empty Website field after deployment;
verify that the documentation URL remains in place after a subsequent deploy,
as well as after connecting or reconnecting the repository.
For an installation that must not be linked from the repository, disable Pull
Request Comments, Commit Comments, `deployment_status` Events, unused
`repository_dispatch` Events and Commit Status in Vercel's Git settings. Keep
Consolidated Commit Status disabled too. These outbound notifications are
separate from Git-triggered builds and the incoming GitHub `verify` Deployment
Check. Verify both a successful automatic deployment and the absence of new
hosting links after changing the settings; do not disable CI or its blocking
production check.

Those controls do not erase historical metadata. GitHub's commit-status API
can list or create statuses but does not provide a delete operation. Where a
strict no-hosting-links policy includes historical statuses, retain the existing
repository privately and import the reviewed Git source into a fresh repository
without its deployment records, comments or status objects. Reconnect hosting
only after disabling notifications, then test again before any publication.

The application protects campaign data with verified Google identities,
enabled invitations and database/Storage policies. Its sign-in page is reachable
on the configured hostname by default. Hiding that page too requires a separate
hosting/access-gateway policy and a verified access path for invited players.
An unlisted URL is not an authorization control.

The optional source link goes **from the installed application to its source**.
It does not require publishing a reverse link from the repository to a personal
installation, nor does it grant access to that installation.

## Release workflow

The same repository can be public and remain the source for the maintainer's
production deployment:

1. A trusted maintainer pushes or merges a reviewed change to `main`.
2. GitHub Actions runs `verify`: file and history secret scans, lint, build,
   tests and dependency audit. It has read-only permissions and no cloud keys.
3. Vercel builds that commit with Production-scoped configuration. Its
   **Production / Blocking** `verify` Deployment Check gates promotion.
4. Only after the build and required check pass do production domains move to
   the new deployment. Verify login, Storage and Realtime after the release.

Direct edits to `main` by a trusted maintainer can use this flow. For substantial
changes, prefer a branch and reviewed pull request. Public readers can propose
changes; they cannot deploy to the maintainer's production merely by opening a
PR. Keep fork protection enabled and never attach production configuration to
untrusted previews. Database migrations remain a separate, reviewed operation.

The gate is not a sandbox: production builds start before CI completes, so write
access to the production branch is security-sensitive. It also cannot detect
every functional regression. Backups, compatible migrations, smoke checks and a
rollback plan remain necessary. See [deployment](DEPLOYMENT.md#8-secure-the-deployment-workflow)
and [operations](OPERATIONS.md#upgrades).

## Publication checklist

- [ ] Review every file and path in the exact release tree, including binary
      metadata, licenses, migrations, examples and generated artifacts.
- [ ] Scan **all** branches, tags and commit identities. Review PR refs as well
      as ordinary Git heads. File deletion in the latest commit is insufficient.
- [ ] Review issues, PRs, comments, releases, Actions logs/artifacts, check URLs
      and deployment records. Hosting account slugs and names can appear here
      even when source files are clean. Decide which public attribution is
      intentional and remove or separate unwanted historical records.
- [ ] For a personal installation, point Website to source documentation and verify
      there are no hosting links in current or historical repository metadata.
      Confirm that invited players still use the normal sign-in flow.
- [ ] Keep original repositories, recovery bundles, exports and cloud projects
      private. Publish a clean source archive with `git archive`, never a zip
      of the entire working directory. Do not mirror old refs into a clean repo.
- [ ] If using a fresh repository, preserve the same production project and
      database, reconnect only its Git source, restore repository settings and
      re-import the `verify` Deployment Check. Verify the next deployment.
- [ ] Confirm production-only environment scopes, protected build logs/source,
      Git Fork Protection, stable Node 22 runtime and a passing blocking check.
- [ ] Provide a source URL accessible to the intended users for the actual
      deployed version, with AGPL and third-party notices. A private URL that
      users cannot open is not a working source offer. Rebuild after setting
      `NEXT_PUBLIC_SOURCE_URL`; keep the corresponding version available.
- [ ] Review the public product name and rights to any distributed artwork.
      Player uploads are not part of the source release.
- [ ] Remove outdated statements that the repository is private only when the
      visibility change is actually approved and performed.
- [ ] When public, enable branch protection/rules for `main` with required
      `verify`, block force pushes/deletion, require approval for workflows from
      external fork contributors, and enable private vulnerability reporting.
      Some settings are unavailable on a free private repository: recheck them
      after publication rather than claiming they are already enforced.

## Prepared launch procedure

Complete the file/history/metadata review while the repository is private.
Do not change visibility as a way to test the following commands. There is no
script or workflow in this repository that publishes it automatically.

The maintainer helper uses an authenticated GitHub CLI (`gh`) account with
administration access to the explicit target. It reads repository metadata in
memory and emits only a bounded plan; do not save raw repository API responses,
which can include temporary clone credentials.

```sh
# Read-only. Replace the explicit target with your repository.
node scripts/publication-guards.mjs YOUR_ACCOUNT/YOUR_REPO
```

For a private repository it reports `waiting_for_publication` and makes no
writes. After the maintainer has **separately authorized and performed** the
visibility change, run it again to inspect the proposed controls. Then:

```sh
node scripts/publication-guards.mjs YOUR_ACCOUNT/YOUR_REPO --apply
```

The helper refuses private or archived repositories, requires the latest
successful `verify` check on the current default-branch commit, checks that the
target has not changed, and configures:

- required `verify` checks from the actual GitHub Actions app, with an up-to-date
  branch, enforcement for administrators, and no force pushes or branch deletion;
- read-only Actions tokens and no workflow approval of PRs;
- approval for workflows from all external fork contributors;
- private vulnerability reporting.

It reads the settings back before reporting success. Existing branch protection
that does not match these minimums requires manual review; the tool will not
overwrite custom rules. Stronger matching protection is retained. If an API
call fails, some earlier protections may already be applied: inspect the error
and rerun after resolving it, rather than disabling protections to finish.
Organization rulesets or provider restrictions may require additional review.

With required GitHub checks, an untested direct edit to `main` may be rejected.
Use a branch, wait for `verify`, then merge the reviewed PR; Vercel still deploys
the resulting `main` commit automatically after its own blocking check. No
second person's approval is required by this single-maintainer baseline, so
the maintainer is not locked out of their own PRs. Add reviewer requirements
deliberately when there are enough trusted maintainers.

Finally configure the [commit-specific source URL](CONFIGURATION.md#source-link-for-automatic-releases),
update statements that the repository is private, deploy, and verify the source
link and the private vulnerability-reporting form as an ordinary GitHub user.
Keep a record of the exact deployed commit and smoke-check result.

## Scope of remaining checks

The publication controls above are distinct from running a production service.
A backup restore drill and a two-user hosted smoke test improve operational
confidence; their absence is not evidence of leaked source or a reason to
declare the repository unsafe to read. Record those tests honestly rather than
treating synthetic RLS tests as a full cloud recovery rehearsal.

Hosting account names in check URLs are public attribution, not credentials.
Changing the application hostname does not remove the team slug from existing
provider links. Review and accept the intended attribution before publication.
Name/domain availability and permission to distribute future artwork are
separate from the source security audit. This repository ships no player artwork
and makes no claim of affiliation with game publishers.

## Why rewriting history may not be sufficient

A force-push updates ordinary refs, but old commits can remain reachable through
GitHub PR references, cached commit pages or existing clones. GitHub's removal
procedure may require Support; it does not promise to purge non-sensitive
historical text. If the goal is to exclude all old contextual material, a new
repository initialized from a reviewed snapshot is more predictable. Keep the
old repository private and archived; do not transfer its issues, PRs or refs.

Prepare a private backup and a tested candidate before deciding between these
paths. A history rewrite changes commit IDs and can break PRs and source links.
A fresh snapshot also requires adapting any upgrade instructions that refer
to older commits. Neither operation rotates an exposed credential: rotate at
its provider first if an actual secret was found.

References: [GitHub sensitive-data removal](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository),
[Vercel Git integration](https://vercel.com/docs/git/vercel-for-github),
[Vercel Deployment Checks](https://vercel.com/docs/deployment-checks).
