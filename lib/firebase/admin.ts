import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const adminAppName = "vers-admin";

const getRequiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Configurazione server incompleta: ${name}`);
  }
  return value;
};

export const getFirebaseAdminAuth = () => {
  const existingApp = getApps().find((app) => app.name === adminAppName);
  if (existingApp) return getAuth(existingApp);

  const app = initializeApp(
    {
      credential: cert({
        projectId: getRequiredEnvironmentVariable(
          "FIREBASE_ADMIN_PROJECT_ID",
        ),
        clientEmail: getRequiredEnvironmentVariable(
          "FIREBASE_ADMIN_CLIENT_EMAIL",
        ),
        privateKey: getRequiredEnvironmentVariable(
          "FIREBASE_ADMIN_PRIVATE_KEY",
        ).replace(/\\n/g, "\n"),
      }),
    },
    adminAppName,
  );

  return getAuth(app);
};
