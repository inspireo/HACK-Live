import { auth } from '../firebase';
export async function invitationApi(route: string, payload?: object) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/identity/${route}`, {
    method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}), cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Invitation unavailable.');
  return result;
}
