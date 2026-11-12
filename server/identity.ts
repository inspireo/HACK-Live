import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Router } from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { createProfileCleanup } from './profile-cleanup';

// Emulator mode must be explicit and must never fall through to production.
const emulator = process.env.IDENTITY_EMULATORS === 'true';
if (emulator && (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-'))) {
  throw new Error('Identity emulators require both emulator hosts and a demo- project');
}
const identityApp = getApps()[0] || initializeApp(emulator
  ? { projectId: process.env.GCLOUD_PROJECT }
  : { credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || firebaseConfig.projectId });
export const identityDb = getFirestore(identityApp, emulator ? '(default)' : process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId);
const identityAuth = getAuth(identityApp);
const router = Router();
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const cleanName = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100;
const validProficiency = ['Experienced', 'Trained', 'Some exposure', 'New to it'];
const registrationKey = (sessionId: string, uid: string) => `${sessionId}~${uid}`;

router.use(async (req, res, next) => {
  try {
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) throw fail(401, 'Sign in to continue.');
    const claims = await identityAuth.verifyIdToken(bearer, true);
    if (claims.firebase.sign_in_provider === 'anonymous' || !claims.email_verified) throw fail(403, 'Use Google or verify your email to continue.');
    res.locals.uid = claims.uid;
    res.locals.claims = claims;
    next();
  } catch (error) { res.status((error as any).status || 401).json({ error: (error as Error).message }); }
});

router.post('/register', async (req, res) => {
  try {
    const uid = res.locals.uid as string;
    const { sessionId, adjective = '', designThinkingProficiency = 'New to it' } = req.body;
    if (typeof sessionId !== 'string' || !/^[\w-]{1,128}$/.test(sessionId) || typeof adjective !== 'string' || adjective.length > 100 || !validProficiency.includes(designThinkingProficiency)) throw fail(400, 'Invalid event registration.');
    const profileRef = identityDb.doc(`profiles/${uid}`);
    const registrationRef = identityDb.doc(`registrations/${registrationKey(sessionId, uid)}`);
    const participantId = await identityDb.runTransaction(async transaction => {
      const [profile, session, registration, legacy] = await Promise.all([
        transaction.get(profileRef), transaction.get(identityDb.doc(`sessions/${sessionId}`)),
        transaction.get(registrationRef),
        transaction.get(identityDb.collection('participants').where('sessionId', '==', sessionId).where('uid', '==', uid)),
      ]);
      if (!session.exists) throw fail(404, 'Event not found.');
      if (profile.data()?.state !== 'active' || !cleanName(profile.data()?.name)) throw fail(409, 'Complete your profile first.');
      if (registration.exists) {
        const linked = await transaction.get(identityDb.doc(`participants/${registration.data()!.participantId}`));
        if (!linked.exists || linked.data()?.uid !== uid || linked.data()?.memberId !== uid || linked.data()?.sessionId !== sessionId) throw fail(409, 'Registration conflict. Contact the event organizer.');
        return linked.id;
      }
      // Historical uid was writable using the public passcode. Even a matching
      // uid cannot prove legacy ownership; only an organizer may authorize it.
      if (!legacy.empty) throw fail(409, 'Legacy registration needs organizer-assisted linking. Do not create a second registration.');
      const participantRef = identityDb.collection('participants').doc();
      if ((await transaction.get(participantRef)).exists) throw fail(409, 'Registration conflict. Contact the event organizer.');
      transaction.create(participantRef, { sessionId, uid, memberId: uid, name: profile.data()!.name, adjective: adjective.trim(), designThinkingProficiency, teamId: null, isAssigned: false });
      transaction.create(registrationRef, { uid, sessionId, participantId: participantRef.id });
      transaction.set(identityDb.doc(`registrationDefaults/${uid}`), { adjective: adjective.trim(), designThinkingProficiency });
      return participantRef.id;
    });
    res.json({ participantId });
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

router.post('/link-legacy', async (req, res) => {
  try {
    const actor = res.locals.uid as string;
    const { participantId, memberUid } = req.body;
    if (typeof participantId !== 'string' || typeof memberUid !== 'string' || !/^[\w~-]{1,256}$/.test(participantId) || !/^[\w-]{1,128}$/.test(memberUid)) throw fail(400, 'Invalid legacy link.');
    const target = await identityAuth.getUser(memberUid);
    if (!target.emailVerified || target.disabled) throw fail(409, 'Target account must have a verified email.');
    await identityDb.runTransaction(async transaction => {
      const participantRef = identityDb.doc(`participants/${participantId}`);
      const participant = await transaction.get(participantRef);
      if (!participant.exists) throw fail(404, 'Participant not found.');
      const sessionId = participant.data()!.sessionId;
      const [session, access, actorRole, targetProfile, registration, existing, welcome, proposals] = await Promise.all([
        transaction.get(identityDb.doc(`sessions/${sessionId}`)), transaction.get(identityDb.doc(`sessionAccess/${sessionId}`)), transaction.get(identityDb.doc(`users/${actor}`)),
        transaction.get(identityDb.doc(`profiles/${memberUid}`)), transaction.get(identityDb.doc(`registrations/${registrationKey(sessionId, memberUid)}`)),
        transaction.get(identityDb.collection('participants').where('sessionId', '==', sessionId).where('memberId', '==', memberUid)),
        transaction.get(identityDb.collection('welcomeResponses').where('participantId', '==', participantId)),
        transaction.get(identityDb.collection('proposedChallenges').where('submitterParticipantId', '==', participantId)),
      ]);
      const sessionData = session.data();
      const permitted = sessionData && (sessionData.ownerId === actor || actorRole.data()?.role === 'admin' || res.locals.claims.email === 'xaeltan@gmail.com' || access.data()?.adminEmails?.includes(res.locals.claims.email));
      if (!permitted) throw fail(403, 'Only an event organizer may link a legacy registration after independently verifying the person.');
      if (participant.data()!.identityState === 'deleted' || participant.data()!.memberId || registration.exists || !existing.empty || targetProfile.data()?.state !== 'active') throw fail(409, 'Link conflict. Resolve registrations with the organizer; no records were merged or overwritten.');
      const { phoneLast4 } = participant.data()!;
      if (phoneLast4) transaction.set(identityDb.doc(`legacyParticipantSecrets/${participantId}`), { uid: memberUid, phoneLast4 });
      transaction.update(participantRef, { uid: memberUid, memberId: memberUid, phoneLast4: FieldValue.delete(), passcode: FieldValue.delete(), phone: FieldValue.delete(), phoneNumber: FieldValue.delete(), email: FieldValue.delete(), emailAddress: FieldValue.delete() });
      transaction.create(identityDb.doc(`registrations/${registrationKey(sessionId, memberUid)}`), { uid: memberUid, sessionId, participantId, linkedBy: actor });
      transaction.set(identityDb.doc(`registrationDefaults/${memberUid}`), { adjective: participant.data()!.adjective || '', designThinkingProficiency: participant.data()!.designThinkingProficiency || 'New to it' });
      for (const record of [...welcome.docs, ...proposals.docs]) {
        if (record.data().sessionId !== sessionId) throw fail(409, 'Legacy workshop reference conflict. Contact the organizer.');
        transaction.update(record.ref, { uid: memberUid });
      }
    });
    res.json({ linked: true });
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

router.post('/remove-registration', async (req, res) => {
  try {
    const actor = res.locals.uid as string;
    const { participantId, sessionId } = req.body;
    if (typeof participantId !== 'string' || typeof sessionId !== 'string' || !/^[\w~-]{1,256}$/.test(participantId) || !/^[\w-]{1,128}$/.test(sessionId)) throw fail(400, 'Invalid registration.');
    await identityDb.runTransaction(async transaction => {
      const [session, access, role, participant, pointers] = await Promise.all([
        transaction.get(identityDb.doc(`sessions/${sessionId}`)), transaction.get(identityDb.doc(`sessionAccess/${sessionId}`)), transaction.get(identityDb.doc(`users/${actor}`)), transaction.get(identityDb.doc(`participants/${participantId}`)),
        transaction.get(identityDb.collection('registrations').where('participantId', '==', participantId)),
      ]);
      if (!session.exists || !(session.data()!.ownerId === actor || role.data()?.role === 'admin' || res.locals.claims.email === 'xaeltan@gmail.com' || access.data()?.adminEmails?.includes(res.locals.claims.email))) throw fail(403, 'Only an event organizer may remove a registration.');
      if ((participant.exists && participant.data()!.sessionId !== sessionId) || pointers.docs.some(pointer => pointer.data().sessionId !== sessionId)) throw fail(409, 'Event registration conflict.');
      transaction.delete(identityDb.doc(`participants/${participantId}`));
      transaction.delete(identityDb.doc(`legacyParticipantSecrets/${participantId}`));
      for (const pointer of pointers.docs) transaction.delete(pointer.ref);
    });
    res.json({ removed: true });
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

router.post('/finalize-team', async (req, res) => {
  try {
    const uid = res.locals.uid as string;
    const { kind, formingId } = req.body;
    if (!['solution', 'discovery'].includes(kind) || typeof formingId !== 'string' || !/^[A-Z0-9_-]{1,100}$/.test(formingId)) throw fail(400, 'Invalid team.');
    const discovery = kind === 'discovery';
    const teamRef = identityDb.collection(discovery ? 'discoveryTeams' : 'teams').doc();
    await identityDb.runTransaction(async transaction => {
      const formingRef = identityDb.doc(`${discovery ? 'formingDiscoveryTeams' : 'formingTeams'}/${formingId}`);
      const forming = await transaction.get(formingRef);
      if (!forming.exists) throw fail(409, 'Forming team is no longer available.');
      const team = forming.data()!;
      const [registration, session, profile] = await Promise.all([
        transaction.get(identityDb.doc(`registrations/${registrationKey(team.sessionId, uid)}`)),
        transaction.get(identityDb.doc(`sessions/${team.sessionId}`)), transaction.get(identityDb.doc(`profiles/${uid}`)),
      ]);
      if (profile.data()?.state !== 'active' || registration.data()?.participantId !== team.leaderId) throw fail(403, 'Only the registered forming-team leader can finalize it.');
      const sessionData = session.data()!;
      const phases = discovery ? ['Focus Areas', 'Discovery Team Formation', 'Challenge Drafting', 'Challenge Discovery', 'Challenge Proposing', 'Challenge Voting'] : ['Team Formation'];
      if (!phases.includes(sessionData.status)) throw fail(409, 'Team formation is not open.');
      const maximum = discovery ? sessionData.maxWgSize || sessionData.maxTeamSize : sessionData.maxTeamSize;
      const minimum = discovery ? sessionData.minWgSize || sessionData.minTeamSize : sessionData.minTeamSize;
      if (!Array.isArray(team.memberIds) || !team.memberIds.includes(team.leaderId) || new Set(team.memberIds).size !== team.memberIds.length || team.memberIds.length > (maximum || 100) || (team.memberIds.length < (minimum || 1) && !team.isOpenToMore)) throw fail(409, 'Invalid team size.');
      const participants = await Promise.all(team.memberIds.map((participantId: string) => transaction.get(identityDb.doc(`participants/${participantId}`))));
      for (const participant of participants) {
        const member = participant.data();
        if (!member?.memberId || member.memberId !== member.uid || member.sessionId !== team.sessionId || (!discovery && member.selectedChallengeId !== team.challengeId)) throw fail(409, 'All team members must have linked registrations for this event and challenge.');
      }
      transaction.create(teamRef, { sessionId: team.sessionId, name: discovery ? `Discovery Team ${formingId}` : '', code: formingId, isOpenToMore: team.isOpenToMore, isParticipantCreated: true, createdAt: Date.now(), ...(discovery ? { leaderId: team.leaderId } : { challengeId: team.challengeId }) });
      for (const participant of participants) transaction.update(participant.ref, discovery ? { discoveryTeamId: teamRef.id, discovery_team_id: teamRef.id } : { teamId: teamRef.id, isAssigned: true });
      transaction.delete(formingRef);
    });
    res.json({ teamId: teamRef.id });
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

router.post('/delete-profile', async (_req, res) => {
  try {
    const uid = res.locals.uid as string;
    if (Date.now() / 1000 - res.locals.claims.auth_time > 300) throw fail(401, 'Sign out and sign in again before deleting your profile.');
    // Durable deletion state prevents new registrations/edits during cleanup.
    await identityDb.doc(`profiles/${uid}`).set({ state: 'deleting' }, { merge: true });
    const ownedParticipants = await identityDb.collection('participants').where('memberId', '==', uid).get();
    // BulkWriter permits a repeatable cleanup beyond Firestore's 500-write limit.
    const writer = createProfileCleanup(identityDb, uid);
    const participantIds = ownedParticipants.docs.map(participant => participant.id);
    for (const participant of ownedParticipants.docs) {
      writer.update(participant.ref, { uid: null, memberId: null, identityState: 'deleted', name: 'Deleted member', adjective: '', designThinkingProficiency: FieldValue.delete(), phone: FieldValue.delete(), phoneNumber: FieldValue.delete(), email: FieldValue.delete(), emailAddress: FieldValue.delete(), phoneLast4: FieldValue.delete(), passcode: FieldValue.delete(), persistedAnswers: FieldValue.delete(), archetypeScores: FieldValue.delete(), primaryArchetype: FieldValue.delete(), secondaryArchetype: FieldValue.delete(), teamId: null, isAssigned: false, discoveryTeamId: null, discovery_team_id: null, solutioning_team_id: null });
      writer.delete(identityDb.doc(`legacyParticipantSecrets/${participant.id}`));
      const responses = await identityDb.collection('welcomeResponses').where('participantId', '==', participant.id).get();
      for (const response of responses.docs) writer.delete(response.ref);
    }
    for (const collectionName of ['registrations', 'legacyParticipantSecrets', 'welcomeResponses', 'proposedChallengeVotes']) {
      const records = await identityDb.collection(collectionName).where('uid', '==', uid).get();
      for (const record of records.docs) writer.delete(record.ref);
    }
    const proposals = await identityDb.collection('proposedChallenges').where('uid', '==', uid).get();
    for (const proposal of proposals.docs) writer.update(proposal.ref, { uid: null, submitterName: 'Deleted member', submitterRealName: FieldValue.delete(), submitterProfileDescriptor: FieldValue.delete(), submitterParticipantId: FieldValue.delete() });
    // Existing team records contain participant-id references, including forming
    // teams and name-submission attribution. Preserve workshop content while
    // removing the deleted person's membership and attribution snapshots.
    for (const collectionName of ['teams', 'discoveryTeams', 'formingTeams', 'formingDiscoveryTeams']) {
      const records = await identityDb.collection(collectionName).get();
      for (const record of records.docs) {
        const team = record.data();
        const changes: Record<string, unknown> = {};
        if (Array.isArray(team.memberIds) && team.memberIds.some((member: string) => participantIds.includes(member))) changes.memberIds = team.memberIds.filter((member: string) => !participantIds.includes(member));
        for (const field of ['leaderId', 'createdBy', 'nameSubmittedBy']) if (team[field] === uid || participantIds.includes(team[field])) changes[field] = FieldValue.delete();
        if (Object.keys(changes).length) writer.update(record.ref, changes);
      }
    }
    writer.delete(identityDb.doc(`registrationDefaults/${uid}`));
    await writer.finish();
    // Retain a private tombstone. Auth and platform authorization deliberately
    // survive social-profile deletion; workshop event ownership is unchanged.
    res.json({ deleted: true });
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

export default router;
