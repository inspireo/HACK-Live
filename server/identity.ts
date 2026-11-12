import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Router } from 'express';
import { allocationEligible } from '../shared/participation';
import { installParticipationRoutes } from './participation';
import { connectionsRouter, queueConnectionCleanup } from './connections';
import { contactProjection } from '../shared/connections';
import { identityDatabaseTarget } from './database-config';
import { beginProfileDeletion, createProfileCleanup, releaseProfileDeletion } from './profile-cleanup';
import { communityProjection, validateProfileEdit } from '../shared/profile';
import { eventSnapshot } from '../shared/attendance';
import { installAttendanceRoutes } from './attendance';
import { queueSharedContentCleanup } from './shared-content-cleanup';
import { cleanupAttendance } from './attendance-cleanup';
import { installAwardRoutes } from './awards';

// Emulator mode must be explicit and must never fall through to production.
const target = identityDatabaseTarget();
const emulator = target.emulator;
const identityApp = getApps()[0] || initializeApp(emulator
  ? { projectId: target.projectId }
  : { credential: applicationDefault(), projectId: target.projectId });
export const identityDb = getFirestore(identityApp, target.databaseId);
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

router.use(connectionsRouter(identityDb));
installParticipationRoutes(router, identityDb, identityAuth);
installAttendanceRoutes(router, identityDb, identityAuth);
installAwardRoutes(router, identityDb, identityAuth);

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
      transaction.create(participantRef, { sessionId, uid, memberId: uid, name: profile.data()!.name, adjective: adjective.trim(), designThinkingProficiency, teamId: null, solutioning_team_id: null, isAssigned: false });
      transaction.create(registrationRef, { uid, sessionId, participantId: participantRef.id, event: eventSnapshot(session.data()!) });
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
      transaction.create(identityDb.doc(`registrations/${registrationKey(sessionId, memberUid)}`), { uid: memberUid, sessionId, participantId, linkedBy: actor, event: eventSnapshot(sessionData!) });
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
      const formationEnabled = discovery ? sessionData.enableParticipantWgFormation ?? sessionData.enableParticipantTeamFormation : sessionData.enableParticipantTeamFormation;
      const phases = discovery ? ['Focus Areas', 'Discovery Team Formation', 'Challenge Drafting', 'Challenge Discovery', 'Challenge Proposing', 'Challenge Voting'] : ['Team Formation'];
      if (!formationEnabled || !phases.includes(sessionData.status)) throw fail(409, 'Team formation is not open.');
      const maximum = discovery ? sessionData.maxWgSize || sessionData.maxTeamSize : sessionData.maxTeamSize;
      const minimum = discovery ? sessionData.minWgSize || sessionData.minTeamSize : sessionData.minTeamSize;
      if (!Array.isArray(team.memberIds) || !team.memberIds.includes(team.leaderId) || new Set(team.memberIds).size !== team.memberIds.length || team.memberIds.length > (maximum || 100) || (team.memberIds.length < (minimum || 1) && !team.isOpenToMore)) throw fail(409, 'Invalid team size.');
      const participants = await Promise.all(team.memberIds.map((participantId: string) => transaction.get(identityDb.doc(`participants/${participantId}`))));
      for (const participant of participants) {
        const member = participant.data();
        if (!member || !allocationEligible(member) || !member.memberId || member.memberId !== member.uid || member.sessionId !== team.sessionId || (!discovery && member.selectedChallengeId !== team.challengeId)) throw fail(409, 'All team members must have linked registrations for this event and challenge.');
        if (discovery ? member.discoveryTeamId || member.discovery_team_id : member.teamId || member.solutioning_team_id || member.isAssigned) throw fail(409, 'A member is already assigned to another team. Refresh and resolve the stale forming team.');
      }
      transaction.create(teamRef, { sessionId: team.sessionId, name: discovery ? `Discovery Team ${formingId}` : '', code: formingId, isOpenToMore: team.isOpenToMore, isParticipantCreated: true, createdAt: Date.now(), leaderId: team.leaderId, ...(!discovery ? { challengeId: team.challengeId } : {}) });
      for (const participant of participants) {
        const labels = { ...participant.data()?.teamRoleLabels };
        const formingKey = `${discovery ? 'formingDiscoveryTeams' : 'formingTeams'}~${formingId}`;
        if (labels[formingKey]) labels[`${discovery ? 'discoveryTeams' : 'teams'}~${teamRef.id}`] = labels[formingKey];
        delete labels[formingKey];
        transaction.update(participant.ref, { ...(discovery ? { discoveryTeamId: teamRef.id, discovery_team_id: teamRef.id } : { teamId: teamRef.id, solutioning_team_id: teamRef.id, isAssigned: true }), teamRoleLabels: labels });
      }
      transaction.delete(formingRef);
    });
    res.json({ teamId: teamRef.id });
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

router.post('/save-profile', async (req, res) => {
  try {
    let edit: ReturnType<typeof validateProfileEdit>;
    try { edit = validateProfileEdit(req.body); } catch (issue) { throw fail(400, (issue as Error).message); }
    const uid = res.locals.uid as string;
    await identityDb.runTransaction(async transaction => {
      const profileRef = identityDb.doc(`profiles/${uid}`);
      const profile = await transaction.get(profileRef);
      if (profile.data()?.state !== 'active') throw fail(409, 'An active profile is required.');
      // Replace source and projection together; removing consent removes old fields.
      transaction.set(profileRef, { name: edit.name, state: 'active' });
      transaction.set(identityDb.doc(`profileDetails/${uid}`), edit.details);
      transaction.set(identityDb.doc(`memberDetails/${uid}`), communityProjection(edit.details));
      transaction.set(identityDb.doc(`connectionContacts/${uid}`), contactProjection(edit.details));
    });
    res.json({ saved: true });
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

router.post('/delete-profile', async (_req, res) => {
  let attemptId: string | undefined;
  let cleanup: ReturnType<typeof createProfileCleanup> | undefined;
  const uid = res.locals.uid as string;
  try {
    if (Date.now() / 1000 - res.locals.claims.auth_time > 300) throw fail(401, 'Sign out and sign in again before deleting your profile.');
    // Persist recovery keys BEFORE any identity fields or pointers are erased.
    const manifest = await beginProfileDeletion(identityDb, uid);
    attemptId = manifest.attemptId;
    await cleanupAttendance(identityDb, uid, attemptId);
    const participantIds = manifest.participantIds;
    const ownedParticipants = participantIds.length ? await identityDb.getAll(...participantIds.map(participantId => identityDb.doc(`participants/${participantId}`))) : [];
    // Bounded, attempt-fenced transactions permit repeatable cleanup beyond a single write batch.
    const writer = createProfileCleanup(identityDb, uid, attemptId);
    cleanup = writer;
    await queueConnectionCleanup(identityDb, uid, writer);
    for (const participant of ownedParticipants) {
      if (participant.exists) writer.update(participant.ref, { uid: null, memberId: null, identityState: 'deleted', officialRoles: FieldValue.delete(), roleChallengeId: FieldValue.delete(), participationState: 'inactive', teamRoleLabels: FieldValue.delete(), name: 'Deleted member', adjective: '', designThinkingProficiency: FieldValue.delete(), phone: FieldValue.delete(), phoneNumber: FieldValue.delete(), email: FieldValue.delete(), emailAddress: FieldValue.delete(), phoneLast4: FieldValue.delete(), passcode: FieldValue.delete(), persistedAnswers: FieldValue.delete(), archetypeScores: FieldValue.delete(), primaryArchetype: FieldValue.delete(), secondaryArchetype: FieldValue.delete(), teamId: null, solutioning_team_id: null, isAssigned: false, discoveryTeamId: null, discovery_team_id: null });
      writer.delete(identityDb.doc(`legacyParticipantSecrets/${participant.id}`));
      const responses = await identityDb.collection('welcomeResponses').where('participantId', '==', participant.id).get();
      for (const response of responses.docs) writer.delete(response.ref);
    }
    for (const collectionName of ['registrations', 'legacyParticipantSecrets', 'welcomeResponses', 'proposedChallengeVotes']) {
      const records = await identityDb.collection(collectionName).where('uid', '==', uid).get();
      for (const record of records.docs) writer.delete(record.ref);
    }
    // Current-record conditional operations preserve surviving peer edits. The
    // original challenge attribution plan persists before any identity erasure.
    await queueSharedContentCleanup(identityDb, uid, attemptId, manifest, writer);
    writer.delete(identityDb.doc(`registrationDefaults/${uid}`));
    await writer.finish();
    // Retain a private tombstone. Auth and platform authorization deliberately
    // survive social-profile deletion; workshop event ownership is unchanged.
    res.json({ deleted: true });
  } catch (error) {
    await cleanup?.abort();
    if (attemptId) await releaseProfileDeletion(identityDb, uid, attemptId).catch(() => {});
    res.status((error as any).status || 500).json({ error: (error as Error).message });
  }
});

export default router;
