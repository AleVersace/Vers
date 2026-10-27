# Repository privacy and publication

Vers publishes its reviewed source under AGPL-3.0-only. The maintainer's personal
installation, cloud configuration, campaign data and original archive repositories
remain private. Source access does not grant service access.

## What belongs in Git

Application source, schema migrations, synthetic tests, configuration templates,
installation instructions and required license notices belong in the source
repository. Operator credentials, live project identifiers, invitations, player
records, database exports, uploaded game artwork and private audit evidence do
not. Use example addresses and UUIDs in documentation.

Installation addresses also stay outside the source repository. The privacy
scanner rejects concrete Vercel deployment hostnames in file contents and names;
use reserved example domains in guides. Review GitHub metadata separately,
because a file scanner cannot inspect provider-generated deployment links.

The author's public GitHub handle, repository URL and GitHub noreply commit
identity are deliberate attribution. Dependency authors, license contacts and
upstream package notices are also legitimate attribution. Do not remove those
notices as if they were leaked operator data.

The current source, filenames and new-installation templates use Vers.
Existing cloud resource identifiers may remain in private infrastructure
configuration so saved files and identities keep working. They are not copied
into the distributable source. See [naming compatibility](RENAMING.md).

## Automated controls

`npm run security:check` enumerates tracked files and non-ignored untracked
files. It rejects credential/backup filenames and non-regular files, checks
personal home-directory paths, and checks email addresses across first-party
code, SQL, configuration **and documentation**. It also stages those files in
a temporary directory for a redacted Gitleaks scan, then removes the temporary
copy. The command fails if Gitleaks is unavailable.

Only the designated `LICENSE` and `THIRD_PARTY_NOTICES.txt` files are exempt
from the email heuristic. In `package-lock.json`, only upstream dependency
`deprecated` fields are exempt: npm can include a maintainer's public contact
there. Other lockfile fields remain checked. These exceptions do **not** exempt
any file or field from Gitleaks secret scanning or home-path detection.

Tests verify these boundaries with synthetic canaries, including documentation,
Windows/macOS/Linux paths, missing scanners and dangling symlinks. SQL examples
in the operations guide are also executed against a disposable database.

The optional pre-push hook runs the working-tree scan. GitHub CI fetches full
history and additionally runs Gitleaks over all commits reachable in its
checkout. Enable the local hook as described in [development](DEVELOPMENT.md).
Neither check proves the absence of all personal information or all possible
secrets: names, images, unusual credential formats and contextual information
need human review.

## Snapshot provenance and review

This repository is prepared from the reviewed current source tree with a new
history. The original repositories, PR references, hosting comments and recovery
bundles remain private and are not imported. This deliberately excludes old
contextual labels from earlier tests. Keep that boundary intact: never merge or
mirror the old Git history into this repository.

The source tree has no bundled campaign artwork, user exports, private account
configuration or credentials. Public GitHub attribution, upstream notices and
synthetic examples are intentional. Secret and privacy scans cover the release
files; they do not guarantee that future changes or provider metadata are clean.
Review GitHub comments, check URLs, Actions logs and deployment records before
changing visibility. Hosting account slugs can identify an operator even when
the source tree itself is neutral.

Follow [the publication checklist](PUBLICATION.md) for source access, deployment
protection and settings that become available on a public repository.

## Before changing visibility or publishing an archive

1. Review the final diff, all branches/tags to be published and commit metadata.
   Run the file scan and `gitleaks git --redact --no-banner --log-opts=--all`.
   Inspect new binary files, embedded metadata and file names manually.
2. Confirm example configuration contains placeholders only. Review migrations
   and seeds for real invitations, campaign names and user identifiers.
3. Review GitHub issues, pull requests, discussions, releases, Actions artifacts
   and logs separately. Git file scans do not inspect these surfaces, cloud
   dashboards or user uploads. Delete/restrict accidental private attachments
   and rotate any exposed credential at its provider.
4. Export releases from reviewed Git content, for example with `git archive`,
   rather than zipping the entire working folder. Ignored local files can still
   contain secrets; `.gitignore` is not encryption and does not untrack files
   already committed.
5. Verify deployment protections and environment separation. Keep production
   data and secrets out of fork builds and previews.
6. Retain AGPL and dependency notices; ensure the source link points to the
   corresponding deployed version and is accessible to the users entitled to
   receive it. Review uploaded-content rights and the proposed public branding.
7. Change repository visibility only after an explicit maintainer decision.

If a secret is exposed, rotate/revoke it first and review its use. Removing a
file or rewriting history alone does not invalidate copied credentials. Follow
[SECURITY.md](../SECURITY.md) for private vulnerability reporting and
[operations](OPERATIONS.md#credential-rotation-and-monitoring) for rotation.
