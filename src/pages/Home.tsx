import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Hash } from 'lucide-react';

export default function Home() {
  const [sessionCode, setSessionCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = React.useMemo(() => [new URLSearchParams(window.location.search)], []);

  useEffect(() => {
    document.title = 'Welcome to #HACK Live';
    
    const codeFromUrl = searchParams.get('code');
    if (codeFromUrl) {
      setSessionCode(codeFromUrl.toUpperCase());
      // Auto-trigger join if code is present
      const autoJoin = async () => {
        setLoading(true);
        try {
          const q = query(collection(db, 'sessions'), where('code', '==', codeFromUrl.toUpperCase()));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const sessionId = snapshot.docs[0].id;
            navigate(`/session/${sessionId}`);
          } else {
            setError('Session not found. Please check the code.');
          }
        } catch (err) {
          console.error(err);
          setError('An error occurred while joining the session.');
        } finally {
          setLoading(false);
        }
      };
      autoJoin();
    }
  }, [searchParams, navigate]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionCode.trim()) return;
    
    setLoading(true);
    setError('');
    try {
      const q = query(collection(db, 'sessions'), where('code', '==', sessionCode.trim().toUpperCase()));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setError('Session not found. Please check the code.');
      } else {
        const sessionId = snapshot.docs[0].id;
        navigate(`/session/${sessionId}`);
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while joining the session.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center text-emerald-500 mb-4">
            <Hash size={48} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">#HACK Live</h1>
          <p className="text-zinc-400">Join a live workshop session</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-zinc-400 mb-1">Session Code</label>
            <input
              id="code"
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              placeholder="e.g. HACK2026"
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg uppercase tracking-widest text-center"
              required
            />
          </div>
          
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
          >
            {loading ? 'Joining...' : 'Join Session'}
          </button>
        </form>

        <div className="pt-12 text-center">
          <Link className="block text-emerald-400 mb-5" to="/members">Community members</Link>
          <button 
            onClick={() => navigate('/admin')}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Admin Login
          </button>
        </div>
      </div>
    </div>
  );
}
