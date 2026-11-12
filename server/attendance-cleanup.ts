import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

// PR1 handoff: call after durable deleting fence, before erasing recovery keys.
// Merge discovery into final PR1 manifest/generation fencing on rebase.
// Every mutation below is transactional; no independent BulkWriter.
export async function cleanupAttendance(database: Firestore, uid: string) {
  const queue = database.collection(`attendanceCleanup/${uid}/items`);
  const discoveries = [
    ['attendance', 'uid', 'subject'], ['attendanceAudit', 'memberUid', 'subject'],
    ['historyVisibility', 'uid', 'subject'], ['attendance', 'verifiedBy', 'verifier'],
    ['attendanceAudit', 'staffUid', 'verifier'],
  ] as const;
  // Persist all references before removing any searchable UID.
  for (const [collectionName, field, kind] of discoveries) {
    const records = await database.collection(collectionName).where(field, '==', uid).get();
    for (const record of records.docs) {
      const manifestRef = queue.doc(createHash('sha256').update(record.ref.path + kind).digest('hex'));
      await database.runTransaction(async transaction => {
        const profile = await transaction.get(database.doc(`profiles/${uid}`));
        if (profile.data()?.state !== 'deleting') throw new Error('Attendance cleanup requires deletion fence');
        transaction.set(manifestRef, { path: record.ref.path, kind });
      });
    }
  }
  const manifest = await queue.get();
  for (const entry of manifest.docs) {
    await database.runTransaction(async transaction => {
      const profile = await transaction.get(database.doc(`profiles/${uid}`));
      const pending = await transaction.get(entry.ref);
      if (profile.data()?.state !== 'deleting') throw new Error('Attendance cleanup lost deletion fence');
      if (!pending.exists) return;
      const { path, kind } = pending.data()!;
      const reference = database.doc(path);
      const record = await transaction.get(reference);
      if (record.exists) {
        if (kind === 'subject') transaction.delete(reference);
        else if (path.startsWith('attendance/')) {
          if (record.data()?.verifiedBy === uid) transaction.update(reference, { verifiedBy: null });
        } else if (record.data()?.staffUid === uid) transaction.update(reference, { staffUid: null, reason: '', evidence: '', fingerprint: FieldValue.delete() });
      }
      transaction.delete(entry.ref);
    });
  }
}
