import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { withProfileDeletionFence } from './profile-cleanup';

export type AttendanceCleanupTarget = { path: string; kind: 'subject' | 'verifier' };
export type AttendanceCleanupPlan = { version: 1; targets: AttendanceCleanupTarget[]; completed: boolean };

// Capture every recovery ID in the shared job before any identity erasure. Retry
// reuses this entire plan even when a prior worker removed searchable UID fields.
export async function planAttendanceCleanup(database: Firestore, uid: string, attemptId: string): Promise<AttendanceCleanupPlan> {
  return withProfileDeletionFence(database, uid, attemptId, async (transaction, job) => {
    if (job.data()?.attendancePlan) return job.data()!.attendancePlan as AttendanceCleanupPlan;
    const discoveries = [
      ['attendance', 'uid', 'subject'], ['attendanceAudit', 'memberUid', 'subject'],
      ['historyVisibility', 'uid', 'subject'], ['attendance', 'verifiedBy', 'verifier'],
      ['attendanceAudit', 'staffUid', 'verifier'],
    ] as const;
    const snapshots = await Promise.all(discoveries.map(([collectionName, field]) =>
      transaction.get(database.collection(collectionName).where(field, '==', uid))));
    const targets = snapshots.flatMap((snapshot, index) => snapshot.docs.map(record => ({ path: record.ref.path, kind: discoveries[index][2] })));
    const plan: AttendanceCleanupPlan = { version: 1, targets, completed: false };
    transaction.update(job.ref, { attendancePlan: plan });
    return plan;
  });
}

// Each mutation rereads BOTH its immutable saved plan and the current target
// under the SAME generation fence. Preserve newer verifier/correction attribution.
export async function applyAttendanceCleanupTarget(database: Firestore, uid: string, attemptId: string, target: AttendanceCleanupTarget) {
  await withProfileDeletionFence(database, uid, attemptId, async (transaction, job) => {
    const plan = job.data()?.attendancePlan as AttendanceCleanupPlan | undefined;
    if (!plan?.targets.some(saved => saved.path === target.path && saved.kind === target.kind)) throw new Error('Attendance cleanup target is absent from saved plan');
    const reference = database.doc(target.path);
    const record = await transaction.get(reference);
    if (!record.exists) return;
    if (target.kind === 'subject') transaction.delete(reference);
    else if (target.path.startsWith('attendance/')) {
      if (record.data()?.verifiedBy === uid) transaction.update(reference, { verifiedBy: null });
    } else if (record.data()?.staffUid === uid) {
      transaction.update(reference, { staffUid: null, reason: '', evidence: '', fingerprint: FieldValue.delete() });
    }
  });
}

export async function cleanupAttendance(database: Firestore, uid: string, attemptId: string) {
  const plan = await planAttendanceCleanup(database, uid, attemptId);
  for (const target of plan.targets) await applyAttendanceCleanupTarget(database, uid, attemptId, target);
  await withProfileDeletionFence(database, uid, attemptId, async (transaction, job) => {
    if (!job.data()?.attendancePlan) throw new Error('Attendance cleanup plan missing');
    transaction.update(job.ref, { 'attendancePlan.completed': true });
  });
  // No independent profile tombstone/job erasure: only the parent completes after
  // all module cleanup succeeds. Full target IDs survive partial retries.
}
