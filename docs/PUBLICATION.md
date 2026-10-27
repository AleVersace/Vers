# Publishing Vers and keeping automatic deployment

The repository remains private until the maintainer explicitly changes its
visibility. An open-source license does not publish GitHub data or authorize
access to a hosted campaign.

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
