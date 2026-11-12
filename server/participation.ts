import type { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { EVENT_ROLES, TEAM_LABELS, allocationEligible, officialRoles, teamMembership } from '../shared/participation';

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
async function staff(database: Firestore, transaction: Transaction, sessionId: string, actor: string, email: string) {
  const [session, access, platform] = await Promise.all(['sessions/' + sessionId, 'sessionAccess/' + sessionId, 'users/' + actor].map(path => transaction.get(database.doc(path))));
  if (!session.exists) throw fail(404, 'Event unavailable.');
  return session.data()?.ownerId === actor || access.data()?.adminEmails?.includes(email) || platform.data()?.role === 'admin' || email === 'xaeltan@gmail.com';
}
async function assertNoTeam(database: Firestore, transaction: Transaction, member: any) {
  if (member.isAssigned || member.teamId || member.solutioning_team_id || member.discoveryTeamId || member.discovery_team_id) throw fail(409, 'Remove active team membership before removing the participant role or deactivating participation.');
  for (const collectionName of ['formingTeams', 'formingDiscoveryTeams']) {
    // Participant IDs are globally unique. Query one indexed field and filter
    // the event explicitly, avoiding an array/equality composite index.
    const forming = await transaction.get(database.collection(collectionName).where('memberIds', 'array-contains', member.id));
    if (forming.docs.some(team => team.data().sessionId === member.sessionId)) throw fail(409, 'Leave the forming team before changing allocation eligibility.');
    const leading = await transaction.get(database.collection(collectionName).where('leaderId', '==', member.id));
    if (leading.docs.some(team => team.data().sessionId === member.sessionId)) throw fail(409, 'Leave the forming team before changing allocation eligibility.');
  }
}

// Installed after identity's verified, non-anonymous bearer middleware. Official
// roles and labels never participate in the staff authority calculation above.
export function installParticipationRoutes(router: Router, database: Firestore, accounts: Auth) {
  router.post('/event-roles', async (req, res) => {
    try {
      const { sessionId, memberUid, roles, challengeId = null, participationState = 'active' } = req.body;
      if (!validId(sessionId) || !validId(memberUid) || !Array.isArray(roles) || !roles.length || roles.length > EVENT_ROLES.length || new Set(roles).size !== roles.length || roles.some(role => !EVENT_ROLES.includes(role)) || !['active', 'inactive'].includes(participationState) || (challengeId !== null && (!validId(challengeId) || !roles.includes('challenge owner')))) throw fail(400, 'Invalid event roles.');
      const participantId = await database.runTransaction(async transaction => {
        if (!await staff(database, transaction, sessionId, res.locals.uid, res.locals.claims.email)) throw fail(403, 'Only event staff can issue official roles.');
        const account = await accounts.getUser(memberUid).catch(issue => {
          if (issue.code === 'auth/user-not-found') throw fail(404, 'Registered member unavailable.');
          throw issue;
        });
        if (!account.emailVerified || account.disabled || !account.providerData.length) throw fail(409, 'A verified registered member is required.');
        const profile = await transaction.get(database.doc(`profiles/${memberUid}`));
        if (profile.data()?.state !== 'active') throw fail(409, 'An active member profile is required.');
        const pointerRef = database.doc(`registrations/${sessionId}~${memberUid}`);
        const pointer = await transaction.get(pointerRef);
        const participantRef = pointer.exists ? database.doc(`participants/${pointer.data()!.participantId}`) : database.collection('participants').doc();
        const participant = await transaction.get(participantRef);
        if (pointer.exists && (!participant.exists || participant.data()?.memberId !== memberUid || participant.data()?.uid !== memberUid || participant.data()?.sessionId !== sessionId || participant.data()?.identityState === 'deleted')) throw fail(409, 'Registration conflict.');
        if (!pointer.exists) {
          const legacy = await transaction.get(database.collection('participants').where('sessionId', '==', sessionId).where('uid', '==', memberUid));
          if (!legacy.empty) throw fail(409, 'Link the existing registration first.');
        }
        if (challengeId) {
          const challenge = await transaction.get(database.doc(`challenges/${challengeId}`));
          if (challenge.data()?.sessionId !== sessionId) throw fail(409, 'Challenge must belong to this event.');
        }
        const changes = { officialRoles: roles, roleChallengeId: challengeId, participationState };
        if (participant.exists && !allocationEligible(changes)) await assertNoTeam(database, transaction, { ...participant.data(), id: participant.id });
        if (participant.exists) transaction.update(participantRef, changes);
        else {
          transaction.create(participantRef, { sessionId, uid: memberUid, memberId: memberUid, name: profile.data()!.name, adjective: '', teamId: null, solutioning_team_id: null, isAssigned: false, ...changes });
          transaction.create(pointerRef, { sessionId, uid: memberUid, participantId: participantRef.id });
        }
        return participantRef.id;
      });
      res.json({ participantId });
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });

  router.post('/team-role', async (req, res) => {
    try {
      const { collectionName, teamId, participantId, label } = req.body;
      if (!['teams', 'discoveryTeams', 'formingTeams', 'formingDiscoveryTeams'].includes(collectionName) || !validId(teamId) || !validId(participantId) || (label !== '' && !TEAM_LABELS.includes(label))) throw fail(400, 'Invalid team role label.');
      await database.runTransaction(async transaction => {
        const team = await transaction.get(database.doc(`${collectionName}/${teamId}`));
        const participant = await transaction.get(database.doc(`participants/${participantId}`));
        const member = { ...participant.data(), id: participant.id } as any;
        if (!team.exists || !participant.exists || member.sessionId !== team.data()?.sessionId || !allocationEligible(member) || !teamMembership(member, collectionName, teamId, team.data())) throw fail(409, 'Active membership of this team is required.');
        const [targetProfile, actorProfile, pointer] = await Promise.all([
          transaction.get(database.doc(`profiles/${member.memberId}`)), transaction.get(database.doc(`profiles/${res.locals.uid}`)),
          transaction.get(database.doc(`registrations/${member.sessionId}~${res.locals.uid}`)),
        ]);
        if (targetProfile.data()?.state !== 'active') throw fail(409, 'Member unavailable.');
        const isStaff = await staff(database, transaction, member.sessionId, res.locals.uid, res.locals.claims.email);
        const actorId = pointer.data()?.participantId;
        const actor = actorId ? await transaction.get(database.doc(`participants/${actorId}`)) : null;
        const currentLeader = actor?.data()?.memberId === res.locals.uid && actor.data()?.sessionId === member.sessionId && allocationEligible(actor.data()!) &&
          actorId === team.data()?.leaderId && teamMembership({ ...actor.data(), id: actorId }, collectionName, teamId, team.data());
        // A member may describe their own work; the actual team leader or event
        // staff may describe any current member. The word "lead" grants nothing.
        if (!isStaff && !(actorProfile.data()?.state === 'active' && actorId && (actorId === participantId || currentLeader))) throw fail(403, 'Only the member, team leader or event staff may edit this label.');
        const labels = { ...member.teamRoleLabels, [`${collectionName}~${teamId}`]: label };
        transaction.update(participant.ref, { teamRoleLabels: labels });
      });
      res.json({ updated: true });
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });

  router.post('/my-badges', async (_req, res) => {
    try {
      const uid = res.locals.uid;
      const profile = await database.doc(`profiles/${uid}`).get();
      if (profile.data()?.state !== 'active') throw fail(404, 'Badge unavailable.');
      const pointers = await database.collection('registrations').where('uid', '==', uid).get();
      const badges = [];
      for (const pointer of pointers.docs) {
        const { sessionId, participantId } = pointer.data();
        const [participant, event] = await Promise.all([database.doc(`participants/${participantId}`).get(), database.doc(`sessions/${sessionId}`).get()]);
        const member = participant.data();
        if (!event.exists || !member || member.uid !== uid || member.memberId !== uid || member.sessionId !== sessionId || member.identityState === 'deleted' || member.participationState === 'inactive' || event.data()?.state === 'inactive' || event.data()?.state === 'deleted') continue;
        const teams = [];
        for (const [collectionName, teamId] of [['teams', member.teamId || member.solutioning_team_id], ['discoveryTeams', member.discoveryTeamId || member.discovery_team_id]]) {
          if (!teamId) continue;
          const team = await database.doc(`${collectionName}/${teamId}`).get();
          if (team.exists && team.data()?.sessionId === sessionId) teams.push({ collectionName, teamId, participantId, kind: collectionName === 'teams' ? 'Solution team' : 'Discovery team', name: team.data()?.name || 'Unnamed team', role: member.teamRoleLabels?.[`${collectionName}~${teamId}`] || null });
        }
        // Explicit projection: no contacts, credentials, admin emails or arbitrary
        // participant/profile fields can enter this response.
        badges.push({ sessionId, eventName: event.data()?.title || 'Event', eventDate: typeof event.data()?.date === 'string' ? event.data()!.date : null, name: profile.data()!.name, roles: officialRoles(member), teams });
      }
      res.json({ badges });
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });
}
