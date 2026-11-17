import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { identityRequest } from '../../identity';
import type { AwardCategory } from '../../../shared/awards';

const control = 'p-2 bg-zinc-900 border border-zinc-600 rounded-lg';
export default function AwardsTab({ sessionId, historicalOnly = false }: { sessionId: string; historicalOnly?: boolean }) {
  const [data, setData] = useState<{ state: { revision: number; finalized: boolean }; categories: AwardCategory[]; results: any[]; audits: any[] } | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('individual');
  const [categoryId, setCategoryId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [reason, setReason] = useState('');
  const [correctionCategory, setCorrectionCategory] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() { const result = await identityRequest('awards/staff', { sessionId }); setData(result); return result; }
  useEffect(() => {
    let current = true;
    setData(null); setCategoryId(''); setRecipient(''); setCorrectionCategory(''); setMessage('');
    Promise.all([identityRequest('awards/staff', { sessionId }), ...['participants', 'teams', 'discoveryTeams'].map(collectionName => getDocs(query(collection(db, collectionName), where('sessionId', '==', sessionId))))])
      .then(([result, members, solution, discovery]) => { if (!current) return; setData(result); setParticipants(members.docs.filter((record: any) => record.data().identityState !== 'deleted').map((record: any) => ({ id: record.id, ...record.data() })));
        setTeams([...[...solution.docs].map(record => ({ id: record.id, ...record.data(), collectionName: 'teams' })), ...[...discovery.docs].map(record => ({ id: record.id, ...record.data(), collectionName: 'discoveryTeams' }))]); })
      .catch(issue => { if (current) setMessage(issue.message); });
    return () => { current = false; };
  }, [sessionId]);
  async function mutate(action: string, payload: object = {}) {
    if (!data || (historicalOnly && !['correct', 'revoke'].includes(action))) return;
    setBusy(true); setMessage('');
    try { await identityRequest('awards/manage', { sessionId, action, expectedRevision: data.state.revision, ...payload }); await refresh(); setMessage('Results updated.'); }
    catch (issue: any) { setMessage(issue.message); try { await refresh(); } catch {} }
    finally { setBusy(false); }
  }
  const selected = data?.categories.find(category => category.id === categoryId);
  return <section className="space-y-6 p-4 text-zinc-100" aria-label="Award management">
    <h2 className="text-2xl font-bold">Official awards</h2>
    <p>{historicalOnly ? 'Participation is closed. Existing awards and private audits remain available to authorized staff for correction or revocation; new awards cannot be issued.' : 'Event staff issue awards here. Judge, mentor and team role labels grant no publishing permission. Past events can be backfilled after verifying records.'}</p>
    <p>Recipients and team membership freeze when published. Only safely linked verified accounts receive personal credit. Unlinked historical members remain explicitly uncredited.</p>
    <Link className="underline" to={`/results/${sessionId}`}>View official event results</Link>
    <p role="status">{message}</p>
    {data && <><p>{data.state.finalized ? 'Results finalized' : 'Results open'} · revision {data.state.revision}</p>
      <button className={control} disabled={busy} onClick={() => refresh().catch(issue => setMessage(issue.message))}>Refresh award management</button>
      {!historicalOnly && !data.state.finalized && <>
        <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); mutate('category', { name, kind }); }}>
          <label>Category name <input className={control} value={name} onChange={event => setName(event.target.value)} maxLength={100} required /></label>
          <label>Recipient kind <select className={control} value={kind} onChange={event => setKind(event.target.value)}><option value="individual">Individual</option><option value="team">Team</option></select></label>
          <button className={control} disabled={busy || !name.trim()}>Create category</button>
        </form>
        <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); const [collectionName, teamId] = recipient.split('~'); mutate('draft', { categoryId, target: selected?.kind === 'individual' ? { participantId: recipient } : { collectionName, teamId } }); }}>
          <label>Award category <select className={control} required value={categoryId} onChange={event => { setCategoryId(event.target.value); setRecipient(''); }}><option value="">Choose category</option>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name} ({category.kind})</option>)}</select></label>
          <label>Award recipient <select className={control} required value={recipient} onChange={event => setRecipient(event.target.value)}><option value="">Choose recipient</option>{selected?.kind === 'individual' ? participants.map(member => <option key={member.id} value={member.id}>{member.name} · {member.id}</option>) : selected?.kind === 'team' ? teams.map(team => <option key={`${team.collectionName}~${team.id}`} value={`${team.collectionName}~${team.id}`}>{team.name || 'Unnamed team'} ({team.collectionName})</option>) : null}</select></label>
          <button className={control} disabled={busy || !recipient || !selected}>Save draft award</button>
        </form>
        <p>Multiple winners: add another draft in the same category. Drafts are visible only to event staff.</p>
      </>}
      <label className="block">Private audit reason <input className={control} value={reason} onChange={event => setReason(event.target.value)} maxLength={100} /></label>
      <label className="block">Correction category <select className={control} value={correctionCategory} onChange={event => setCorrectionCategory(event.target.value)}><option value="">Choose corrected category</option>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name} ({category.kind})</option>)}</select></label>
      <p>{historicalOnly ? 'Corrections retain original recipients, event and team snapshots. An incorrect recipient can be revoked; new issuance is closed for this deleted event.' : 'Corrections retain original recipients, event and team snapshots. For an incorrect recipient, revoke the award, reopen results if necessary, then issue a replacement.'}</p>
      <div className="space-y-4">{data.results.map(result => <article key={result.id} data-testid={`award-${result.id}`} className="p-4 border border-zinc-700 rounded-lg space-y-2">
        <h3 className="font-bold">{result.snapshot?.categoryName || data.categories.find(category => category.id === result.categoryId)?.name} · {result.status}</h3>
        <p>{result.snapshot?.team?.name || result.target?.participantId || result.target?.teamId || 'Anonymized recipient'}</p>
        {result.snapshot && <ul>{result.snapshot.recipients.map((member: any, position: number) => <li key={position}>{member.name} ({member.credit})</li>)}</ul>}
        {result.snapshot?.recipients.length === 0 && <p>Team award only: no recorded recipients receive personal credit.</p>}
        {!historicalOnly && result.status === 'draft' && <><button className={control} disabled={busy || data.state.finalized} onClick={() => mutate('publish', { resultId: result.id })}>Publish award</button> <button className={control} disabled={busy || data.state.finalized} onClick={() => mutate('discard', { resultId: result.id })}>Discard draft</button></>}
        {result.status === 'published' && <><button className={control} disabled={busy || !reason.trim() || !data.categories.some(category => category.id === correctionCategory && category.kind === result.kind)} onClick={() => mutate('correct', { resultId: result.id, categoryId: correctionCategory, reason })}>Correct category</button> <button className={control} disabled={busy || !reason.trim()} onClick={() => mutate('revoke', { resultId: result.id, reason })}>Revoke award</button></>}
      </article>)}</div>
      {!historicalOnly && <button className={control} disabled={busy || (data.state.finalized && !reason.trim())} onClick={() => mutate(data.state.finalized ? 'reopen' : 'finalize', data.state.finalized ? { reason } : {})}>{data.state.finalized ? 'Reopen results' : 'Finalize results'}</button>}
      <p>Finalization explicitly closes award entry. It makes no claim about who competed or lost. Corrections and revocations remain audited.</p>
      <details><summary>Staff audit trail</summary>{[...data.audits].sort((left, right) => right.revision - left.revision).map(audit => <p key={audit.id}>Revision {audit.revision} · {audit.action} · {audit.at} · {audit.actorUid || 'Deleted actor'}{audit.reason && ` · ${audit.reason}`}</p>)}</details>
    </>}
  </section>;
}
