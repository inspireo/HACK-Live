import MemberHistory from './components/MemberHistory';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { GoogleAuthProvider, EmailAuthProvider, User, createUserWithEmailAndPassword, linkWithCredential, linkWithPopup, onIdTokenChanged, reload, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { Link, useLocation, useParams } from 'react-router-dom';
import { auth, db } from './firebase';
import { ConnectionIndicator, ConnectionPanel } from './connections';
import { MemberDetails, ProfileEditor } from './profile-details';

export const isRegisteredMember = (user: User | null) => !!user && !user.isAnonymous && user.emailVerified;
type Profile = { name: string; state: string };
const ProfileContext = createContext<Profile | null>(null);
export const useProfile = () => useContext(ProfileContext)!;
export async function identityRequest(route: string, payload: object = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/identity/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Please try again.');
  return result;
}
const inputClass = 'w-full p-3 bg-zinc-900 border border-zinc-600 rounded-lg';
const buttonClass = 'p-3 bg-emerald-700 rounded-lg disabled:opacity-50';
function Panel({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6"><div className="w-full max-w-md space-y-5">{children}</div></main>;
}

export function MemberGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [deletionMessage, setDeletionMessage] = useState('');
  const [deletionBusy, setDeletionBusy] = useState(false);
  useEffect(() => onIdTokenChanged(auth, current => { setUser(current); setAuthRevision(revision => revision + 1); setReady(true); }), []);
  useEffect(() => {
    setProfile(undefined); setError('');
    if (!isRegisteredMember(user)) return;
    // Child listeners require a server-active profile. A local pending create
    // must not start them before the profile write is authorized and committed.
    return onSnapshot(doc(db, 'profiles', user!.uid), { includeMetadataChanges: true }, snapshot => {
      if (!snapshot.metadata.hasPendingWrites) setProfile(snapshot.exists() ? snapshot.data() as Profile : null);
    }, issue => setError(issue.message));
  }, [user?.uid, user?.emailVerified, authRevision]);
  // The destination path and query remain in the address bar throughout auth,
  // including on refresh. No untrusted redirect parameter is accepted.
  if (!ready) return <Panel>Loading account…</Panel>;
  if (!isRegisteredMember(user)) return <SignIn user={user} />;
  // Administrator permissions belong to the existing users/session authority,
  // independently of whether this person has a social profile.
  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/display/')) return <>{children}</>;
  if (error) return <Panel><p role="alert">{error}</p><button onClick={() => signOut(auth)}>Sign out</button></Panel>;
  if (profile === undefined) return <Panel>Loading profile…</Panel>;
  if (profile?.state === 'deleting') return <Panel><p>Profile deletion is in progress. If a previous request was interrupted, retry below. After a server interruption, cleanup may remain locked for up to five minutes.</p><button disabled={deletionBusy} className={buttonClass} onClick={async () => {
    setDeletionBusy(true); setDeletionMessage('');
    try { await identityRequest('delete-profile'); } catch (issue: any) { setDeletionMessage(issue.message); } finally { setDeletionBusy(false); }
  }}>Retry deletion</button><p role="status">{deletionMessage}</p><button onClick={() => signOut(auth)}>Sign out</button></Panel>;
  if (!profile || profile.state === 'deleted') return <ProfileForm />;
  return <ProfileContext.Provider value={profile}><div className="bg-zinc-900 text-white px-5 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><Link to="/">#HACK Live</Link><ConnectionIndicator /><Link className="min-w-0 max-w-full [overflow-wrap:anywhere]" to="/account">Account · {profile.name}</Link></div>{children}</ProfileContext.Provider>;
}

function SignIn({ user }: { user: User | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function attempt(action: () => Promise<unknown>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (issue: any) { setMessage(issue.code === 'auth/credential-already-in-use' || issue.code === 'auth/email-already-in-use' ? 'This account already exists. Sign in to it; ask the organizer to resolve any legacy registration conflict.' : issue.message); } finally { setBusy(false); }
  }
  if (user && !user.isAnonymous && !user.emailVerified) return <Panel>
    <h1 className="text-3xl">Verify your email</h1><p>Open the verification email, then continue. Your event link is saved in this tab.</p>
    <button disabled={busy} className={buttonClass} onClick={() => attempt(async () => { await reload(user); await user.getIdToken(true); if (!user.emailVerified) setMessage('Email is not verified yet.'); })}>I have verified my email</button>
    <button disabled={busy} className={buttonClass} onClick={() => attempt(async () => { await sendEmailVerification(user); setMessage('Verification email sent.'); })}>Resend verification email</button>
    <button onClick={() => signOut(auth)}>Use another account</button><p role="status">{message}</p>
  </Panel>;
  return <Panel><h1 className="text-3xl font-bold">Sign in to #HACK Live</h1><p>Join the community with a permanent account. Event registration is a separate step.</p>
    <button disabled={busy} className={buttonClass} onClick={() => attempt(async () => {
      if (auth.currentUser?.isAnonymous) {
        try { await linkWithPopup(auth.currentUser, new GoogleAuthProvider()); }
        catch (issue: any) {
          // An existing permanent Google account wins over an anonymous device
          // session. This authenticates the account but never claims legacy data.
          const credential = GoogleAuthProvider.credentialFromError(issue);
          if (issue.code !== 'auth/credential-already-in-use' || !credential) throw issue;
          await signInWithCredential(auth, credential);
        }
      } else await signInWithPopup(auth, new GoogleAuthProvider());
    })}>Continue with Google</button>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); attempt(async () => {
      if (signup) {
        const credential = auth.currentUser?.isAnonymous
          ? await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password))
          : await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(credential.user);
      } else await signInWithEmailAndPassword(auth, email, password);
    }); }}>
      <label className="block">Email<input className={inputClass} type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" /></label>
      <label className="block">Password<input className={inputClass} type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required autoComplete={signup ? 'new-password' : 'current-password'} /></label>
      <button className={buttonClass} disabled={busy}>{signup ? 'Create account' : 'Sign in with email'}</button>
    </form>
    <button onClick={() => setSignup(!signup)}>{signup ? 'Use an existing account' : 'Create an account with email'}</button>
    <button disabled={busy || !email} onClick={() => attempt(async () => { await sendPasswordResetEmail(auth, email); setMessage('If the account exists, a reset email has been sent.'); })}>Reset password</button>
    <p>Old name and phone passcodes cannot recover registrations. Ask your event organizer to link a legacy registration to your verified account.</p>
    <p role="status">{message}</p>
  </Panel>;
}

function ProfileForm({ profile }: { profile?: Profile }) {
  const [name, setName] = useState(profile?.name || auth.currentUser?.displayName || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <Panel><h1 className="text-3xl font-bold">{profile ? 'Your profile' : 'Create your profile'}</h1>
    <p>Creating a profile does not register you for an event.</p>
    {profile ? <ProfileEditor uid={auth.currentUser!.uid} name={name} onNameChange={setName} save={payload => identityRequest('save-profile', payload)} onSaved={setMessage} /> : <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true);
      try { await setDoc(doc(db, 'profiles', auth.currentUser!.uid), { name: name.trim(), state: 'active' }); setMessage('Profile saved.'); } catch (issue: any) { setMessage(issue.message); } finally { setBusy(false); }
    }}><label>Name<input className={inputClass} value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></label><button disabled={busy || !name.trim()} className={buttonClass}>Save profile</button></form>}
    <p role="status">{message}</p>
    {profile && <><Link className="block underline" to="/badge">My badge</Link><Link to="/">Find an event</Link><button className="block" onClick={() => signOut(auth)}>Sign out</button>
      <p>Deleting removes your social profile and reusable details. Workshop contributions retain a deleted-member label. Your sign-in and event administrator permissions remain. You can create a new social profile later.</p>
      <p className="text-xs">Account ID for organizer-assisted legacy linking: <code>{auth.currentUser?.uid}</code></p>
      <button className="text-red-400" disabled={busy} onClick={async () => {
        if (!window.confirm('Delete your social profile and personal workshop details? This cannot be undone. Your sign-in and administrator permissions remain.')) return;
        setBusy(true);
        try { await identityRequest('delete-profile'); } catch (issue: any) { setMessage(issue.message); } finally { setBusy(false); }
      }}>Delete profile</button></>}
  </Panel>;
}
export function Account() { return <><ProfileForm profile={useProfile()} /><div className="bg-zinc-950 text-white p-6 max-w-3xl mx-auto"><MemberHistory /></div></>; }

export function MemberProfile() {
  const { memberId } = useParams();
  const [member, setMember] = useState<Profile | null>(null);
  const [message, setMessage] = useState('Loading member…');
  useEffect(() => onSnapshot(doc(db, 'profiles', memberId!), snapshot => {
    setMember(snapshot.exists() && snapshot.data().state === 'active' ? snapshot.data() as Profile : null);
    setMessage('Member unavailable.');
  }, () => { setMember(null); setMessage('Member unavailable.'); }), [memberId]);
  return <Panel>{member ? <><MemberDetails key={memberId} memberId={memberId!} name={member.name} /><ConnectionPanel key={memberId} peerUid={memberId!} /><MemberHistory key={memberId} memberUid={memberId} /></> : <p>{message}</p>}<Link to="/members">Community members</Link></Panel>;
}
export function Members() {
  const [members, setMembers] = useState<{ memberId: string; name: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { getDocs(query(collection(db, 'profiles'), where('state', '==', 'active'))).then(snapshot => setMembers(snapshot.docs.map(entry => ({ memberId: entry.id, name: entry.data().name })))).catch(issue => setError(issue.message)); }, []);
  return <Panel><h1 className="text-3xl">Community members</h1>{members.map(member => <Link className="block underline" key={member.memberId} to={`/members/${member.memberId}`}>{member.name}</Link>)}{error && <p role="alert">{error}</p>}</Panel>;
}
