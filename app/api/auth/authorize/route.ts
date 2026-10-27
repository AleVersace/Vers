import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAllowedFirebaseIdentity } from "@/lib/vers/auth-identity";

export const runtime = "nodejs";

const readBearerToken = (request: NextRequest): string | null => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
};

export async function POST(request: NextRequest) {
  const firebaseToken = readBearerToken(request);
  if (!firebaseToken) {
    return NextResponse.json(
      { error: "Token Firebase mancante." },
      { status: 401 },
    );
  }

  try {
    const firebaseAuth = getFirebaseAdminAuth();
    const identity = await firebaseAuth.verifyIdToken(firebaseToken);
    const email = identity.email?.trim().toLowerCase();

    if (!email || !isAllowedFirebaseIdentity(identity, process.env.FIREBASE_ADMIN_PROJECT_ID)) {
      return NextResponse.json(
        { error: "L'account Google non ha un'email verificata." },
        { status: 403 },
      );
    }

    if (identity.role === "authenticated") {
      return NextResponse.json({ authorized: true });
    }

    const access = await getSupabaseAdminClient()
      .from("campaign_access_grants")
      .select("campaign_id")
      .eq("email", email)
      .eq("enabled", true)
      .limit(1);

    if (access.error) {
      console.error("Campaign access lookup failed", access.error);
      return NextResponse.json(
        { error: "Non riesco a verificare le campagne abilitate." },
        { status: 503 },
      );
    }

    if (!access.data?.length) {
      return NextResponse.json({ authorized: false }, { status: 403 });
    }

    const userRecord = await firebaseAuth.getUser(identity.uid);
    await firebaseAuth.setCustomUserClaims(identity.uid, {
      ...userRecord.customClaims,
      role: "authenticated",
    });

    return NextResponse.json({ authorized: true });
  } catch (error) {
    console.error("Firebase authorization failed", error);
    return NextResponse.json(
      { error: "Token Firebase non valido o scaduto." },
      { status: 401 },
    );
  }
}
