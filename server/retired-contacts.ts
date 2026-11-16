import { FieldValue, type Firestore } from 'firebase-admin/firestore';

// This task's migration is deliberately impossible to aim at a live database.
export function syntheticContactMigrationTarget(environment: NodeJS.ProcessEnv = process.env) {
  const projectId = environment.GCLOUD_PROJECT;
  const host = environment.FIRESTORE_EMULATOR_HOST;
  if (!projectId?.startsWith('demo-') || !host || !/^(?:127\.0\.0\.1|localhost|\[::1\]):[0-9]{1,5}$/.test(host) || (environment.FIRESTORE_DATABASE_ID && environment.FIRESTORE_DATABASE_ID !== '(default)')) throw new Error('Retired contact cleanup requires a demo- project and local default-database Firestore emulator.');
  return { projectId, databaseId: '(default)' };
}

export type RetiredContactResult = 'missing' | 'inactive' | 'clean' | 'candidate' | 'retired';
// Discovery supplies identity only. Reread current lifecycle and projection in
// one transaction; never set a stale projection or recreate a deleted record.
export async function retireSignalContact(database: Firestore, memberId: string, applyChanges = false): Promise<RetiredContactResult> {
  const target = syntheticContactMigrationTarget();
  if ((database as Firestore & { readonly projectId: string }).projectId !== target.projectId || database.databaseId !== target.databaseId) throw new Error('Migration database does not match the synthetic target.');
  const projectionRef = database.doc(`connectionContacts/${memberId}`);
  return database.runTransaction(async transaction => {
    const [profile, projection] = await Promise.all([
      transaction.get(database.doc(`profiles/${memberId}`)), transaction.get(projectionRef),
    ]);
    if (!projection.exists) return 'missing';
    if (profile.data()?.state !== 'active') return 'inactive';
    if (!Object.hasOwn(projection.data()!, 'signal')) return 'clean';
    if (!applyChanges) return 'candidate';
    // Unknown future keys and all concurrent fields survive. The read locks
    // serialize this delete transform with Save, accept and profile deletion.
    transaction.update(projectionRef, { signal: FieldValue.delete() });
    return 'retired';
  });
}
