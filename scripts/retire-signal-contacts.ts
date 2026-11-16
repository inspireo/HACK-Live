import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { retireSignalContact, syntheticContactMigrationTarget, type RetiredContactResult } from '../server/retired-contacts';

// No production mode. No data values or user IDs in output. Default is dry-run.
if (process.argv.slice(2).some(argument => argument !== '--apply')) throw new Error('Only --apply is supported; target must be a local synthetic emulator.');
const target = syntheticContactMigrationTarget();
const applyChanges = process.argv.includes('--apply');
const migrationDb = getFirestore(initializeApp({ projectId: target.projectId }), target.databaseId);
const counts: Record<RetiredContactResult, number> = { missing: 0, inactive: 0, clean: 0, candidate: 0, retired: 0 };
let cursor: QueryDocumentSnapshot | undefined;
try {
  for (;;) {
    let query = migrationDb.collection('connectionContacts').orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const projection of page.docs) {
      const outcome = await retireSignalContact(migrationDb, projection.id, applyChanges);
      // Increment after transaction success, never inside a retryable callback.
      counts[outcome]++;
    }
    cursor = page.docs.at(-1);
  }
  console.log(JSON.stringify({ mode: applyChanges ? 'apply' : 'dry-run', ...target, counts }));
} finally { await migrationDb.terminate(); }
