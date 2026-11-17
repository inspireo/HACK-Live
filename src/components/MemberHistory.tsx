import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { identityRequest } from '../identity';

type Entry = { sessionId: string; eventName: string; eventDate: string | null; registered: boolean; attendanceStatus: string; occurredAt: string | null; visible?: boolean; recordedAt?: string; method?: string; audit?: { revision: number; action: string; staffUid?: string; method: string; status: string; occurredAt: string; recordedAt: string; reason: string; evidence: string }[] };
export default function MemberHistory({ memberUid, sessionId }: { memberUid?: string; sessionId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const own = !memberUid || memberUid === auth.currentUser?.uid;
  useEffect(() => {
    let current = true;
    setEntries([]); setMessage('Loading event history…');
    identityRequest('member-history', memberUid ? { memberUid } : {}).then(result => {
      if (current) { setEntries(result.entries.filter((entry: Entry) => !sessionId || entry.sessionId === sessionId)); setMessage(''); }
    }).catch(issue => { if (current) setMessage(issue.message); });
    return () => { current = false; };
  }, [memberUid, sessionId, revision]);
  useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);
  return <section className="my-4 space-y-3" aria-label={sessionId ? 'Event attendance' : 'Event history'}>
    <h2 className="text-xl font-semibold">{sessionId ? 'Your attendance' : 'Event history'}</h2>
    {own && !sessionId && <p className="text-sm">Select which history entries to show on your profile. Event rosters and official results may independently show participation. Attendance times and verification details stay protected; choosing an entry shares its safe summary and attendance occurrence, never its private audit.</p>}
    {entries.map(entry => <article key={entry.sessionId} className="border border-zinc-700 rounded p-3 space-y-2">
      {!sessionId && <h3 className="font-semibold">{entry.eventName}</h3>}
      <p>{entry.registered ? 'Registered' : 'Historical registration'} · {entry.attendanceStatus === 'verified-attended' ? 'Verified attended' : 'Attendance not verified'}</p>
      <p>Event date: {entry.eventDate || 'Unknown'}</p>
      {entry.occurredAt && <p>Attendance occurred: <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString()}</time></p>}
      {own && entry.recordedAt && <p className="text-sm">Recorded: {new Date(entry.recordedAt).toLocaleString()} · {entry.method?.replaceAll('_', ' ')}</p>}
      {own && !sessionId && <label className="block"><input type="checkbox" disabled={busy} checked={!!entry.visible} onChange={async event => {
        const visible = event.target.checked; setBusy(true); setMessage('');
        try { await identityRequest('history-visibility', { sessionId: entry.sessionId, visible }); setRevision(value => value + 1); }
        catch (issue: any) { setMessage(issue.message); } finally { setBusy(false); }
      }} /> Show {entry.eventName} on profile</label>}
      {own && !sessionId && !!entry.audit?.length && <details><summary>Verification and correction history</summary>{entry.audit.map(change => <div key={change.revision} className="my-2 text-sm"><p>Revision {change.revision}: {change.action} · {change.status} · Verifier {change.staffUid || 'Deleted member'} · {change.method.replaceAll('_', ' ')} · Occurred {change.occurredAt} · Recorded {change.recordedAt}</p>{change.reason && <p>Reason: {change.reason}</p>}{change.evidence && <p>Evidence: {change.evidence}</p>}</div>)}</details>}
    </article>)}
    {!entries.length && !message && <p>{sessionId ? 'Attendance not verified.' : own ? 'No event history yet.' : 'No shared event history.'}</p>}
    {message && <p role="status">{message}</p>}<button className="text-sm underline" onClick={() => setRevision(value => value + 1)}>Refresh {sessionId ? 'attendance' : 'history'}</button>
  </section>;
}
