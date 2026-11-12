import type { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { allocationEligible, teamMembership } from '../shared/participation';
import { awardId, awardName, awardSummary, awardTarget, type AwardRecipient, type AwardSnapshot } from '../shared/awards';

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const metadataName = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : fallback;
async function eventStaff(database: Firestore, transaction: Transaction, sessionId: string, actor: string, email: string) {
  const [event, access, platform] = await Promise.all(['sessions/' + sessionId, 'sessionAccess/' + sessionId, 'users/' + actor].map(path => transaction.get(database.doc(path))));
  if (!event.exists) throw fail(404, 'Event unavailable.');
  const permitted = event.data()!.ownerId === actor || access.data()?.adminEmails?.includes(email) || platform.data()?.role === 'admin' || email === 'xaeltan@gmail.com';
  return { permitted, event: event.data()! };
}

// Read every source inside the issuing transaction. An edit to membership, name,
// pointer or profile causes retry; no subsequent team read can rewrite history.
async function snapshotAward(database: Firestore, accounts: Auth, transaction: Transaction, sessionId: string, category: any, target: any, event: any): Promise<AwardSnapshot> {
  if (!awardTarget(category.kind, target)) throw fail(400, 'Choose a valid recipient.');
  let team: AwardSnapshot['team'] = null;
  let participants;
  if ('participantId' in target) {
    const participant = await transaction.get(database.doc(`participants/${target.participantId}`));
    if (!participant.exists || participant.data()?.sessionId !== sessionId || participant.data()?.identityState === 'deleted') throw fail(409, 'Recipient must belong to this event.');
    participants = [participant];
  } else {
    const teamRecord = await transaction.get(database.doc(`${target.collectionName}/${target.teamId}`));
    if (!teamRecord.exists || teamRecord.data()?.sessionId !== sessionId) throw fail(409, 'Team must belong to this event.');
    team = { collectionName: target.collectionName, teamId: target.teamId, name: metadataName(teamRecord.data()!.name, 'Unnamed team') };
    // Query the existing authoritative participant aliases, never a new attendance
    // or participant row. Read both aliases to cover migrated historical teams.
    const fields = target.collectionName === 'teams' ? ['teamId', 'solutioning_team_id'] : ['discoveryTeamId', 'discovery_team_id'];
    const groups = await Promise.all(fields.map(field => transaction.get(database.collection('participants').where('sessionId', '==', sessionId).where(field, '==', target.teamId))));
    participants = [...new Map(groups.flatMap(group => group.docs).map(record => [record.id, record])).values()];
  }
  if (participants.length > 80) throw fail(409, 'At most 80 recipients can be issued in one team result.');
  const recipients: AwardRecipient[] = [];
  for (const participant of participants) {
    const member = { ...participant.data(), id: participant.id } as any;
    if (team && !teamMembership(member, team.collectionName, team.teamId, {})) throw fail(409, 'Team membership changed.');
    // Conflicting aliases are unsafe, rather than evidence of two memberships.
    if (team) {
      const aliases = team.collectionName === 'teams' ? [member.teamId, member.solutioning_team_id] : [member.discoveryTeamId, member.discovery_team_id];
      if (aliases.some(value => value && value !== team!.teamId)) throw fail(409, 'Resolve conflicting team memberships before issuing.');
    }
    let recipient: AwardRecipient = { participantId: participant.id, memberId: null, name: 'Unlinked historical recipient', credit: 'unlinked' };
    if (member.identityState === 'deleted') {
      recipients.push({ participantId: null, memberId: null, name: 'Deleted recipient', credit: 'deleted' });
      continue;
    }
    // Canonical memberId is server-linked; mutable legacy uid alone is not.
    // Read lifecycle BEFORE eligibility so even an uncredited historical judge
    // or inactive member cannot add a participant reference after plan capture.
    const [pointer, profile] = awardId(member.memberId) ? await Promise.all([
        transaction.get(database.doc(`registrations/${sessionId}~${member.memberId}`)),
        transaction.get(database.doc(`profiles/${member.memberId}`)),
      ]) : [null, null];
    if (profile && profile.data()?.state !== 'active') {
      if (!team) throw fail(409, 'Recipient profile is unavailable.');
      recipients.push({ participantId: null, memberId: null, name: 'Deleted recipient', credit: 'deleted' });
      continue;
    }
    if (team && !allocationEligible(member)) recipient = { ...recipient, name: 'Ineligible historical recipient', credit: 'ineligible' };
    else if (pointer && profile && member.uid === member.memberId) {
      let verified = false;
      try { const account = await accounts.getUser(member.memberId); verified = account.emailVerified && !account.disabled && account.providerData.length > 0; }
      catch (issue: any) { if (issue.code !== 'auth/user-not-found') throw issue; }
      if (pointer.data()?.participantId === participant.id && pointer.data()?.uid === member.memberId && pointer.data()?.sessionId === sessionId && profile.data()?.state === 'active' && awardName(profile.data()?.name) && verified) {
        recipient = { participantId: participant.id, memberId: member.memberId, name: profile.data()!.name, credit: 'verified' };
      }
    }
    recipients.push(recipient);
  }
  return { eventName: metadataName(event.title, 'Event'), eventDate: typeof event.date === 'string' ? event.date.slice(0, 100) : null, categoryName: category.name, team, recipients };
}

export function installAwardRoutes(router: Router, database: Firestore, accounts: Auth) {
  // All award collections deny direct client access, including staff writes.
  // These endpoints run after identity's verified nonanonymous bearer middleware.
  router.post('/awards/manage', async (req, res) => {
    try {
      const { sessionId, action, expectedRevision, categoryId, resultId, name, kind, target, reason } = req.body;
      if (!awardId(sessionId) || !['category', 'draft', 'discard', 'publish', 'correct', 'revoke', 'finalize', 'reopen'].includes(action) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw fail(400, 'Invalid award operation.');
      if (['correct', 'revoke', 'reopen'].includes(action) && (!awardName(reason))) throw fail(400, 'Provide a private audit reason (1–100 characters).');
      if (reason !== undefined && !awardName(reason)) throw fail(400, 'Invalid audit reason.');
      if (action === 'category' && (!awardName(name) || !['individual', 'team'].includes(kind))) throw fail(400, 'Invalid award category.');
      if (['draft', 'correct'].includes(action) && !awardId(categoryId)) throw fail(400, 'Choose a category.');
      if (['publish', 'correct', 'revoke', 'discard'].includes(action) && !awardId(resultId)) throw fail(400, 'Choose a result.');
      if (resultId !== undefined && !awardId(resultId)) throw fail(400, 'Invalid result.');
      const createdRef = database.collection(action === 'category' ? 'eventAwardCategories' : 'awardResults').doc();
      const auditRef = database.collection('awardAudits').doc();
      const response = await database.runTransaction(async transaction => {
        const { permitted, event } = await eventStaff(database, transaction, sessionId, res.locals.uid, res.locals.claims.email);
        if (!permitted) throw fail(403, 'Only event staff can manage official awards.');
        const actorProfile = await transaction.get(database.doc(`profiles/${res.locals.uid}`));
        // Social-profile deletion never removes staff authority, but subsequent
        // actions must not reintroduce its deleted personal attribution.
        const actorUid = actorProfile.data()?.state === 'active' ? res.locals.uid : null;
        const stateRef = database.doc(`eventResults/${sessionId}`);
        const state = (await transaction.get(stateRef)).data() || { revision: 0, finalized: false };
        if (state.revision !== expectedRevision) throw fail(409, 'Results changed. Refresh before trying again.');
        if (state.finalized && !['correct', 'revoke', 'reopen'].includes(action)) throw fail(409, 'Reopen finalized results before adding awards.');
        if (action === 'reopen' && !state.finalized) throw fail(409, 'Results are already open.');
        const category = ['draft', 'correct'].includes(action) ? await transaction.get(database.doc(`eventAwardCategories/${categoryId}`)) : null;
        if (category && (!category.exists || category.data()?.sessionId !== sessionId)) throw fail(409, 'Category must belong to this event.');
        const resultRef = resultId ? database.doc(`awardResults/${resultId}`) : createdRef;
        const previous = resultId ? await transaction.get(resultRef) : null;
        const source = previous?.data();
        if (resultId && (!source || source.sessionId !== sessionId)) throw fail(409, 'Result must belong to this event.');
        if (action === 'draft' && source && source.status !== 'draft') throw fail(409, 'Published recipients are immutable; revoke and issue a replacement.');
        if (action === 'publish' && source?.status !== 'draft') throw fail(409, 'Only a draft can be published.');
        if (action === 'discard' && source?.status !== 'draft') throw fail(409, 'Only a draft can be discarded.');
        if (['correct', 'revoke'].includes(action) && source?.status !== 'published') throw fail(409, 'Only a published award can be corrected or revoked.');
        if (action === 'draft' && !awardTarget(category!.data()!.kind, target)) throw fail(400, 'Choose a valid recipient.');
        if (action === 'draft') {
          const recipient = await transaction.get(database.doc(category!.data()!.kind === 'individual' ? `participants/${target.participantId}` : `${target.collectionName}/${target.teamId}`));
          if (!recipient.exists || recipient.data()?.sessionId !== sessionId || recipient.data()?.identityState === 'deleted') throw fail(409, 'Recipient must belong to this event.');
          if (category!.data()!.kind === 'individual' && awardId(recipient.data()?.memberId)) {
            const profile = await transaction.get(database.doc(`profiles/${recipient.data()!.memberId}`));
            if (profile.data()?.state !== 'active') throw fail(409, 'Recipient profile is unavailable.');
          }
        }
        if (action === 'correct' && category!.data()!.kind !== source!.kind) throw fail(409, 'A correction cannot change the recipient kind. Revoke and replace instead.');
        let snapshot: AwardSnapshot | undefined;
        if (action === 'publish') {
          const issueCategory = await transaction.get(database.doc(`eventAwardCategories/${source!.categoryId}`));
          if (issueCategory.data()?.sessionId !== sessionId) throw fail(409, 'Category unavailable.');
          snapshot = await snapshotAward(database, accounts, transaction, sessionId, issueCategory.data(), source!.target, event);
        } else if (action === 'correct') snapshot = { ...source!.snapshot, categoryName: category!.data()!.name };
        if (action === 'finalize') {
          const drafts = await transaction.get(database.collection('awardResults').where('sessionId', '==', sessionId).where('status', '==', 'draft'));
          if (!drafts.empty) throw fail(409, 'Publish or discard all drafts before finalizing.');
        }
        // Reads must precede writes; preserve each member's profile choice on correction.
        const credited = (snapshot?.recipients || source?.snapshot?.recipients || []).filter((recipient: AwardRecipient) => recipient.credit === 'verified' && recipient.memberId);
        const projectionRecords = await Promise.all(credited.map((recipient: AwardRecipient) => transaction.get(database.doc(`memberAchievements/${recipient.memberId}/awards/${resultRef.id}`))));
        const creditProfiles = await Promise.all(credited.map((recipient: AwardRecipient) => transaction.get(database.doc(`profiles/${recipient.memberId}`))));
        const activeCredited = credited.filter((_recipient: AwardRecipient, position: number) => creditProfiles[position].data()?.state === 'active');
        if (snapshot) snapshot = { ...snapshot, recipients: snapshot.recipients.map(recipient => recipient.memberId && !activeCredited.some((active: AwardRecipient) => active.memberId === recipient.memberId)
          ? { participantId: null, memberId: null, name: 'Deleted recipient', credit: 'deleted' } : recipient) };
        const now = new Date().toISOString();
        const revision = state.revision + 1;
        if (action === 'category') transaction.create(createdRef, { sessionId, name: name.trim(), kind });
        if (action === 'draft') transaction.set(resultRef, { sessionId, categoryId, kind: category!.data()!.kind, target, status: 'draft', updatedAt: now, updatedBy: actorUid });
        if (action === 'discard') transaction.delete(resultRef);
        if (action === 'publish' || action === 'correct') {
          const nextSource = { ...source, snapshot, status: 'published', publishedAt: source!.publishedAt || now };
          transaction.update(resultRef, { snapshot, categoryId: action === 'correct' ? categoryId : source!.categoryId, status: 'published', publishedAt: nextSource.publishedAt, updatedBy: actorUid, updatedAt: now,
            // Indexed durable discovery keys survive team edits and support cleanup manifests.
            subjectUids: [...new Set(snapshot!.recipients.flatMap(recipient => recipient.memberId ? [recipient.memberId] : []))],
            participantIds: snapshot!.recipients.flatMap(recipient => recipient.participantId ? [recipient.participantId] : []) });
          for (const [position, projection] of projectionRecords.entries()) {
            if (creditProfiles[position].data()?.state === 'active') transaction.set(projection.ref, { sessionId, resultId: resultRef.id, visibleOnProfile: projection.data()?.visibleOnProfile === true });
            else transaction.delete(projection.ref);
          }
        }
        if (action === 'revoke') {
          transaction.update(resultRef, { status: 'revoked', updatedBy: actorUid, updatedAt: now });
          for (const projection of projectionRecords) transaction.delete(projection.ref);
        }
        transaction.set(stateRef, { revision, finalized: action === 'finalize' ? true : action === 'reopen' ? false : state.finalized, updatedAt: now });
        transaction.create(auditRef, { sessionId, resultId: ['category', 'finalize', 'reopen'].includes(action) ? null : resultRef.id, action, revision, actorUid, reason: actorUid ? reason?.trim() || null : null, at: now,
          subjectUids: [...new Set(activeCredited.map((recipient: AwardRecipient) => recipient.memberId))] });
        return { revision, id: action === 'category' ? createdRef.id : ['finalize', 'reopen'].includes(action) ? sessionId : resultRef.id };
      });
      res.json(response);
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });

  router.post('/awards/staff', async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!awardId(sessionId)) throw fail(400, 'Invalid event.');
      const data = await database.runTransaction(async transaction => {
        if (!(await eventStaff(database, transaction, sessionId, res.locals.uid, res.locals.claims.email)).permitted) throw fail(403, 'Only event staff can read drafts and audits.');
        const [state, categories, results, audits] = await Promise.all([
          transaction.get(database.doc(`eventResults/${sessionId}`)),
          ...['eventAwardCategories', 'awardResults', 'awardAudits'].map(collectionName => transaction.get(database.collection(collectionName).where('sessionId', '==', sessionId))),
        ]);
        const entries = (records: any) => records.docs.map((record: any) => ({ id: record.id, ...record.data() }));
        return { state: state.data() || { revision: 0, finalized: false }, categories: entries(categories), results: entries(results), audits: entries(audits) };
      });
      res.json(data);
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });

  // Reads use transactions too: deletion, revocation and visibility updates cannot
  // race an authorized response assembled from mixed generations.
  const safeSummary = async (transaction: Transaction, record: any) => {
    const names = [];
    for (const recipient of record.data().snapshot.recipients as AwardRecipient[]) {
      if (recipient.credit !== 'verified' || !recipient.memberId) { names.push(recipient.credit === 'deleted' ? 'Deleted recipient' : 'Uncredited historical recipient'); continue; }
      const profile = await transaction.get(database.doc(`profiles/${recipient.memberId}`));
      names.push(profile.data()?.state === 'active' ? recipient.name : 'Deleted recipient');
    }
    return awardSummary(record.id, record.data(), names);
  };
  router.post('/awards/event', async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!awardId(sessionId)) throw fail(400, 'Invalid event.');
      const data = await database.runTransaction(async transaction => {
        const event = await transaction.get(database.doc(`sessions/${sessionId}`));
        if (!event.exists) throw fail(404, 'Event unavailable.');
        const state = await transaction.get(database.doc(`eventResults/${sessionId}`));
        const results = await transaction.get(database.collection('awardResults').where('sessionId', '==', sessionId).where('status', '==', 'published'));
        const awards = [];
        for (const record of results.docs) awards.push(await safeSummary(transaction, record));
        return { finalized: state.data()?.finalized === true, awards };
      });
      res.json(data);
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });
  router.post('/awards/member', async (req, res) => {
    try {
      const memberId = req.body.memberId ?? res.locals.uid;
      if (!awardId(memberId)) throw fail(400, 'Invalid member.');
      const data = await database.runTransaction(async transaction => {
        const profile = await transaction.get(database.doc(`profiles/${memberId}`));
        if (profile.data()?.state !== 'active') throw fail(404, 'Member unavailable.');
        const own = memberId === res.locals.uid;
        const projections = await transaction.get(database.collection(`memberAchievements/${memberId}/awards`));
        const awards = [];
        for (const projection of projections.docs) {
          if (!own && projection.data().visibleOnProfile !== true) continue;
          const source = await transaction.get(database.doc(`awardResults/${projection.id}`));
          if (source.data()?.status !== 'published' || !source.data()?.snapshot.recipients.some((recipient: AwardRecipient) => recipient.credit === 'verified' && recipient.memberId === memberId)) continue;
          awards.push({ ...await safeSummary(transaction, source), ...(own ? { visibleOnProfile: projection.data().visibleOnProfile === true } : {}) });
        }
        return { own, awards };
      });
      res.json(data);
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });
  router.post('/awards/visibility', async (req, res) => {
    try {
      const { resultId, visibleOnProfile } = req.body;
      if (!awardId(resultId) || typeof visibleOnProfile !== 'boolean') throw fail(400, 'Invalid achievement visibility.');
      await database.runTransaction(async transaction => {
        const [profile, source, projection] = await Promise.all([
          transaction.get(database.doc(`profiles/${res.locals.uid}`)), transaction.get(database.doc(`awardResults/${resultId}`)),
          transaction.get(database.doc(`memberAchievements/${res.locals.uid}/awards/${resultId}`)),
        ]);
        if (profile.data()?.state !== 'active' || !projection.exists || source.data()?.status !== 'published' || !source.data()?.snapshot.recipients.some((recipient: AwardRecipient) => recipient.credit === 'verified' && recipient.memberId === res.locals.uid)) throw fail(403, 'Only your published verified achievement can be selected.');
        transaction.update(projection.ref, { visibleOnProfile });
      });
      res.json({ updated: true });
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });
}
