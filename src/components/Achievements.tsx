import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { identityRequest } from '../identity';
import type { AwardSummary } from '../../shared/awards';

export function AwardCard({ award }: { award: AwardSummary }) {
  return <div className="border border-zinc-700 rounded-lg p-4 space-y-1">
    <h3 className="font-bold">{award.categoryName}</h3>
    <p>{award.teamName && `${award.teamName} · `}{award.eventName}{award.eventDate && ` · ${award.eventDate}`}</p>
    <Link className="underline text-emerald-400" to={`/results/${award.sessionId}`}>Official event results</Link>
  </div>;
}
export function Achievements({ memberId }: { memberId?: string }) {
  const [data, setData] = useState<{ own: boolean; awards: (AwardSummary & { visibleOnProfile?: boolean })[] } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() { setMessage(''); try { setData(await identityRequest('awards/member', memberId ? { memberId } : {})); } catch (issue: any) { setData(null); setMessage(issue.message); } }
  useEffect(() => { let current = true; setData(null); setMessage('');
    const load = () => identityRequest('awards/member', memberId ? { memberId } : {}).then(result => { if (current) setData(result); }).catch(issue => { if (current) { setData(null); setMessage(issue.message); } });
    load(); window.addEventListener('focus', load);
    return () => { current = false; window.removeEventListener('focus', load); };
  }, [memberId]);
  return <section className="space-y-3" aria-label="Achievements"><h2 className="text-xl font-bold">Achievements</h2>
    {data?.own && <p className="text-sm text-zinc-400">Published, verified awards are hidden on your profile until you select them. Official event results remain visible to verified signed-in members.</p>}
    <button className="underline" disabled={busy} onClick={refresh}>Refresh achievements</button>
    {!data && !message && <p>Loading achievements…</p>}
    {data?.awards.length === 0 && <p>{data.own ? 'No published verified awards recorded.' : 'No achievements selected for this profile.'} An absent award does not indicate participation or a loss.</p>}
    {data?.awards.map(award => <div key={award.id}><AwardCard award={award} />{data.own && <label className="flex gap-2 py-2"><input type="checkbox" disabled={busy} checked={award.visibleOnProfile} onChange={async event => {
      setBusy(true); setMessage('');
      try { await identityRequest('awards/visibility', { resultId: award.id, visibleOnProfile: event.target.checked }); await refresh(); } catch (issue: any) { setMessage(issue.message); } finally { setBusy(false); }
    }} />Show {award.categoryName} on my profile</label>}</div>)}
    {message && <p role="alert">{message}</p>}
  </section>;
}
