import { contactFields, normalizeContactPhone, normalizeTelegram, type ProfileDetails, type ContactField } from './profile';

export type ConnectionState = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'removed' | 'blocked';
export type ConnectionCore = { requester: string; generation: string; state: ConnectionState };
export type ConnectionView = ConnectionCore & { pairId: string; peerUid: string; unread: boolean };
export const connectionActions = ['request', 'accept', 'decline', 'cancel', 'unfriend', 'block', 'seen'] as const;
export type ConnectionAction = typeof connectionActions[number];
// Snapshot data and legacy selections are runtime input, not trustworthy TS casts.
export function selectedContactFields(selection: unknown): ContactField[] {
  return Array.isArray(selection) ? contactFields.filter(field => selection.includes(field)) : [];
}
export function selectedContacts(values: unknown): Partial<Record<ContactField, string>> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  const contacts = values as Record<string, unknown>;
  return Object.fromEntries(contactFields.filter(field => typeof contacts[field] === 'string' && (contacts[field] as string).trim()).map(field => [field, contacts[field]]));
}
export function contactProjection(details: ProfileDetails): Partial<Record<ContactField, string>> {
  const contacts = selectedContacts(details?.contacts);
  // Missing mode means independent. Linked mode never grants either selection.
  if (details?.whatsappUsesMobile === true) {
    delete contacts.whatsapp;
    if (contacts.phone) contacts.whatsapp = contacts.phone;
  }
  return Object.fromEntries(selectedContactFields(details?.connectionFields).filter(field => contacts[field]).map(field => [field, contacts[field]]));
}
// Legacy values can stay visible as text; only recognized routes become links.
// No permission, lookup, app detection or navigation occurs during rendering.
export function contactHref(field: ContactField, value: string): string | undefined {
  if (typeof value !== 'string' || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  try {
    if (field === 'phone' || field === 'whatsapp') {
      const phone = normalizeContactPhone(value);
      return field === 'phone' ? `tel:${phone}` : `https://wa.me/${phone.slice(1)}`;
    }
    if (field === 'telegram') return `https://t.me/${normalizeTelegram(value).slice(1)}`;
    // Deliberately narrow bare email syntax: URI query/fragment delimiters and
    // percent escapes must never become mail headers or injected recipients.
    if (field === 'contactEmail' && value.length <= 254) {
      const [localPart, domain, extra] = value.split('@');
      if (!extra && localPart?.length <= 64 && /^[a-zA-Z0-9!$'*+_~-]+(?:\.[a-zA-Z0-9!$'*+_~-]+)*$/.test(localPart) && domain?.includes('.') && domain.split('.').every(label => label.length <= 63 && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label))) return `mailto:${encodeURIComponent(localPart)}@${domain}`;
    }
  } catch { /* Correctable legacy value remains plain text. */ }
  return undefined;
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
