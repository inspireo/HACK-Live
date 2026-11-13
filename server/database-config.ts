import firebaseConfig from '../firebase-applet-config.json';

// Shared by server and migration. Emulator default DB is isolated from the
// checked-in application's named database and cannot silently target production.
export function identityDatabaseTarget(environment: NodeJS.ProcessEnv = process.env) {
  const emulator = environment.IDENTITY_EMULATORS === 'true' || !!environment.FIRESTORE_EMULATOR_HOST || !!environment.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator && (!environment.FIRESTORE_EMULATOR_HOST || !environment.FIREBASE_AUTH_EMULATOR_HOST || !environment.GCLOUD_PROJECT?.startsWith('demo-'))) throw new Error('Identity emulators require both emulator hosts and a demo- project');
  return {
    emulator,
    projectId: environment.GCLOUD_PROJECT || firebaseConfig.projectId,
    databaseId: emulator ? '(default)' : environment.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId,
  };
}
