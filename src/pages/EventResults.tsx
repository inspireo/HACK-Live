import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { identityRequest } from '../identity';
import { AwardCard } from '../components/Achievements';
import type { AwardSummary } from '../../shared/awards';

export default function EventResults() {
  const { sessionId } = useParams();
  const [data, setData] = useState<{ finalized: boolean; awards: AwardSummary[] } | null>(null);
  const [message, setMessage] = useState('');
  const requestSequence = useRef(0);
  const refresh = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setMessage(''); setData(null);
    try { const result = await identityRequest('awards/event', { sessionId }); if (requestId === requestSequence.current) setData(result); }
    catch (issue: any) { if (requestId === requestSequence.current) setMessage(issue.message); }
  }, [sessionId]);
  useEffect(() => { refresh(); return () => { requestSequence.current++; }; }, [refresh]);
  return <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6"><div className="max-w-3xl mx-auto space-y-4"><h1 className="text-3xl font-bold">Official event results</h1>
    <p>Published awards are available to verified signed-in community members, independently of each recipient’s profile selections.</p>
    {data && <p>{data.finalized ? 'Results finalized. Staff corrections remain possible with an audit trail.' : 'Results are not yet finalized.'} An absent award does not indicate participation or a loss.</p>}
    <button className="underline" onClick={refresh}>Refresh results</button>
    {data?.awards.map(award => <article key={award.id}><AwardCard award={award} /><p className="text-sm text-zinc-400">Recipients at issue: {award.recipientNames.join(', ') || 'Team award only; no recorded personal credit.'}</p></article>)}
    {data?.awards.length === 0 && <p>No published awards recorded.</p>}
    {message && <p role="alert">{message}</p>}
  </div></main>;
}
