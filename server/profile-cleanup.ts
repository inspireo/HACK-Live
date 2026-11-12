import type { DocumentData, DocumentReference, Firestore, UpdateData } from 'firebase-admin/firestore';

// BulkWriter.close() drains writes but deliberately never rejects. Observe each
// result immediately so partial cleanup cannot become a successful deletion.
export function createProfileCleanup(database: Firestore, uid: string) {
  const writer = database.bulkWriter();
  const operations: Promise<void>[] = [];
  const failures: unknown[] = [];
  const observe = (operation: Promise<unknown>) => {
    operations.push(operation.then(() => {}, issue => { failures.push(issue); }));
  };
  return {
    update: (reference: DocumentReference, changes: UpdateData<DocumentData>) => observe(writer.update(reference, changes)),
    delete: (reference: DocumentReference) => observe(writer.delete(reference)),
    finish: async () => {
      await writer.close();
      await Promise.all(operations);
      if (failures.length) throw failures[0];
      await database.doc(`profiles/${uid}`).set({ state: 'deleted' });
    },
  };
}
