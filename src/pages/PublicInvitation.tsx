import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, MapPin, Video } from 'lucide-react';
import { PublicEvent, publishedDate } from '../utils/eventInvitation';
import { invitationApi } from '../utils/invitationApi';

export default function PublicInvitation() {
  const { token } = useParams();
  const [event, setEvent] = useState<PublicEvent | null>(null), [error, setError] = useState('');
  const [loadedToken, setLoadedToken] = useState('');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setEvent(null); setError('');
    fetch(`/api/invitations/${encodeURIComponent(token || '')}`, { signal: controller.signal, cache: 'no-store', referrerPolicy: 'no-referrer' }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Invitation unavailable.');
      if (active) { setEvent(result); setLoadedToken(token || ''); }
    }).catch(issue => { if (active && issue.name !== 'AbortError') setError(issue.message); });
    return () => { active = false; controller.abort(); };
  }, [token]);
  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(() => { setEvent(null); setError('Invitation expired. Ask the organizer for a current link.'); }, Math.max(0, event.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [event]);
  return <main className="min-h-screen bg-zinc-950 px-5 py-12 text-zinc-100"><article className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-xl">
    <div className="h-2 bg-emerald-400" /><div className="space-y-7 p-7 sm:p-10">
      <p className="text-sm font-semibold tracking-widest text-emerald-300">#HACK LIVE · YOU’RE INVITED</p>
      {error ? <><h1 className="text-3xl font-bold">Invitation unavailable</h1><p role="alert" className="text-zinc-300">{error}</p></> : !event || loadedToken !== token ? <p role="status">Loading invitation…</p> : <>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{event.title}</h1>
        {event.description && <p className="whitespace-pre-wrap leading-relaxed text-zinc-300">{event.description}</p>}
        <dl className="space-y-5 border-y border-zinc-800 py-6">
          {event.startsAt && <div className="flex gap-4"><CalendarDays className="shrink-0 text-emerald-300" aria-hidden="true" /><div><dt className="text-xs uppercase tracking-wider text-zinc-400">When</dt><dd>{publishedDate(event)}{event.endsAt && <span className="block text-sm text-zinc-400">Ends {publishedDate({ ...event, startsAt: event.endsAt })}</span>}</dd></div></div>}
          {event.venue && <div className="flex gap-4"><MapPin className="shrink-0 text-emerald-300" aria-hidden="true" /><div><dt className="text-xs uppercase tracking-wider text-zinc-400">Venue</dt><dd>{event.venue}</dd></div></div>}
          {event.viewingUrl && <div className="flex gap-4"><Video className="shrink-0 text-emerald-300" aria-hidden="true" /><div><dt className="text-xs uppercase tracking-wider text-zinc-400">Watch online</dt><dd><a href={event.viewingUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline">Open viewing link</a></dd></div></div>}
        </dl>
        <p className="text-sm text-zinc-300">{event.registrationRequired ? 'Register to attend. Sign in or create a profile, then confirm your event registration.' : 'No account or registration needed to attend.'}</p>
        <div className="flex flex-wrap gap-3">
          {event.registrationRequired && <Link to={`/invite/${token}/register`} className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-zinc-950">Register</Link>}
          {event.calendarEnabled && <a href={`/api/invitations/${token}/calendar.ics`} download="event.ics" className="rounded-xl border border-zinc-600 px-6 py-3 font-semibold hover:bg-zinc-800">Add to calendar</a>}
        </div>
        <p className="text-xs text-zinc-500">Invitation link expires {new Date(event.expiresAt).toLocaleString()}.</p>
      </>}
    </div></article></main>;
}
export function InvitationRegistration() {
  const { token } = useParams(), navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    invitationApi(`invitations/${encodeURIComponent(token || '')}/destination`, {}).then(result => {
      if (active) navigate(`/session/${encodeURIComponent(result.sessionId)}`, { replace: true });
    }).catch(issue => { if (active) setError(issue.message); });
    return () => { active = false; };
  }, [token, navigate]);
  return <main className="min-h-screen bg-zinc-950 p-8 text-zinc-100">{error ? <p role="alert">{error}</p> : <p role="status">Checking event invitation…</p>}</main>;
}
