import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { identityDatabaseTarget } from '../server/database-config';
import { eventSnapshot } from '../shared/attendance';

// Metadata-only, repeatable optional backfill. Never derives attendance from a
// registration/createdAt, never changes profile/identity, dry run by default.
const projectId = process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error('Set GCLOUD_PROJECT explicitly');
const target = identityDatabaseTarget();
const database = getFirestore(initializeApp({ projectId: target.projectId }), target.databaseId);
const applyChanges = process.argv.includes('--apply');
const pointers = await database.collection('registrations').get();
let candidates = 0;
for (const pointer of pointers.docs) {
  const changed = await database.runTransaction(async transaction => {
    const current = await transaction.get(pointer.ref);
    const data = current.data();
    if (!data || data.event || typeof data.uid !== 'string' || typeof data.sessionId !== 'string' || pointer.id !== `${data.sessionId}~${data.uid}` || !/^[\w-]{1,128}$/.test(data.sessionId) || !/^[\w-]{1,128}$/.test(data.uid) || typeof data.participantId !== 'string' || !/^[\w~-]{1,256}$/.test(data.participantId)) return false;
    const [profile, event, participant] = await Promise.all([
      transaction.get(database.doc(`profiles/${data.uid}`)), transaction.get(database.doc(`sessions/${data.sessionId}`)), transaction.get(database.doc(`participants/${data.participantId}`)),
    ]);
    if (profile.data()?.state !== 'active' || !event.exists || participant.data()?.memberId !== data.uid || participant.data()?.uid !== data.uid || participant.data()?.sessionId !== data.sessionId) return false;
    if (applyChanges) transaction.update(pointer.ref, { event: eventSnapshot(event.data()!) });
    return true;
  });
  if (changed) candidates++;
}
console.log(JSON.stringify({ mode: applyChanges ? 'applied' : 'dry-run', metadataSnapshots: candidates, attendanceCreated: 0 }));
