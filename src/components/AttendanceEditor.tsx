import { useEffect, useState } from 'react';
import { identityRequest } from '../identity';

export default function AttendanceEditor({ sessionId, participants }: { sessionId: string; participants: any[] }) {
  const [memberUid, setMemberUid] = useState('');
  const [records, setRecords] = useState<any[]>([]);
  const [action, setAction] = useState('check-in');
  const [status, setStatus] = useState('attended');
  const [occurredAt, setOccurredAt] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const current = records.find(record => record.uid === memberUid);
  useEffect(() => {
    let live = true;
    identityRequest('event-attendance', { sessionId }).then(result => { if (live) setRecords(result.records); }).catch(issue => { if (live) setMessage(issue.message); });
    return () => { live = false; };
  }, [sessionId, refresh]);
  return <details className="border border-zinc-700 rounded-xl p-4"><summary>Verify attendance</summary>
    <p className="my-3">Registration is not attendance. Check in a member you verified, or record past attendance with its actual date and evidence. Another staff member must verify your own attendance.</p>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage('');
      try {
        await identityRequest('attendance', { sessionId, memberUid, requestId: crypto.randomUUID(), action, status, method: occurredAt || action === 'correct' ? 'manual_evidence' : 'staff_check_in', occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null, evidence, reason, expectedRevision: current?.revision || null });
        setMessage(action === 'correct' ? 'Attendance corrected.' : 'Attendance verified.'); setRefresh(value => value + 1);
      } catch (issue: any) { setMessage(issue.message); setRefresh(value => value + 1); } finally { setBusy(false); }
    }}>
      <label className="block">Attendance member<select required className="block bg-zinc-950 p-3" value={memberUid} onChange={event => { setMemberUid(event.target.value); setAction('check-in'); setReason(''); setEvidence(''); setOccurredAt(''); }}><option value="">Select registered member</option>{participants.filter(member => member.memberId && member.identityState !== 'deleted' && member.participationState !== 'inactive').map(member => <option key={member.id} value={member.memberId}>{member.name}</option>)}</select></label>
      <p>{current?.status === 'attended' ? 'Verified attended' : 'Attendance not verified'}{current && ` · Revision ${current.revision}`}</p>
      <label className="block">Attendance action<select className="block bg-zinc-950 p-3" value={action} onChange={event => setAction(event.target.value)}><option value="check-in">Check in</option><option value="correct" disabled={!current}>Correct existing attendance</option></select></label>
      {action === 'correct' && <><label className="block">Corrected attendance<select className="block bg-zinc-950 p-3" value={status} onChange={event => setStatus(event.target.value)}><option value="attended">Verified attended</option><option value="removed">Remove verification</option></select></label><label className="block">Correction reason<textarea required maxLength={1000} className="block w-full bg-zinc-950 p-3" value={reason} onChange={event => setReason(event.target.value)} /></label></>}
      <label className="block">Actual attendance date and time (your local timezone)<input type="datetime-local" required={action === 'correct'} className="block bg-zinc-950 p-3" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} /></label>
      <p className="text-sm">Leave blank only for a check-in happening now. Past events require the actual occurrence date; event creation and registration dates are not evidence.</p>
      <label className="block">Attendance evidence<textarea required={!!occurredAt || action === 'correct'} maxLength={2000} className="block w-full bg-zinc-950 p-3" value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
      <button disabled={busy || !memberUid} className="bg-emerald-700 p-3 rounded">{action === 'correct' ? 'Save attendance correction' : 'Verify member attendance'}</button><p role="status">{message}</p>
      {current && <details><summary>Attendance audit</summary>{current.audit?.map((entry: any) => <p className="text-sm my-2" key={entry.revision}>Revision {entry.revision} · {entry.status} · occurred {entry.occurredAt} · recorded {entry.recordedAt} · verifier {entry.staffUid || 'Deleted member'} · {entry.method} · {entry.reason} · {entry.evidence}</p>)}</details>}
    </form>
  </details>;
}
