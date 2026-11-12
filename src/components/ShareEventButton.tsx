import { useId, useRef, useState } from 'react';
import { Share2 } from 'lucide-react';
import { buildEventInvitation, shareEventInvitation } from '../utils/eventInvitation';

interface ShareEventButtonProps {
  sessionId: string;
  publicTitle: unknown;
  stage: unknown;
}

export default function ShareEventButton({ sessionId, publicTitle, stage }: ShareEventButtonProps) {
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const inFlight = useRef(false);
  const feedbackId = useId();
  const invitationId = useId();
  const invitation = buildEventInvitation(sessionId, publicTitle, stage, window.location.origin);
  if (!invitation) return null;

  const handleShare = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFeedback('');
    setManualCopy(false);
    const result = await shareEventInvitation(invitation, {
      share: navigator.share ? payload => navigator.share(payload) : undefined,
      copy: navigator.clipboard?.writeText ? invitationText => navigator.clipboard.writeText(invitationText) : undefined,
    });
    setFeedback(result === 'shared' ? 'Event invitation shared.'
      : result === 'copied' ? 'Event invitation copied. Paste it to invite friends.'
      : result === 'manual' ? 'Select and copy the invitation below to invite friends.' : '');
    setManualCopy(result === 'manual');
    inFlight.current = false;
    setPending(false);
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={handleShare} disabled={pending} aria-describedby={feedbackId}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50">
        <Share2 size={16} aria-hidden="true" /> {pending ? 'Sharing…' : 'Share event'}
      </button>
      <p id={feedbackId} role="status" aria-live="polite" aria-atomic="true" className="text-sm text-emerald-300">{feedback}</p>
      {manualCopy && (
        <div className="space-y-2">
          <label htmlFor={invitationId} className="block text-sm text-zinc-300">Event invitation</label>
          <textarea id={invitationId} readOnly value={invitation.fullText} rows={5}
            onFocus={event => event.currentTarget.select()}
            className="w-full rounded-xl border border-zinc-600 bg-zinc-950 p-3 text-sm text-zinc-100 focus-visible:outline-emerald-400" />
        </div>
      )}
    </div>
  );
}
