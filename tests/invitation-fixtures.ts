import { fixtureDb, signInFixture } from './fixtures';
export const publicFields = { title: 'Community Design Day', description: 'A public invitation to build together.', venue: 'Community Hall · Level 2', viewingUrl: 'https://example.test/watch', startLocal: '2026-12-03T09:30', endLocal: '2026-12-03T17:00', timeZone: 'Asia/Singapore', registrationRequired: true, calendarEnabled: true };
export async function invitationRequest(route: string, token?: string, payload?: object) {
  const response = await fetch(`http://127.0.0.1:3000${route}`, {
    method: payload ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  return { status: response.status, headers: response.headers, data: response.headers.get('content-type')?.includes('text/calendar') ? await response.text() : await response.json() };
}
export async function publishFixture(sessionId = 'event-one', fields: object = publicFields) {
  const token = await signInFixture('organizer');
  const before = (await fixtureDb.doc(`eventPublications/${sessionId}`).get()).data();
  const result = await invitationRequest(`/api/identity/events/${sessionId}/publication/publish`, token, { revision: before?.revision || 0, fields });
  if (result.status !== 200) throw new Error(JSON.stringify(result));
  return (await invitationRequest(`/api/identity/events/${sessionId}/publication`, token)).data;
}
