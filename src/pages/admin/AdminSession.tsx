import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, collection, query, where, getDoc, getDocs, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth } from '../../firebase';
import { ArrowLeft, Settings, Users, Target, FileText, MonitorPlay, Sparkles, ChevronLeft, ChevronRight, Activity, Award, Shield, CheckCircle2, Trash2, Eye, EyeOff, Plus, Minus } from 'lucide-react';
import { QUESTION_PACKS, ARCHETYPES } from '../../data/questionPacks';

import ChallengesTab from './ChallengesTab';
import ResourcesTab from './ResourcesTab';
import ParticipantsTab from './ParticipantsTab';
import TeamsTab from './TeamsTab';
import RandomiserTab from './RandomiserTab';
import DiscoveryTab from './DiscoveryTab';
import AwardsTab from './AwardsTab';
import { Folder, ArrowUp, ArrowDown, Lightbulb, Flame, Globe, HelpCircle, Compass, Network, Shuffle } from 'lucide-react';

const getAdminStatusLabel = (status: string) => {
  switch (status) {
    case 'Opening': return 'Welcome / Opening';
    case 'ResourcesOnly': return 'View Resources Only';
    case 'Focus Areas': return 'Focus Areas';
    case 'Challenge Drafting': return 'Challenge Drafting';
    case 'Challenge Discovery':
    case 'Challenge Proposing': return 'Challenge Proposing';
    case 'Challenge Voting': return 'Challenge Voting';
    case 'Voting Review': return 'Voting Review';
    case 'Published Challenges': return 'Published Challenges';
    case 'Draft': return 'Challenges Review';
    case 'Challenge Selection Open': return 'Challenge Selection Open';
    case 'Selection Locked': return 'Selection Locked';
    case 'Team Formation': return 'Solution Team Formation';
    case 'Team Assignment In Progress': return 'Solution Team Assignment';
    case 'Team Naming Open': return 'Solution Team Naming';
    case 'Team Naming Locked': return 'Solution Team Naming Locked';
    case 'Live': return 'Workshop In Progress';
    case 'Presentations': return 'Presentations';
    case 'Closed': return 'Closed';
    default: return status;
  }
};

const getStepsForSession = (enableChallengeDiscovery: boolean) => {
  const steps: { id: string; label: string; phase: string }[] = [
    // Opening Phase
    { id: 'Opening', label: 'Welcome / Opening', phase: 'Opening' },
    { id: 'ResourcesOnly', label: 'View Resources Only', phase: 'Opening' },
  ];

  // Challenge Discovery Phase
  if (enableChallengeDiscovery) {
    steps.push(
      { id: 'Focus Areas', label: 'Focus Areas', phase: 'Challenge Discovery' },
      { id: 'Discovery Team Formation', label: 'Challenge Workgroup Formation', phase: 'Challenge Discovery' },
      { id: 'Challenge Drafting', label: 'Challenge Drafting', phase: 'Challenge Discovery' },
      { id: 'Challenge Proposing', label: 'Challenge Proposing', phase: 'Challenge Discovery' },
      { id: 'Challenge Voting', label: 'Challenge Voting', phase: 'Challenge Discovery' },
      { id: 'Voting Review', label: 'Voting Review', phase: 'Challenge Discovery' },
      { id: 'Published Challenges', label: 'Published Challenges', phase: 'Challenge Discovery' }
    );
  } else {
    // If not discovery, we might have Draft (Challenges Review)
    steps.push(
      { id: 'Draft', label: 'Challenges Review', phase: 'Solutioning' }
    );
  }

  // Solutioning Phase
  steps.push(
    { id: 'Challenge Selection Open', label: 'Challenge Selection Open', phase: 'Solutioning' },
    { id: 'Selection Locked', label: 'Selection Locked', phase: 'Solutioning' },
    { id: 'Team Formation', label: 'Solution Team Formation', phase: 'Solutioning' },
    { id: 'Team Assignment In Progress', label: 'Solution Team Assignment', phase: 'Solutioning' },
    { id: 'Team Naming Open', label: 'Solution Team Naming', phase: 'Solutioning' },
    { id: 'Team Naming Locked', label: 'Solution Team Naming Locked', phase: 'Solutioning' },
    { id: 'Live', label: 'Workshop In Progress', phase: 'Solutioning' }
  );

  // Closing Phase
  steps.push(
    { id: 'Presentations', label: 'Presentations', phase: 'Closing' },
    { id: 'Closed', label: 'Closed', phase: 'Closing' }
  );

  return steps;
};

export default function AdminSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [focusAreas, setFocusAreas] = useState<any[]>([]);
  const [proposedChallenges, setProposedChallenges] = useState<any[]>([]);
  const [proposedChallengeVotes, setProposedChallengeVotes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('settings');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'All' | 'General' | 'Mission Innovation' | 'Team Formation' | 'Experimental'>('All');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth.currentUser);
  const [permissionError, setPermissionError] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // States for Admin Management
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [confirmRevokeEmail, setConfirmRevokeEmail] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setLoginError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error', error);
      setLoginError(error.message);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser || currentUser.isAnonymous) {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const tabNames: Record<string, string> = {
      settings: 'Session Settings',
      admins: 'Session Admins',
      discovery: 'Challenge Discovery',
      challenges: 'Challenges',
      resources: 'Resources',
      awards: 'Official Awards',
      participants: 'Participants',
      teams: 'Collaboration',
      display: 'Display Mode'
    };
    const pageName = tabNames[activeTab] || 'Admin';
    document.title = `${pageName} – #HACK Live Admin`;
  }, [activeTab]);

  useEffect(() => {
    if (!sessionId || !user || user.isAnonymous) return;

    setLoading(true);
    let unsubAccess = () => {};
    const unsubSession = onSnapshot(doc(db, 'sessions', sessionId), (sessionDoc) => {
      if (sessionDoc.exists()) {
        unsubAccess();
        unsubAccess = onSnapshot(doc(db, 'sessionAccess', sessionId), async accessDoc => {
        const data = { ...sessionDoc.data(), ...accessDoc.data() } as any;
        const role = await getDoc(doc(db, 'users', user.uid));
        // Client-side verification
        const isPlatformOwner = user.email === 'xaeltan@gmail.com' || role.data()?.role === 'admin';
        const isSessionOwner = data.ownerId === user.uid;
        const isAssignedAdmin = data.adminEmails && data.adminEmails.includes(user.email);
        
        if (!isPlatformOwner && !isSessionOwner && !isAssignedAdmin) {
          setPermissionError(true);
        } else {
          setPermissionError(false);
          setSession({ id: sessionDoc.id, ...data });
        }
        setLoading(false);
        }, () => { setPermissionError(true); setLoading(false); });
      } else {
        navigate('/admin');
      }
      setLoading(false);
    }, (error) => {
      console.error('Admin Session listener error:', error);
      if (error.code === 'permission-denied') {
        setPermissionError(true);
      }
      setLoading(false);
    });

    const unsubChallenges = onSnapshot(query(collection(db, 'challenges'), where('sessionId', '==', sessionId)), (snapshot) => {
      setChallenges(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => ((a.displayOrder ?? 0) - (b.displayOrder ?? 0)) || a.id.localeCompare(b.id)));
    }, (error) => {
      console.error('Admin Challenges listener error:', error);
    });

    const unsubResources = onSnapshot(query(collection(db, 'resources'), where('sessionId', '==', sessionId)), (snapshot) => {
      setResources(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0)));
    }, (error) => {
      console.error('Admin Resources listener error:', error);
    });

    const unsubParticipants = onSnapshot(query(collection(db, 'participants'), where('sessionId', '==', sessionId)), (snapshot) => {
      setParticipants(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Admin Participants listener error:', error);
    });

    const unsubTeams = onSnapshot(query(collection(db, 'teams'), where('sessionId', '==', sessionId)), (snapshot) => {
      setTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Admin Teams listener error:', error);
    });

    const unsubFocusAreas = onSnapshot(query(collection(db, 'focusAreas'), where('sessionId', '==', sessionId)), (snapshot) => {
      setFocusAreas(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (error) => {
      console.error('Admin Focus Areas listener error:', error);
    });

    const unsubProposed = onSnapshot(query(collection(db, 'proposedChallenges'), where('sessionId', '==', sessionId)), (snapshot) => {
      setProposedChallenges(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (error) => {
      console.error('Admin Proposed Challenges listener error:', error);
    });

    const unsubProposedVotes = onSnapshot(query(collection(db, 'proposedChallengeVotes'), where('sessionId', '==', sessionId)), (snapshot) => {
      setProposedChallengeVotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (error) => {
      console.error('Admin Proposed Votes listener error:', error);
    });

    return () => {
      unsubSession();
      unsubAccess();
      unsubChallenges();
      unsubResources();
      unsubParticipants();
      unsubTeams();
      unsubFocusAreas();
      unsubProposed();
      unsubProposedVotes();
    };
  }, [sessionId, navigate]);

  // 1. If we are currently loading, display loading spinner/message
  if (loading && !session && !permissionError) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">Loading...</div>;
  }

  // 2. If the user is not authenticated or anonymous, they must log in
  if (!user || user.isAnonymous) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-sm w-full bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-xl">
          <h1 className="text-2/x text-2xl font-bold">Facilitator Login Required</h1>
          <p className="text-zinc-400 text-sm">Sign in with Google to access the session curation and facilitation portal.</p>
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-white text-zinc-900 font-semibold rounded-xl hover:bg-zinc-200 transition-colors text-sm"
          >
            Sign in with Google
          </button>
          {loginError && (
            <div className="mt-4 p-4 bg-red-950/50 border border-red-900 rounded-xl text-left">
              <p className="text-red-400 text-xs font-semibold mb-1">Login Failed</p>
              <p className="text-zinc-300 text-xs">{loginError}</p>
            </div>
          )}
          <button
            onClick={() => navigate('/')}
            className="w-full py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg text-xs font-semibold"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // 3. If there is a permission error (e.g. they are logged in but not in adminEmails and not owner)
  if (permissionError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md space-y-4 shadow-xl">
          <h2 className="text-2xl font-bold text-red-500">Access Denied</h2>
          <p className="text-sm text-zinc-400">
            You do not currently have facilitator access to this session. Please ask the session creator or platform administrators to register your Google Account email (<span className="text-zinc-200 font-semibold">{user.email}</span>) under Session Admins.
          </p>
          <button
            onClick={() => navigate('/admin')}
            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white rounded-lg transition-colors font-semibold text-sm"
          >
            Back to Sessions List
          </button>
        </div>
      </div>
    );
  }

  // 4. Default check if session doesn't exist
  if (!session) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">Loading Session Details...</div>;
  }

  const sessionSteps = getStepsForSession(session?.enableChallengeDiscovery || false);
  const currentStepIndex = sessionSteps.findIndex(s => s.id === session?.status);
  const currentStep = sessionSteps[currentStepIndex] || null;
  const currentPhase = currentStep?.phase || 'Opening';

  const handleNextStep = async () => {
    if (currentStepIndex !== -1 && currentStepIndex < sessionSteps.length - 1) {
      const nextStep = sessionSteps[currentStepIndex + 1];
      await updateDoc(doc(db, 'sessions', sessionId!), { status: nextStep.id });
    }
  };

  const handlePrevStep = async () => {
    if (currentStepIndex > 0) {
      const prevStep = sessionSteps[currentStepIndex - 1];
      await updateDoc(doc(db, 'sessions', sessionId!), { status: prevStep.id });
    }
  };

  const updateSessionStatus = async (status: string) => {
    await updateDoc(doc(db, 'sessions', sessionId!), { status });
  };

  const updateDisplayMode = async (displayMode: string) => {
    await updateDoc(doc(db, 'sessions', sessionId!), { displayMode });
  };

  const resetWelcomeResponses = async (questionId: string) => {
    if (!window.confirm(`Reset all responses for Question: "${questionId}"? This cannot be undone.`)) return;
    
    const q = query(collection(db, 'welcomeResponses'), where('sessionId', '==', sessionId), where('questionId', '==', questionId));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  };

  const setActiveWelcomeQuestion = async (questionId: string | null) => {
    try {
      await updateDoc(doc(db, 'sessions', sessionId!), { activeWelcomeQuestion: questionId });
    } catch (error) {
      console.error('Error setting active welcome question:', error);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail) return;
    const emailToGrant = newAdminEmail.trim().toLowerCase();
    
    // Simple email regex verification
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToGrant)) {
      setAdminError('Please enter a valid email address.');
      setAdminSuccess(null);
      return;
    }

    if (emailToGrant === 'xaeltan@gmail.com') {
      setAdminError('This email belongs to the Platform Owner, who already has universal access.');
      setAdminSuccess(null);
      return;
    }

    const currentAdmins = session?.adminEmails || [];
    if (currentAdmins.includes(emailToGrant)) {
      setAdminError('This email is already registered as an administrator.');
      setAdminSuccess(null);
      return;
    }

    try {
      await updateDoc(doc(db, 'sessionAccess', sessionId!), {
        adminEmails: [...currentAdmins, emailToGrant]
      });
      setNewAdminEmail('');
      setAdminSuccess(`Successfully granted access to ${emailToGrant}.`);
      setAdminError(null);
    } catch (error: any) {
      setAdminError(error.message || 'Error updating permissions.');
      setAdminSuccess(null);
    }
  };

  const handleRemoveAdmin = async (emailToRemove: string) => {
    if (emailToRemove === 'xaeltan@gmail.com') {
      setAdminError("Platform Owner cannot be removed.");
      return;
    }

    try {
      const currentAdmins = session?.adminEmails || [];
      const updatedAdmins = currentAdmins.filter((em: string) => em !== emailToRemove);
      await updateDoc(doc(db, 'sessionAccess', sessionId!), {
        adminEmails: updatedAdmins
      });
      setAdminSuccess(`Successfully revoked access for ${emailToRemove}.`);
      setAdminError(null);
      setConfirmRevokeEmail(null);
    } catch (error: any) {
      setAdminError(error.message || 'Error revoking permissions.');
      setAdminSuccess(null);
      setConfirmRevokeEmail(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-800 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors" title="Back to Sessions">
              <ArrowLeft size={18} />
            </button>
            <h2 className="font-bold text-sm text-zinc-100 truncate flex-1">{session.title}</h2>
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-bold text-zinc-400 truncate uppercase tracking-wider">
              {getAdminStatusLabel(session.status)}
            </span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-5 overflow-y-auto">
          {[
            {
              title: 'System & Admin',
              tabs: [
                { id: 'settings', label: 'Settings', icon: Settings },
                { id: 'admins', label: 'Admins', icon: Shield },
              ]
            },
            {
              title: 'Onboarding Prep',
              tabs: [
                { id: 'welcome', label: 'Participant Experience', icon: Sparkles },
                { id: 'participants', label: 'Participants Roster', icon: Users },
              ]
            },
            {
              title: 'Workshop Content',
              tabs: [
                ...(session?.enableChallengeDiscovery ? [{ id: 'discovery', label: 'Challenge Discovery', icon: Compass }] : []),
                { id: 'challenges', label: 'Challenges', icon: Target },
                { id: 'resources', label: 'Resources', icon: FileText },
                { id: 'awards', label: 'Official Awards', icon: Award },
              ]
            },
            {
              title: 'Interactive Play',
              tabs: [
                { id: 'teams', label: 'Collaboration', icon: Network },
                { id: 'randomiser', label: 'Randomiser', icon: Shuffle },
                { id: 'display', label: 'Display Mode', icon: MonitorPlay },
              ]
            }
          ].map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1.5">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-3 mb-2">
                {group.title}
              </h3>
              <div className="space-y-0.5">
                {group.tabs.map(tab => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm font-semibold'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border border-transparent'
                      }`}
                    >
                      <tab.icon size={16} className={`shrink-0 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                      <span className="text-xs font-medium">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="w-full max-w-[1700px] mx-auto space-y-6">
          {/* Persistent Live Session Control */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 transition-all border-l-4 border-l-emerald-500">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  <Activity size={10} /> Live Facilitation Control
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-medium">Phase:</span>
                  <span className="text-sm font-bold text-zinc-200 bg-zinc-950 px-2 py-0.5 rounded-md border border-zinc-800">{currentPhase}</span>
                  <span className="text-zinc-650 text-xs">•</span>
                  <span className="text-xs text-zinc-400 font-medium font-mono">Step:</span>
                  <span className="text-sm font-bold text-emerald-400">{getAdminStatusLabel(session.status)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-3 w-full md:w-auto justify-end">
              {/* Previous / Next buttons */}
              <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={handlePrevStep}
                  disabled={currentStepIndex <= 0}
                  className="p-1 px-2.5 bg-transparent hover:bg-zinc-800 disabled:opacity-40 rounded-lg text-zinc-300 disabled:hover:bg-transparent transition-colors flex items-center gap-1 text-xs font-semibold"
                  title="Previous Step"
                >
                  <ChevronLeft size={16} />
                  <span className="hidden sm:inline">Prev</span>
                </button>
                <div className="w-[1px] bg-zinc-800 my-1"></div>
                <button
                  onClick={handleNextStep}
                  disabled={currentStepIndex === -1 || currentStepIndex >= sessionSteps.length - 1}
                  className="p-1 px-2.5 bg-transparent hover:bg-zinc-800 disabled:opacity-40 rounded-lg text-zinc-300 disabled:hover:bg-transparent transition-colors flex items-center gap-1 text-xs font-semibold"
                  title="Next Step"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Jump Dropdown */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-zinc-500 hidden sm:inline select-none">Jump to:</span>
                <select
                  value={session.status}
                  onChange={async (e) => {
                    await updateDoc(doc(db, 'sessions', sessionId!), { status: e.target.value });
                  }}
                  className="w-full sm:w-auto bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 font-medium focus:outline-none cursor-pointer"
                >
                  {['Opening', 'Challenge Discovery', 'Solutioning', 'Closing'].map(phaseName => {
                    const phaseSteps = sessionSteps.filter(s => s.phase === phaseName);
                    if (phaseSteps.length === 0) return null;
                    return (
                      <optgroup key={phaseName} label={phaseName} className="bg-zinc-900 text-zinc-500 font-bold uppercase text-[10px] tracking-wider my-1">
                        {phaseSteps.map(s => (
                          <option key={s.id} value={s.id} className="text-zinc-100 font-normal normal-case text-xs">
                            {s.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {activeTab === 'admins' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Shield className="text-emerald-500" />
                  Session Admins
                </h1>
                <p className="text-sm text-zinc-400">
                  Manage collaborative workshop facilitators and co-facilitators for this session.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Side: Add Facilitator */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 h-fit">
                  <h3 className="font-semibold text-lg text-zinc-100">Add Session Admin</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                    Collaborators must authenticate via Google Login. Enter their Google-associated email address to grant co-facilitator privileges inside this session.
                  </p>
                  
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-405 text-zinc-400 uppercase tracking-wider mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="facilitator@example.com"
                        value={newAdminEmail}
                        onChange={(e) => {
                          setNewAdminEmail(e.target.value);
                          setAdminError(null);
                          setAdminSuccess(null);
                        }}
                        className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-zinc-600"
                      />
                    </div>
                    {adminError && (
                      <p className="text-xs text-red-400 font-medium">{adminError}</p>
                    )}
                    {adminSuccess && (
                      <p className="text-xs text-emerald-400 font-medium">{adminSuccess}</p>
                    )}
                    <button
                      onClick={handleAddAdmin}
                      className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors text-sm cursor-pointer"
                    >
                      Grant Admin Access
                    </button>
                  </div>
                </div>

                {/* Right Side: Current Administrators list */}
                <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                  <h3 className="font-semibold text-lg text-zinc-100 flex items-center gap-2">
                    <span>Active Facilitators</span>
                    <span className="text-xs font-mono bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-zinc-400 rounded-full">
                      {(session?.adminEmails?.length || 0) + 1}
                    </span>
                  </h3>

                  <div className="space-y-3">
                    {/* Platform Owner / Primary Creator Info always displayed first */}
                    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-200">xaeltan@gmail.com</span>
                          <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Platform Owner
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-normal">Universal platforms developer with root master access privileges</p>
                      </div>
                      <div className="text-xs font-bold text-zinc-500">Protected</div>
                    </div>

                    {/* Original Creator of this session displayed next if different */}
                    {session?.ownerEmail && session.ownerEmail !== 'xaeltan@gmail.com' && (
                      <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-200">
                              {session.ownerEmail}
                            </span>
                            <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Original Creator
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 font-normal">Created and initiated this event canvas</p>
                        </div>
                        <div className="text-xs font-bold text-zinc-500">Protected</div>
                      </div>
                    )}

                    {/* Other added dynamic Admins */}
                    {(!session?.adminEmails || session.adminEmails.filter((em: string) => em !== 'xaeltan@gmail.com' && em !== session?.ownerEmail).length === 0) ? (
                      <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-800 rounded-xl text-sm">
                        No additional session admins added yet.
                      </div>
                    ) : (
                      session.adminEmails
                        .filter((em: string) => em !== 'xaeltan@gmail.com' && em !== session?.ownerEmail)
                        .map((email: string) => (
                          <div key={email} className="bg-zinc-950/40 border border-zinc-800 hover:border-zinc-750 transition-colors rounded-xl p-4 flex items-center justify-between animate-fadeIn">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{email}</span>
                                <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  Session Admin
                                </span>
                              </div>
                              <p className="text-xs text-zinc-500 font-normal">Full co-facilitation privileges inside this session workspace</p>
                            </div>
                            
                            {confirmRevokeEmail === email ? (
                              <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-1 duration-200">
                                <span className="text-xs text-red-400 font-bold hidden sm:inline">Are you sure?</span>
                                <button
                                  onClick={() => handleRemoveAdmin(email)}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold border border-red-600 rounded-lg text-xs transition-colors cursor-pointer shadow-lg shadow-red-950/20"
                                >
                                  Confirm Revoke
                                </button>
                                <button
                                  onClick={() => setConfirmRevokeEmail(null)}
                                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold cursor-pointer border border-zinc-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setAdminError(null);
                                  setAdminSuccess(null);
                                  setConfirmRevokeEmail(email);
                                }}
                                className="px-3 py-1.5 bg-red-950/20 hover:bg-red-900/20 text-red-400 font-bold border border-red-900/30 rounded-lg text-xs transition-colors cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">Session Settings</h1>
              
              {/* 1. Challenge Discovery Configuration Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-200">Challenge Discovery Configuration</h3>
                  <p className="text-xs text-zinc-400 mt-1 mb-4">
                    Configure upstream collaborative drafting, focus area interest parameters, and discovery workgroups.
                  </p>
                  
                  <div className="flex items-center gap-2 p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                    <input 
                      type="checkbox" 
                      id="enableChallengeDiscovery"
                      checked={session.enableChallengeDiscovery || false}
                      onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { enableChallengeDiscovery: e.target.checked })}
                      className="w-5 h-5 text-emerald-600 bg-zinc-900 border-zinc-700 rounded focus:ring-emerald-500"
                    />
                    <label htmlFor="enableChallengeDiscovery" className="text-sm text-zinc-300 font-medium select-none cursor-pointer">
                      Enable Challenge Discovery Mode <span className="text-zinc-500 text-xs font-normal">(allows participants to submit, vote, and select Focus Areas)</span>
                    </label>
                  </div>

                  {session.enableChallengeDiscovery && (
                    <div className="space-y-5 mt-5 pt-5 border-t border-zinc-800/60 animate-in fade-in duration-200">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">
                          Focus Area Selection Mode
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => updateDoc(doc(db, 'sessions', sessionId!), { focusAreaSelectionMode: 'single' })}
                            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                              session.focusAreaSelectionMode === 'single'
                                ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400 font-semibold shadow-sm'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-750'
                            }`}
                          >
                            <div className="text-sm font-semibold">Single Selection</div>
                            <div className="text-[11px] text-zinc-500 mt-0.5 leading-normal font-normal">
                              Participants may select ONLY one Focus Area. Selecting a new one automatically moves their interest.
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateDoc(doc(db, 'sessions', sessionId!), { focusAreaSelectionMode: 'multiple' })}
                            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                              session.focusAreaSelectionMode !== 'single'
                                ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400 font-semibold shadow-sm'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-750'
                            }`}
                          >
                            <div className="text-sm font-semibold">Multiple Selection</div>
                            <div className="text-[11px] text-zinc-500 mt-0.5 leading-normal font-normal">
                              Participants may select multiple Focus Areas simultaneously (Default). Perfect for early exploratory discovery.
                            </div>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400">
                          Challenge Workgroup Size Parameters
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">Preferred Workgroup Size</label>
                            <input 
                              type="number" 
                              value={session.preferredWgSize !== undefined ? session.preferredWgSize : (session.preferredTeamSize || 4)}
                              onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { preferredWgSize: parseInt(e.target.value) || 4 })}
                              className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-zinc-200"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">Min Workgroup Size</label>
                            <input 
                              type="number" 
                              value={session.minWgSize !== undefined ? session.minWgSize : (session.minTeamSize || 3)}
                              onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { minWgSize: parseInt(e.target.value) || 3 })}
                              className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-zinc-200"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">Max Workgroup Size</label>
                            <input 
                              type="number" 
                              value={session.maxWgSize !== undefined ? session.maxWgSize : (session.maxTeamSize || 6)}
                              onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { maxWgSize: parseInt(e.target.value) || 6 })}
                              className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-zinc-200"
                            />
                          </div>
                        </div>
                      </div>

                      <div className={`flex items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                        session.enableParticipantWgFormation 
                          ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' 
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      }`}>
                        <div className="flex items-start sm:items-center gap-3 flex-1">
                          <input 
                            type="checkbox" 
                            id="enableParticipantWgFormation"
                            checked={Boolean(session.enableParticipantWgFormation)}
                            onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { enableParticipantWgFormation: e.target.checked })}
                            className="w-4 h-4 mt-0.5 sm:mt-0 text-emerald-600 bg-zinc-900 border-zinc-700 rounded focus:ring-emerald-500 cursor-pointer"
                          />
                          <label htmlFor="enableParticipantWgFormation" className="text-sm select-none cursor-pointer">
                            <span className={session.enableParticipantWgFormation ? 'text-zinc-200 font-medium' : 'text-zinc-300'}>
                              Enable participant-led workgroup formation
                            </span>
                            <span className="block sm:inline sm:ml-1.5 text-zinc-500 text-xs font-normal">
                              (allows peer pairing during early discovery)
                            </span>
                          </label>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                          session.enableParticipantWgFormation 
                            ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/60' 
                            : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                        }`}>
                          {session.enableParticipantWgFormation ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Solutioning Configuration Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-200">Solutioning Configuration</h3>
                  <p className="text-xs text-zinc-400 mt-1 mb-4">
                    Configure downstream team formation, solution building size parameters, and peer self-selection traits.
                  </p>

                  <div className="space-y-4">
                    <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400">
                      Solution Team Size Parameters
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Preferred Team Size</label>
                        <input 
                          type="number" 
                          value={session.preferredTeamSize}
                          onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { preferredTeamSize: parseInt(e.target.value) || 4 })}
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-zinc-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Min Team Size</label>
                        <input 
                          type="number" 
                          value={session.minTeamSize}
                          onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { minTeamSize: parseInt(e.target.value) || 3 })}
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-zinc-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Max Team Size</label>
                        <input 
                          type="number" 
                          value={session.maxTeamSize}
                          onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { maxTeamSize: parseInt(e.target.value) || 6 })}
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-zinc-200"
                        />
                      </div>
                    </div>
                  </div>

                  <div className={`flex items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                    session.enableParticipantTeamFormation 
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' 
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  } mt-4`}>
                    <div className="flex items-start sm:items-center gap-3 flex-1">
                      <input 
                        type="checkbox" 
                        id="enableParticipantTeamFormation"
                        checked={Boolean(session.enableParticipantTeamFormation)}
                        onChange={(e) => updateDoc(doc(db, 'sessions', sessionId!), { enableParticipantTeamFormation: e.target.checked })}
                        className="w-4 h-4 mt-0.5 sm:mt-0 text-emerald-600 bg-zinc-900 border-zinc-700 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="enableParticipantTeamFormation" className="text-sm select-none cursor-pointer">
                        <span className={session.enableParticipantTeamFormation ? 'text-zinc-200 font-medium' : 'text-zinc-300'}>
                          Enable participant-led team formation
                        </span>
                        <span className="block sm:inline sm:ml-1.5 text-zinc-500 text-xs font-normal">
                          (allows peer pairing during implementation coding and designs)
                        </span>
                      </label>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                      session.enableParticipantTeamFormation 
                        ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/60' 
                        : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                    }`}>
                      {session.enableParticipantTeamFormation ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
                <div>
                  <h1 className="text-2xl font-bold">Projector Display Control</h1>
                  <p className="text-xs text-zinc-400 mt-1">Manage what is currently shown on the big screen in the room.</p>
                </div>
                <button
                  onClick={() => window.open(`/display/${sessionId}`, '_blank')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-950/20 shadow-emerald-950/40 shrink-0"
                >
                  <MonitorPlay size={16} />
                  Open Projector View
                </button>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-200 mb-1">Active View</h3>
                  <p className="text-xs text-zinc-500 mb-6">Select a screen view to project it instantly to the room display.</p>
                  
                  {session.enableChallengeDiscovery ? (
                    <div className="space-y-8 animate-fadeIn">
                      {/* Discovery Section */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/80">
                          <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                          <h4 className="text-xs font-extrabold uppercase tracking-widest text-yellow-500">Upstream Challenge Discovery</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                          {[
                            { id: 'Welcome', label: 'Welcome Screen', description: 'Poll & onboarding stats', icon: Users },
                            { id: 'Collaboration Styles', label: 'Collaboration Styles', description: 'Live archetype room mix', icon: Sparkles },
                            { id: 'Focus Areas', label: 'Focus Areas', description: 'Live workshop focus areas', icon: Target },
                            { id: 'Challenge Workgroups', label: 'Challenge Workgroups', description: 'Group lists & alignment', icon: Users },
                            { id: 'Challenge Voting', label: 'Challenge Voting', description: 'Live ranked voting results', icon: Sparkles },
                            { id: 'Voting Review', label: 'Voting Review', description: 'Live review and consolidation', icon: Award }
                          ].map(mode => {
                            const Icon = mode.icon;
                            const isActive = session.displayMode === mode.id;
                            return (
                              <button
                                key={mode.id}
                                onClick={() => updateDisplayMode(mode.id)}
                                className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between gap-3 group relative overflow-hidden h-32 select-none ${
                                  isActive 
                                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500 shadow-md shadow-emerald-500/5' 
                                    : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
                                }`}
                              >
                                <div className="flex justify-between items-start w-full">
                                  <span className={`p-1.5 rounded-lg ${isActive ? 'bg-emerald-900/40 text-emerald-400' : 'bg-zinc-900 text-zinc-500'}`}>
                                    <Icon size={16} />
                                  </span>
                                  {isActive && (
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold text-sm leading-tight text-zinc-100">{mode.label}</div>
                                  <div className="text-[11px] text-zinc-500 mt-1 line-clamp-1 group-hover:text-zinc-400 font-medium">{mode.description}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Solutioning Section */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/80">
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          <h4 className="text-xs font-extrabold uppercase tracking-widest text-blue-400">Downstream Solutioning</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                          {[
                            { id: 'Challenges', label: 'Challenges Spread', description: 'Downstream prompt cards', icon: Target },
                            { id: 'Participants', label: 'Participants', description: 'Directory of attendees', icon: Users },
                            { id: 'Teams', label: 'Solution Teams', description: 'Teamed cohorts display', icon: Sparkles },
                            { id: 'Resources', label: 'Resources & Prompts', description: 'Shared slides & briefs', icon: FileText },
                            { id: 'Randomiser', label: 'Presentation Picker', description: 'Bespoke selector tool', icon: Sparkles }
                          ].map(mode => {
                            const Icon = mode.icon;
                            const isActive = session.displayMode === mode.id;
                            return (
                              <button
                                key={mode.id}
                                onClick={() => updateDisplayMode(mode.id)}
                                className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between gap-3 group relative overflow-hidden h-32 select-none ${
                                  isActive 
                                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500 shadow-md shadow-emerald-500/5' 
                                    : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
                                }`}
                              >
                                <div className="flex justify-between items-start w-full">
                                  <span className={`p-1.5 rounded-lg ${isActive ? 'bg-emerald-900/40 text-emerald-400' : 'bg-zinc-900 text-zinc-500'}`}>
                                    <Icon size={16} />
                                  </span>
                                  {isActive && (
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold text-sm leading-tight text-zinc-100">{mode.label}</div>
                                  <div className="text-[11px] text-zinc-500 mt-1 line-clamp-1 group-hover:text-zinc-400 font-medium">{mode.description}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Only Downstream Solutioning Modes */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 animate-fadeIn">
                      {[
                        { id: 'Welcome', label: 'Welcome Screen', description: 'Poll & onboarding stats', icon: Users },
                        { id: 'Collaboration Styles', label: 'Collaboration Styles', description: 'Live archetype room mix', icon: Sparkles },
                        { id: 'Challenges', label: 'Challenges Spread', description: 'Downstream prompt cards', icon: Target },
                        { id: 'Participants', label: 'Participants', description: 'Directory of attendees', icon: Users },
                        { id: 'Teams', label: 'Solution Teams', description: 'Teamed cohorts display', icon: Sparkles },
                        { id: 'Resources', label: 'Resources & Prompts', description: 'Shared slides & briefs', icon: FileText },
                        { id: 'Randomiser', label: 'Presentation Picker', description: 'Bespoke selector tool', icon: Sparkles }
                      ].map(mode => {
                        const Icon = mode.icon;
                        const isActive = session.displayMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            onClick={() => updateDisplayMode(mode.id)}
                            className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between gap-3 group relative overflow-hidden h-32 select-none ${
                              isActive 
                                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500 shadow-md shadow-emerald-500/5' 
                                : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
                            }`}
                          >
                            <div className="flex justify-between items-start w-full">
                              <span className={`p-1.5 rounded-lg ${isActive ? 'bg-emerald-900/40 text-emerald-400' : 'bg-zinc-900 text-zinc-500'}`}>
                                <Icon size={16} />
                              </span>
                              {isActive && (
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-sm leading-tight text-zinc-100">{mode.label}</div>
                              <div className="text-[11px] text-zinc-500 mt-1 line-clamp-1 group-hover:text-zinc-400 font-medium">{mode.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {session.displayMode === 'Collaboration Styles' && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mt-6 space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-zinc-100">Collaboration Styles Reveal Mode</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">Control the suspense and reveal when the group results are displayed on the projector screen.</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 p-5 bg-zinc-900/40 rounded-xl border border-zinc-800">
                    <div className="flex-1 space-y-1">
                      <div className="text-xs font-semibold text-zinc-350">
                        Current Status: {session.revealArchetypes ? (
                          <span className="text-emerald-400 font-extrabold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] ml-1.5 inline-block">Live Revealed</span>
                        ) : (
                          <span className="text-amber-400 font-extrabold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] ml-1.5 inline-block">Suspenseful Waiting Block</span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {session.revealArchetypes 
                          ? "The projector is fully displaying the room's live style mix percentages, bar counts, and anonymous statement ripples." 
                          : "The projector is showing a gorgeous gathering loader with live counters. No percentages or counts are exposed yet."
                        }
                      </p>
                    </div>

                    <div className="flex items-center">
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'sessions', sessionId!), { 
                            revealArchetypes: !session.revealArchetypes 
                          });
                        }}
                        className={`px-4 py-2 rounded-xl font-extrabold text-[11px] uppercase tracking-wide transition-all flex items-center gap-2 select-none shrink-0 border border-transparent ${
                          session.revealArchetypes 
                            ? 'bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border-amber-500/20' 
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/20'
                        }`}
                      >
                        <Sparkles size={12} />
                        {session.revealArchetypes ? 'Hide Style Details' : '🎉 Reveal Collaboration Styles Live!'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'welcome' && (
            <div id="participant-experience-dashboard" className="space-y-8 animate-in fade-in duration-300">
              {/* HEADER CONTAINER */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-zinc-900/60 border border-zinc-800 p-6 rounded-2xl">
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold font-sans tracking-tight text-white flex items-center gap-2">
                    <Sparkles size={24} className="text-emerald-400" />
                    Participant Experience Dashboard
                  </h1>
                  <p className="text-zinc-400 text-xs">
                    Curate Icebreakers, Question Packs, Archetypes, Live Polls, and Participant Profile Signals to build the optimal participant onboarding flow.
                  </p>
                </div>
                {session.activeWelcomeQuestion && (
                  <button 
                    onClick={() => setActiveWelcomeQuestion(null)}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-350 hover:text-white text-xs font-semibold rounded-xl transition-colors border border-zinc-700 self-start sm:self-center shrink-0"
                  >
                    Clear Projector Display
                  </button>
                )}
              </div>

              {/* RESOLVE FLOW STATE AND SEQUENCING */}
              {(() => {
                const enabledPacks = session.enabledQuestionPacks || ['welcome_icebreakers', 'collaboration_archetypes'];
                const packOrder = session.questionPackOrder || QUESTION_PACKS.map(p => p.id);
                
                // Sort master QUESTION_PACKS based on the session's questionPackOrder
                const sortedPacks = [...QUESTION_PACKS].sort((a, b) => {
                  let idxA = packOrder.indexOf(a.id);
                  let idxB = packOrder.indexOf(b.id);
                  if (idxA === -1) idxA = 999;
                  if (idxB === -1) idxB = 999;
                  return idxA - idxB;
                });

                const activePacks = sortedPacks.filter(p => enabledPacks.includes(p.id));
                const projectorQuestions = activePacks.flatMap(p => p.questions)
                  .filter(q => q.showOnProjector && (!session.disabledQuestionIds || !session.disabledQuestionIds.includes(q.id)));

                const getCategoryStyles = (category: string) => {
                  switch (category) {
                    case 'General':
                      return { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Globe };
                    case 'Mission Innovation':
                      return { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Flame };
                    case 'Team Formation':
                      return { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Users };
                    case 'Experimental':
                      return { bg: 'bg-purple-500/10 text-purple-300 border-purple-500/20', icon: Lightbulb };
                    default:
                      return { bg: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: HelpCircle };
                  }
                };

                const movePackOption = async (packId: string, direction: 'up' | 'down') => {
                  const currentOrder = session.questionPackOrder || QUESTION_PACKS.map(p => p.id);
                  const idx = currentOrder.indexOf(packId);
                  if (idx === -1) return;
                  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
                  if (targetIdx < 0 || targetIdx >= currentOrder.length) return;

                  const newOrder = [...currentOrder];
                  const temp = newOrder[idx];
                  newOrder[idx] = newOrder[targetIdx];
                  newOrder[targetIdx] = temp;

                  await updateDoc(doc(db, 'sessions', sessionId!), { questionPackOrder: newOrder });
                };

                return (
                  <div className="space-y-8">
                    {/* SECTION 1: LIVE PROJECTOR QUESTION SELECTOR */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <MonitorPlay size={20} className="text-emerald-400" />
                        <h2 className="text-base font-bold text-zinc-100">Live Projector Polls</h2>
                      </div>
                      <p className="text-xs text-zinc-450 leading-relaxed">
                        Select an active question to project dynamic visual analytics (live Word Cloud or Multiple Choice bars) on the screen.
                      </p>

                      {projectorQuestions.length === 0 ? (
                        <div className="text-center p-8 bg-zinc-950 rounded-xl border border-dashed border-zinc-800 space-y-2">
                          <p className="text-xs text-zinc-500 font-medium">No live-compatible projector questions are currently active.</p>
                          <p className="text-[10px] text-zinc-600 max-w-sm mx-auto">
                            Ensure a pack containing projector questions is **Enabled** below, and that those individual questions are marked as **Active**.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {projectorQuestions.map(q => {
                            const isActive = session.activeWelcomeQuestion === q.id;
                            return (
                              <div 
                                key={q.id} 
                                className={`bg-zinc-950 border p-5 rounded-xl flex flex-col justify-between space-y-4 transition-all duration-300 ${
                                  isActive 
                                    ? 'border-emerald-500 ring-2 ring-emerald-500/10' 
                                    : 'border-zinc-800'
                                }`}
                              >
                                <div className="space-y-1.5">
                                  <div className="flex justify-between items-start gap-2">
                                    <span className="text-[9px] bg-zinc-850 text-zinc-400 px-2 py-0.5 rounded uppercase font-bold tracking-wider shrink-0 border border-zinc-800">
                                      {q.type === 'wordcloud' ? 'Word Cloud' : 'Multiple Choice'}
                                    </span>
                                    {isActive && (
                                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 animate-pulse">
                                        Live on Projector
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-sm font-bold text-zinc-100">{q.text}</h4>
                                </div>

                                <div className="flex gap-2 shrink-0">
                                  <button 
                                    onClick={() => setActiveWelcomeQuestion(q.id)}
                                    disabled={isActive}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                                      isActive
                                        ? 'bg-emerald-600/20 text-emerald-400 cursor-default border border-emerald-500/20'
                                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    }`}
                                  >
                                    {isActive ? 'Live Now' : 'Show on Projector'}
                                  </button>
                                  <button 
                                    onClick={() => {
                                      if (confirm("Reset responses for this live question? All historical data for this slide in this session will be cleared.")) {
                                        resetWelcomeResponses(q.id);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-red-950/10 hover:bg-red-950/30 text-red-400 border border-red-950/30 text-xs font-semibold rounded-lg transition-colors"
                                  >
                                    Reset
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* SECTION 2: QUESTION PACK MANAGEMENT & SEQUENCE FLOW */}
                    <div className="space-y-5">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                        <div className="space-y-0.5">
                          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                            <Shield size={18} className="text-emerald-400" />
                            Curate Onboarding Flow Pack Sequence
                          </h2>
                          <p className="text-xs text-zinc-500">
                            Reorder, enable, or disable packs. Participants will encounter them in this exact order.
                          </p>
                        </div>

                        {/* CATEGORY FILTER TABS */}
                        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                          {(['All', 'General', 'Mission Innovation', 'Team Formation', 'Experimental'] as const).map(cat => {
                            const count = cat === 'All' ? QUESTION_PACKS.length : QUESTION_PACKS.filter(p => p.category === cat).length;
                            const isSelected = selectedCategoryFilter === cat;
                            return (
                              <button
                                key={cat}
                                onClick={() => setSelectedCategoryFilter(cat)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                                  isSelected 
                                    ? 'bg-emerald-600 text-white' 
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                                }`}
                              >
                                {cat === 'All' ? 'All Packs' : cat} <span className={`text-[10px] opacity-75 ${isSelected ? 'text-emerald-200' : 'text-zinc-550'}`}>({count})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* DISPLAY INSTRUCTION ON REORDERING IF FILTERED */}
                      {selectedCategoryFilter !== 'All' && (
                        <p className="text-[11px] text-zinc-500 bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-900 border-dashed">
                          💡 You are filtering by <span className="text-zinc-350 font-semibold">{selectedCategoryFilter}</span>. Reorder handles ("Move Up"/"Move Down") remain active and shift packs within the overall master onboarding sequence.
                        </p>
                      )}

                      {/* LIST DOCK */}
                      <div className="grid grid-cols-1 gap-6">
                        {sortedPacks
                          .filter(pack => selectedCategoryFilter === 'All' || pack.category === selectedCategoryFilter)
                          .map(pack => {
                            const isPackEnabled = enabledPacks.includes(pack.id);
                            const masterIdx = sortedPacks.indexOf(pack);
                            const catData = getCategoryStyles(pack.category);
                            
                            return (
                              <div key={pack.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm hover:border-zinc-750 transition-colors">
                                {/* CARD HEADER */}
                                <div className="p-5 bg-zinc-900/60 border-b border-zinc-800/60 flex flex-col md:flex-row justify-between md:items-center gap-4">
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[10px] bg-zinc-950 text-zinc-400 px-2 py-0.5 rounded-md border border-zinc-800 font-bold font-sans">
                                        Step {masterIdx + 1} of {sortedPacks.length}
                                      </span>
                                      
                                      <span className={`text-[9px] border px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 ${catData.bg}`}>
                                        <catData.icon size={11} className="shrink-0" />
                                        <span>{pack.category}</span>
                                      </span>

                                      {isPackEnabled ? (
                                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                          ✓ Ready / Active
                                        </span>
                                      ) : (
                                        <span className="text-[9px] bg-zinc-800 text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                          Off in session
                                        </span>
                                      )}
                                    </div>
                                    
                                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                                      {pack.id === 'collaboration_archetypes' && <Sparkles size={16} className="text-amber-400 shrink-0" />}
                                      {pack.title}
                                    </h3>
                                    <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">{pack.description}</p>
                                  </div>
                                  
                                  <div className="flex items-center gap-3 shrink-0">
                                    {/* REORDER BUTTONS */}
                                    <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                                      <button
                                        onClick={() => movePackOption(pack.id, 'up')}
                                        disabled={masterIdx === 0}
                                        title="Move Up in flow"
                                        className={`p-1.5 rounded-lg transition-colors ${
                                          masterIdx === 0 
                                            ? 'text-zinc-700 cursor-not-allowed' 
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                        }`}
                                      >
                                        <ArrowUp size={14} />
                                      </button>
                                      <button
                                        onClick={() => movePackOption(pack.id, 'down')}
                                        disabled={masterIdx === sortedPacks.length - 1}
                                        title="Move Down in flow"
                                        className={`p-1.5 rounded-lg transition-colors ${
                                          masterIdx === sortedPacks.length - 1 
                                            ? 'text-zinc-700 cursor-not-allowed' 
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                        }`}
                                      >
                                        <ArrowDown size={14} />
                                      </button>
                                    </div>

                                    {/* ENABLE/DISABLE TOGGLE BUTTON */}
                                    <button
                                      onClick={async () => {
                                        const nextPacks = isPackEnabled
                                          ? enabledPacks.filter(id => id !== pack.id)
                                          : [...enabledPacks, pack.id];
                                        await updateDoc(doc(db, 'sessions', sessionId!), { enabledQuestionPacks: nextPacks });
                                      }}
                                      className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all border ${
                                        isPackEnabled
                                          ? 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border-emerald-500/30'
                                          : 'bg-zinc-800 hover:bg-zinc-750 text-zinc-400 border-zinc-700'
                                      }`}
                                    >
                                      {isPackEnabled ? '✓ Pack Enabled' : '+ Enable Pack'}
                                    </button>
                                  </div>
                                </div>

                                {/* List questions within the pack */}
                                {isPackEnabled && (
                                  <div className="p-6 bg-zinc-950/20 divide-y divide-zinc-800/50">
                                    {pack.questions.map((q, qidx) => {
                                      const isDisabled = session.disabledQuestionIds?.includes(q.id);
                                      return (
                                        <div key={q.id} className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row justify-between md:items-center gap-4">
                                          <div className="space-y-1.5 max-w-xl">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-[10px] text-zinc-500 font-bold font-sans">Q{qidx + 1}</span>
                                              <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-zinc-750">
                                                {q.type === 'wordcloud' ? 'Word Cloud' : 'Multiple Choice'}
                                              </span>
                                              {q.persistToProfile && (
                                                <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 font-bold rounded uppercase tracking-wider">
                                                  Enriches Profile
                                                </span>
                                              )}
                                              {!q.showOnProjector && (
                                                <span className="text-[9px] bg-zinc-800 text-zinc-550 px-1.5 font-bold rounded uppercase tracking-wider">
                                                  Private (No Projector)
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-xs font-semibold text-zinc-200">{q.text}</p>
                                            
                                            {/* Display preview options for MC questions */}
                                            {q.options && (
                                              <div className="pl-4 border-l border-zinc-800 text-[10px] text-zinc-500 space-y-0.5 font-sans leading-relaxed">
                                                {q.options.map((opt) => {
                                                  const text = typeof opt === 'string' ? opt : opt.text;
                                                  return <div key={text}>• {text}</div>;
                                                })}
                                              </div>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0">
                                            <button
                                              onClick={async () => {
                                                const currentDisabled = session.disabledQuestionIds || [];
                                                const nextDisabled = currentDisabled.includes(q.id)
                                                  ? currentDisabled.filter(id => id !== q.id)
                                                  : [...currentDisabled, q.id];
                                                await updateDoc(doc(db, 'sessions', sessionId!), { disabledQuestionIds: nextDisabled });
                                              }}
                                              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                                                isDisabled
                                                  ? 'bg-zinc-850 text-zinc-600 hover:text-zinc-400'
                                                  : 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-950/40'
                                              }`}
                                            >
                                              {isDisabled ? (
                                                <>
                                                  <EyeOff size={13} />
                                                  Disabled / Hidden
                                                </>
                                              ) : (
                                                <>
                                                  <Eye size={13} />
                                                  Active
                                                </>
                                              )}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Placeholders for other tabs */}
          {activeTab === 'challenges' && (
            <ChallengesTab 
              sessionId={sessionId!} 
              challenges={challenges} 
              session={session}
              focusAreas={focusAreas}
              participants={participants}
              teams={teams}
              proposedChallenges={proposedChallenges}
            />
          )}
          {activeTab === 'awards' && <AwardsTab sessionId={sessionId!} />}
          {activeTab === 'resources' && <ResourcesTab sessionId={sessionId!} resources={resources} />}
          {activeTab === 'participants' && (
            <ParticipantsTab 
              sessionId={sessionId!}
              participants={participants} 
              challenges={challenges} 
              teams={teams} 
              focusAreas={focusAreas}
              enableChallengeDiscovery={session.enableChallengeDiscovery || false}
              proposedChallenges={proposedChallenges}
              session={session}
            />
          )}
          {activeTab === 'teams' && <TeamsTab sessionId={sessionId!} session={session} participants={participants} teams={teams} challenges={challenges} focusAreas={focusAreas} proposedChallenges={proposedChallenges} />}
          {activeTab === 'randomiser' && <RandomiserTab sessionId={sessionId!} session={session} teams={teams} challenges={challenges} />}
          {activeTab === 'discovery' && (
            <DiscoveryTab 
              sessionId={sessionId!} 
              focusAreas={focusAreas} 
              proposedChallenges={proposedChallenges} 
              proposedChallengeVotes={proposedChallengeVotes}
              challengesCount={challenges.length}
              participants={participants}
              challenges={challenges}
              session={session}
            />
          )}
        </div>
      </div>
    </div>
  );
}


