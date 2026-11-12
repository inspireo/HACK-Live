import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, projectId, seedEvents, signInFixture } from './fixtures';

let environment: RulesTestEnvironment;
const context = (uid: string) => environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
const tokens: Record<string, string> = {};
async function assign(memberUid: string, roles = ['participant'], extra = {}, actor = 'organizer') {
  return callIdentity(tokens[actor], 'event-roles', { sessionId: 'event-one', memberUid, roles, ...extra });
}
before(async () => {
  await clearFixtures(); await seedEvents();
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  for (const uid of ['organizer', 'coadmin', 'platform', 'event-two-owner', 'ordinary', 'mentor', 'mixed', 'leader', 'member', 'outsider', 'badge-delete', 'form-leader', 'form-member']) {
    await createFixtureUser(uid); tokens[uid] = await signInFixture(uid);
  }
  await createFixtureUser('unverified-role', false);
  await fixtureDb.doc('users/platform').set({ role: 'admin' });
  await fixtureDb.doc('sessions/event-two').update({ ownerId: 'event-two-owner' });
});
after(async () => { await environment?.cleanup(); });

test('official role assignment including self-target requires existing owner/coadmin/platform authority', async () => {
  assert.equal((await callIdentity(undefined, 'event-roles', { sessionId: 'event-one', memberUid: 'mentor', roles: ['mentor'] })).status, 401);
  assert.equal((await callIdentity(await signInFixture('unverified-role'), 'event-roles', { sessionId: 'event-one', memberUid: 'mentor', roles: ['mentor'] })).status, 403);
  assert.equal((await assign('ordinary', ['organizer/facilitator'], {}, 'ordinary')).status, 403);
  for (const actor of ['organizer', 'coadmin', 'platform']) {
    const self = await assign(actor, ['organizer/facilitator', 'mentor'], {}, actor);
    assert.equal(self.status, 200, JSON.stringify(self));
    const again = await assign(actor, ['organizer/facilitator', 'mentor'], {}, actor);
    assert.equal(again.data.participantId, self.data.participantId);
    assert.equal((await fixtureDb.collection('participants').where('sessionId', '==', 'event-one').where('memberId', '==', actor).get()).size, 1);
    const badges = await callIdentity(tokens[actor], 'my-badges');
    assert.deepEqual(badges.data.badges.find((badge: any) => badge.sessionId === 'event-one').roles, ['organizer/facilitator', 'mentor']);
  }
  assert.equal((await assign('event-two-owner', ['organizer/facilitator'], {}, 'event-two-owner')).status, 403);
  assert.equal((await assign('mentor', ['mentor'], {}, 'event-two-owner')).status, 403);
  assert.equal((await assign('unverified-role', ['mentor'])).status, 409);
  const mentor = await assign('mentor', ['mentor', 'volunteer']);
  assert.equal(mentor.status, 200, JSON.stringify(mentor));
  const mixed = await assign('mixed', ['participant', 'mentor'], {}, 'coadmin');
  assert.equal(mixed.status, 200);
  assert.equal((await assign('ordinary', ['organizer/facilitator'], {}, 'platform')).status, 200);
  assert.equal((await assign('ordinary', ['participant', 'mentor'], {}, 'ordinary')).status, 403);
  assert.equal((await assign('outsider', ['judge'], {}, 'ordinary')).status, 403);
  await assertFails(updateDoc(doc(context('ordinary'), 'sessions/event-one'), { title: 'Role is not administration' }));
  await assertFails(updateDoc(doc(context('ordinary'), 'participants', mentor.data.participantId), { officialRoles: ['participant'] }));
  await assertFails(updateDoc(doc(context('organizer'), 'participants', mentor.data.participantId), { officialRoles: ['participant'] }));
  assert.equal((await assign('mentor', ['mentor', 'mentor'])).status, 400);
  assert.equal((await assign('mentor', ['admin'])).status, 400);
  assert.equal((await assign('mentor', ['challenge owner'], { challengeId: 'event-two-challenge' })).status, 409);
  assert.equal((await assign('mentor', ['challenge owner'], { challengeId: 'event-one-challenge' })).status, 200);
  assert.equal((await assign('mentor', ['mentor'], { challengeId: 'event-one-challenge' })).status, 400);
  assert.equal((await assign('missing-member', ['mentor'])).status, 404);
});

test('concurrent role issue and ordinary registration reuse one pointer without changing name or reusable profile', async () => {
  const registered = await callIdentity(tokens.mixed, 'register', { sessionId: 'event-one', adjective: 'Patient' });
  const assignments = await Promise.all(Array.from({ length: 4 }, () => assign('mixed', ['participant', 'mentor'])));
  assert.ok(assignments.every(result => result.status === 200));
  assert.ok(assignments.every(result => result.data.participantId === registered.data.participantId));
  assert.equal((await fixtureDb.collection('participants').where('sessionId', '==', 'event-one').where('memberId', '==', 'mixed').get()).size, 1);
  assert.equal((await fixtureDb.doc(`participants/${registered.data.participantId}`).get()).data()!.name, 'Synthetic mixed');
  assert.deepEqual((await fixtureDb.doc('profiles/mixed').get()).data(), { name: 'Synthetic mixed', state: 'active' });
  // A member cannot turn their staff-only registration into a contestant by re-registering.
  const staffRejoin = await callIdentity(tokens.mentor, 'register', { sessionId: 'event-one' });
  assert.equal(staffRejoin.status, 200);
  assert.deepEqual((await fixtureDb.doc(`participants/${staffRejoin.data.participantId}`).get()).data()!.officialRoles, ['challenge owner']);
});

test('staff-only cannot allocate in discovery OR solution; mixed participation retains existing behavior', async () => {
  const staffRow = await assign('mentor', ['mentor', 'volunteer']);
  const mixedRow = await assign('mixed', ['participant', 'mentor']);
  await fixtureDb.doc('sessions/event-one').update({ status: 'Team Formation' });
  for (const fields of [{ teamId: 'team', isAssigned: true }, { solutioning_team_id: 'team' }, { discoveryTeamId: 'discovery', discovery_team_id: 'discovery' }]) {
    await assertFails(updateDoc(doc(context('mentor'), 'participants', staffRow.data.participantId), fields));
    await assertFails(updateDoc(doc(context('organizer'), 'participants', staffRow.data.participantId), fields));
  }
  for (const collectionName of ['formingTeams', 'formingDiscoveryTeams']) {
    await assertFails(setDoc(doc(context('mentor'), collectionName, 'STAFF'), { sessionId: 'event-one', leaderId: staffRow.data.participantId, memberIds: [staffRow.data.participantId], isOpenToMore: true }));
  }
  await assertSucceeds(updateDoc(doc(context('mixed'), 'participants', mixedRow.data.participantId), { teamId: 'existing-team', isAssigned: true }));
  assert.equal((await assign('mixed', ['mentor'])).status, 409);
  assert.equal((await assign('mixed', ['participant', 'mentor'], { participationState: 'inactive' })).status, 409);
  await fixtureDb.doc(`participants/${mixedRow.data.participantId}`).update({ teamId: null, isAssigned: false });
  for (const collectionName of ['formingTeams', 'formingDiscoveryTeams']) {
    await fixtureDb.doc(`${collectionName}/MIXED`).set({ sessionId: 'event-one', leaderId: mixedRow.data.participantId, memberIds: [mixedRow.data.participantId], isOpenToMore: true });
    assert.equal((await assign('mixed', ['mentor'])).status, 409);
    await fixtureDb.doc(`${collectionName}/MIXED`).delete();
  }
  assert.equal((await assign('mixed', ['mentor'])).status, 200);
  assert.equal((await assign('mixed', ['participant', 'mentor'])).status, 200);
});

test('team labels honor self/actual leader/staff authority with cross-event isolation and no leader grant', async () => {
  const leader = (await assign('leader')).data.participantId;
  const member = (await assign('member')).data.participantId;
  const outsider = (await assign('outsider')).data.participantId;
  await fixtureDb.doc('teams/label-team').set({ sessionId: 'event-one', leaderId: leader, name: 'Label team' });
  await fixtureDb.doc(`participants/${leader}`).update({ teamId: 'label-team', isAssigned: true });
  // Exercise historical final-team alias too.
  await fixtureDb.doc(`participants/${member}`).update({ solutioning_team_id: 'label-team' });
  const payload = { collectionName: 'teams', teamId: 'label-team', participantId: member, label: 'lead' };
  assert.equal((await callIdentity(tokens.outsider, 'team-role', payload)).status, 403);
  assert.equal((await callIdentity(tokens['event-two-owner'], 'team-role', payload)).status, 403);
  assert.equal((await callIdentity(tokens.member, 'team-role', payload)).status, 200);
  // Owning a "lead" label cannot edit another member or the actual leaderId.
  assert.equal((await callIdentity(tokens.member, 'team-role', { ...payload, participantId: leader })).status, 403);
  assert.equal((await assign('outsider', ['organizer/facilitator'], {}, 'member')).status, 403);
  await assertFails(updateDoc(doc(context('member'), 'sessions/event-one'), { title: 'A lead label is not admin' }));
  await assertFails(updateDoc(doc(context('member'), 'teams/label-team'), { leaderId: member }));
  await assertFails(updateDoc(doc(context('member'), 'participants', member), { teamRoleLabels: { 'teams~label-team': 'admin' } }));
  await assertFails(updateDoc(doc(context('organizer'), 'participants', member), { teamRoleLabels: { 'teams~label-team': 'lead' } }));
  for (const actor of ['leader', 'coadmin', 'platform', 'organizer']) assert.equal((await callIdentity(tokens[actor], 'team-role', { ...payload, label: 'designer' })).status, 200);
  await fixtureDb.doc(`participants/${leader}`).update({ teamId: null, isAssigned: false });
  assert.equal((await callIdentity(tokens.leader, 'team-role', payload)).status, 403);
  await fixtureDb.doc(`participants/${leader}`).update({ teamId: 'label-team', isAssigned: true });
  assert.equal((await callIdentity(tokens.leader, 'team-role', { ...payload, participantId: outsider })).status, 409);
  assert.equal((await callIdentity(tokens.leader, 'team-role', { ...payload, label: 'administrator' })).status, 400);
  await fixtureDb.doc('discoveryTeams/cross-event').set({ sessionId: 'event-two', leaderId: leader });
  await fixtureDb.doc(`participants/${member}`).update({ discovery_team_id: 'cross-event' });
  assert.equal((await callIdentity(tokens.organizer, 'team-role', { ...payload, collectionName: 'discoveryTeams', teamId: 'cross-event' })).status, 409);
  assert.equal((await fixtureDb.doc('teams/label-team').get()).data()!.leaderId, leader);
  await fixtureDb.doc('discoveryTeams/label-discovery').set({ sessionId: 'event-one', leaderId: leader, name: 'Discovery' });
  await fixtureDb.doc(`participants/${member}`).update({ discovery_team_id: 'label-discovery' });
  await assertSucceeds(updateDoc(doc(context('member'), 'discoveryTeams/label-discovery'), { name: 'Member named group' }));
  await assertFails(updateDoc(doc(context('outsider'), 'discoveryTeams/label-discovery'), { name: 'Unrelated member cannot rename' }));
  await assertFails(updateDoc(doc(context('member'), 'discoveryTeams/label-discovery'), { leaderId: member }));
});

test('forming labels and actual leadership survive both finalizations, staff-only member rechecked on server', async () => {
  const leader = (await assign('form-leader')).data.participantId;
  const member = (await assign('form-member')).data.participantId;
  const staffMember = (await assign('mentor', ['mentor'])).data.participantId;
  for (const kind of ['solution', 'discovery']) {
    const formingCollection = kind === 'solution' ? 'formingTeams' : 'formingDiscoveryTeams';
    const finalCollection = kind === 'solution' ? 'teams' : 'discoveryTeams';
    const formingId = kind.toUpperCase();
    await fixtureDb.doc('sessions/event-one').update({ status: kind === 'solution' ? 'Team Formation' : 'Discovery Team Formation' });
    await fixtureDb.doc(`participants/${leader}`).update({ selectedChallengeId: 'event-one-challenge' });
    await fixtureDb.doc(`participants/${member}`).update({ selectedChallengeId: 'event-one-challenge' });
    await fixtureDb.doc(`${formingCollection}/${formingId}`).set({ sessionId: 'event-one', leaderId: leader, memberIds: [leader, member, staffMember], isOpenToMore: true, challengeId: 'event-one-challenge' });
    assert.equal((await callIdentity(tokens['form-leader'], 'finalize-team', { kind, formingId })).status, 409);
    await fixtureDb.doc(`${formingCollection}/${formingId}`).update({ memberIds: [leader, member] });
    assert.equal((await callIdentity(tokens['form-leader'], 'team-role', { collectionName: formingCollection, teamId: formingId, participantId: member, label: 'researcher' })).status, 200);
    const result = await callIdentity(tokens['form-leader'], 'finalize-team', { kind, formingId });
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal((await fixtureDb.doc(`${finalCollection}/${result.data.teamId}`).get()).data()!.leaderId, leader);
    const row = (await fixtureDb.doc(`participants/${member}`).get()).data()!;
    assert.equal(row.teamRoleLabels[`${finalCollection}~${result.data.teamId}`], 'researcher');
    assert.equal(row.teamRoleLabels[`${formingCollection}~${formingId}`], undefined);
  }
});

test('badge requires live profile/pointer/participation/event; projection has no contacts and deletion cleans roles', async () => {
  const issued = await assign('badge-delete', ['mentor', 'volunteer']);
  const participantRef = fixtureDb.doc(`participants/${issued.data.participantId}`);
  const badge = await callIdentity(tokens['badge-delete'], 'my-badges');
  assert.equal(badge.status, 200); assert.equal(badge.data.badges.length, 1);
  assert.deepEqual(badge.data.badges[0].roles, ['mentor', 'volunteer']);
  assert.deepEqual(Object.keys(badge.data.badges[0]).sort(), ['eventDate', 'eventName', 'name', 'roles', 'sessionId', 'teams']);
  await participantRef.update({ participationState: 'inactive' });
  assert.deepEqual((await callIdentity(tokens['badge-delete'], 'my-badges')).data.badges, []);
  await participantRef.update({ participationState: 'active' });
  await fixtureDb.doc('sessions/event-one').update({ state: 'inactive' });
  assert.deepEqual((await callIdentity(tokens['badge-delete'], 'my-badges')).data.badges, []);
  await fixtureDb.doc('sessions/event-one').update({ state: 'active' });
  const event = (await fixtureDb.doc('sessions/event-one').get()).data()!;
  await fixtureDb.doc('sessions/event-one').delete();
  assert.deepEqual((await callIdentity(tokens['badge-delete'], 'my-badges')).data.badges, []);
  await fixtureDb.doc('sessions/event-one').set(event);
  await fixtureDb.doc('registrations/event-one~badge-delete').delete();
  assert.deepEqual((await callIdentity(tokens['badge-delete'], 'my-badges')).data.badges, []);
  await fixtureDb.doc('registrations/event-one~badge-delete').set({ uid: 'badge-delete', sessionId: 'event-one', participantId: issued.data.participantId });
  await participantRef.update({ teamRoleLabels: { 'teams~historical': 'designer' } });
  await fixtureDb.doc('profiles/badge-delete').update({ state: 'deleting' });
  assert.equal((await callIdentity(tokens['badge-delete'], 'my-badges')).status, 404);
  assert.equal((await callIdentity(tokens['badge-delete'], 'delete-profile')).status, 200);
  assert.equal((await callIdentity(tokens['badge-delete'], 'my-badges')).status, 404);
  const tombstone = (await participantRef.get()).data()!;
  assert.equal(tombstone.participationState, 'inactive');
  for (const field of ['officialRoles', 'roleChallengeId', 'teamRoleLabels']) assert.equal(tombstone[field], undefined);
  assert.equal((await fixtureDb.doc('sessions/event-one').get()).exists, true);
});
