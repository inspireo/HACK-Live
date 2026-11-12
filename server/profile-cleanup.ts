import type { DocumentData, DocumentReference, Firestore, UpdateData } from 'firebase-admin/firestore';
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
    transaction.set(jobRef, manifest);
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

type CleanupMutation = { reference: DocumentReference; changes?: UpdateData<DocumentData> };

// Every mutation batch reads/locks the current deletion attempt, not just final
// completion. A paused request cannot erase newly created data after takeover.
// Bounded transactions also surface all write failures directly (unlike the
// non-rejecting BulkWriter.close API) and work beyond a single batch's limit.
export function createProfileCleanup(database: Firestore, uid: string, attemptId: string) {
  const mutations: CleanupMutation[] = [];
  const jobRef = database.doc(`profileDeletionJobs/${uid}`);
  return {
    update: (reference: DocumentReference, changes: UpdateData<DocumentData>) => { mutations.push({ reference, changes }); },
    delete: (reference: DocumentReference) => { mutations.push({ reference }); },
    abort: async () => { mutations.length = 0; },
    finish: async () => {
      for (let offset = 0; offset < mutations.length; offset += 100) {
        const chunk = mutations.slice(offset, offset + 100);
        await database.runTransaction(async transaction => {
          const job = await transaction.get(jobRef);
          if (job.data()?.attemptId !== attemptId) throw new Error('Cleanup attempt superseded; retry deletion.');
          for (const mutation of chunk) {
            if (mutation.changes) transaction.update(mutation.reference, mutation.changes);
            else transaction.delete(mutation.reference);
          }
          transaction.update(jobRef, { leaseUntil: Date.now() + 5 * 60 * 1000 });
        });
      }
      await database.runTransaction(async transaction => {
        const job = await transaction.get(jobRef);
        if (job.data()?.attemptId !== attemptId) throw new Error('Cleanup attempt superseded; retry deletion.');
        transaction.set(database.doc(`profiles/${uid}`), { state: 'deleted' });
        transaction.delete(jobRef);
      });
    },
  };
}
