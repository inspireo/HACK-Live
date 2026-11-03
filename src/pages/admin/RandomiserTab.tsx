import React, { useState, useEffect, useMemo } from 'react';
import { doc, updateDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Sparkles, RotateCcw, Play, SkipForward, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Team {
  id: string;
  name: string;
  challengeId: string;
  hasPresented?: boolean;
}

interface Challenge {
  id: string;
  title: string;
  displayOrder: number;
}

interface Session {
  id: string;
  displayMode: string;
  randomiserSelectedTeamId?: string | null;
  randomiserIsPicking?: boolean;
  randomiserStrategy?: string;
  randomiserLastChallengeId?: string | null;
}

export default function RandomiserTab({ 
  sessionId, 
  session, 
  teams, 
  challenges 
}: { 
  sessionId: string;
  session: Session;
  teams: Team[];
  challenges: Challenge[];
}) {
  const [isPickingLocal, setIsPickingLocal] = useState(false);
  const [pendingStrategy, setPendingStrategy] = useState<string | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const STRATEGIES = [
    { id: 'rotate', label: 'Rotate Between Challenges', description: 'Cycles through challenges, picking one team from each in turn' },
    { id: 'complete_challenge', label: 'Complete One Challenge Before Moving On', description: 'Randomly selects within the current challenge until done, then advances' },
    { id: 'fully_random', label: 'Fully Random Across All Teams', description: 'Picks any remaining team completely at random, regardless of challenge' }
  ];

  const currentStrategy = session.randomiserStrategy || 'complete_challenge';
  const strategyLabel = STRATEGIES.find(s => s.id === currentStrategy)?.label || 'Complete One Challenge Before Moving On';

  // Group teams by challenge and filter out challenges with no teams
  const challengesWithTeams = useMemo(() => {
    return challenges
      .filter(c => teams.some(t => t.challengeId === c.id))
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [challenges, teams]);

  // Find the current challenge (first one with unpresented teams) - useful for Complete Challenge Mode
  const currentChallenge = useMemo(() => {
    return challengesWithTeams.find(c => 
      teams.some(t => t.challengeId === c.id && !t.hasPresented)
    );
  }, [challengesWithTeams, teams]);

  // Teams in the current challenge that haven't presented yet
  const remainingTeamsInCurrentChallenge = useMemo(() => {
    if (!currentChallenge) return [];
    return teams.filter(t => t.challengeId === currentChallenge.id && !t.hasPresented);
  }, [currentChallenge, teams]);

  // Helper to find the next challenge in rotation that has unpresented teams
  const targetRotatedChallenge = useMemo(() => {
    if (challengesWithTeams.length === 0) return null;
    
    const lastChallengeId = session.randomiserLastChallengeId;
    const lastIndex = lastChallengeId ? challengesWithTeams.findIndex(c => c.id === lastChallengeId) : -1;
    
    for (let i = 1; i <= challengesWithTeams.length; i++) {
      const searchIndex = (lastIndex + i) % challengesWithTeams.length;
      const candidateChallenge = challengesWithTeams[searchIndex];
      const hasUnpresented = teams.some(t => t.challengeId === candidateChallenge.id && !t.hasPresented);
      if (hasUnpresented) {
        return candidateChallenge;
      }
    }
    return null;
  }, [challengesWithTeams, teams, session.randomiserLastChallengeId]);

  // Total remaining teams across all challenges
  const totalRemainingTeams = useMemo(() => {
    return teams.filter(t => !t.hasPresented).length;
  }, [teams]);

  const selectedTeam = useMemo(() => {
    if (!session.randomiserSelectedTeamId) return null;
    return teams.find(t => t.id === session.randomiserSelectedTeamId);
  }, [session.randomiserSelectedTeamId, teams]);

  const selectedTeamChallenge = useMemo(() => {
    if (!selectedTeam) return null;
    return challenges.find(c => c.id === selectedTeam.challengeId);
  }, [selectedTeam, challenges]);

  const hasBegun = useMemo(() => {
    return teams.some(t => t.hasPresented);
  }, [teams]);

  const handleStrategyChange = async (stratId: string) => {
    if (stratId === currentStrategy) return;
    if (hasBegun) {
      setPendingStrategy(stratId);
    } else {
      await applyStrategyChange(stratId);
    }
  };

  const applyStrategyChange = async (stratId: string) => {
    await updateDoc(doc(db, 'sessions', sessionId), {
      randomiserStrategy: stratId
    });
  };

  const handlePickNext = async () => {
    const strategy = session.randomiserStrategy || 'complete_challenge';
    let pool: Team[] = [];
    let targetChId: string | null = null;

    if (strategy === 'complete_challenge') {
      if (!currentChallenge) return;
      pool = teams.filter(t => t.challengeId === currentChallenge.id && !t.hasPresented);
      targetChId = currentChallenge.id;
    } else if (strategy === 'fully_random') {
      pool = teams.filter(t => !t.hasPresented);
    } else if (strategy === 'rotate') {
      if (!targetRotatedChallenge) return;
      pool = teams.filter(t => t.challengeId === targetRotatedChallenge.id && !t.hasPresented);
      targetChId = targetRotatedChallenge.id;
    }

    if (pool.length === 0) return;

    setIsPickingLocal(true);
    
    // Update session state to "picking"
    await updateDoc(doc(db, 'sessions', sessionId), {
      randomiserIsPicking: true,
      randomiserSelectedTeamId: null,
      displayMode: 'Randomiser' // Automatically switch to Randomiser view
    });

    // Simulate "picking" effect
    setTimeout(async () => {
      const randomIndex = Math.floor(Math.random() * pool.length);
      const pickedTeam = pool[randomIndex];
      const finalChId = targetChId || pickedTeam.challengeId;

      // Update team and session state
      const batch = writeBatch(db);
      batch.update(doc(db, 'teams', pickedTeam.id), { hasPresented: true });
      batch.update(doc(db, 'sessions', sessionId), {
        randomiserIsPicking: false,
        randomiserSelectedTeamId: pickedTeam.id,
        randomiserLastChallengeId: finalChId
      });

      await batch.commit();
      setIsPickingLocal(false);
    }, 2000);
  };

  const handleReset = async () => {
    const batch = writeBatch(db);
    
    // Reset all teams in this session
    teams.forEach(t => {
      batch.update(doc(db, 'teams', t.id), { hasPresented: false });
    });

    // Reset session state including rotation memory
    batch.update(doc(db, 'sessions', sessionId), {
      randomiserSelectedTeamId: null,
      randomiserIsPicking: false,
      randomiserLastChallengeId: null
    });

    await batch.commit();
    setShowConfirmReset(false);
  };

  const handleSkip = async () => {
    if (!selectedTeam) return;
    
    await updateDoc(doc(db, 'sessions', sessionId), {
      randomiserSelectedTeamId: null
    });
  };

  const isAllSelected = totalRemainingTeams === 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="text-emerald-500" /> Team Selection Randomiser
        </h2>
        {showConfirmReset ? (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-1 duration-200">
            <span className="text-xs text-red-400 font-bold hidden sm:inline">Are you sure?</span>
            <button 
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-650 hover:bg-red-500 text-white rounded-lg transition-all text-xs font-bold shadow-lg shadow-red-950/20 border border-red-650"
            >
              Confirm Reset
            </button>
            <button 
              onClick={() => setShowConfirmReset(false)}
              className="px-2.5 py-1.5 bg-zinc-805 hover:bg-zinc-755 text-zinc-300 rounded-lg text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setShowConfirmReset(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm font-medium"
          >
            <RotateCcw size={16} /> Reset Randomiser
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Status Card */}
        <div className="md:col-span-1 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col justify-between gap-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">Current Status</h3>
              {isAllSelected ? (
                <div className="flex items-center gap-3 text-emerald-400 font-bold p-4 bg-emerald-950/20 border border-emerald-900/50 rounded-xl">
                  <CheckCircle2 size={24} className="shrink-0 text-emerald-400" />
                  <span>All teams selected!</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentStrategy === 'rotate' ? (
                    <>
                      {targetRotatedChallenge ? (
                        <div className="space-y-2">
                          <div className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500 animate-pulse">
                            Up Next in Rotation
                          </div>
                          <div className="text-base font-black text-white leading-snug">
                            #{challengesWithTeams.indexOf(targetRotatedChallenge) + 1} – {targetRotatedChallenge.title}
                          </div>
                          <div className="text-xs text-zinc-400 flex items-center justify-between">
                            <span>Unpresented in this theme:</span>
                            <span className="font-extrabold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/30 text-xs">
                              {teams.filter(t => t.challengeId === targetRotatedChallenge.id && !t.hasPresented).length} left
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 italic p-3 bg-zinc-950/40 rounded-xl border border-zinc-800">
                          No remaining unpresented teams in rotation cycle
                        </div>
                      )}

                      <div className="pt-2 border-t border-zinc-800/40 space-y-2">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Remaining per Challenge:</div>
                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                          {challengesWithTeams.map((c, idx) => {
                            const remCount = teams.filter(t => t.challengeId === c.id && !t.hasPresented).length;
                            const isNextRotTarget = targetRotatedChallenge?.id === c.id;
                            return (
                              <div 
                                key={c.id} 
                                className={`flex items-center justify-between text-[11px] p-2 rounded-lg transition-colors ${
                                  isNextRotTarget 
                                    ? 'bg-emerald-950/20 text-emerald-400 font-semibold border border-emerald-900/30' 
                                    : remCount === 0 
                                      ? 'text-zinc-600 line-through bg-zinc-950/15' 
                                      : 'text-zinc-400 bg-zinc-950/20'
                                }`}
                              >
                                <span className="truncate max-w-[150px]" title={c.title}>
                                  #{idx + 1}. {c.title}
                                </span>
                                <span className={`font-mono text-xs ${remCount > 0 && !isNextRotTarget ? 'text-zinc-400 font-bold' : ''}`}>
                                  {remCount} left
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : currentStrategy === 'fully_random' ? (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Current Pool Mode</div>
                      <div className="text-base font-black text-white">
                        Fully Random Selection
                      </div>
                      <div className="text-xs text-zinc-400 bg-zinc-950/30 p-3 rounded-xl border border-zinc-800 leading-relaxed">
                        Picks completely at random across all yet-to-present teams, bypassing any challenge progression order.
                      </div>
                    </div>
                  ) : (
                    // Default / Complete challenge sequence
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-zinc-500 mb-1">Current Challenge</div>
                        <div className="text-base font-bold text-white truncate" title={currentChallenge?.title}>
                          {currentChallenge?.title || 'None'}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Remaining in challenge:</span>
                        <span className="text-lg font-black text-emerald-400">
                          {remainingTeamsInCurrentChallenge.length}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Global stats bar */}
                  <div className="border-t border-zinc-800 pt-3 flex justify-between text-xs text-zinc-400">
                    <span>Total remaining teams:</span>
                    <span className="font-extrabold text-zinc-355">{totalRemainingTeams} of {teams.length}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Team Selection Strategy Controller */}
            <div className="pt-4 border-t border-zinc-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Team Selection Strategy</span>
                <span className="text-[9px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded font-extrabold uppercase">
                  {currentStrategy === 'rotate' ? 'Rotation' : currentStrategy === 'fully_random' ? 'Full Random' : 'Sequential'}
                </span>
              </div>

              <div className="space-y-2">
                {STRATEGIES.map(strat => {
                  const isActive = currentStrategy === strat.id;
                  return (
                    <button
                      key={strat.id}
                      onClick={() => handleStrategyChange(strat.id)}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-start gap-2 ${
                        isActive 
                          ? 'bg-emerald-950/20 border-emerald-500/35 text-white font-semibold shadow-inner' 
                          : 'bg-zinc-950/45 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-400'
                      }`}
                      id={`strategy-btn-${strat.id}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          isActive ? 'border-emerald-500 text-emerald-500' : 'border-zinc-700'
                        }`}>
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                        </div>
                      </div>
                      <div>
                        <div className="font-bold text-[11px] leading-tight">{strat.label}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed font-normal">{strat.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Interactive mid-session strategy override safety check */}
              {pendingStrategy && (
                <div className="bg-amber-950/20 border border-amber-900/35 p-3 rounded-xl space-y-2.5 text-[11px] text-amber-300 animate-in fade-in slide-in-from-top-2">
                  <div className="flex gap-1.5 items-start">
                    <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <span className="font-bold block text-amber-200">Change strategy mid-session?</span> 
                      This may trigger unexpected sequences or bypass currently active loops. It is recommended to reset the session. Change anyway?
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setPendingStrategy(null)}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded text-[10px]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        await applyStrategyChange(pendingStrategy);
                        setPendingStrategy(null);
                      }}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-[10px]"
                    >
                      Yes, Switch
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {!isAllSelected && (
              <button
                onClick={handlePickNext}
                disabled={isPickingLocal || session.randomiserIsPicking}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-base transition-all ${
                  isPickingLocal || session.randomiserIsPicking
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                }`}
                id="btn-pick-next-team"
              >
                {isPickingLocal || session.randomiserIsPicking ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    >
                      <RotateCcw size={18} />
                    </motion.div>
                    Picking...
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    Pick Next Team
                  </>
                )}
              </button>
            )}

            {isAllSelected && (
              <div className="p-4 bg-emerald-950/20 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 leading-relaxed">
                <AlertCircle size={14} className="inline mr-1.5 mb-0.5" />
                All teams have been selected. Reset to start again.
              </div>
            )}
          </div>
        </div>

        {/* Selection Display */}
        <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 p-8 rounded-3xl flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
          {/* Current Strategy visibility display banner */}
          <div className="absolute top-4 right-4 bg-zinc-950/60 border border-zinc-800 px-3 py-1.5 rounded-full text-[10px] text-zinc-400 font-bold flex items-center gap-1.5 shadow-sm">
            <span className="text-zinc-500 font-extrabold uppercase text-[9px]">Active Strategy:</span>
            <span>{strategyLabel}</span>
          </div>

          <AnimatePresence mode="wait">
            {session.randomiserIsPicking ? (
              <motion.div
                key="picking"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="text-center space-y-4"
              >
                <div className="text-6xl font-black text-zinc-800 animate-pulse uppercase tracking-tighter">
                  Picking...
                </div>
                <div className="text-zinc-500 font-mono text-sm">
                  {currentStrategy === 'rotate' && targetRotatedChallenge 
                    ? `Cycling to: ${targetRotatedChallenge.title}` 
                    : currentStrategy === 'fully_random' 
                      ? 'Selecting from all remaining teams' 
                      : `Randomising within: ${currentChallenge?.title}`}
                </div>
              </motion.div>
            ) : selectedTeam ? (
              <motion.div
                key={selectedTeam.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-6 w-full max-w-lg"
              >
                <div className="space-y-2">
                  <div className="text-sm font-bold text-emerald-500 uppercase tracking-widest">Selected to Present</div>
                  <h3 className="text-5xl font-black text-white leading-tight">
                    {selectedTeam.name || 'Unnamed Team'}
                  </h3>
                  <div className="text-xl text-zinc-400 font-medium">
                    {selectedTeamChallenge?.title}
                  </div>
                </div>
                
                <div className="pt-8 flex justify-center gap-4">
                  <button 
                    onClick={handleSkip}
                    className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors font-medium"
                  >
                    <SkipForward size={18} /> Clear Selection
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center space-y-4"
              >
                <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Sparkles size={40} className="text-zinc-700" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-600">Ready to select?</h3>
                <p className="text-zinc-500 max-w-xs mx-auto">
                  Click "Pick Next Team" to randomly select a team from the current challenge.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Team List / History */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Users size={20} className="text-zinc-500" /> Team Status
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {challengesWithTeams.map(c => (
            <div key={c.id} className="space-y-3">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">{c.title}</div>
              <div className="space-y-2">
                {teams.filter(t => t.challengeId === c.id).map(t => (
                  <div 
                    key={t.id} 
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                      t.hasPresented 
                        ? 'bg-emerald-950/10 border-emerald-900/30 text-emerald-400/70' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <span className="font-medium truncate">{t.name || 'Unnamed Team'}</span>
                    {t.hasPresented && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
