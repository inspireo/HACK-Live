import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { identityRequest } from '../identity';
import { AwardCard } from '../components/Achievements';
import type { AwardSummary } from '../../shared/awards';

export default function EventResults() {
  const { sessionId } = useParams();
  const [data, setData] = useState<{ finalized: boolean; awards: AwardSummary[] } | null>(null);
  const [message, setMessage] = useState('');
  async function refresh() { setMessage(''); setData(null); try { setData(await identityRequest('awards/event', { sessionId })); } catch (issue: any) { setMessage(issue.message); } }
  useEffect(() => { refresh(); }, [sessionId]);
  return <main className="max-w-3xl mx-auto p-6 text-zinc-100 space-y-4"><h1 className="text-3xl font-bold">Official event results</h1>
    <p>Published awards are available to verified signed-in community members, independently of each recipient’s profile selections.</p>
    {data && <p>{data.finalized ? 'Results finalized. Staff corrections remain possible with an audit trail.' : 'Results are not yet finalized.'} An absent award does not indicate participation or a loss.</p>}
    <button className="underline" onClick={refresh}>Refresh results</button>
    {data?.awards.map(award => <article key={award.id}><AwardCard award={award} /><p className="text-sm text-zinc-400">Recipients at issue: {award.recipientNames.join(', ') || 'Team award only; no recorded personal credit.'}</p></article>)}
    {data?.awards.length === 0 && <p>No published awards recorded.</p>}
    {message && <p role="alert">{message}</p>}
  </main>;
}
