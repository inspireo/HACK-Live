import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { clearFixtures, createFixtureUser, fixtureDb, seedEvents, signInFixture, callIdentity, projectId } from './fixtures';
import { invitationRequest, publicFields, publishFixture } from './invitation-fixtures';
import { INVITATION_TTL_MS } from '../server/event-invitations';
let environment: RulesTestEnvironment;
let owner: string, member: string;
const publicationPath = '/api/identity/events/event-one/publication';
before(async () => {
  await clearFixtures(); await seedEvents();
  for (const uid of ['organizer', 'coadmin', 'member', 'platform', 'xaeltan']) await createFixtureUser(uid);
  await createFixtureUser('unverified', false);
  await fixtureDb.doc('users/platform').set({ role: 'admin' });
  owner = await signInFixture('organizer'); member = await signInFixture('member');
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
});
after(async () => { await environment?.cleanup(); });

test('existing organizer authority only; publication is explicit and defaults preserve registration', async () => {
  assert.equal((await invitationRequest(`${publicationPath}/publish`, undefined, { revision: 0, fields: publicFields })).status, 401);
  assert.equal((await invitationRequest(`${publicationPath}/publish`, await signInFixture('unverified'), { revision: 0, fields: publicFields })).status, 403);
  assert.equal((await invitationRequest(`${publicationPath}/publish`, member, { revision: 0, fields: publicFields })).status, 403);
  assert.equal((await invitationRequest(publicationPath, member)).status, 403);
  assert.equal((await invitationRequest('/api/identity/events/event-one/invitation', member)).status, 404);
  assert.equal((await invitationRequest(publicationPath, owner)).data.fields.registrationRequired, true);
  assert.equal((await invitationRequest(publicationPath, owner)).data.fields.calendarEnabled, false);
  await fixtureDb.doc('sessions/event-one').update({ status: 'Draft', ownerEmail: 'PRIVATE', code: 'PRIVATE', createdAt: 1 });
  const published = await publishFixture('event-one', { title: publicFields.title });
  const preview = await invitationRequest(`/api/invitations/${published.token}`);
  assert.equal(preview.status, 200); assert.equal(preview.data.registrationRequired, true); assert.equal(preview.data.calendarEnabled, false);
  assert.equal(preview.data.startsAt, undefined);
  // Explicit publication works before live workshop stages.
  for (const uid of ['coadmin', 'platform']) {
    const token = await signInFixture(uid);
    const current = await invitationRequest(publicationPath, token);
    assert.equal(current.status, 200);
    assert.equal((await invitationRequest(`${publicationPath}/publish`, token, { revision: current.data.revision, fields: publicFields })).status, 200);
  }
  const current = (await invitationRequest(publicationPath, owner)).data;
  assert.equal((await invitationRequest(`${publicationPath}/publish`, owner, { revision: current.revision - 1, fields: publicFields })).status, 409);
  assert.equal((await invitationRequest(`${publicationPath}/publish`, owner, { revision: current.revision, fields: { ...publicFields, ownerEmail: 'PRIVATE' } })).status, 400);
  assert.equal((await invitationRequest(`${publicationPath}/publish`, owner, { revision: current.revision, fields: { title: 'Workshop', registrationRequired: false } })).status, 400);
  assert.equal((await invitationRequest(`${publicationPath}/publish`, owner, { revision: current.revision, fields: { ...publicFields, calendarEnabled: true, startLocal: '' } })).status, 400);
});

test('anonymous preview and calendar whitelist fields; reads never extend or register', async () => {
  const publication = await publishFixture();
  const token = publication.token;
  const beforePublication = (await fixtureDb.doc('eventPublications/event-one').get()).data();
  const beforeInvitation = (await fixtureDb.doc(`eventInvitations/${token}`).get()).data()!;
  const preview = await invitationRequest(`/api/invitations/${token}`);
  assert.deepEqual(Object.keys(preview.data).sort(), ['calendarEnabled', 'description', 'endsAt', 'expiresAt', 'registrationRequired', 'startsAt', 'timeZone', 'title', 'venue', 'viewingUrl'].sort());
  assert.doesNotMatch(JSON.stringify(preview.data), /PRIVATE|organizer|ownerId|event-one|createdAt|challenge|participant|adminEmails|currentToken/);
  assert.equal(preview.headers.get('cache-control'), 'no-store'); assert.equal(preview.headers.get('referrer-policy'), 'no-referrer');
  const calendar = await invitationRequest(`/api/invitations/${token}/calendar.ics`);
  assert.equal(calendar.status, 200); assert.match(calendar.data, /DTSTART:20261203T013000Z/);
  assert.match(calendar.headers.get('content-disposition')!, /attachment/);
  assert.doesNotMatch(calendar.data, /event-one|PRIVATE|ORGANIZER:|ATTENDEE:/);
  const shared = await invitationRequest('/api/identity/events/event-one/invitation', member);
  assert.equal(shared.data.token, token);
  assert.equal(beforeInvitation.expiresAt - beforeInvitation.createdAt, INVITATION_TTL_MS);
  assert.deepEqual((await fixtureDb.doc(`eventInvitations/${token}`).get()).data(), beforeInvitation);
  assert.deepEqual((await fixtureDb.doc('eventPublications/event-one').get()).data(), beforePublication);
  assert.equal((await fixtureDb.collection('registrations').get()).size, 0);
  assert.equal((await invitationRequest(`/api/identity/invitations/${token}/destination`, undefined, {})).status, 401);
  assert.deepEqual((await invitationRequest(`/api/identity/invitations/${token}/destination`, member, {})).data, { sessionId: 'event-one' });
  assert.equal((await fixtureDb.collection('registrations').get()).size, 0);
  for (const invalid of ['bad-token', 'b'.repeat(43)]) assert.equal((await invitationRequest(`/api/invitations/${invalid}`)).status, 404);
});

test('SDK denies invitation stores for anonymous, members and existing admins, with private rules intact', async () => {
  const published = (await invitationRequest(publicationPath, owner)).data;
  for (const database of [environment.unauthenticatedContext().firestore(), ...['member', 'organizer', 'platform'].map(uid => environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore())]) {
    for (const [store, record] of [['eventPublications', 'event-one'], ['eventInvitations', published.token]]) {
      await assertFails(getDoc(doc(database, store, record))); await assertFails(getDocs(collection(database, store))); await assertFails(setDoc(doc(database, store, record), { published: true }));
    }
  }
  const anonymous = environment.unauthenticatedContext().firestore();
  for (const path of ['sessions/event-one', 'profiles/member', 'challenges/event-one-challenge', 'sessionAccess/event-one']) await assertFails(getDoc(doc(anonymous, path)));
});

test('renew/revoke/unpublish/expiry/stale links fail closed across preview, calendar and post-auth destination', async () => {
  const original = await publishFixture();
  const uid = (await fixtureDb.doc('eventPublications/event-one').get()).data()!.calendarUid;
  async function unavailable(token: string) {
    for (const suffix of ['', '/calendar.ics']) assert.equal((await invitationRequest(`/api/invitations/${token}${suffix}`)).status, 404);
    assert.equal((await invitationRequest(`/api/identity/invitations/${token}/destination`, member, {})).status, 404);
  }
  assert.equal((await invitationRequest(`${publicationPath}/renew`, owner, { revision: original.revision })).status, 200);
  await unavailable(original.token);
  let current = (await invitationRequest(publicationPath, owner)).data;
  assert.notEqual(current.token, original.token);
  const stableExpiry = current.expiresAt;
  await publishFixture(); current = (await invitationRequest(publicationPath, owner)).data;
  assert.equal(current.expiresAt, stableExpiry);
  assert.equal((await invitationRequest(`${publicationPath}/revoke`, owner, { revision: current.revision })).status, 200);
  await unavailable(current.token);
  assert.equal((await invitationRequest('/api/identity/events/event-one/invitation', member)).status, 404);
  current = await publishFixture();
  assert.equal((await invitationRequest(`${publicationPath}/unpublish`, owner, { revision: current.revision })).status, 200);
  await unavailable(current.token);
  const republished = await publishFixture(); assert.notEqual(republished.token, current.token);
  const record = (await fixtureDb.doc(`eventInvitations/${republished.token}`).get()).data()!;
  const expiredCreation = Date.now() - INVITATION_TTL_MS - 1;
  await fixtureDb.doc(`eventInvitations/${republished.token}`).update({ createdAt: expiredCreation, expiresAt: expiredCreation + INVITATION_TTL_MS });
  await unavailable(republished.token);
  assert.equal((await invitationRequest('/api/identity/events/event-one/invitation', member)).status, 404);
  // Expiry does not affect the existing canonical verified registration flow.
  const registration = await callIdentity(member, 'register', { sessionId: 'event-one', adjective: 'Curious' }); assert.equal(registration.status, 200);
  assert.equal((await callIdentity(member, 'register', { sessionId: 'event-one' })).data.participantId, registration.data.participantId);
  assert.equal((await fixtureDb.doc('eventPublications/event-one').get()).data()!.calendarUid, uid);
  assert.equal(record.revoked, false);
});

test('calendar-only attendance never needs an account; changed flags preserve registrations and current UID', async () => {
  const registrations = (await fixtureDb.collection('registrations').get()).docs.map(record => record.data());
  const profiles = (await fixtureDb.collection('profiles').get()).docs.map(record => record.data());
  const current = await publishFixture('event-one', { ...publicFields, registrationRequired: false });
  const preview = await invitationRequest(`/api/invitations/${current.token}`);
  assert.equal(preview.data.registrationRequired, false); assert.equal(preview.data.calendarEnabled, true);
  assert.equal((await invitationRequest(`/api/invitations/${current.token}/calendar.ics`)).status, 200);
  assert.equal((await invitationRequest(`/api/identity/invitations/${current.token}/destination`, member, {})).status, 404);
  assert.deepEqual((await fixtureDb.collection('registrations').get()).docs.map(record => record.data()), registrations);
  assert.deepEqual((await fixtureDb.collection('profiles').get()).docs.map(record => record.data()), profiles);
  const results = await Promise.all([1, 2].map(() => invitationRequest(`${publicationPath}/renew`, owner, { revision: current.revision })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  await fixtureDb.doc('sessions/event-one').delete();
  const publication = (await fixtureDb.doc('eventPublications/event-one').get()).data()!;
  assert.equal((await invitationRequest(`/api/invitations/${publication.currentToken}`)).status, 404);
});
