import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { Plus, LogOut, Settings } from 'lucide-react';

export default function AdminDashboard() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth.currentUser);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionCode, setNewSessionCode] = useState('');
  const navigate = useNavigate();
  const [hasAutoRedirected, setHasAutoRedirected] = useState(false);

  useEffect(() => {
    document.title = 'Admin Dashboard – #HACK Live Admin';
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'sessions'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const role = await getDoc(doc(db, 'users', user.uid));
      const allSessions = await Promise.all(snapshot.docs.map(async sessionDoc => {
        const access = await getDoc(doc(db, 'sessionAccess', sessionDoc.id)).catch(() => null);
        return { id: sessionDoc.id, ...sessionDoc.data(), ...access?.data() };
      }));
      
      const filtered = allSessions.filter((session: any) => {
        const isPlatformOwner = user.email === 'xaeltan@gmail.com' || role.data()?.role === 'admin';
        const isOwner = session.ownerId === user.uid;
        const isCoAdmin = session.adminEmails && session.adminEmails.includes(user.email);
        return isPlatformOwner || isOwner || isCoAdmin;
      });

      setSessions(filtered);
      setLoading(false);

      // Auto-redirect if the user is a normal session-admin with exactly 1 session, and we haven't auto-redirected yet.
      if (user.email !== 'xaeltan@gmail.com' && filtered.length === 1 && !hasAutoRedirected) {
        setHasAutoRedirected(true);
        navigate(`/admin/${filtered[0].id}`);
      }
    }, (error) => {
      console.error("Error fetching sessions:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, hasAutoRedirected, navigate]);

  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setLoginError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error', error);
      if (error.code === 'auth/admin-restricted-operation') {
        setLoginError('Google Sign-In is disabled. Please enable it in the Firebase Console under Authentication > Sign-in method.');
      } else {
        setLoginError(error.message);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionTitle || !newSessionCode || !user) return;

    try {
      const docRef = await addDoc(collection(db, 'sessions'), {
        title: newSessionTitle,
        code: newSessionCode.toUpperCase(),
        status: 'Draft',
        preferredTeamSize: 4,
        minTeamSize: 3,
        maxTeamSize: 5,
        displayMode: 'Challenges',
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'sessionAccess', docRef.id), { ownerEmail: user.email || '', adminEmails: [] });
      setNewSessionTitle('');
      setNewSessionCode('');
      navigate(`/admin/${docRef.id}`);
    } catch (error) {
      console.error('Error creating session', error);
    }
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">Loading...</div>;

  if (!user || user.isAnonymous) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-sm w-full">
          <h1 className="text-3xl font-bold">Admin Login</h1>
          <p className="text-zinc-400">Sign in with Google to manage your #HACK Live sessions.</p>
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-white text-zinc-900 font-medium rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Sign in with Google
          </button>
          {loginError && (
            <div className="mt-4 p-4 bg-red-950/50 border border-red-900 rounded-xl text-left">
              <p className="text-red-400 text-sm font-medium mb-1">Login Failed</p>
              <p className="text-zinc-300 text-sm">{loginError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="w-full max-w-[1200px] mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Your Sessions</h1>
          <button onClick={handleLogout} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-4">Create New Session</h2>
            <form onSubmit={createSession} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Session Title</label>
                <input
                  type="text"
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Session Code</label>
                <input
                  type="text"
                  value={newSessionCode}
                  onChange={(e) => setNewSessionCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                <Plus size={18} />
                Create Session
              </button>
            </form>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Active Sessions</h2>
            {sessions.length === 0 ? (
              <div className="bg-zinc-950/40 border border-zinc-800 p-6 rounded-xl space-y-2 text-center">
                <p className="text-zinc-400 text-sm font-medium">You do not currently have admin access to any sessions.</p>
                <p className="text-zinc-500 text-xs leading-relaxed max-w-sm mx-auto font-normal">
                  If you are co-facilitating an active workspace, please contact the session owner to add your email address (<span className="text-zinc-350 font-semibold">{user.email}</span>) under Session Admins. Otherwise, you can initialize a brand new session using the creator tool.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => navigate(`/admin/${session.id}`)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-emerald-500/50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <h3 className="font-semibold text-lg">{session.title}</h3>
                      <p className="text-sm text-zinc-400">Code: <span className="text-emerald-400 font-mono">{session.code}</span></p>
                    </div>
                    <div className="text-zinc-500">
                      <Settings size={20} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
