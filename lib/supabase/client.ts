"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getFirebaseAuth } from "@/lib/firebase/client";

let browserClient: SupabaseClient | null = null;

export const getSupabaseBrowserClient = (): SupabaseClient => {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Configurazione pubblica Supabase incompleta.");
  }

  browserClient = createClient(url, publishableKey, {
    accessToken: async () => {
      const user = getFirebaseAuth().currentUser;
      return user ? user.getIdToken(false) : null;
    },
    realtime: {
      // Keep heartbeats outside the throttled browser tab. Long sessions often
      // leave the table in the background while players check sheets or rules.
      worker: true,
      heartbeatIntervalMs: 15_000,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return browserClient;
};
