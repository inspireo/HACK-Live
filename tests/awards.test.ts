import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { callIdentity, clearFixtures, createFixtureUser, fixtureAuth, fixtureDb, projectId, seedEvents, signInFixture } from './fixtures';
import { planAwardCleanup, scrubAwardRecord, type AwardCleanupPlan } from '../server/award-cleanup';

let environment: RulesTestEnvironment;
const tokens: Record<string, string> = {};
const participantIds: Record<string, string> = {};
let individualCategory: string;
let teamCategory: string;
let correctedCategory: string;
let teamResult: string;
let individualResult: string;
const staffData = async (sessionId = 'event-one') => (await callIdentity(tokens.organizer, 'awards/staff', { sessionId })).data;
async function manage(action: string, payload: object = {}, actor = 'organizer', sessionId = 'event-one') {
  const state = await staffData(sessionId);
  return callIdentity(tokens[actor], 'awards/manage', { sessionId, action, expectedRevision: state.state.revision, ...payload });
}
async function succeed(action: string, payload: object = {}, actor = 'organizer') {
  const response = await manage(action, payload, actor);
  assert.equal(response.status, 200, JSON.stringify(response));
  return response.data;
}
const memberAwards = async (actor: string, memberId?: string) => (await callIdentity(tokens[actor], 'awards/member', memberId ? { memberId } : {})).data;
const eventAwards = async () => (await callIdentity(tokens.other, 'awards/event', { sessionId: 'event-one' })).data;
before(async () => {
  await clearFixtures(); await seedEvents();
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  for (const uid of ['organizer', 'coadmin', 'platform', 'alice', 'bob', 'carol', 'other', 'judge', 'legacy']) {
    await createFixtureUser(uid); tokens[uid] = await signInFixture(uid);
    const response = await callIdentity(tokens[uid], 'register', { sessionId: 'event-one' });
    assert.equal(response.status, 200); participantIds[uid] = response.data.participantId;
  }
  await fixtureDb.doc('users/platform').set({ role: 'admin' });
  await fixtureDb.doc(`participants/${participantIds.judge}`).update({ officialRoles: ['judge', 'mentor'], teamRoleLabels: { 'teams~award-team': 'lead' } });
  await fixtureDb.doc('sessions/event-one').update({ status: 'Closed', date: '2025-04-03' });
});
after(async () => environment?.cleanup());

test('award API and rules enforce real verified authentication and event staff authority', async () => {
  for (const route of ['awards/manage', 'awards/staff', 'awards/event', 'awards/member', 'awards/visibility']) assert.equal((await callIdentity(undefined, route)).status, 401);
  await createFixtureUser('unverified-award', false);
  assert.equal((await callIdentity(await signInFixture('unverified-award'), 'awards/event', { sessionId: 'event-one' })).status, 403);
  const anonymous = await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) })).json();
  assert.equal((await callIdentity(anonymous.idToken, 'awards/event', { sessionId: 'event-one' })).status, 403);
  for (const actor of ['alice', 'judge']) {
    assert.equal((await manage('category', { name: 'Unauthorized', kind: 'individual' }, actor)).status, 403);
    assert.equal((await callIdentity(tokens[actor], 'awards/staff', { sessionId: 'event-one' })).status, 403);
  }
  individualCategory = (await succeed('category', { name: 'Community contributor', kind: 'individual' }, 'coadmin')).id;
  teamCategory = (await succeed('category', { name: 'Team distinction', kind: 'team' }, 'platform')).id;
  correctedCategory = (await succeed('category', { name: 'Corrected team distinction', kind: 'team' })).id;
  for (const uid of ['organizer', 'alice']) {
    const client = environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
    for (const path of [`eventAwardCategories/${individualCategory}`, 'eventResults/event-one', 'awardResults/forged', 'awardAudits/forged', 'memberAchievements/alice/awards/forged']) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { sessionId: 'event-one', status: 'published', memberId: 'alice', visibleOnProfile: true }));
    }
    await assertFails(updateDoc(doc(client, 'profiles/alice'), { achievements: ['I won'] }));
  }
});

test('cross-event recipients/categories and forged selectors cannot issue awards; drafts remain staff-only', async () => {
  await fixtureDb.doc('participants/cross-event').set({ sessionId: 'event-two', name: 'Cross event' });
  await fixtureDb.doc('teams/cross-team').set({ sessionId: 'event-two', name: 'Cross team' });
  for (const payload of [
    { categoryId: individualCategory, target: { participantId: 'cross-event' } },
    { categoryId: teamCategory, target: { collectionName: 'teams', teamId: 'cross-team' } },
  ]) assert.equal((await manage('draft', payload)).status, 409);
  assert.equal((await manage('draft', { categoryId: individualCategory, target: { participantId: participantIds.alice, memberId: 'other' } })).status, 400);
  const otherCategory = await manage('category', { name: 'Other event', kind: 'individual' }, 'organizer', 'event-two');
  assert.equal((await manage('draft', { categoryId: otherCategory.data.id, target: { participantId: participantIds.alice } })).status, 409);
  individualResult = (await succeed('draft', { categoryId: individualCategory, target: { participantId: participantIds.alice } })).id;
  assert.equal((await eventAwards()).awards.length, 0);
  assert.equal((await memberAwards('alice')).awards.length, 0);
  const staff = await staffData(); assert.equal(staff.results.find((result: any) => result.id === individualResult).status, 'draft');
  assert.equal((await manage('finalize')).status, 409);
  await fixtureDb.doc(`participants/${participantIds.alice}`).update({ sessionId: 'event-two' });
  assert.equal((await manage('publish', { resultId: individualResult })).status, 409);
  await fixtureDb.doc(`participants/${participantIds.alice}`).update({ sessionId: 'event-one' });
});

test('publish credits only verified pointers; personal profile visibility defaults private and cannot be set for someone else', async () => {
  await succeed('publish', { resultId: individualResult });
  assert.equal((await memberAwards('alice')).awards.length, 1);
  assert.equal((await memberAwards('alice')).awards[0].visibleOnProfile, false);
  assert.equal((await memberAwards('other', 'alice')).awards.length, 0);
  assert.equal((await callIdentity(tokens.other, 'awards/visibility', { resultId: individualResult, visibleOnProfile: true, memberId: 'alice' })).status, 403);
  assert.equal((await callIdentity(tokens.alice, 'awards/visibility', { resultId: individualResult, visibleOnProfile: true })).status, 200);
  assert.equal((await memberAwards('other', 'alice')).awards.length, 1);
  assert.equal((await callIdentity(tokens.alice, 'awards/visibility', { resultId: individualResult, visibleOnProfile: false })).status, 200);
  // Event publication has a distinct legitimate audience despite hidden profile.
  const summary = (await eventAwards()).awards[0];
  assert.deepEqual(summary.recipientNames, ['Synthetic alice']);
  assert.equal(summary.eventDate, '2025-04-03');
  for (const key of ['reason', 'actorUid', 'memberId', 'target', 'subjectUids', 'email', 'phone']) assert.equal(key in summary, false);
});

test('team publication snapshots a coherent concurrent membership/name generation; later changes cannot rewrite winners', async () => {
  await fixtureDb.doc('teams/award-team').set({ sessionId: 'event-one', name: 'Original team', hasPresented: true });
  for (const uid of ['alice', 'bob']) await fixtureDb.doc(`participants/${participantIds[uid]}`).update({ teamId: 'award-team' });
  teamResult = (await succeed('draft', { categoryId: teamCategory, target: { collectionName: 'teams', teamId: 'award-team' } })).id;
  const publication = manage('publish', { resultId: teamResult });
  const edit = fixtureDb.runTransaction(async transaction => {
    transaction.update(fixtureDb.doc('teams/award-team'), { name: 'Concurrent team' });
    transaction.update(fixtureDb.doc(`participants/${participantIds.bob}`), { teamId: null });
    transaction.update(fixtureDb.doc(`participants/${participantIds.carol}`), { teamId: 'award-team' });
  });
  const [published] = await Promise.all([publication, edit]); assert.equal(published.status, 200, JSON.stringify(published));
  const source = (await fixtureDb.doc(`awardResults/${teamResult}`).get()).data()!;
  const actual = source.snapshot.recipients.map((recipient: any) => recipient.memberId).sort();
  assert.deepEqual(actual, source.snapshot.team.name === 'Original team' ? ['alice', 'bob'] : ['alice', 'carol']);
  assert.equal(source.snapshot.eventName, 'Synthetic Design Workshop');
  await fixtureDb.doc('teams/award-team').update({ name: 'Later name' });
  for (const uid of ['alice', 'bob', 'carol']) await fixtureDb.doc(`participants/${participantIds[uid]}`).update({ teamId: null });
  assert.deepEqual((await fixtureDb.doc(`awardResults/${teamResult}`).get()).data()!.snapshot, source.snapshot);
  for (const uid of actual) assert.ok((await memberAwards(uid)).awards.some((award: any) => award.id === teamResult));
  // The randomizer hasPresented flag creates no result or personal achievement.
  assert.equal((await memberAwards('other')).awards.length, 0);
});

test('legacy mutable uid, missing pointer and disabled account never confer personal award credit; multiple winners supported', async () => {
  await fixtureDb.doc('participants/legacy-award').set({ sessionId: 'event-one', uid: 'legacy', name: 'Untrusted legacy name', passcode: 'not-proof' });
  const legacyAward = (await succeed('draft', { categoryId: individualCategory, target: { participantId: 'legacy-award' } })).id;
  await succeed('publish', { resultId: legacyAward });
  assert.equal((await memberAwards('legacy')).awards.length, 0);
  assert.equal((await fixtureDb.doc(`awardResults/${legacyAward}`).get()).data()!.snapshot.recipients[0].credit, 'unlinked');
  const missingPointer = (await succeed('draft', { categoryId: individualCategory, target: { participantId: participantIds.other } })).id;
  await fixtureDb.doc('registrations/event-one~other').delete();
  await succeed('publish', { resultId: missingPointer });
  assert.equal((await memberAwards('other')).awards.length, 0);
  const disabledAward = (await succeed('draft', { categoryId: individualCategory, target: { participantId: participantIds.judge } })).id;
  await fixtureAuth.updateUser('judge', { disabled: true });
  await succeed('publish', { resultId: disabledAward });
  assert.equal((await fixtureDb.doc(`awardResults/${disabledAward}`).get()).data()!.snapshot.recipients[0].memberId, null);
  assert.ok((await eventAwards()).awards.filter((award: any) => award.categoryName === 'Community contributor').length >= 3);
});

test('concurrent staff edits use expected revision; finalize, correct, revoke and reopen retain private authorized audit', async () => {
  const { state } = await staffData();
  const attempts = await Promise.all(['One', 'Two'].map(name => callIdentity(tokens.organizer, 'awards/manage', { sessionId: 'event-one', action: 'category', expectedRevision: state.revision, name, kind: 'individual' })));
  assert.deepEqual(attempts.map(attempt => attempt.status).sort(), [200, 409]);
  const discard = (await succeed('draft', { categoryId: individualCategory, target: { participantId: participantIds.alice } })).id;
  assert.equal((await manage('finalize')).status, 409);
  await succeed('discard', { resultId: discard });
  await succeed('finalize');
  assert.equal((await eventAwards()).finalized, true);
  assert.equal((await manage('draft', { categoryId: individualCategory, target: { participantId: participantIds.alice } })).status, 409);
  const original = (await fixtureDb.doc(`awardResults/${teamResult}`).get()).data()!;
  await succeed('correct', { resultId: teamResult, categoryId: correctedCategory, reason: 'Private clerical correction' });
  const corrected = (await fixtureDb.doc(`awardResults/${teamResult}`).get()).data()!;
  assert.deepEqual(corrected.snapshot.recipients, original.snapshot.recipients);
  assert.deepEqual(corrected.snapshot.team, original.snapshot.team);
  assert.equal((await eventAwards()).awards.find((award: any) => award.id === teamResult).categoryName, 'Corrected team distinction');
  for (const recipient of corrected.snapshot.recipients) if (recipient.memberId) assert.equal((await memberAwards(recipient.memberId)).awards.find((award: any) => award.id === teamResult).visibleOnProfile, false);
  assert.equal((await manage('revoke', { resultId: individualResult })).status, 400);
  await succeed('revoke', { resultId: individualResult, reason: 'Recipient correction required' });
  assert.ok(!(await memberAwards('alice')).awards.some((award: any) => award.id === individualResult));
  assert.ok(!(await eventAwards()).awards.some((award: any) => award.id === individualResult));
  assert.equal((await manage('publish', { resultId: individualResult })).status, 409);
  assert.ok((await staffData()).audits.some((audit: any) => audit.action === 'revoke' && audit.reason === 'Recipient correction required'));
  assert.ok(!JSON.stringify(await eventAwards()).includes('Private clerical'));
  await succeed('reopen', { reason: 'Authorized backfill' });
  assert.equal((await eventAwards()).finalized, false);
});

test('historical unlinked/deleted/ineligible team recipients stay explicit; empty surviving team receives no personal credit', async () => {
  await fixtureDb.doc('teams/historical-team').set({ sessionId: 'event-one', name: 'Historical team' });
  await fixtureDb.doc('participants/legacy-award').update({ teamId: 'historical-team' });
  await fixtureDb.doc('participants/historical-deleted').set({ sessionId: 'event-one', teamId: 'historical-team', memberId: null, uid: null, identityState: 'deleted', name: 'Deleted member' });
  await fixtureDb.doc(`participants/${participantIds.judge}`).update({ teamId: 'historical-team' });
  const resultId = (await succeed('draft', { categoryId: teamCategory, target: { collectionName: 'teams', teamId: 'historical-team' } })).id;
  await succeed('publish', { resultId });
  const source = (await fixtureDb.doc(`awardResults/${resultId}`).get()).data()!;
  assert.deepEqual(source.snapshot.recipients.map((recipient: any) => recipient.credit).sort(), ['deleted', 'ineligible', 'unlinked']);
  assert.equal(source.snapshot.recipients.some((recipient: any) => recipient.memberId), false);
  assert.ok(!JSON.stringify((await eventAwards()).awards.find((award: any) => award.id === resultId)).includes('Untrusted legacy name'));
  await fixtureDb.doc('discoveryTeams/empty-historical-team').set({ sessionId: 'event-one', name: 'Surviving historical team' });
  const emptyAward = (await succeed('draft', { categoryId: teamCategory, target: { collectionName: 'discoveryTeams', teamId: 'empty-historical-team' } })).id;
  await succeed('publish', { resultId: emptyAward });
  assert.deepEqual((await fixtureDb.doc(`awardResults/${emptyAward}`).get()).data()!.snapshot.recipients, []);
  assert.ok((await eventAwards()).awards.some((award: any) => award.id === emptyAward));
});

test('durable award cleanup manifest survives partial scrubbing, fences stale generations, preserves team aggregate and other credit', async () => {
  const source = (await fixtureDb.doc(`awardResults/${teamResult}`).get()).data()!;
  const otherUid = source.snapshot.recipients.find((recipient: any) => recipient.memberId !== 'alice').memberId;
  await fixtureDb.doc('profiles/alice').update({ state: 'deleting' });
  const job = fixtureDb.doc('profileDeletionJobs/award-cleanup-test');
  await job.set({ generation: 'current', state: 'deleting' });
  const plan = await fixtureDb.runTransaction(async transaction => {
    const manifest = await planAwardCleanup(fixtureDb, transaction, 'alice', [participantIds.alice]);
    transaction.update(job, { awards: manifest }); return manifest;
  });
  assert.ok(plan.resultIds.includes(teamResult)); assert.ok(plan.achievementIds.includes(teamResult));
  const fence = (generation: string) => async (transaction: any) => {
    const saved = await transaction.get(job);
    const profile = await transaction.get(fixtureDb.doc('profiles/alice'));
    if (saved.data()?.generation !== generation || saved.data()?.state !== 'deleting' || profile.data()?.state !== 'deleting') throw new Error('Stale deletion generation');
  };
  await assert.rejects(scrubAwardRecord(fixtureDb, 'alice', plan, 'result', teamResult, fence('old')), /Stale deletion generation/);
  assert.equal((await fixtureDb.doc(`awardResults/${teamResult}`).get()).data()!.snapshot.recipients.some((recipient: any) => recipient.memberId === 'alice'), true);
  // Concurrent staff work after planning must not create fresh personal audit
  // references outside the immutable deletion manifest.
  await succeed('correct', { resultId: teamResult, categoryId: correctedCategory, reason: 'Correction concurrent with deletion' });
  const duringDeletion = await staffData();
  for (const audit of duringDeletion.audits.filter((entry: any) => !plan.auditIds.includes(entry.id))) assert.ok(!audit.subjectUids.includes('alice'));
  assert.equal((await manage('draft', { categoryId: individualCategory, target: { participantId: participantIds.alice } })).status, 409);
  await scrubAwardRecord(fixtureDb, 'alice', plan, 'result', teamResult, fence('current'));
  // A real failing write interrupts cleanup after personal discovery was removed.
  await assert.rejects(fixtureDb.doc('awardAudits/missing-retry-target').update({ reason: null }));
  const restored = (await job.get()).data()!.awards as AwardCleanupPlan;
  for (const [type, recordIds] of [['result', restored.resultIds], ['audit', restored.auditIds], ['achievement', restored.achievementIds]] as const) {
    for (const recordId of recordIds) await scrubAwardRecord(fixtureDb, 'alice', restored, type, recordId, fence('current'));
  }
  // Retry the exact persisted plan after all discovery fields have gone.
  for (const resultId of restored.resultIds) await scrubAwardRecord(fixtureDb, 'alice', restored, 'result', resultId, fence('current'));
  const retained = (await fixtureDb.doc(`awardResults/${teamResult}`).get()).data()!;
  assert.equal(retained.status, 'published'); assert.deepEqual(retained.snapshot.team, source.snapshot.team);
  assert.ok(retained.snapshot.recipients.some((recipient: any) => recipient.memberId === otherUid));
  assert.ok(!JSON.stringify(retained).includes(participantIds.alice));
  assert.ok(!retained.snapshot.recipients.some((recipient: any) => recipient.memberId === 'alice'));
  assert.equal((await fixtureDb.doc(`memberAchievements/${otherUid}/awards/${teamResult}`).get()).exists, true);
  assert.equal((await fixtureDb.doc(`memberAchievements/alice/awards/${teamResult}`).get()).exists, false);
  for (const auditId of restored.auditIds) { const audit = (await fixtureDb.doc(`awardAudits/${auditId}`).get()).data()!; assert.ok(!audit.subjectUids.includes('alice')); assert.equal(audit.reason, null); }
  assert.ok((await eventAwards()).awards.find((award: any) => award.id === teamResult).recipientNames.includes('Deleted recipient'));
  assert.equal((await callIdentity(tokens.other, 'awards/member', { memberId: 'alice' })).status, 404);
  assert.equal((await callIdentity(tokens.alice, 'awards/visibility', { resultId: teamResult, visibleOnProfile: true })).status, 403);
  assert.equal((await fixtureAuth.getUser('alice')).emailVerified, true);
  await fixtureDb.doc('profiles/alice').set({ name: 'Returned synthetic alice', state: 'active' });
  assert.equal((await memberAwards('alice')).awards.length, 0);
  assert.ok((await memberAwards(otherUid)).awards.some((award: any) => award.id === teamResult));
});

test('social deletion preserves staff authority without recreating actor attribution after manifest planning', async () => {
  await fixtureDb.doc('profiles/organizer').update({ state: 'deleting' });
  const issued = await succeed('category', { name: 'Authorized staff after deletion', kind: 'individual' });
  assert.ok(issued.id);
  const audit = (await staffData()).audits.find((entry: any) => entry.revision === issued.revision);
  assert.equal(audit.actorUid, null); assert.equal(audit.reason, null);
  assert.equal((await fixtureDb.doc('sessions/event-one').get()).data()!.ownerId, 'organizer');
  assert.equal((await fixtureAuth.getUser('organizer')).emailVerified, true);
});
