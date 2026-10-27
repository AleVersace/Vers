# Security

Report vulnerabilities privately through GitHub's **Report a vulnerability**
action in the repository's Security tab once the repository is public and the
maintainer has enabled it. During private preparation, this GitHub feature is
not available. Do not put exploit details, credentials,
JWTs, personal email addresses or campaign data in a public issue. If private
reporting is not available, ask the maintainer for a private channel without
including sensitive details. Never test against someone else's live installation.

Supported fixes target the latest release. Operators must apply both application
updates and the associated database migrations. See [deployment guidance](docs/DEPLOYMENT.md)
and the [security boundaries](docs/SECURITY-MODEL.md).

A Firebase UID or email is trusted only inside a signed token accepted by
Supabase's configured Firebase integration. Database policies additionally require
the configured issuer/audience, verified Google email and authenticated role.
Campaign access is checked against the enabled invitation on every request.

Keep the Supabase service key and Firebase service account server-side. Public
Firebase web configuration and Supabase publishable keys are not administrator
credentials. Rotate a secret immediately if it is exposed; deleting a commit is
not enough. Keep private backups and audit evidence outside distributable archives.
