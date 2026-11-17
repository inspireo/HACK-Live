export interface EventInvitation {
  title: string;
  text: string;
  url: string;
  fullText: string;
}

export interface PublicEvent {
  title: string; description?: string; venue?: string; viewingUrl?: string;
  startsAt?: string; endsAt?: string; timeZone?: string;
  registrationRequired: boolean; calendarEnabled: boolean; expiresAt: number;
}
export function publishedDate(event: Pick<PublicEvent, 'startsAt' | 'endsAt' | 'timeZone'>) {
  if (!event.startsAt || !event.timeZone) return '';
  try { return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: event.timeZone }).format(new Date(event.startsAt)) + ` (${event.timeZone})`; }
  catch { return ''; }
}
// Accept only the server's whitelisted publication and capability, never a session.
export function buildEventInvitation(token: string, event: PublicEvent, origin: string): EventInvitation | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const site = new URL(origin);
  if (!['https:', 'http:'].includes(site.protocol)) return null;
  const title = typeof event.title === 'string'
    ? event.title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  // Avoid carrying links, markup or contact details embedded in a title into the message.
  const hasEmailAddress = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(title);
  const safeTitle = title && title.length <= 160 && !/[<>]|https?:|www\./i.test(title) && !hasEmailAddress
    ? title : '#HACK Live workshop';
  const url = new URL(`/invite/${token}`, site.origin).href;
  const date = publishedDate(event);
  const text = `Join me at ${safeTitle}!${date ? ` ${date}.` : ''} Come collaborate with us on #HACK Live.`;
  return { title: safeTitle, text, url, fullText: `${text}\n${url}` };
}

export interface InvitationSharePlatform {
  share?: (payload: ShareData) => Promise<void>;
  copy?: (invitationText: string) => Promise<void>;
}

export type InvitationShareResult = 'shared' | 'copied' | 'cancelled' | 'manual';

// Called synchronously by the click handler: no async work before native share,
// which needs the browser's transient user activation on mobile.
export async function shareEventInvitation(
  invitation: EventInvitation,
  platform: InvitationSharePlatform,
): Promise<InvitationShareResult> {
  if (platform.share) {
    try {
      await platform.share({ title: invitation.title, text: invitation.text, url: invitation.url });
      return 'shared';
    } catch (failure) {
      if (failure && typeof failure === 'object' && 'name' in failure && failure.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  try {
    if (platform.copy) {
      await platform.copy(invitation.fullText);
      return 'copied';
    }
  } catch {
    // Clipboard can be denied after share fails or in an insecure browser.
  }
  return 'manual';
}
