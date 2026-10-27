"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
  type UserCredential,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requireFirebaseConfig = () => {
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Configurazione Firebase incompleta: ${missing.join(", ")}`,
    );
  }
};

export const getFirebaseApp = (): FirebaseApp => {
  requireFirebaseConfig();
  return getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig as Record<string, string>);
};

export const getFirebaseAuth = (): Auth => getAuth(getFirebaseApp());

export const signInWithGoogle = async (): Promise<UserCredential> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(getFirebaseAuth(), provider);
};

export const ensureSupabaseRole = async (user: User): Promise<boolean> => {
  const currentToken = await user.getIdTokenResult();
  if (currentToken.claims.role === "authenticated") return true;

  const firebaseToken = await user.getIdToken(true);
  const response = await fetch("/api/auth/authorize", {
    method: "POST",
    headers: {
      authorization: `Bearer ${firebaseToken}`,
    },
  });

  if (response.status === 403) return false;

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? "Non riesco ad abilitare l'accesso ai dati.",
    );
  }

  const refreshedToken = await user.getIdTokenResult(true);
  if (refreshedToken.claims.role !== "authenticated") {
    throw new Error("Firebase non ha aggiornato il token di accesso.");
  }

  return true;
};

export const signOutFromVers = async () => signOut(getFirebaseAuth());
