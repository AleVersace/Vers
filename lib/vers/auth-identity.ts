type FirebaseIdentity = {
  aud?: unknown;
  iss?: unknown;
  email?: unknown;
  email_verified?: unknown;
  firebase?: { sign_in_provider?: unknown };
};

// The Admin SDK verifies the signature. Keep the accepted identity contract
// aligned with current_firebase_uid() in the database.
export function isAllowedFirebaseIdentity(
  identity: FirebaseIdentity,
  projectId: string | undefined,
): boolean {
  return Boolean(
    projectId &&
    identity.aud === projectId &&
    identity.iss === `https://securetoken.google.com/${projectId}` &&
    typeof identity.email === "string" && identity.email.trim() &&
    identity.email_verified === true &&
    identity.firebase?.sign_in_provider === "google.com",
  );
}
