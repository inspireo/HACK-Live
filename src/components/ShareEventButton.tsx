import { useEffect, useId, useRef, useState } from 'react';
import { Share2 } from 'lucide-react';
import { buildEventInvitation, EventInvitation, shareEventInvitation } from '../utils/eventInvitation';
import { invitationApi } from '../utils/invitationApi';

export default function ShareEventButton({ sessionId }: { sessionId: string }) {
  const [feedback, setFeedback] = useState('');
  const [prepared, setPrepared] = useState<{ sessionId: string; invitation: EventInvitation; expiresAt: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const inFlight = useRef(false);
  const preparedKey = useRef('');
  preparedKey.current = `${sessionId}:${prepared?.sessionId === sessionId ? prepared.invitation.url : ''}`;
  const feedbackId = useId(), invitationId = useId();
  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    setPrepared(null); setManualCopy(false); setLoading(true); setFeedback('');
    const load = async () => {
      const requestNumber = ++latestRequest;
      try {
        const result = await invitationApi(`events/${encodeURIComponent(sessionId)}/invitation`);
        const invitation = buildEventInvitation(result.token, result.event, window.location.origin);
        if (active && requestNumber === latestRequest) { setPrepared(invitation ? { sessionId, invitation, expiresAt: result.event.expiresAt } : null); setFeedback(''); setManualCopy(false); }
      } catch (issue) { if (active && requestNumber === latestRequest) { setPrepared(null); setManualCopy(false); setFeedback((issue as Error).message); } }
      finally { if (active && requestNumber === latestRequest) setLoading(false); }
    };
    void load();
    const refresh = () => { setPrepared(null); setLoading(true); void load(); };
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [sessionId]);
  useEffect(() => {
    if (!prepared) return;
    const timer = setTimeout(() => { setPrepared(null); setManualCopy(false); setFeedback('Invitation expired. Ask the organizer to renew it.'); }, Math.max(0, prepared.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [prepared]);
  const current = prepared?.sessionId === sessionId ? prepared : null;
  const handleShare = async () => {
    if (inFlight.current || !current) return;
    if (Date.now() >= current.expiresAt) { setPrepared(null); setFeedback('Invitation expired. Ask the organizer to renew it.'); return; }
    inFlight.current = true; setPending(true); setFeedback(''); setManualCopy(false);
    const sharingKey = preparedKey.current;
    // Read-only preparation is complete. Native share executes in this click stack.
    const result = await shareEventInvitation(current.invitation, {
      share: navigator.share ? payload => navigator.share(payload) : undefined,
      copy: navigator.clipboard?.writeText ? invitationText => navigator.clipboard.writeText(invitationText) : undefined,
    });
    if (sharingKey === preparedKey.current) {
      setFeedback(result === 'shared' ? 'Event invitation shared.' : result === 'copied' ? 'Event invitation copied. Paste it to invite friends.' : result === 'manual' ? 'Select and copy the invitation below to invite friends.' : '');
      setManualCopy(result === 'manual');
    }
    inFlight.current = false; setPending(false);
  };
  return <div className="space-y-2">
    <button type="button" onClick={handleShare} disabled={pending || !current} aria-describedby={feedbackId}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50">
      <Share2 size={16} aria-hidden="true" /> {loading ? 'Preparing invitation…' : pending ? 'Sharing…' : 'Share event'}
    </button>
    <p id={feedbackId} role="status" aria-live="polite" aria-atomic="true" className="text-sm text-emerald-300">{feedback}</p>
    {manualCopy && current && <div className="space-y-2"><label htmlFor={invitationId} className="block text-sm text-zinc-300">Event invitation</label>
      <textarea id={invitationId} readOnly value={current.invitation.fullText} rows={5} onFocus={event => event.currentTarget.select()}
        className="w-full rounded-xl border border-zinc-600 bg-zinc-950 p-3 text-sm text-zinc-100 focus-visible:outline-emerald-400" /></div>}
  </div>;
}
