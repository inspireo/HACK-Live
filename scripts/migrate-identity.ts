import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

// Offline, privileged, repeatable migration; never infers ownership. Dry-run by
// default. Operator must separately authorize/configure a future production run.
const applyChanges = process.argv.includes('--apply');
const projectId = process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error('Set GCLOUD_PROJECT explicitly');
if (process.env.FIRESTORE_EMULATOR_HOST && !projectId.startsWith('demo-')) throw new Error('Emulator migrations require a demo- project');
const migrationDb = getFirestore(initializeApp({ projectId }), process.env.FIRESTORE_DATABASE_ID || '(default)');
const participants = await migrationDb.collection('participants').get();
const contactFields = ['phoneLast4', 'passcode', 'phone', 'phoneNumber', 'email', 'emailAddress'];
let participantCount = 0;
for (const participant of participants.docs) {
  const data = participant.data();
  const contacts = Object.fromEntries(contactFields.filter(field => field !== 'passcode' && data[field] !== undefined).map(field => [field, data[field]]));
  const removed = Object.fromEntries(contactFields.filter(field => data[field] !== undefined).map(field => [field, FieldValue.delete()]));
  if (!Object.keys(removed).length) continue;
  participantCount++;
  if (applyChanges) await migrationDb.runTransaction(async transaction => {
    // Retain legacy uid for organizer reconciliation, explicitly UNTRUSTED.
    // It never grants write/link permission under the new rules or API.
    if (Object.keys(contacts).length) transaction.set(migrationDb.doc(`legacyParticipantSecrets/${participant.id}`), { ...contacts, historicalUid: data.uid || null }, { merge: true });
    transaction.update(participant.ref, removed);
  });
}
const sessions = await migrationDb.collection('sessions').get();
let sessionCount = 0;
for (const session of sessions.docs) {
  const data = session.data();
  if (!('ownerEmail' in data) && !('adminEmails' in data)) continue;
  sessionCount++;
  if (applyChanges) await migrationDb.runTransaction(async transaction => {
    transaction.set(migrationDb.doc(`sessionAccess/${session.id}`), { ownerEmail: data.ownerEmail || '', adminEmails: data.adminEmails || [] });
    transaction.update(session.ref, { ownerEmail: FieldValue.delete(), adminEmails: FieldValue.delete() });
  });
}
console.log(JSON.stringify({ mode: applyChanges ? 'applied' : 'dry-run', participantCount, sessionCount }));
