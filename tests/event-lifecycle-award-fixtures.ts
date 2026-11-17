import assert from 'node:assert/strict';
import { callIdentity } from './fixtures';

export async function manageLifecycleAward(token: string, action: string, payload: object = {}) {
  const staff = await callIdentity(token, 'awards/staff', { sessionId: 'event-one' });
  assert.equal(staff.status, 200, JSON.stringify(staff));
  return callIdentity(token, 'awards/manage', { sessionId: 'event-one', expectedRevision: staff.data.state.revision, action, ...payload });
}

export async function seedLifecycleAwards(token: string, participantId: string) {
  async function issue(action: string, payload: object) {
    const result = await manageLifecycleAward(token, action, payload);
    assert.equal(result.status, 200, JSON.stringify(result)); return result.data.id as string;
  }
  const categoryId = await issue('category', { name: 'Retained achievement', kind: 'individual' });
  const correctedCategoryId = await issue('category', { name: 'Corrected historical achievement', kind: 'individual' });
  const resultId = await issue('draft', { categoryId, target: { participantId } });
  await issue('publish', { resultId });
  const draftId = await issue('draft', { categoryId, target: { participantId } });
  return { categoryId, correctedCategoryId, resultId, draftId };
}
