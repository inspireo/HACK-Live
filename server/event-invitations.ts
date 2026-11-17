import { Temporal } from '@js-temporal/polyfill';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export interface PublishedEvent {
  title: string; description?: string; venue?: string; viewingUrl?: string;
  startLocal?: string; endLocal?: string; startsAt?: string; endsAt?: string; timeZone?: string;
  registrationRequired: boolean; calendarEnabled: boolean;
}
const allowed = new Set(['title', 'description', 'venue', 'viewingUrl', 'startLocal', 'endLocal', 'timeZone', 'registrationRequired', 'calendarEnabled']);
export function validatePublication(payload: unknown): PublishedEvent {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !allowed.has(key))) throw new Error('Use only the public event fields.');
  const values = payload as Record<string, unknown>;
  const text = (key: string, maximum: number, multiline = false) => {
    const value = values[key];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.trim().length > maximum || /[<>]/.test(value) || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) throw new Error(`Invalid public ${key}.`);
    return value.trim() || undefined;
  };
  for (const key of ['registrationRequired', 'calendarEnabled']) if (values[key] !== undefined && typeof values[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
  const title = text('title', 160);
  if (!title) throw new Error('A public event title is required.');
  const publication: PublishedEvent = { title, registrationRequired: values.registrationRequired !== false, calendarEnabled: values.calendarEnabled === true };
  if (!publication.registrationRequired && !publication.calendarEnabled) throw new Error('Choose Register, Add to calendar, or both.');
  const description = text('description', 4000, true), venue = text('venue', 500), viewingUrl = text('viewingUrl', 2000);
  if (description) publication.description = description;
  if (venue) publication.venue = venue;
  if (viewingUrl) {
    let link: URL;
    try { link = new URL(viewingUrl); } catch { throw new Error('Use a valid HTTPS viewing URL.'); }
    if (link.protocol !== 'https:' || link.username || link.password || /\s/.test(viewingUrl)) throw new Error('Use a valid HTTPS viewing URL without credentials.');
    publication.viewingUrl = link.href;
  }
  const startLocal = text('startLocal', 16), endLocal = text('endLocal', 16), timeZone = text('timeZone', 100);
  if (publication.calendarEnabled || startLocal || endLocal || timeZone) {
    if (!startLocal || !endLocal || !timeZone || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startLocal) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endLocal) || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)$/.test(timeZone)) throw new Error('Provide start, end and an explicit IANA timezone.');
    try {
      const start = Temporal.ZonedDateTime.from(`${startLocal}[${timeZone}]`, { overflow: 'reject', disambiguation: 'reject' });
      const end = Temporal.ZonedDateTime.from(`${endLocal}[${timeZone}]`, { overflow: 'reject', disambiguation: 'reject' });
      if (start.year < 1970 || end.year > 9999 || end.epochMilliseconds <= start.epochMilliseconds) throw new Error();
      Object.assign(publication, { startLocal, endLocal, timeZone, startsAt: start.toInstant().toString(), endsAt: end.toInstant().toString() });
    } catch { throw new Error('Use valid, unambiguous local times with end after start in the selected timezone.'); }
  }
  return publication;
}

// Construct explicitly. Never spread database documents into a public response.
export function publicProjection(publication: PublishedEvent, expiresAt: number) {
  return { title: publication.title, ...(publication.description ? { description: publication.description } : {}),
    ...(publication.venue ? { venue: publication.venue } : {}), ...(publication.viewingUrl ? { viewingUrl: publication.viewingUrl } : {}),
    ...(publication.startsAt && publication.endsAt && publication.timeZone ? { startsAt: publication.startsAt, endsAt: publication.endsAt, timeZone: publication.timeZone } : {}),
    registrationRequired: publication.registrationRequired !== false, calendarEnabled: publication.calendarEnabled === true, expiresAt };
}
export function isCurrentInvitation(token: string, invitation: any, publication: any, now: number) {
  return !!invitation && !!publication && publication.published === true && publication.currentToken === token && invitation.revoked === false
    && Number.isSafeInteger(invitation.createdAt) && Number.isSafeInteger(invitation.expiresAt)
    && invitation.expiresAt === invitation.createdAt + INVITATION_TTL_MS && now >= invitation.createdAt && now < invitation.expiresAt;
}
const escapeCalendarText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const utcCalendarTime = (value: string) => value.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
function foldCalendarLine(value: string) {
  let output = '', currentBytes = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character, 'utf8');
    if (currentBytes + bytes > 75) { output += '\r\n '; currentBytes = 1; }
    output += character; currentBytes += bytes;
  }
  return output;
}
export function buildCalendar(publication: PublishedEvent, calendarUid: string, updatedAt: number) {
  if (!publication.calendarEnabled || !publication.startsAt || !publication.endsAt || !publication.timeZone || !/^[a-f0-9-]{36}$/.test(calendarUid)) throw new Error('Calendar unavailable.');
  const description = [publication.description, `Event timezone: ${publication.timeZone}`, publication.viewingUrl].filter(Boolean).join('\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HACK Live//Event invitation//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${calendarUid}@hack-live`, `DTSTAMP:${utcCalendarTime(new Date(updatedAt).toISOString())}`,
    `DTSTART:${utcCalendarTime(publication.startsAt)}`, `DTEND:${utcCalendarTime(publication.endsAt)}`,
    `SUMMARY:${escapeCalendarText(publication.title)}`, `DESCRIPTION:${escapeCalendarText(description)}`,
    ...(publication.venue ? [`LOCATION:${escapeCalendarText(publication.venue)}`] : []),
    ...(publication.viewingUrl ? [`URL:${publication.viewingUrl}`] : []), 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
