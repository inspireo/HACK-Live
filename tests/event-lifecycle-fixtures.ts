import assert from 'node:assert/strict';
import { callIdentity, clearFixtures, createFixtureUser, seedEvents, signInFixture } from './fixtures';

export async function seedLifecycle() {
  await clearFixtures(); await seedEvents();
  const tokens: Record<string, string> = {};
  for (const uid of ['organizer', 'coadmin', 'member', 'newcomer', 'outsider']) {
    await createFixtureUser(uid); tokens[uid] = await signInFixture(uid);
  }
  const registration = await callIdentity(tokens.member, 'register', { sessionId: 'event-one' });
  assert.equal(registration.status, 200, JSON.stringify(registration));
  return { tokens, participantId: registration.data.participantId as string };
}

export async function deleteLifecycleEvent(token: string) {
  const result = await callIdentity(token, 'events/event-one/soft-delete');
  assert.equal(result.status, 200, JSON.stringify(result));
}
