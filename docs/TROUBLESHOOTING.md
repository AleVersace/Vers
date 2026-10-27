# Troubleshooting

First confirm the deployed commit, environment and project IDs privately.
Use sanitized error messages in issues. Never paste a JWT, private key, service
account JSON, personal email list or database export into a public discussion.

| Symptom | Checks and recovery |
| --- | --- |
| Clone denied / repository not found | Verify the repository URL. The upstream source is public; a private fork requires an authorized GitHub account. Repository access does not grant access to a hosted installation. |
| Firebase configuration incomplete | Populate the four required Firebase public fields and rebuild/redeploy. Adding only server credentials is insufficient. |
| Supabase public configuration incomplete | Check the project URL and publishable key for the intended environment, then rebuild. |
| Google `auth/unauthorized-domain` | Authorize the exact application hostname in the correct Firebase project. For development, add localhost explicitly. Keep the configured Firebase auth domain unless intentionally configuring a custom one. |
| Popup blocked or closed | Start login with the button, allow its popup and finish Google sign-in in the same browser session. Close stale popups and retry without browser automation moving the OAuth window. |
| Google access denied by organization / test-user policy | Check the Google account and the project's OAuth audience/organization restrictions. This is separate from Supabase invitations. |
| Login works but no campaigns appear | Verify the normalized Google email has an enabled invitation for the intended campaign. Reload the campaign selector. Firebase account existence alone does not grant access. |
| Authorization route returns 401 without credentials | Expected. This is a basic negative smoke test, not a successful-login test. |
| Authorization route returns 401 for a real login | Privately inspect Vercel function logs. Besides invalid tokens, initialization failures can use this response: check Admin project/account/key formatting and runtime dependencies. Never weaken token validation to suppress the error. |
| Authorization route returns 403 | The identity may not be a verified Google account or may lack an enabled invitation. Check both against the intended project. |
| Authorization route returns 503 | Inspect Supabase availability, server secret, URL and access-grants table. The server could not query invitations. |
| Database says Firebase identity incomplete / RLS rejects valid users | Check all four matching Firebase project settings in CONFIGURATION.md, the technical claim and verified Google provider. A new database also needs `setup:initialize`; an upgrade may need `setup:auth`. |
| `Installation already contains campaigns` | Do not retry initialization or delete campaigns. For an upgrade use the documented migration plan and `setup:auth`. |
| CLI migration history mismatch | Confirm the linked project and versions. Investigate before using migration repair. Never fix this with a production reset. |
| Assets fail to load or upload | Check `NEXT_PUBLIC_ASSET_BUCKET` against the existing private bucket (`vers-assets` for new installations), rebuild if changed, and check migrations/RLS, scene/campaign access, image type and 15 MiB bucket limit. A hidden image may be intentionally forbidden. Do not switch the bucket to public. |
| Signed file URL expires | URLs are renewed during an active session. Reconnect/reload if background throttling or network loss interrupted renewal; inspect current access rights. Revoked users should not receive replacements. |
| Two clients do not synchronize | Check both accounts' invitations, Supabase Realtime health/publications, private channel authorization, network/WebSocket restrictions and browser errors. Compare persisted state after reload. |
| Vercel reports `ERR_REQUIRE_ESM` in Firebase Admin | Keep the tested Node 22 runtime and `vercel.json`'s `NODE_OPTIONS`. A local import passing alone does not reproduce Vercel's default flags. |
| Preview fails but production works | Expected if preview has no test credentials. Configure a separate Firebase/Supabase pair; do not copy production secrets into Preview. |
| Vercel deployment succeeds while CI is still running | These systems run independently. Require passing checks/review before merging, or use a controlled promotion procedure. |
| Build fails while downloading fonts | The build fetches Geist through `next/font/google`. Check build network access; do not disable certificate verification. |
| Secret checker cannot find Gitleaks | Install the official executable or set `GITLEAKS_BINARY`. The check intentionally fails closed. |
| Privacy check rejects documentation | Use synthetic addresses and generic paths. Move private installation notes outside Git. Do not add personal values to an allowlist to make the check green. |
| Branch protection unavailable for a private repo | GitHub plan capabilities may limit it. Restrict write access and review changes; the application does not require purchasing a plan automatically. |

If the browser still shows the previous name, check the deployment and reload.
Existing cloud identifiers can remain unchanged without serving an old client.
See [naming compatibility](RENAMING.md) for bucket configuration, saved browser
preferences and the difference between a source rename and a data migration.
