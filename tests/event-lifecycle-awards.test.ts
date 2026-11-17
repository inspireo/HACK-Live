import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { callIdentity, fixtureDb } from './fixtures';
import { deleteLifecycleEvent, seedLifecycle } from './event-lifecycle-fixtures';
import { manageLifecycleAward, seedLifecycleAwards } from './event-lifecycle-award-fixtures';

let fixture: Awaited<ReturnType<typeof seedLifecycle>>;
beforeEach(async () => { fixture = await seedLifecycle(); });

test('soft-deleted event retains wins and private audits, allows authorized correction/revoke, rejects new issuance', async () => {
  const { tokens, participantId } = fixture;
  const { categoryId, correctedCategoryId, resultId, draftId } = await seedLifecycleAwards(tokens.organizer, participantId);
  assert.equal((await callIdentity(tokens.member, 'awards/visibility', { resultId, visibleOnProfile: true })).status, 200);
  const original = (await fixtureDb.doc(`awardResults/${resultId}`).get()).data()!;
  const auditCount = (await fixtureDb.collection('awardAudits').get()).size;
  await deleteLifecycleEvent(tokens.organizer);
  assert.deepEqual((await fixtureDb.doc(`awardResults/${resultId}`).get()).data(), original);
  assert.ok((await fixtureDb.doc(`memberAchievements/member/awards/${resultId}`).get()).exists);
  const requests: [string, object][] = [
    ['category', { name: 'New forbidden award', kind: 'individual' }],
    ['draft', { categoryId, target: { participantId } }],
    ['publish', { resultId: draftId }], ['discard', { resultId: draftId }],
    ['finalize', {}], ['reopen', { reason: 'Cannot reopen deleted event' }],
  ];
  for (const [action, payload] of requests) {
    assert.equal((await manageLifecycleAward(tokens.organizer, action, payload)).status, 404, action);
  }
  assert.equal((await fixtureDb.collection('awardAudits').get()).size, auditCount);
  for (const [actor, payload] of [['member', {}], ['outsider', { memberId: 'member' }]] as const) {
    const wins = await callIdentity(tokens[actor], 'awards/member', payload);
    assert.equal(wins.status, 200); assert.equal(wins.data.awards.length, 1);
    assert.equal(wins.data.awards[0].id, resultId);
  }
  assert.equal((await callIdentity(tokens.outsider, 'awards/staff', { sessionId: 'event-one' })).status, 403);
  const staff = await callIdentity(tokens.organizer, 'awards/staff', { sessionId: 'event-one' });
  const correction = { sessionId: 'event-one', expectedRevision: staff.data.state.revision, action: 'correct', resultId, categoryId: correctedCategoryId, reason: 'Private retained history correction' };
  assert.equal((await callIdentity(tokens.outsider, 'awards/manage', correction)).status, 403);
  assert.equal((await callIdentity(tokens.coadmin, 'awards/manage', correction)).status, 200);
  assert.equal((await callIdentity(tokens.organizer, 'awards/manage', correction)).status, 409);
  const corrected = (await fixtureDb.doc(`awardResults/${resultId}`).get()).data()!;
  assert.deepEqual(corrected.snapshot.recipients, original.snapshot.recipients);
  assert.equal(corrected.snapshot.eventName, original.snapshot.eventName);
  assert.equal(corrected.snapshot.categoryName, 'Corrected historical achievement');
  assert.equal((await fixtureDb.doc(`memberAchievements/member/awards/${resultId}`).get()).data()!.visibleOnProfile, true);
  const eventResults = await callIdentity(tokens.outsider, 'awards/event', { sessionId: 'event-one' });
  assert.equal(eventResults.status, 200); assert.equal(eventResults.data.awards[0].id, resultId);
  assert.doesNotMatch(JSON.stringify(eventResults.data), /Private|reason|audit|actorUid|subjectUids/);
  assert.equal((await manageLifecycleAward(tokens.organizer, 'revoke', { resultId, reason: 'Private historical revocation' })).status, 200);
  assert.equal((await fixtureDb.doc(`awardResults/${resultId}`).get()).data()!.status, 'revoked');
  assert.equal((await fixtureDb.collection('awardAudits').get()).size, auditCount + 2);
  assert.deepEqual((await callIdentity(tokens.member, 'awards/member')).data.awards, []);
  assert.ok((await fixtureDb.doc(`participants/${participantId}`).get()).exists);
  assert.ok((await fixtureDb.doc('registrations/event-one~member').get()).exists);
});
