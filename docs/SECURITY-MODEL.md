# Security boundaries

Vers is a cooperative virtual tabletop with Google sign-in and invitation-based
campaign access. Supabase verifies JWT signatures; RLS enforces campaign, scene,
character, profile and asset access even when a client bypasses the interface.
Account email, first/last name and panel layout are visible only to their owner.
The campaign roster exposes display name, avatar, role and character name.

Repository access and installation access are independent. A public source
repository does not authorize its visitors to use the maintainer's personal
installation. Each operator controls their own cloud projects and invitations.
The default sign-in page can be visited without an account; campaign and file
access still require authorization. Keeping the address out of documentation
does not replace these controls. See [publication boundaries](PUBLICATION.md#public-source-and-a-personal-installation)
for deployment metadata and optional protection of the sign-in page itself.

Disabling an invitation blocks subsequent database and file authorization,
including existing sessions. It cannot erase data already downloaded. A signed
asset URL remains usable until its expiry: new URLs last 15 minutes and renew
automatically during a session. URLs issued before this update retain their
original expiry (up to 12 hours).

## Fog and dice

Fog is a visual presentation tool. The full image of a scene made available to
players is downloaded by their browsers; fog is not a confidentiality boundary
against developer tools or a modified client. Keep secret rooms, unrevealed maps
and encounters in separate master-only scenes. Hidden tokens/characters and
unplaced or hidden props are filtered by database and Storage policies.
Campaign token-library images are shared with members even if a particular
placement is hidden; use private NPC characters for secret artwork.

Dice are generated in the client for cooperative play, not an anti-cheat or
cryptographically verified gambling system. Persisted rolls are tied to the
signed-in user's UID. Broadcasts cannot inject a roll or change token visibility:
receivers reload the authorized database state. Shared pings are peer messages.

## Hosting and untrusted contributions

Use separate Firebase/Supabase projects and credentials for development, preview
and production. Do not give fork pull requests production variables. CI uses
synthetic data, no cloud credentials and read-only GitHub permissions. Review
untrusted changes before running them locally or deploying them. See [deployment](DEPLOYMENT.md)
for the migration order and source availability requirement, and
[repository privacy](REPOSITORY-PRIVACY.md) for source-publication checks.
