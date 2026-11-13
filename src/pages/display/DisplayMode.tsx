import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Hash, Users, Target, Sparkles, FileText, QrCode, Award } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import SafeHtml from '../../components/SafeHtml';
import { motion, AnimatePresence } from 'motion/react';
import { QUESTION_PACKS } from '../../data/questionPacks';

export default function DisplayMode() {
  const { sessionId } = useParams();
  const [session, setSession] = useState<any>(null);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [welcomeResponses, setWelcomeResponses] = useState<any[]>([]);
  const [discoveryTeams, setDiscoveryTeams] = useState<any[]>([]);
  const [focusAreas, setFocusAreas] = useState<any[]>([]);
  const [proposedChallenges, setProposedChallenges] = useState<any[]>([]);
  const [proposedChallengeVotes, setProposedChallengeVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const baseUrl = (import.meta as any).env.VITE_JOIN_URL || window.location.origin;
  const joinUrl = session?.code ? `${baseUrl}?code=${session.code}` : baseUrl;

  useEffect(() => {
    if (session?.name) {
      document.title = `${session.name} – #HACK Display`;
    } else {
      document.title = '#HACK Display';
    }
  }, [session?.name]);

  useEffect(() => {
    if (!sessionId || !auth.currentUser) return;

    const unsubSession = onSnapshot(doc(db, 'sessions', sessionId), (doc) => {
      if (doc.exists()) setSession({ id: doc.id, ...doc.data() });
      setLoading(false);
    }, (error) => {
      console.error('Display Session listener error:', error);
    });

    const unsubChallenges = onSnapshot(query(collection(db, 'challenges'), where('sessionId', '==', sessionId), where('isPublished', '==', true)), (snapshot) => {
      setChallenges(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => ((a.displayOrder ?? 0) - (b.displayOrder ?? 0)) || a.id.localeCompare(b.id)));
    }, (error) => {
      console.error('Display Challenges listener error:', error);
    });

    const unsubParticipants = onSnapshot(query(collection(db, 'participants'), where('sessionId', '==', sessionId)), (snapshot) => {
      setParticipants(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Display Participants listener error:', error);
    });

    const unsubTeams = onSnapshot(query(collection(db, 'teams'), where('sessionId', '==', sessionId)), (snapshot) => {
      setTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Display Teams listener error:', error);
    });

    const unsubDiscTeams = onSnapshot(query(collection(db, 'discoveryTeams'), where('sessionId', '==', sessionId)), (snapshot) => {
      setDiscoveryTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Display Discovery Teams listener error:', error);
    });

    const unsubResources = onSnapshot(query(collection(db, 'resources'), where('sessionId', '==', sessionId), where('isPublished', '==', true)), (snapshot) => {
      setResources(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0)));
    }, (error) => {
      console.error('Display Resources listener error:', error);
    });

    const unsubWelcome = onSnapshot(query(collection(db, 'welcomeResponses'), where('sessionId', '==', sessionId)), (snapshot) => {
      setWelcomeResponses(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Display Welcome responses listener error:', error);
    });

    const unsubFocusAreas = onSnapshot(query(collection(db, 'focusAreas'), where('sessionId', '==', sessionId)), (snapshot) => {
      setFocusAreas(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0)));
    }, (error) => {
      console.error('Display Focus Areas listener error:', error);
    });

    const unsubProposed = onSnapshot(query(collection(db, 'proposedChallenges'), where('sessionId', '==', sessionId)), (snapshot) => {
      setProposedChallenges(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (error) => {
      console.error('Display Proposed challenges listener error:', error);
    });

    const unsubProposedVotes = onSnapshot(query(collection(db, 'proposedChallengeVotes'), where('sessionId', '==', sessionId)), (snapshot) => {
      setProposedChallengeVotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Display Proposed votes listener error:', error);
    });

    return () => {
      unsubSession();
      unsubChallenges();
      unsubParticipants();
      unsubTeams();
      unsubDiscTeams();
      unsubResources();
      unsubWelcome();
      unsubFocusAreas();
      unsubProposed();
      unsubProposedVotes();
    };
  }, [sessionId, auth.currentUser]);

  if (loading || !session) return <div className="min-h-screen bg-black text-white flex items-center justify-center text-4xl">Loading...</div>;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="p-8 border-b border-zinc-900 flex justify-between items-center bg-zinc-950">
        <div className="flex items-center gap-4">
          <Hash size={48} className="text-emerald-500" />
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{session.title}</h1>
            <p className="text-xl text-zinc-400 mt-1">Join at <span className="text-emerald-400 font-mono">{baseUrl}</span> with code <span className="text-emerald-400 font-mono font-bold">{session.code}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-3xl font-bold text-emerald-400">{participants.length}</div>
            <div className="text-zinc-500 uppercase tracking-widest text-sm font-semibold">Participants</div>
          </div>
          
          <div className="bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
            <div className="bg-white p-1 rounded-lg">
              <QRCodeSVG 
                value={joinUrl}
                size={80}
                level="H"
                includeMargin={false}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-hidden flex flex-col">
        {session.displayMode === 'Welcome' && <DisplayWelcome session={session} responses={welcomeResponses} />}
        {session.displayMode === 'Focus Areas' && <DisplayFocusAreas focusAreas={focusAreas} participants={participants} />}
        {session.displayMode === 'Challenge Workgroups' && <DisplayChallengeWorkgroups discoveryTeams={discoveryTeams} participants={participants} focusAreas={focusAreas} />}
        {session.displayMode === 'Challenge Voting' && <DisplayChallengeVoting proposedChallenges={proposedChallenges} proposedChallengeVotes={proposedChallengeVotes} focusAreas={focusAreas} />}
        {session.displayMode === 'Voting Review' && <DisplayVotingReview proposedChallenges={proposedChallenges} proposedChallengeVotes={proposedChallengeVotes} focusAreas={focusAreas} />}
        {session.displayMode === 'Challenges' && <DisplayChallenges challenges={challenges} participants={participants} teams={teams} />}
        {session.displayMode === 'Participants' && <DisplayParticipants participants={participants} challenges={challenges} />}
        {session.displayMode === 'Teams' && <DisplayTeams teams={teams} discoveryTeams={discoveryTeams} participants={participants} challenges={challenges} session={session} />}
        {session.displayMode === 'Resources' && <DisplayResources resources={resources} />}
        {session.displayMode === 'Randomiser' && <DisplayRandomiser session={session} teams={teams} challenges={challenges} />}
        {session.displayMode === 'Collaboration Styles' && <DisplayCollaborationStyles session={session} participants={participants} />}
      </main>
    </div>
  );
}

function DisplayChallenges({ challenges, participants, teams }: { challenges: any[], participants: any[], teams: any[] }) {
  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-emerald-400"><Target size={32} /> Live Challenge Spread</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
        {challenges.map(c => {
          const pCount = participants.filter(p => p.selectedChallengeId === c.id).length;
          const tCount = teams.filter(t => t.challengeId === c.id).length;
          return (
            <div key={c.id} className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl flex flex-col justify-between">
              <div>
                <h3 className="text-2xl font-bold mb-4">{c.title}</h3>
                <SafeHtml html={c.summary} className="text-zinc-400 text-lg leading-relaxed" />
                      {c.submitterName && <p className="text-sm text-zinc-400 italic">Proposed by: {c.submitterName}</p>}
              </div>
              <div className="mt-8 pt-6 border-t border-zinc-800 flex justify-between items-end">
                <div>
                  <div className="text-5xl font-black text-emerald-400">{pCount}</div>
                  <div className="text-zinc-500 uppercase tracking-wider text-sm font-bold mt-2">Interested</div>
                </div>
                {tCount > 0 && (
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-400">{tCount}</div>
                    <div className="text-zinc-500 uppercase tracking-wider text-sm font-bold mt-1">Teams</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DisplayParticipants({ participants, challenges }: { participants: any[], challenges: any[] }) {
  return (
    <div className="flex-1 flex flex-col h-full">
      <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-emerald-400"><Users size={32} /> Participants</h2>
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {participants.map(p => {
              const challenge = challenges.find(c => c.id === p.selectedChallengeId);
              return (
                <div key={p.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
                  <h3 className="text-xl font-bold truncate">{p.name}</h3>
                  {challenge ? (
                    <p className="text-emerald-500 text-sm truncate mt-1">{challenge.title}</p>
                  ) : (
                    <p className="text-orange-500 text-sm truncate mt-1 font-medium">No challenge selected</p>
                  )}
                  <div className="mt-4 flex justify-between items-center">
                    <span className="text-xs text-zinc-500 bg-zinc-950 px-2 py-1 rounded">{p.designThinkingProficiency}</span>
                    {p.isAssigned ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Assigned"></span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-500" title="Unassigned"></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisplayTeams({ teams, discoveryTeams = [], participants, challenges, session }: { teams: any[], discoveryTeams?: any[], participants: any[], challenges: any[], session: any }) {
  const isDiscoveryPhase = session?.enableChallengeDiscovery && [
    'Focus Areas',
    'Discovery Team Formation',
    'Challenge Drafting',
    'Challenge Discovery',
    'Challenge Proposing',
    'Challenge Voting',
    'Voting Review'
  ].includes(session?.status);

  if (isDiscoveryPhase) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold flex items-center gap-3 text-emerald-400">
            <Users size={32} /> Challenge Workgroups
          </h2>
          <span className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full font-bold uppercase tracking-wider text-xs">
            Discovery Phase
          </span>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {discoveryTeams.map(dt => {
                const members = participants.filter(p => p.discoveryTeamId === dt.id || p.discovery_team_id === dt.id);
                return (
                  <div key={dt.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col justify-between">
                    <div>
                      <div className="mb-4">
                        <h3 className="text-2xl font-bold text-white">
                          {dt.name || 'Unnamed Challenge Workgroup'}
                        </h3>
                        <span className="text-zinc-500 font-mono text-xs block mt-1">
                          CW: <strong className="text-emerald-400">{dt.code || dt.id}</strong>
                        </span>
                      </div>
                      <ul className="space-y-3">
                        {members.map(m => (
                          <li key={m.id} className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                            <span className="font-semibold text-lg text-zinc-200">{m.name}</span>
                            {dt.leaderId === m.id && (
                              <span className="text-xs text-blue-400 font-bold uppercase tracking-wide">Leader</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {members.length === 0 && (
                        <p className="text-sm text-zinc-500 italic mt-2">No members joined yet.</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {discoveryTeams.length === 0 && (
                <div className="col-span-full text-center py-16 text-zinc-500 text-xl border border-dashed border-zinc-800 rounded-3xl">
                  No active Challenge Workgroups have been formed or joined yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-emerald-400"><Sparkles size={32} /> Solution Teams</h2>
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {teams.map(t => {
              const challenge = challenges.find(c => c.id === t.challengeId);
              const members = participants.filter(p => p.teamId === t.id);
              return (
                <div key={t.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col">
                  <div className="mb-6">
                    <h3 className={`text-2xl font-bold ${!t.name ? 'text-zinc-500 italic' : 'text-white'}`}>
                      {t.name || 'Unnamed Team'}
                    </h3>
                    <p className="text-emerald-500 font-medium mt-2">{challenge?.title}</p>
                  </div>
                  <div className="flex-1">
                    <ul className="space-y-3">
                      {members.map(m => (
                        <li key={m.id} className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl">
                          <span className="font-semibold text-lg">{m.name}</span>
                          <span className="text-sm text-zinc-500">{m.adjective}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisplayResources({ resources }: { resources: any[] }) {
  const getExternalLinkButtonLabel = (resource: any) => {
    if (resource.linkButtonLabel) return resource.linkButtonLabel;
    switch (resource.category) {
      case 'Workshop Materials': return 'Access materials';
      case 'Prompt': return 'Open Prompt Source';
      case 'Guide': return 'Open Full Guide';
      case 'Framework': return 'View Framework';
      case 'Example': return 'View Example';
      case 'Reflection': return 'Open Reflection';
      case 'Scripture': return 'Read Passage';
      case 'Tool': return 'Open Tool';
      default: return 'Open External Link';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-emerald-400"><FileText size={32} /> Resources & Prompts</h2>
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {resources.map(r => (
              <div key={r.id} className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl flex flex-col">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-blue-400">{r.title}</h3>
                  {r.category && (
                    <span className="inline-block mt-2 px-3 py-1 text-sm font-medium rounded-lg bg-zinc-800 text-zinc-300">
                      {r.category}
                    </span>
                  )}
                </div>
                <div className="text-zinc-300 text-lg leading-relaxed">
                  <SafeHtml html={r.summary} />
                </div>
                {r.sheetLink && (
                  <div className="mt-8 pt-6 border-t border-zinc-800">
                    <a href={r.sheetLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-lg text-blue-400 hover:text-blue-300 bg-blue-950/30 px-4 py-2 rounded-xl transition-colors w-fit">
                      {getExternalLinkButtonLabel(r)} &rarr;
                    </a>
                  </div>
                )}
              </div>
            ))}
            {resources.length === 0 && (
              <div className="col-span-full text-center py-12 text-zinc-500 text-xl border border-dashed border-zinc-800 rounded-3xl">
                No resources available yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisplayRandomiser({ session, teams, challenges }: { session: any, teams: any[], challenges: any[] }) {
  const selectedTeam = teams.find(t => t.id === session.randomiserSelectedTeamId);
  const challenge = challenges.find(c => c.id === selectedTeam?.challengeId);

  const strat = session.randomiserStrategy || 'complete_challenge';
  const stratLabel = strat === 'rotate' 
    ? 'Rotate Between Challenges' 
    : strat === 'fully_random' 
      ? 'Fully Random Across All Teams' 
      : 'Complete One Challenge Before Moving On';

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center relative w-full h-full">
      {/* Current Strategy visibility display banner for participants */}
      <div className="absolute top-8 right-8 bg-zinc-900/80 border border-zinc-800 px-4 py-2 rounded-full text-xs text-zinc-400 font-bold flex items-center gap-2 shadow-lg backdrop-blur-sm">
        <span className="text-zinc-500 font-extrabold uppercase text-[10px]">Active Strategy:</span>
        <span className="text-white">{stratLabel}</span>
      </div>

      <AnimatePresence mode="wait">
        {session.randomiserIsPicking ? (
          <motion.div
            key="picking"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            className="space-y-12"
          >
            <div className="relative">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                className="w-64 h-64 border-8 border-emerald-500/20 border-t-emerald-500 rounded-full mx-auto"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles size={80} className="text-emerald-500 animate-pulse" />
              </div>
            </div>
            <div className="space-y-4">
              <h2 className="text-8xl font-black text-white tracking-tighter uppercase italic">Picking...</h2>
              <p className="text-3xl text-zinc-500 font-medium uppercase tracking-widest">Randomising teams</p>
            </div>
          </motion.div>
        ) : selectedTeam ? (
          <motion.div
            key={selectedTeam.id}
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="space-y-12 w-full max-w-6xl"
          >
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-3xl font-black text-emerald-500 uppercase tracking-[0.3em]"
              >
                Up Next to Present
              </motion.div>
              
              <h3 className="text-[12rem] font-black text-white leading-[0.9] tracking-tighter drop-shadow-[0_0_50px_rgba(16,185,129,0.3)]">
                {selectedTeam.name || 'Unnamed Team'}
              </h3>
              
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-5xl text-zinc-400 font-bold"
              >
                {challenge?.title}
              </motion.div>
            </div>

            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="h-2 bg-emerald-500/30 rounded-full w-48 mx-auto"
            />
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="w-32 h-32 bg-zinc-900 rounded-full flex items-center justify-center mx-auto border border-zinc-800">
              <Sparkles size={64} className="text-zinc-800" />
            </div>
            <div className="space-y-4">
              <h2 className="text-6xl font-black text-zinc-800 uppercase tracking-tighter">Ready to Present</h2>
              <p className="text-2xl text-zinc-600 font-medium uppercase tracking-widest">Waiting for facilitator to pick a team</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DisplayWelcome({ session, responses }: { session: any, responses: any[] }) {
  const questionId = session.activeWelcomeQuestion;
  
  if (!questionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
        <div className="space-y-4">
          <h2 className="text-6xl font-black text-emerald-400">Welcome!</h2>
          <p className="text-2xl text-zinc-500 uppercase tracking-widest font-bold">
            The session will begin shortly
          </p>
        </div>
        <div className="w-24 h-1 bg-emerald-500/20 rounded-full" />
      </div>
    );
  }

  // Find the current question details in the loaded QUESTION_PACKS metadata
  const currentQuestion = QUESTION_PACKS.flatMap(p => p.questions).find(q => q.id === questionId);
  const questionText = currentQuestion ? currentQuestion.text : (questionId === 'q1' ? 'What brought you here today?' : 'How open are you to experimenting in missions?');
  const isWordCloud = currentQuestion ? currentQuestion.type === 'wordcloud' : (questionId === 'q1');

  const filteredResponses = responses.filter(r => r.questionId === questionId);

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="max-w-5xl w-full space-y-12">
        <div className="space-y-4">
          <h2 className="text-5xl font-black text-emerald-400 leading-tight">
            {questionText}
          </h2>
          <p className="text-2xl text-zinc-500 uppercase tracking-widest font-bold">
            {filteredResponses.length} {filteredResponses.length === 1 ? 'Response' : 'Responses'}
          </p>
        </div>

        <div className="min-h-[400px] flex items-center justify-center">
          {isWordCloud ? (
            <WordCloud responses={filteredResponses} />
          ) : (
            <BarChart responses={filteredResponses} options={currentQuestion?.options} />
          )}
        </div>
      </div>
    </div>
  );
}

function WordCloud({ responses }: { responses: any[] }) {
  const wordCounts = responses.reduce((acc: Record<string, number>, r) => {
    const words = r.response.split(/[\s,]+/).filter(Boolean);
    words.forEach((w: string) => {
      const normalized = w.toLowerCase().trim();
      if (normalized.length > 2) {
        acc[normalized] = (acc[normalized] || 0) + 1;
      }
    });
    return acc;
  }, {});

  const words: { text: string; count: number }[] = Object.entries(wordCounts).map(([text, count]) => ({ text, count: count as number }));
  const maxCount = Math.max(...words.map(w => w.count), 1);

  if (words.length === 0) {
    return <p className="text-zinc-700 text-3xl italic">Waiting for responses...</p>;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 p-8">
      {words.sort((a, b) => b.count - a.count).map(({ text, count }) => {
        const size = 1 + (count / maxCount) * 4; // 1rem to 5rem
        const opacity = 0.4 + (count / maxCount) * 0.6;
        return (
          <span 
            key={text} 
            style={{ fontSize: `${size}rem`, opacity }}
            className="font-bold tracking-tight transition-all duration-500 hover:text-emerald-400 cursor-default capitalize"
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

function BarChart({ responses, options }: { responses: any[], options?: any[] }) {
  const normalizedOptions = options 
    ? options.map(opt => typeof opt === 'string' ? opt : opt.text)
    : [
        "I'm all in! Let's try anything.",
        "Pretty open, I like trying new things.",
        "Open, but I have some reservations.",
        "A bit cautious, but willing to listen.",
        "I prefer sticking to what we know works."
      ];

  const counts = responses.reduce((acc: Record<string, number>, r) => {
    acc[r.response] = (acc[r.response] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const maxCount = Math.max(...(Object.values(counts) as number[]), 1);

  return (
    <div className="w-full max-w-3xl space-y-6 text-left">
      {normalizedOptions.map(option => {
        const count = counts[option] || 0;
        const percentage = (count / maxCount) * 100;
        return (
          <div key={option} className="space-y-2">
            <div className="flex justify-between items-end">
              <span className="text-xl font-semibold text-zinc-300">{option}</span>
              <span className="text-2xl font-black text-emerald-400">{count}</span>
            </div>
            <div className="h-4 bg-zinc-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DisplayFocusAreas({ focusAreas, participants }: { focusAreas: any[], participants: any[] }) {
  return (
    <div className="flex-1 flex flex-col h-full">
      <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-emerald-400">
        <Target size={32} /> Focus Areas
      </h2>
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
            {focusAreas.map(fa => {
              const interestCount = participants.filter(p => 
                p.interestedFocusAreaId === fa.id || 
                (p.interestedFocusAreaIds && Array.isArray(p.interestedFocusAreaIds) && p.interestedFocusAreaIds.includes(fa.id))
              ).length;
              return (
                <div key={fa.id} className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl flex flex-col justify-between transition-all hover:border-emerald-500/30">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                      {fa.title}
                    </h3>
                    <p className="text-zinc-400 text-lg leading-relaxed">{fa.description}</p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-zinc-800 flex justify-between items-center">
                    <span className="text-sm font-semibold tracking-wider text-zinc-500 uppercase">Participant Alignment</span>
                    <div className="flex items-center gap-2">
                       <span className="text-4xl font-black text-emerald-400">{interestCount}</span>
                       <span className="text-zinc-500 text-sm font-bold uppercase tracking-widest">{interestCount === 1 ? 'Interest' : 'Interests'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {focusAreas.length === 0 && (
              <div className="col-span-full text-center py-16 text-zinc-500 text-xl border border-dashed border-zinc-800 rounded-3xl">
                Waiting for Focus Areas to be posted.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisplayChallengeWorkgroups({ discoveryTeams, participants, focusAreas }: { discoveryTeams: any[], participants: any[], focusAreas: any[] }) {
  const sortedTeams = useMemo(() => {
    const sortedFocusAreas = [...focusAreas].sort((a, b) => {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });

    const getFaIndex = (faId: string) => {
      if (!faId) return 9999;
      const idx = sortedFocusAreas.findIndex(fa => fa.id === faId);
      return idx === -1 ? 9998 : idx;
    };

    return [...discoveryTeams].sort((a, b) => {
      const idxA = getFaIndex(a.focusAreaId);
      const idxB = getFaIndex(b.focusAreaId);
      if (idxA !== idxB) return idxA - idxB;
      
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [discoveryTeams, focusAreas]);

  return (
    <div className="flex-1 flex flex-col h-full">
      <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-emerald-400">
        <Users size={32} /> Challenge Workgroups
      </h2>
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedTeams.map(dt => {
              const members = participants.filter(p => p.discoveryTeamId === dt.id || p.discovery_team_id === dt.id);
              const fa = focusAreas.find(f => f.id === dt.focusAreaId);
              const isOpen = dt.isOpenToMore !== false;

              return (
                <div key={dt.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col justify-between transition-all hover:border-emerald-500/20">
                  <div>
                    <div className="flex justify-between items-start mb-4 gap-2">
                      <div>
                        <h3 className="text-2xl font-bold text-white leading-snug">
                          {dt.name || 'Unnamed Workgroup'}
                        </h3>
                        <span className="text-zinc-550 text-xs font-mono block mt-1">
                          CW Code: <strong className="text-emerald-400">{dt.code || dt.id}</strong>
                        </span>
                      </div>
                      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border text-center whitespace-nowrap shrink-0 ${
                        isOpen 
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40' 
                          : 'bg-zinc-950/40 text-zinc-500 border-zinc-800'
                      }`}>
                        {isOpen ? 'Open' : 'Full'}
                      </span>
                    </div>

                    {fa && (
                      <div className="mb-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-900/40">
                          {fa.title}
                        </span>
                      </div>
                    )}

                    <div className="space-y-2 mt-4">
                      <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">
                        Members ({members.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {members.map(m => (
                          <span key={m.id} className="px-3 py-1.5 bg-zinc-950 rounded-xl border border-zinc-800 text-sm font-semibold text-zinc-350 flex items-center gap-1.5">
                            {m.name}
                            {dt.leaderId === m.id && (
                              <span className="px-1 py-0.5 bg-amber-500/10 text-amber-500 rounded text-[9px] font-extrabold uppercase tracking-wider">L</span>
                            )}
                          </span>
                        ))}
                        {members.length === 0 && (
                          <span className="text-xs text-zinc-650 italic">No members yet...</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {discoveryTeams.length === 0 && (
              <div className="col-span-full text-center py-16 text-zinc-500 text-xl border border-dashed border-zinc-800 rounded-3xl">
                No active Challenge Workgroups have been formed or joined yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisplayChallengeVoting({ proposedChallenges, proposedChallengeVotes, focusAreas }: { proposedChallenges: any[], proposedChallengeVotes: any[], focusAreas: any[] }) {
  // Sort from high to low vote counts
  const sortedChallenges = [...proposedChallenges].map(pc => {
    const votesCount = proposedChallengeVotes.filter(v => v.proposedChallengeId === pc.id).length;
    const focus = focusAreas.find(f => f.id === pc.focusAreaId);
    return {
      ...pc,
      votesCount,
      focusTitle: focus?.title || 'General Theme'
    };
  }).sort((a, b) => b.votesCount - a.votesCount);

  const maxVotes = Math.max(...sortedChallenges.map(c => c.votesCount), 1);

  return (
    <div className="flex-1 flex flex-col h-full">
      <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-emerald-400">
        <Sparkles size={32} /> Live Challenge Hub: Voting & Submissions
      </h2>
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
          <div className="space-y-6 max-w-6xl mx-auto">
            {sortedChallenges.map((pc, idx) => {
              const pct = (pc.votesCount / maxVotes) * 100;
              const isTopVoted = idx === 0 && pc.votesCount > 0;

              return (
                <div 
                  key={pc.id} 
                  className={`p-6 rounded-3xl transition-all relative overflow-hidden flex flex-col md:flex-row gap-6 justify-between items-start md:items-center border ${
                    isTopVoted 
                      ? 'bg-emerald-500/20 border-emerald-500/50 shadow-lg shadow-emerald-500/5' 
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  {/* Visual Background Glow for Top Voted */}
                  {isTopVoted && (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                  )}

                  {/* Left content: Rank, title, focus area, subtler details */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-base font-extrabold ${
                        isTopVoted 
                          ? 'bg-emerald-500 text-black' 
                          : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-zinc-800 text-zinc-450 border border-zinc-700/50">
                        {pc.focusTitle}
                      </span>
                      {isTopVoted && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <Sparkles size={10} /> Top Voted
                        </span>
                      )}
                    </div>

                    <h3 className="text-2xl font-bold text-white tracking-tight leading-tight">
                      {pc.title}
                    </h3>
                    <p className="text-zinc-400 text-base leading-relaxed line-clamp-2">
                      {pc.description}
                    </p>
                    <p className="text-xs text-zinc-500 font-semibold select-none">
                      Proposed by: <span className="text-zinc-400">{pc.submitterName || 'Anonymous'}</span>
                      {pc.isRefinedByFacilitator && (
                        <span className="ml-2.5 inline-flex items-center gap-1 text-zinc-550 font-bold text-[10px]">
                          • <Sparkles size={11} className="text-amber-500 animate-pulse" /> Refined by facilitator
                        </span>
                      )}
                    </p>

                    {/* Progress Bar Display */}
                    <div className="w-full h-2.5 bg-zinc-950 rounded-full overflow-hidden mt-3 max-w-xl">
                      <div 
                        className={`h-full transition-all duration-1000 ease-out rounded-full ${
                          isTopVoted ? 'bg-emerald-500' : 'bg-emerald-600/60'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Right side: Giant vote indicator */}
                  <div className="md:text-right shrink-0">
                    <div className="flex items-baseline md:justify-end gap-1">
                      <span className={`text-6xl font-black ${isTopVoted ? 'text-emerald-400' : 'text-zinc-200'}`}>
                        {pc.votesCount}
                      </span>
                    </div>
                    <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider block mt-1">
                      {pc.votesCount === 1 ? 'Vote' : 'Votes'}
                    </span>
                  </div>
                </div>
              );
            })}
            {proposedChallenges.length === 0 && (
              <div className="text-center py-16 text-zinc-500 text-xl border border-dashed border-zinc-800 rounded-3xl">
                Waiting for challenge pitches to be submitted.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisplayVotingReview({ proposedChallenges, proposedChallengeVotes, focusAreas }: { proposedChallenges: any[], proposedChallengeVotes: any[], focusAreas: any[] }) {
  // Sort from high to low vote counts
  const sortedChallenges = [...proposedChallenges].map(pc => {
    const votesCount = proposedChallengeVotes.filter(v => v.proposedChallengeId === pc.id).length;
    const focus = focusAreas.find(f => f.id === pc.focusAreaId);
    return {
      ...pc,
      votesCount,
      focusTitle: focus?.title || 'General Theme'
    };
  }).sort((a, b) => b.votesCount - a.votesCount);

  const maxVotes = Math.max(...sortedChallenges.map(c => c.votesCount), 1);

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3 text-emerald-400">
            <Award size={32} /> Voting Review
          </h2>
          <p className="text-zinc-400 text-lg mt-1 font-medium">
            Facilitators are reviewing proposed challenges.
          </p>
        </div>
        <div className="px-5 py-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-500 rounded-2xl text-sm font-bold animate-pulse flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          Publishing Soon...
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
          <div className="space-y-6 max-w-6xl mx-auto">
            {sortedChallenges.map((pc, idx) => {
              const pct = (pc.votesCount / maxVotes) * 100;
              const isTopVoted = idx === 0 && pc.votesCount > 0;

              return (
                <div 
                  key={pc.id} 
                  className={`p-6 rounded-3xl transition-all relative overflow-hidden flex flex-col md:flex-row gap-6 justify-between items-start md:items-center border ${
                    isTopVoted 
                      ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-500/5' 
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  {/* Visual Background Glow for Top Voted */}
                  {isTopVoted && (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                  )}

                  {/* Left content: Rank, title, focus area, details */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-base font-extrabold ${
                        isTopVoted 
                          ? 'bg-emerald-500 text-black' 
                          : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-zinc-800 text-zinc-450 border border-zinc-700/50">
                        {pc.focusTitle}
                      </span>
                      {isTopVoted && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <Sparkles size={10} /> Top Voted
                        </span>
                      )}
                    </div>

                    <h3 className="text-2xl font-bold text-white tracking-tight leading-tight">
                      {pc.title}
                    </h3>
                    <p className="text-zinc-400 text-base leading-relaxed line-clamp-2">
                      {pc.description}
                    </p>
                    <p className="text-xs text-zinc-500 font-semibold select-none">
                      Proposed by: <span className="text-zinc-400">{pc.submitterName || 'Anonymous'}</span>
                      {pc.isRefinedByFacilitator && (
                        <span className="ml-2.5 inline-flex items-center gap-1 text-zinc-550 font-bold text-[10px]">
                          • <Sparkles size={11} className="text-amber-500 animate-pulse" /> Refined by facilitator
                        </span>
                      )}
                    </p>

                    {/* Progress Bar Display */}
                    <div className="w-full h-2.5 bg-zinc-950 rounded-full overflow-hidden mt-3 max-w-xl">
                      <div 
                        className={`h-full transition-all duration-1000 ease-out rounded-full ${
                          isTopVoted ? 'bg-emerald-500' : 'bg-emerald-600/60'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Right side: Giant vote indicator */}
                  <div className="md:text-right shrink-0">
                    <div className="flex items-baseline md:justify-end gap-1">
                      <span className={`text-6xl font-black ${isTopVoted ? 'text-emerald-400' : 'text-zinc-200'}`}>
                        {pc.votesCount}
                      </span>
                    </div>
                    <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider block mt-1">
                      {pc.votesCount === 1 ? 'Vote' : 'Votes'}
                    </span>
                  </div>
                </div>
              );
            })}
            {proposedChallenges.length === 0 && (
              <div className="text-center py-16 text-zinc-500 text-xl border border-dashed border-zinc-800 rounded-3xl">
                No proposed pitches to display.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisplayCollaborationStyles({ session, participants }: { session: any, participants: any[] }) {
  const counts = {
    driver: 0,
    champion: 0,
    futurist: 0,
    builder: 0,
    explorer: 0
  };

  participants.forEach(p => {
    if (p.primaryArchetype && p.primaryArchetype in counts) {
      counts[p.primaryArchetype as 'driver' | 'champion' | 'futurist' | 'builder']++;
    } else {
      if (p.persistedAnswers && Object.keys(p.persistedAnswers).length > 0) {
        counts.explorer++;
      }
    }
  });

  const totalRespondents = counts.driver + counts.champion + counts.futurist + counts.builder + counts.explorer;

  const statementsList = [
    { text: "✨ Several people here naturally lean toward imagining bold, new possibilities.", type: "futurist" },
    { text: "✨ We have participants who love introducing out-of-the-box ideas and challenging conventions.", type: "futurist" },
    { text: "🚀 Several people in this room excel at keeping our momentum forward and milestones met.", type: "driver" },
    { text: "🚀 We have participants who naturally shine at organizing complexity into clear actions.", type: "driver" },
    { text: "🗣 We have people who naturally advocate for user needs and deep community empathy.", type: "champion" },
    { text: "🗣 A group in this room keeps human experiences and user stories at the absolute center.", type: "champion" },
    { text: "🛠 Many participants here enjoy making ideas practical, tangible, and visible.", type: "builder" },
    { text: "🛠 A group of creators in this room is ready to build interactive, demo-able prototypes.", type: "builder" },
    { text: "🌱 We have participants who are in a fresh, open-minded explorer posture, ready to support any dimension of the team!", type: "explorer" },
    { text: "🌱 Several curious minds here are keeping their options open and exploring new ways to collaborate.", type: "explorer" }
  ];

  const activeStatements = statementsList.filter(s => counts[s.type as keyof typeof counts] > 0);
  const defaultStatements = [
    "✨ The room is full of collaborative energy, ready to explore fresh pathways together.",
    "🌱 Every contribution style is valued here. We are co-creating a spiritually hospitable space.",
    "🤝 Trust the process. Different styles bring beautiful diversity to our workshop teams."
  ];
  const finalStatements = activeStatements.length > 0 ? activeStatements.map(s => s.text) : defaultStatements;

  const [statementIndex, setStatementIndex] = useState(0);

  useEffect(() => {
    if (finalStatements.length <= 1) return;
    const interval = setInterval(() => {
      setStatementIndex((prev) => (prev + 1) % finalStatements.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [finalStatements]);

  const isRevealed = session.revealArchetypes === true;

  return (
    <div className="flex-1 flex flex-col justify-between max-w-6xl mx-auto w-full space-y-8 py-4">
      <div className="text-center space-y-3">
        <h2 className="text-5xl font-black bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 bg-clip-text text-transparent flex items-center justify-center gap-3">
          <Sparkles className="text-emerald-400 animate-pulse" size={40} />
          Collaboration Styles in the Room
        </h2>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto font-medium">
          A live look at our group's natural contribution patterns. We welcome every posture — from clear specialists to open explorers.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!isRevealed ? (
          <motion.div
            key="mysterious-waiting"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-zinc-950/60 border border-zinc-900 rounded-3xl space-y-8 shadow-inner my-8"
          >
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-emerald-500/10 border-t-emerald-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles size={32} className="text-teal-400 animate-bounce" />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-3xl font-bold text-zinc-100">Gathering Collaboration Waves...</h3>
              <p className="text-zinc-400 text-base max-w-md mx-auto">
                Facilitator is preparing the big reveal. Answer your onboarding questions now to add your vibe to the live room mix!
              </p>
            </div>

            <div className="flex gap-8 text-left bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
              <div>
                <span className="text-4xl font-extrabold text-emerald-400 block">{participants.length}</span>
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Profiles Joined</span>
              </div>
              <div className="w-px bg-zinc-800" />
              <div>
                <span className="text-4xl font-extrabold text-teal-400 block">
                  {participants.filter(p => p.persistedAnswers && Object.keys(p.persistedAnswers).length > 0).length}
                </span>
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Responses In</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="revealed-dashboard"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex-1 max-w-4xl mx-auto w-full my-4"
          >
            <div className="bg-zinc-950/85 border border-zinc-900 p-8 rounded-3xl space-y-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-6">
                  <h3 className="text-xl font-bold text-zinc-300">Room Balance & Mix</h3>
                  <span className="text-xs text-zinc-500 font-semibold px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
                    {totalRespondents} active signals
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {[
                    {
                      key: 'driver',
                      label: 'Project Drivers',
                      emoji: '🚀',
                      desc: 'helping teams move forward and structure progress',
                      count: counts.driver,
                      color: 'from-amber-500 to-orange-400',
                      bg: 'bg-amber-500/10',
                      border: 'border-amber-500/20'
                    },
                    {
                      key: 'champion',
                      label: 'User Champions',
                      emoji: '🗣',
                      desc: 'empathy, design research, and people insight',
                      count: counts.champion,
                      color: 'from-purple-500 to-violet-400',
                      bg: 'bg-purple-500/10',
                      border: 'border-purple-500/20'
                    },
                    {
                      key: 'futurist',
                      label: 'Futurists',
                      emoji: '✨',
                      desc: 'fresh ideas, bold visions, and possibilities',
                      count: counts.futurist,
                      color: 'from-pink-500 to-rose-400',
                      bg: 'bg-pink-500/10',
                      border: 'border-pink-500/20'
                    },
                    {
                      key: 'builder',
                      label: 'Builders',
                      emoji: '🛠',
                      desc: 'making ideas tangible and building practical prototypes',
                      count: counts.builder,
                      color: 'from-cyan-500 to-sky-400',
                      bg: 'bg-cyan-500/10',
                      border: 'border-cyan-500/20'
                    },
                    {
                      key: 'explorer',
                      label: 'Fresh Explorers',
                      emoji: '🌱',
                      desc: 'still exploring where and how they can best contribute',
                      count: counts.explorer,
                      color: 'from-emerald-500 to-teal-400',
                      bg: 'bg-emerald-500/10',
                      border: 'border-emerald-500/20'
                    }
                  ].map((style) => {
                    const percentage = totalRespondents > 0 ? Math.round((style.count / totalRespondents) * 100) : 0;
                    return (
                      <div key={style.key} className={`space-y-2 ${style.key === 'explorer' ? 'md:col-span-2' : ''}`}>
                        <div className="flex justify-between items-baseline">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{style.emoji}</span>
                            <span className="font-bold text-zinc-100">{style.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-zinc-400">
                            <span className="text-lg font-extrabold text-white">{style.count}</span>
                            <span className="text-xs">({percentage}%)</span>
                          </div>
                        </div>

                        <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 1.2, ease: "easeOut" }}
                            className={`h-full bg-gradient-to-r ${style.color}`}
                          />
                        </div>

                        <p className="text-xs text-zinc-550 italic">
                          Participants leaning toward {style.desc}.
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
