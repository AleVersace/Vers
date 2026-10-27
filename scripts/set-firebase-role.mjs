import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error(
    "Uso: npm run firebase:set-role -- email@example.com",
  );
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !process.env.FIREBASE_ADMIN_PROJECT_ID) {
  console.error(
    "Imposta GOOGLE_APPLICATION_CREDENTIALS al percorso assoluto del JSON del service account Firebase e FIREBASE_ADMIN_PROJECT_ID al tuo progetto.",
  );
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  });
}

try {
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, {
    ...user.customClaims,
    role: "authenticated",
  });
  console.log(`Ruolo Supabase assegnato a ${email}.`);
  console.log("Esci e rientra in Vers per aggiornare il token.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Errore Firebase sconosciuto.",
  );
  process.exit(1);
}
