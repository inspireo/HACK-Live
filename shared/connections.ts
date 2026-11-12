import { contactFields, type ProfileDetails, type ContactField } from './profile';

export type ConnectionState = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'removed' | 'blocked';
export type ConnectionCore = { requester: string; generation: string; state: ConnectionState };
export type ConnectionView = ConnectionCore & { pairId: string; peerUid: string; unread: boolean };
export const connectionActions = ['request', 'accept', 'decline', 'cancel', 'unfriend', 'block', 'seen'] as const;
export type ConnectionAction = typeof connectionActions[number];
export function contactProjection(details: ProfileDetails): Partial<Record<ContactField, string>> {
  return Object.fromEntries(contactFields.filter(field => details.connectionFields.includes(field) && details.contacts[field]).map(field => [field, details.contacts[field]]));
}
export function nextConnectionState(action: ConnectionAction, actor: string, current?: ConnectionCore): ConnectionState {
  if (action === 'block') return 'blocked';
  if (action === 'request') {
    if (current?.state === 'blocked') throw new Error('Connection unavailable.');
    if (current?.state === 'pending' || current?.state === 'accepted') return current.state;
    return 'pending';
  }
  if (!current) throw new Error('Connection changed. Refresh and try again.');
  if (action === 'seen') return current.state;
  if (action === 'unfriend' && current.state === 'accepted') return 'removed';
  if (current.state === 'pending') {
    if (action === 'cancel' && current.requester === actor) return 'cancelled';
    if (current.requester !== actor && action === 'accept') return 'accepted';
    if (current.requester !== actor && action === 'decline') return 'declined';
  }
  throw new Error('This action is not available.');
}
