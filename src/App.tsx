import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './firebase';

import Home from './pages/Home';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSession from './pages/admin/AdminSession';
import ParticipantDashboard from './pages/participant/ParticipantDashboard';
import DisplayMode from './pages/display/DisplayMode';

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test-connection-diagnostic', 'check'));
      } catch (error: any) {
        const msg = error instanceof Error ? error.message : String(error);
        const code = error?.code || '';
        
        // These codes and messages confirm the client successfully reached Firestore on the cloud!
        const successReachable = [
          'permission-denied', 
          'not-found', 
          'unauthenticated'
        ].some(c => code.includes(c) || msg.toLowerCase().includes(c));

        if (!successReachable) {
          if (msg.includes('offline') || code === 'unavailable') {
            setDbError('The database appears to be offline or unreachable. Please verify that your Firestore database is created in the Firebase console and that you are connected to the internet.');
          } else if (msg.includes('quota') || code === 'resource-exhausted') {
            setDbError('Firestore usage quota exceeded for today. Please wait for the daily quota to reset, or upgrade your Firebase project from Spark to Blaze plan.');
          } else {
            console.warn('Initial connection probe response:', msg, code);
            // Don't show generic errors as blockers to avoid false positives, but log them
          }
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch((error) => {
          console.error('Auth Error:', error);
          if (error.code === 'auth/admin-restricted-operation') {
            setAuthError('Anonymous Authentication is disabled. Please enable it in the Firebase Console under Authentication > Sign-in method.');
          } else {
            setAuthError(error.message);
          }
          setIsAuthReady(true); // Still allow rendering so admins can log in
        });
      } else {
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  if (authError && !window.location.pathname.startsWith('/admin') && !window.location.pathname.startsWith('/display')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6 text-center">
        <div className="bg-red-950/50 border border-red-900 p-8 rounded-2xl max-w-lg">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Setup Required</h2>
          <p className="text-zinc-300 mb-6 text-lg">
            Participants cannot join because <strong>Anonymous Authentication</strong> is disabled in your database.
          </p>
          <div className="bg-black/30 p-4 rounded-lg text-left mb-6">
            <p className="text-sm text-zinc-400 mb-2 font-semibold uppercase tracking-wider">How to fix this:</p>
            <ol className="list-decimal list-inside text-zinc-300 space-y-2 text-sm">
              <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Firebase Console</a></li>
              <li>Select your project</li>
              <li>Navigate to <strong>Authentication</strong> &gt; <strong>Sign-in method</strong></li>
              <li>Click <strong>Add new provider</strong> and select <strong>Anonymous</strong></li>
              <li>Toggle it to <strong>Enable</strong> and click Save</li>
            </ol>
          </div>
          <p className="text-sm text-zinc-500">
            Once enabled, refresh this page. Participants will be able to join without logging in.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">Loading...</div>;
  }

  return (
    <BrowserRouter>
      {dbError && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-red-950/95 border border-red-800 text-red-200 p-4 rounded-xl shadow-2xl backdrop-blur flex justify-between items-start gap-4 animate-in slide-in-from-top-4 duration-300">
          <div className="space-y-1">
            <h4 className="font-bold flex items-center gap-2 text-red-400">
              ⚠️ Database Connection Notification
            </h4>
            <p className="text-sm opacity-90 text-left">{dbError}</p>
          </div>
          <button 
            onClick={() => setDbError(null)} 
            className="text-xs font-semibold shrink-0 bg-red-900/60 hover:bg-red-800 text-white py-1 px-3 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/:sessionId" element={<AdminSession />} />
        <Route path="/session/:sessionId" element={<ParticipantDashboard />} />
        <Route path="/display/:sessionId" element={<DisplayMode />} />
      </Routes>
    </BrowserRouter>
  );
}
