import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Tests require emulators; no production fallback');
export const projectId = 'demo-hack-live';
const fixtureApp = getApps()[0] || initializeApp({ projectId });
export const fixtureDb = getFirestore(fixtureApp);
export const fixtureAuth = getAuth(fixtureApp);
export const password = 'Synthetic-password-123!';
export async function clearFixtures() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
}
export async function createFixtureUser(uid: string, verified = true) {
  await fixtureAuth.createUser({ uid, email: `${uid}@example.test`, password, emailVerified: verified });
  await fixtureDb.doc(`profiles/${uid}`).set({ name: `Synthetic ${uid}`, state: 'active' });
}
export async function seedEvents() {
  for (const sessionId of ['event-one', 'event-two']) {
    await fixtureDb.doc(`sessions/${sessionId}`).set({ title: sessionId === 'event-one' ? 'Synthetic Design Workshop' : 'Synthetic Second Workshop', code: sessionId === 'event-one' ? 'DEMO1' : 'DEMO2', ownerId: 'organizer', status: 'Challenge Selection Open', displayMode: 'Challenges', enableParticipantTeamFormation: true, maxTeamSize: 6 });
    await fixtureDb.doc(`sessionAccess/${sessionId}`).set({ ownerEmail: 'organizer@example.test', adminEmails: ['coadmin@example.test'] });
    await fixtureDb.doc(`challenges/${sessionId}-challenge`).set({ sessionId, title: 'Design a welcoming community', description: 'A synthetic workshop challenge.', isPublished: true, displayOrder: 0 });
  }
}
export async function signInFixture(uid: string) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${uid}@example.test`, password, returnSecureToken: true }) });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result.idToken as string;
}
export async function callIdentity(token: string | undefined, route: string, payload: object = {}) {
  const response = await fetch(`http://127.0.0.1:3000/api/identity/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
  return { status: response.status, data: await response.json() };
}
