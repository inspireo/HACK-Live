// These are active participant stages, not a publication flag. Draft is also the
// initial setup state, so do not promote it (or unknown/closed states) via shares.
const INVITABLE_STAGES = new Set([
  'Opening', 'ResourcesOnly', 'Focus Areas', 'Discovery Team Formation',
  'Challenge Drafting', 'Challenge Discovery', 'Challenge Proposing',
  'Challenge Voting', 'Voting Review', 'Published Challenges',
  'Challenge Selection Open', 'Selection Locked', 'Team Formation',
  'Team Assignment In Progress', 'Team Naming Open', 'Team Naming Locked',
  'Live', 'Presentations',
]);

export interface EventInvitation {
  title: string;
  text: string;
  url: string;
  fullText: string;
}

// Only the title already displayed on the participant join screen is accepted.
// Never serialize the session: it also contains owner/admin emails and join codes.
// No published date/venue fields exist in the current model; createdAt is not an event date.
export function buildEventInvitation(
  sessionId: string,
  publicTitle: unknown,
  stage: unknown,
  origin: string,
): EventInvitation | null {
  if (typeof stage !== 'string' || !INVITABLE_STAGES.has(stage) || !sessionId) return null;
  const site = new URL(origin);
  if (!['https:', 'http:'].includes(site.protocol)) return null;
  const title = typeof publicTitle === 'string'
    ? publicTitle.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  // Avoid carrying links, markup or contact details embedded in a title into the message.
  const safeTitle = title && title.length <= 160 && !/[<>@]|https?:|www\./i.test(title)
    ? title : '#HACK Live workshop';
  const url = new URL(`/session/${encodeURIComponent(sessionId)}`, site.origin).href;
  const text = `Join me at ${safeTitle}! Come collaborate with us on #HACK Live.`;
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
