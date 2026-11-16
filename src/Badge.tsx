import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { auth, db } from './firebase';
import { identityRequest } from './identity';
import { ProfilePhoto } from './profile-details';
import { badgeMemberDetails, profileUrl, TEAM_LABELS } from '../shared/participation';

type BadgeTeam = { kind: string; name: string; role: string | null; collectionName: string; teamId: string; participantId: string };
type BadgeData = { sessionId: string; eventName: string; eventDate: string | null; name: string; roles: string[]; teams: BadgeTeam[] };
// PR2 integration seam: only member-visible memberDetails may supply these.
// No reads from canonical owner-private profileDetails or contact projections.
type BadgeDetails = { avatarUrl?: string; title?: string };
export default function MyBadge() {
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [details, setDetails] = useState<BadgeDetails>({});
  const [parameters, setParameters] = useSearchParams();
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const uid = auth.currentUser!.uid;
  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      // Hide stale cards immediately when a source changes or becomes unreadable.
      setBadges([]); setLoaded(false);
      identityRequest('my-badges').then(result => { if (mounted && revision === current) { setBadges(result.badges); setLoaded(true); } }).catch(issue => { if (mounted && revision === current) { setMessage(issue.message); setLoaded(true); } });
    };
    const subscriptions = [
      onSnapshot(query(collection(db, 'participants'), where('memberId', '==', uid)), refresh, () => { setBadges([]); setLoaded(true); }),
      onSnapshot(query(collection(db, 'registrations'), where('uid', '==', uid)), refresh, () => { setBadges([]); setLoaded(true); }),
      onSnapshot(collection(db, 'sessions'), refresh, () => { setBadges([]); setLoaded(true); }),
      onSnapshot(collection(db, 'teams'), refresh), onSnapshot(collection(db, 'discoveryTeams'), refresh),
    ];
    // On the PR1 preparation base this collection is denied; name-only still works.
    subscriptions.push(onSnapshot(doc(db, 'memberDetails', uid), snapshot => {
      setDetails(badgeMemberDetails(snapshot.data()));
    }, () => setDetails({})));
    return () => { mounted = false; subscriptions.forEach(unsubscribe => unsubscribe()); };
  }, [uid]);
  const selected = badges.find(badge => badge.sessionId === parameters.get('event')) || badges[0];
  const url = profileUrl(window.location.origin, uid);
  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setMessage('Profile link copied.'); }
    catch { setMessage('Copy the profile link below.'); }
  }
  return <main className="min-h-screen bg-zinc-950 text-zinc-100 px-3 py-6"><div className="mx-auto max-w-sm space-y-4">
    <div className="flex justify-between items-center"><h1 className="text-xl font-semibold">My badge</h1><Link className="underline" to="/account">Account</Link></div>
    {badges.length > 1 && <label className="block">Event<select aria-label="Event" className="mt-1 w-full rounded-lg bg-zinc-800 p-3" value={selected.sessionId} onChange={event => setParameters({ event: event.target.value })}>{badges.map(badge => <option key={badge.sessionId} value={badge.sessionId}>{badge.eventName}</option>)}</select></label>}
    {selected ? <>
      <article aria-label="Personal event badge" className="rounded-2xl bg-white text-zinc-950 overflow-hidden shadow-xl">
        <div className="bg-emerald-950 text-white px-5 py-4"><p className="font-black text-2xl tracking-tight">#hack<span className="text-emerald-300"> live</span></p><p className="mt-2 break-words font-medium">{selected.eventName}</p>{selected.eventDate && <p className="text-sm">{selected.eventDate}</p>}</div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">{details.avatarUrl && <ProfilePhoto url={details.avatarUrl} />}<div className="min-w-0"><h2 className="text-2xl font-bold break-words">{selected.name}</h2>{details.title && <p className="text-sm break-words">{details.title}</p>}</div></div>
          <div><h3 className="text-xs uppercase font-bold tracking-wide mb-2">Official event roles</h3><div className="flex flex-wrap gap-2">{selected.roles.map(role => <span key={role} className="rounded-full bg-emerald-100 text-emerald-950 px-3 py-1 text-sm font-semibold capitalize">{role}</span>)}</div></div>
          {selected.teams.map(team => <div key={team.kind}><p className="text-xs font-bold uppercase">{team.kind}</p><p className="break-words">{team.name}</p>{team.role && <p className="text-sm capitalize">Team role: {team.role}</p>}</div>)}
          <figure className="text-center"><QRCodeSVG value={url} size={240} level="M" marginSize={4} title="Member profile QR code" className="w-full max-w-[240px] h-auto mx-auto bg-white" /><figcaption className="text-sm font-medium mt-2">Scan to view my member profile</figcaption></figure>
          <p className="text-xs text-zinc-600 text-center">Sign in to view. Approved connections can share selected contact details.</p>
        </div>
      </article>
      <div className="flex gap-3">{typeof navigator.share === 'function' && <button className="flex-1 rounded-lg p-3 bg-emerald-700" onClick={async () => { try { await navigator.share({ title: 'My #hack member profile', url }); } catch (issue: any) { if (issue.name !== 'AbortError') await copyLink(); } }}>Share profile</button>}<button className="flex-1 rounded-lg bg-zinc-800 p-3" onClick={copyLink}>Copy profile link</button></div>
      <a className="block text-sm underline break-all" href={url}>{url}</a>
      {selected.teams.map(team => <label key={team.kind} className="block text-sm">My {team.kind.toLowerCase()} role label<select className="block w-full p-3 bg-zinc-800 rounded-lg mt-1" value={team.role || ''} onChange={async event => { try { await identityRequest('team-role', { collectionName: team.collectionName, teamId: team.teamId, participantId: team.participantId, label: event.target.value }); setMessage('Team role label saved.'); } catch (issue: any) { setMessage(issue.message); } }}><option value="">No label</option>{TEAM_LABELS.map(label => <option key={label} value={label}>{label}</option>)}</select></label>)}
    </> : <p>{loaded ? 'No active event badge. Register for an event or contact its organizer.' : 'Loading badge…'}</p>}
    <p role="status">{message}</p>
  </div></main>;
}
