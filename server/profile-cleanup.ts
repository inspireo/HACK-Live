import type { DocumentData, DocumentReference, DocumentSnapshot, Firestore, Transaction, UpdateData } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

export async function beginProfileDeletion(database: Firestore, uid: string) {
  const attemptId = randomUUID();
  return database.runTransaction(async transaction => {
    const jobRef = database.doc(`profileDeletionJobs/${uid}`);
    const job = await transaction.get(jobRef);
    if (job.exists && job.data()!.leaseUntil > Date.now()) throw Object.assign(new Error('Profile cleanup is already running. Retry shortly.'), { status: 409 });
    let participantIds: string[] = job.data()?.participantIds || [];
    let proposalIds: string[] = job.data()?.proposalIds || [];
    if (!job.exists) {
      const [participants, proposals] = await Promise.all([
        transaction.get(database.collection('participants').where('memberId', '==', uid)),
        transaction.get(database.collection('proposedChallenges').where('uid', '==', uid)),
      ]);
      participantIds = participants.docs.map(participant => participant.id);
      const associated = await Promise.all(participantIds.map(participantId => transaction.get(database.collection('proposedChallenges').where('submitterParticipantId', '==', participantId))));
      proposalIds = [...new Set([...proposals.docs, ...associated.flatMap(snapshot => snapshot.docs)].map(proposal => proposal.id))];
    }
    const manifest = { participantIds, proposalIds, attemptId, leaseUntil: Date.now() + 5 * 60 * 1000 };
    transaction.set(jobRef, manifest, { merge: true });
    transaction.set(database.doc(`profiles/${uid}`), { state: 'deleting' });
    return manifest;
  });
}

export async function releaseProfileDeletion(database: Firestore, uid: string, attemptId: string) {
  await database.runTransaction(async transaction => {
    const jobRef = database.doc(`profileDeletionJobs/${uid}`);
    const job = await transaction.get(jobRef);
    if (job.data()?.attemptId === attemptId) transaction.update(jobRef, { leaseUntil: 0 });
  });
}

// Shared module extension seam. Callback reads/mutations and lease renewal all
// serialize with takeover/completion; stale workers never write a new generation.
// Callback must perform its reads before writes, as with any Firestore transaction.
export async function withProfileDeletionFence<T>(
  database: Firestore, uid: string, attemptId: string,
  operation: (transaction: Transaction, job: DocumentSnapshot) => Promise<T>,
): Promise<T> {
  return database.runTransaction(async transaction => {
    const jobRef = database.doc(`profileDeletionJobs/${uid}`);
    const [job, profile] = await Promise.all([
      transaction.get(jobRef), transaction.get(database.doc(`profiles/${uid}`)),
    ]);
    if (job.data()?.attemptId !== attemptId || profile.data()?.state !== 'deleting') throw new Error('Cleanup attempt superseded; retry deletion.');
    const result = await operation(transaction, job);
    transaction.update(jobRef, { leaseUntil: Date.now() + 5 * 60 * 1000 });
    return result;
  });
}

export type CurrentCleanupDecision = { kind: 'update'; changes: UpdateData<DocumentData> } | { kind: 'delete' } | null;
type CleanupMutation = { reference: DocumentReference; changes?: UpdateData<DocumentData>; transform?: (current: DocumentSnapshot) => CurrentCleanupDecision };

// Every mutation batch reads/locks the current deletion attempt, not just final
// completion. A paused request cannot erase newly created data after takeover.
// Bounded transactions also surface all write failures directly (unlike the
// non-rejecting BulkWriter.close API) and work beyond a single batch's limit.
export function createProfileCleanup(database: Firestore, uid: string, attemptId: string) {
  const mutations: CleanupMutation[] = [];
  const jobRef = database.doc(`profileDeletionJobs/${uid}`);
  // PR2 extension seam: deterministic owner documents, no owned blob assets.
  for (const collectionName of ['profileDetails', 'memberDetails', 'connectionContacts']) mutations.push({ reference: database.doc(`${collectionName}/${uid}`) });
  return {
    update: (reference: DocumentReference, changes: UpdateData<DocumentData>) => { mutations.push({ reference, changes }); },
    delete: (reference: DocumentReference) => { mutations.push({ reference }); },
    transform: (reference: DocumentReference, operation: (current: DocumentSnapshot) => CurrentCleanupDecision) => { mutations.push({ reference, transform: operation }); },
    abort: async () => { mutations.length = 0; },
    finish: async () => {
      for (let offset = 0; offset < mutations.length; offset += 100) {
        const chunk = mutations.slice(offset, offset + 100);
        await withProfileDeletionFence(database, uid, attemptId, async transaction => {
          // Read every shared target before ANY mutation in this transaction.
          // Peer updates cause retries and conditions re-evaluate on fresh data.
          const references = [...new Map(chunk.filter(mutation => mutation.transform).map(mutation => [mutation.reference.path, mutation.reference])).values()];
          const snapshots = await Promise.all(references.map(reference => transaction.get(reference)));
          const currentRecords = new Map(snapshots.map(snapshot => [snapshot.ref.path, snapshot]));
          for (const mutation of chunk) {
            if (mutation.transform) {
              const current = currentRecords.get(mutation.reference.path)!;
              if (!current.exists) continue;
              const decision = mutation.transform(current);
              if (decision?.kind === 'update') transaction.update(mutation.reference, decision.changes);
              else if (decision?.kind === 'delete') transaction.delete(mutation.reference);
            } else if (mutation.changes) transaction.update(mutation.reference, mutation.changes);
            else transaction.delete(mutation.reference);
          }
        });
      }
      await database.runTransaction(async transaction => {
        const [job, profile] = await Promise.all([
          transaction.get(jobRef), transaction.get(database.doc(`profiles/${uid}`)),
        ]);
        if (job.data()?.attemptId !== attemptId || profile.data()?.state !== 'deleting') throw new Error('Cleanup attempt superseded; retry deletion.');
        for (const namespace of ['attendancePlan', 'awardPlan']) {
          if (job.data()?.[namespace] && job.data()![namespace].completed !== true) throw new Error(`Profile cleanup module incomplete: ${namespace}`);
        }
        transaction.set(database.doc(`profiles/${uid}`), { state: 'deleted' });
        transaction.delete(jobRef);
      });
    },
  };
}
