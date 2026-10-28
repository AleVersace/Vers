# Contributing to Vers

Start with [development setup](docs/DEVELOPMENT.md) and the
[architecture](docs/architecture.md). The UI supports Italian, English, French and German; technical documentation is maintained in
English with an Italian entry point. Follow the [translation guidelines](docs/DEVELOPMENT.md#interface-translations)
when adding or changing interface copy.

## Project direction

Vers is opinionated: the maintainer prioritizes practical tools that speed up
play without unnecessary configuration or complexity. It can support many RPGs,
but it does not aim to implement every ruleset. For a substantial feature, explain
which recurring action at the table becomes easier and discuss the idea before
building a large implementation. A contribution can be sound and still fall
outside that direction.

## Changes and reviews

- Use a focused branch and explain the user-visible problem, resulting behavior
  and relevant test evidence in the pull request.
- Keep changes compatible with existing campaigns and browser state. A rename
  of a bucket, channel, storage key or database identifier needs a migration plan.
- Add new migrations for schema/permission changes; do not rewrite an already
  applied migration to update production.
- Use synthetic users and disposable data. Do not develop against another
  person's live campaign.
- Update the relevant setup/operations docs when configuration or runtime
  requirements change.
- For dependency changes, review Node compatibility, run the Firebase runtime
  regression check through the full suite and regenerate dependency notices.

Before proposing a change, run the checks in [README.md](README.md).
Install the optional local pre-push hook with
`git config core.hooksPath .githooks`; CI remains the shared verification path.
Maintainers should review and require passing checks before deployment.

## Bug reports

Include the commit, browser/runtime versions, reproduction steps, expected and
actual behavior, and sanitized diagnostics. For screenshots, remove account
identity and private game content. Do not attach environment files, tokens,
database exports or service-account credentials.

Security reports follow [SECURITY.md](SECURITY.md), not a public bug report.

## License and content

Contributions are licensed under AGPL-3.0-only, like the project. Submit only
code or material you have the right to distribute. Preserve original copyright
and dependency notices, and identify modifications as required by the license.
Do not add campaign artwork, proprietary rulebook text or personal invitations
to example data. Use your GitHub noreply address if you do not want your personal
email to become part of Git history.
