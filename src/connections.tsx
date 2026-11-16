import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { auth, db } from './firebase';
import { identityRequest } from './identity';
import { fieldLabels, type ContactField } from '../shared/profile';
import type { ConnectionAction, ConnectionView } from '../shared/connections';

const buttonClass = 'px-3 py-2 rounded bg-emerald-800 disabled:opacity-50';
function useConnections() {
  const ownUid = auth.currentUser?.uid;
  const [snapshot, setSnapshot] = useState<{ ownerUid?: string; connections: ConnectionView[]; error: string }>({ connections: [], error: '' });
  useEffect(() => {
    setSnapshot({ ownerUid: ownUid, connections: [], error: '' });
    if (!ownUid) return;
    let current = true;
    const unsubscribe = onSnapshot(collection(db, 'connectionViews', ownUid, 'peers'), result => {
      if (!current || auth.currentUser?.uid !== ownUid) return;
      setSnapshot({ ownerUid: ownUid, connections: result.docs.map(entry => entry.data() as ConnectionView), error: '' });
    }, issue => {
      if (current && auth.currentUser?.uid === ownUid) setSnapshot({ ownerUid: ownUid, connections: [], error: issue.message });
    });
    return () => { current = false; unsubscribe(); };
  }, [ownUid]);
  // Suppress the prior account before the new effect/subscription can run.
  const selected = ownUid && snapshot.ownerUid === ownUid ? snapshot : undefined;
  return { ownUid, connections: selected?.connections || [], error: selected?.error || '' };
}
export function ConnectionIndicator() {
  const { connections, ownUid } = useConnections();
  if (!ownUid) return null;
  const incoming = connections.filter(entry => entry.state === 'pending' && entry.requester !== ownUid).length;
  const accepted = connections.filter(entry => entry.state === 'accepted' && entry.unread).length;
  return <Link to="/connections">Connections{incoming ? ` · ${incoming} incoming` : ''}{accepted ? ` · ${accepted} accepted` : ''}</Link>;
}
function PeerName({ uid }: { uid: string }) {
  const [name, setName] = useState('Member unavailable');
  useEffect(() => onSnapshot(doc(db, 'profiles', uid), snapshot => setName(snapshot.data()?.state === 'active' ? snapshot.data()!.name : 'Member unavailable'), () => setName('Member unavailable')), [uid]);
  return <Link className="underline" to={`/members/${uid}`}>{name}</Link>;
}
export function ConnectionsPage() {
  const { connections, error, ownUid } = useConnections();
  if (!ownUid) return null;
  return <main className="min-h-screen bg-zinc-950 text-white p-6 space-y-6"><h1 className="text-3xl">Connections</h1>
    <p>Only accepted connections can view your globally selected contact fields. Sharing a team or attending an event does not connect you.</p>
    {(['Incoming requests', 'Outgoing requests', 'Accepted connections'] as const).map((heading, group) => {
      const rows = connections.filter(entry => group === 2 ? entry.state === 'accepted' : entry.state === 'pending' && (group === 0 ? entry.requester !== ownUid : entry.requester === ownUid));
      return <section key={heading} className="space-y-3"><h2 className="text-xl">{heading}</h2>{!rows.length && <p>None yet.</p>}{rows.map(entry => <div className="border border-zinc-700 rounded p-4" key={entry.peerUid}><PeerName uid={entry.peerUid} /><ConnectionPanel peerUid={entry.peerUid} /></div>)}</section>;
    })}<p role="alert">{error}</p><Link to="/members">Community members</Link></main>;
}

// Integration seam: append to PR2's member presentation; never owns its editor.
export function ConnectionPanel({ peerUid }: { peerUid: string }) {
  const ownUid = auth.currentUser?.uid;
  if (!ownUid || peerUid === ownUid) return null;
  // A new viewer/peer gets fresh state before any async inspect or listener result.
  return <ConnectionDetails key={JSON.stringify([ownUid, peerUid])} ownUid={ownUid} peerUid={peerUid} />;
}
function ConnectionDetails({ ownUid, peerUid }: { ownUid: string; peerUid: string }) {
  const [view, setView] = useState<ConnectionView | undefined>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [fields, setFields] = useState<{ ownFields?: ContactField[]; peerFields?: ContactField[]; state?: string }>({});
  const [contacts, setContacts] = useState<Partial<Record<ContactField, string>>>({});
  useEffect(() => {
    setReady(false); setView(undefined); setContacts({}); setConfirmation(false);
    if (auth.currentUser?.uid !== ownUid) return;
    let current = true;
    const unsubscribe = onSnapshot(doc(db, 'connectionViews', ownUid, 'peers', peerUid), snapshot => {
      if (!current || auth.currentUser?.uid !== ownUid) return;
      setView(snapshot.exists() ? snapshot.data() as ConnectionView : undefined); setReady(true);
    }, issue => { if (current && auth.currentUser?.uid === ownUid) { setError(issue.message); setReady(false); } });
    return () => { current = false; unsubscribe(); };
  }, [ownUid, peerUid]);
  useEffect(() => {
    let active = true;
    setFields({});
    if (auth.currentUser?.uid !== ownUid) return;
    if (peerUid !== ownUid) identityRequest('connections/inspect', { peerUid }).then(result => { if (active && auth.currentUser?.uid === ownUid) setFields(result); }).catch(issue => { if (active && auth.currentUser?.uid === ownUid) setError(issue.message); });
    return () => { active = false; };
  }, [peerUid, ownUid, view?.state, view?.generation, confirmation]);
  useEffect(() => {
    setContacts({});
    if (auth.currentUser?.uid !== ownUid || view?.state !== 'accepted') return;
    let current = true;
    const unsubscribe = onSnapshot(doc(db, 'connectionContacts', peerUid), snapshot => {
      if (current && auth.currentUser?.uid === ownUid) setContacts(snapshot.data() || {});
    }, () => { if (current && auth.currentUser?.uid === ownUid) setContacts({}); });
    return () => { current = false; unsubscribe(); };
  }, [ownUid, peerUid, view?.state, view?.generation]);
  if (auth.currentUser?.uid !== ownUid) return null;
  const state = fields.state === 'blocked' ? 'blocked' : view?.state || 'none';
  const outgoing = view?.requester === ownUid;
  async function act(action: ConnectionAction) {
    if (auth.currentUser?.uid !== ownUid) return;
    setBusy(true); setError('');
    try { await identityRequest(`connections/${action}`, { peerUid, ...(view ? { generation: view.generation } : {}) }); if (auth.currentUser?.uid === ownUid) setConfirmation(false); }
    catch (issue) { if (auth.currentUser?.uid === ownUid) setError((issue as Error).message); } finally { if (auth.currentUser?.uid === ownUid) setBusy(false); }
  }
  const actionButton = (action: ConnectionAction, label: string) => <button className={buttonClass} disabled={busy || !ready} onClick={() => act(action)}>{label}</button>;
  const labels = (selection?: ContactField[]) => selection ? selection.map(field => fieldLabels[field]).join(', ') || 'No populated fields selected' : 'Loading selected fields…';
  return <section aria-label="Connection" className="space-y-3 py-3">
    <p role="status">{state === 'pending' ? outgoing ? 'Request sent' : 'Incoming connection request' : state === 'accepted' ? 'Connected' : state === 'blocked' ? 'Connection unavailable' : 'Not connected'}</p>
    {state === 'pending' && <><p>You share after acceptance: {labels(fields.ownFields)}.</p><p>They share after acceptance: {labels(fields.peerFields)}.</p><p>Each person chooses one contact selection for all approved connections. Later changes apply to all current and future connections.</p></>}
    {state === 'pending' && (outgoing ? actionButton('cancel', 'Cancel request') : <>{actionButton('accept', 'Accept connection')}{actionButton('decline', 'Decline request')}</>)}
    {state === 'accepted' && <><h3>Shared contacts</h3><dl>{Object.entries(contacts).map(([field, value]) => <div key={field}><dt>{fieldLabels[field as ContactField]}</dt><dd>{value}</dd></div>)}</dl>{!Object.keys(contacts).length && <p>No contact fields shared.</p>}{view?.unread && actionButton('seen', 'Mark acceptance read')}{actionButton('unfriend', 'Unfriend')}</>}
    {!['accepted', 'pending', 'blocked'].includes(state) && <>{!confirmation ? <button className={buttonClass} disabled={!ready} onClick={() => setConfirmation(true)}>Request connection</button> : <><p>You will share after acceptance: {labels(fields.ownFields)}. They choose which fields to share. These global selections can change later.</p>{actionButton('request', 'Send request')}</>}</>}
    {state !== 'blocked' && actionButton('block', 'Block member')}
    <p className="text-sm">Unfriend or block immediately removes future contact access in both directions. Copies already saved by someone cannot be recalled. Blocking prevents new requests from this account, including after profile recreation.</p>
    <Link className="underline" to="/account">Choose contact fields for all connections</Link><p role="alert">{error}</p>
  </section>;
}
