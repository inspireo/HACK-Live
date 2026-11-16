import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { normalizePhotoUpload } from './profile-photo';
import { identityDatabaseTarget } from './database-config';
import { beginProfileDeletion, createProfileCleanup, releaseProfileDeletion } from './profile-cleanup';
import { communityProjection, isManagedPhotoUrl, validateProfileEdit } from '../shared/profile';

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
  if (req.path.startsWith('/photo/')) res.set({ 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' });
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
      const formationEnabled = discovery ? sessionData.enableParticipantWgFormation ?? sessionData.enableParticipantTeamFormation : sessionData.enableParticipantTeamFormation;
      const phases = discovery ? ['Focus Areas', 'Discovery Team Formation', 'Challenge Drafting', 'Challenge Discovery', 'Challenge Proposing', 'Challenge Voting'] : ['Team Formation'];
      if (!formationEnabled || !phases.includes(sessionData.status)) throw fail(409, 'Team formation is not open.');
      const maximum = discovery ? sessionData.maxWgSize || sessionData.maxTeamSize : sessionData.maxTeamSize;
      const minimum = discovery ? sessionData.minWgSize || sessionData.minTeamSize : sessionData.minTeamSize;
      if (!Array.isArray(team.memberIds) || !team.memberIds.includes(team.leaderId) || new Set(team.memberIds).size !== team.memberIds.length || team.memberIds.length > (maximum || 100) || (team.memberIds.length < (minimum || 1) && !team.isOpenToMore)) throw fail(409, 'Invalid team size.');
      const participants = await Promise.all(team.memberIds.map((participantId: string) => transaction.get(identityDb.doc(`participants/${participantId}`))));
      for (const participant of participants) {
        const member = participant.data();
        if (!member?.memberId || member.memberId !== member.uid || member.sessionId !== team.sessionId || (!discovery && member.selectedChallengeId !== team.challengeId)) throw fail(409, 'All team members must have linked registrations for this event and challenge.');
        if (discovery ? member.discoveryTeamId || member.discovery_team_id : member.teamId || member.isAssigned) throw fail(409, 'A member is already assigned to another team. Refresh and resolve the stale forming team.');
      }
      transaction.create(teamRef, { sessionId: team.sessionId, name: discovery ? `Discovery Team ${formingId}` : '', code: formingId, isOpenToMore: team.isOpenToMore, isParticipantCreated: true, createdAt: Date.now(), ...(discovery ? { leaderId: team.leaderId } : { challengeId: team.challengeId }) });
      for (const participant of participants) transaction.update(participant.ref, discovery ? { discoveryTeamId: teamRef.id, discovery_team_id: teamRef.id } : { teamId: teamRef.id, isAssigned: true });
      transaction.delete(formingRef);
    });
    res.json({ teamId: teamRef.id });
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

router.get('/photo/:memberId/:version', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' });
  try {
    const { memberId, version } = req.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(memberId) || !/^[a-f0-9-]{36}$/.test(version)) throw fail(404, 'Photo unavailable.');
    const photo = await identityDb.runTransaction(async transaction => {
      const [profile, caller, source, asset] = await Promise.all([
        transaction.get(identityDb.doc(`profiles/${memberId}`)),
        transaction.get(identityDb.doc(`profiles/${res.locals.uid}`)),
        transaction.get(identityDb.doc(`${res.locals.uid === memberId ? 'profileDetails' : 'memberDetails'}/${memberId}`)),
        transaction.get(identityDb.doc(`profilePhotos/${memberId}`)),
      ]);
      const values = res.locals.uid === memberId ? source.data()?.professional : source.data();
      if (profile.data()?.state !== 'active' || caller.data()?.state !== 'active' || asset.data()?.version !== version || values?.avatarUrl !== `/api/identity/photo/${memberId}/${version}`) throw fail(404, 'Photo unavailable.');
      return asset.data()!;
    });
    res.type('image/webp').send(photo.bytes);
  } catch (error) { res.status((error as any).status || 500).json({ error: (error as Error).message }); }
});

router.post('/save-profile', async (req, res) => {
  try {
    let edit: ReturnType<typeof validateProfileEdit>;
    try { edit = validateProfileEdit(req.body); } catch (issue) { throw fail(400, (issue as Error).message); }
    let photo: Buffer | undefined;
    try { photo = await normalizePhotoUpload(req.body.photoUpload); } catch (issue) { throw fail(400, (issue as Error).message); }
    const photoVersion = photo ? randomUUID() : undefined;
    const uid = res.locals.uid as string;
    const savedDetails = await identityDb.runTransaction(async transaction => {
      const details = structuredClone(edit.details);
      const profileRef = identityDb.doc(`profiles/${uid}`);
      const [profile, currentDetails] = await Promise.all([transaction.get(profileRef), transaction.get(identityDb.doc(`profileDetails/${uid}`))]);
      if (profile.data()?.state !== 'active') throw fail(409, 'An active profile is required.');
      const avatarUrl = details.professional.avatarUrl;
      // Never let a stale draft resurrect a removed/replaced photo or borrow another uid's asset.
      if (avatarUrl !== currentDetails.data()?.professional?.avatarUrl || (avatarUrl && isManagedPhotoUrl(avatarUrl) && !avatarUrl.startsWith(`/api/identity/photo/${uid}/`))) throw fail(409, 'Photo changed. Reload your profile and try again.');
      if (photo) {
        details.professional.avatarUrl = `/api/identity/photo/${uid}/${photoVersion}`;
        transaction.set(identityDb.doc(`profilePhotos/${uid}`), { version: photoVersion, bytes: photo });
      } else if (req.body.photoUpload === null || !avatarUrl) {
        delete details.professional.avatarUrl;
        transaction.delete(identityDb.doc(`profilePhotos/${uid}`));
      }
      // Replace source, projection and bytes together; removing consent removes old fields.
      transaction.set(profileRef, { name: edit.name, state: 'active' });
      transaction.set(identityDb.doc(`profileDetails/${uid}`), details);
      transaction.set(identityDb.doc(`memberDetails/${uid}`), communityProjection(details));
      return details;
    });
    res.json({ saved: true, details: savedDetails });
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
    const participantIds = manifest.participantIds;
    const ownedParticipants = participantIds.length ? await identityDb.getAll(...participantIds.map(participantId => identityDb.doc(`participants/${participantId}`))) : [];
    // Bounded, attempt-fenced transactions permit repeatable cleanup beyond a single write batch.
    const writer = createProfileCleanup(identityDb, uid, attemptId);
    cleanup = writer;
    for (const participant of ownedParticipants) {
      if (participant.exists) writer.update(participant.ref, { uid: null, memberId: null, identityState: 'deleted', name: 'Deleted member', adjective: '', designThinkingProficiency: FieldValue.delete(), phone: FieldValue.delete(), phoneNumber: FieldValue.delete(), email: FieldValue.delete(), emailAddress: FieldValue.delete(), phoneLast4: FieldValue.delete(), passcode: FieldValue.delete(), persistedAnswers: FieldValue.delete(), archetypeScores: FieldValue.delete(), primaryArchetype: FieldValue.delete(), secondaryArchetype: FieldValue.delete(), teamId: null, isAssigned: false, discoveryTeamId: null, discovery_team_id: null, solutioning_team_id: null });
      writer.delete(identityDb.doc(`legacyParticipantSecrets/${participant.id}`));
      const responses = await identityDb.collection('welcomeResponses').where('participantId', '==', participant.id).get();
      for (const response of responses.docs) writer.delete(response.ref);
    }
    for (const collectionName of ['registrations', 'legacyParticipantSecrets', 'welcomeResponses', 'proposedChallengeVotes']) {
      const records = await identityDb.collection(collectionName).where('uid', '==', uid).get();
      for (const record of records.docs) writer.delete(record.ref);
    }
    for (const proposalId of manifest.proposalIds) {
      const proposal = await identityDb.doc(`proposedChallenges/${proposalId}`).get();
      if (proposal.exists) writer.update(proposal.ref, { uid: null, submitterName: 'Deleted member', submitterRealName: FieldValue.delete(), submitterProfileDescriptor: FieldValue.delete(), submitterParticipantId: FieldValue.delete() });
      const published = await identityDb.collection('challenges').where('proposedChallengeId', '==', proposalId).get();
      const publishedRefs = published.docs.map(challenge => challenge.ref);
      if (proposal.data()?.publishedChallengeId) publishedRefs.push(identityDb.doc(`challenges/${proposal.data()!.publishedChallengeId}`));
      for (const reference of publishedRefs) {
        const challenge = await reference.get();
        if (!challenge.exists) continue;
        // Existing single/bulk publisher generated this exact attribution slot.
        // Keep editable workshop prose while anonymizing known copied identity.
        const summary = typeof challenge.data()!.summary === 'string' ? challenge.data()!.summary.replace(/<p><em>Proposed by:[\s\S]*?<\/em><\/p>/gi, '<p><em>Proposed by: Deleted member</em></p>') : '';
        writer.update(reference, { summary, submitterName: 'Deleted member' });
      }
    }
    // Existing team records contain participant-id references, including forming
    // teams and name-submission attribution. Preserve workshop content while
    // removing the deleted person's membership and attribution snapshots.
    for (const collectionName of ['teams', 'discoveryTeams', 'formingTeams', 'formingDiscoveryTeams']) {
      const records = await identityDb.collection(collectionName).get();
      for (const record of records.docs) {
        const team = record.data();
        if (collectionName.startsWith('forming') && participantIds.includes(team.leaderId)) { writer.delete(record.ref); continue; }
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
  } catch (error) {
    await cleanup?.abort();
    if (attemptId) await releaseProfileDeletion(identityDb, uid, attemptId).catch(() => {});
    res.status((error as any).status || 500).json({ error: (error as Error).message });
  }
});

export default router;
