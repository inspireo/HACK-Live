import { allocationEligible, solutionTeamId } from '../../../shared/participation';
import EventRolesEditor from '../../components/EventRolesEditor';
import { useState, useEffect } from 'react';
import { updateDoc, doc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Edit2, CheckCircle2, AlertCircle, HelpCircle, Trash2, X, Download } from 'lucide-react';
import { ARCHETYPES, getLeanings } from '../../data/questionPacks';
import { exportToCSV } from '../../utils/csv';
import { identityRequest } from '../../identity';

interface ParticipantsTabProps {
  sessionId?: string;
  participants: any[];
  challenges: any[];
  teams: any[];
  focusAreas?: any[];
  enableChallengeDiscovery?: boolean;
  proposedChallenges?: any[];
  session?: any;
}

export default function ParticipantsTab({
  sessionId,
  participants,
  challenges,
  teams,
  focusAreas = [],
  enableChallengeDiscovery = false,
  proposedChallenges = [],
  session = {}
}: ParticipantsTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [deletingParticipantId, setDeletingParticipantId] = useState<string | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [legacyParticipantId, setLegacyParticipantId] = useState('');
  const [memberUid, setMemberUid] = useState('');

  const [discoveryTeams, setDiscoveryTeams] = useState<any[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(
      query(collection(db, 'discoveryTeams'), where('sessionId', '==', sessionId)),
      (snap) => {
        setDiscoveryTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => console.error('Error listening to discoveryTeams in ParticipantsTab:', err)
    );
    return unsub;
  }, [sessionId]);

  const handleExportCSV = () => {
    const headers = [
      'Participant Name',
      'Email',
      'Descriptor Word',
      'Design Thinking Proficiency',
      'Collaboration Archetype Leaning',
      'Selected Focus Areas',
      'Selected Challenge',
      'Challenge Workgroup',
      'Solution Team',
      'Joined Timestamp'
    ];

    const rows = participants.map(p => {
      let archetypeLeaning = 'None';
      if (p.archetypeScores) {
        const { primary, secondary } = getLeanings(p.archetypeScores);
        const primaryArch = primary ? ARCHETYPES[primary]?.label : '';
        const secondaryArch = secondary ? ARCHETYPES[secondary]?.label : '';
        archetypeLeaning = primaryArch ? (secondaryArch ? `${primaryArch} (Secondary: ${secondaryArch})` : primaryArch) : 'None';
      }

      const selectedFocus = (p.interestedFocusAreaIds || [])
        .map((id: string) => focusAreas.find(fa => fa.id === id)?.title || id)
        .join(', ');

      const challengeTitle = challenges.find(c => c.id === p.selectedChallengeId || c.id === p.selected_challenge_id)?.title || '';
      
      const discTeam = discoveryTeams.find(dt => dt.id === p.discoveryTeamId || dt.id === p.discovery_team_id);
      const workgroupName = discTeam?.name || (discTeam?.code ? `Group ${discTeam.code}` : '');

      const solTeam = teams.find(t => t.id === solutionTeamId(p));
      const teamName = solTeam?.name || (solTeam?.code ? `Team ${solTeam.code}` : '');

      return [
        p.name || '',
        p.email || p.emailAddress || '',
        p.adjective || '',
        p.designThinkingProficiency || '',
        archetypeLeaning,
        selectedFocus,
        challengeTitle,
        workgroupName,
        teamName,
        p.createdAt ? new Date(p.createdAt).toISOString() : ''
      ];
    });

    const cleanName = (session?.name || sessionId || 'session')
      .toLowerCase()
      .replace(/[^a-z0-0a-z_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `hacklive_participants_${cleanName}_${dateStr}.csv`;

    exportToCSV(filename, headers, rows);
  };

  const clearMessages = () => {
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleEdit = (p: any) => {
    setEditingId(p.id);
    const existingIds = p.interestedFocusAreaIds && Array.isArray(p.interestedFocusAreaIds)
      ? p.interestedFocusAreaIds
      : (p.interestedFocusAreaId ? [p.interestedFocusAreaId] : []);
    setEditData({
      name: p.name,
      adjective: p.adjective,
      designThinkingProficiency: p.designThinkingProficiency,
      selectedChallengeId: p.selectedChallengeId || '',
      teamId: solutionTeamId(p) || '',
      interestedFocusAreaIds: existingIds
    });
  };

  const handleSave = async (p: any) => {
    clearMessages();
    try {
      let newTeamId = editData.teamId;
      let newChallengeId = editData.selectedChallengeId || null;

      if (solutionTeamId(p) && !newChallengeId) {
        if (!confirm("This will remove the participant from their current team. Continue?")) {
          return;
        }
        newTeamId = '';
      }

      const isAssigned = !!newTeamId;
      const focusIds = editData.interestedFocusAreaIds || [];
      const focusId = focusIds.length > 0 ? focusIds[0] : null;

      await updateDoc(doc(db, 'participants', p.id), {
        name: editData.name,
        adjective: editData.adjective,
        designThinkingProficiency: editData.designThinkingProficiency,
        selectedChallengeId: newChallengeId,
        teamId: newTeamId || null,
        solutioning_team_id: newTeamId || null,
        isAssigned,
        interestedFocusAreaIds: focusIds,
        interestedFocusAreaId: focusId
      });
      setSuccessMessage('Participant updated successfully.');
      setEditingId(null);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to update participant.');
    }
  };

  const handleDelete = async () => {
    if (!deletingParticipantId || deleteConfirmationText !== 'DELETE') return;
    clearMessages();

    try {
      const p = participants.find(part => part.id === deletingParticipantId);
      const wasInTeam = !!(p && solutionTeamId(p));

      await identityRequest('remove-registration', { participantId: deletingParticipantId, sessionId });
      
      setSuccessMessage(wasInTeam 
        ? 'Participant deleted and removed from their team.' 
        : 'Participant deleted successfully.');
      
      setDeletingParticipantId(null);
      setDeleteConfirmationText('');
    } catch (err) {
      console.error(err);
      setErrorMessage('Could not delete participant. Please try again.');
    }
  };

  // Extract all Focus Area interests/interactions for a participant
  const getParticipantFocusInterests = (p: any) => {
    const list: any[] = [];
    
    // 1. Directly selected Focus Area interests (array or single string)
    if (p.interestedFocusAreaIds && Array.isArray(p.interestedFocusAreaIds)) {
      p.interestedFocusAreaIds.forEach((id: string) => {
        const directFa = focusAreas.find(fa => fa.id === id);
        if (directFa && !list.some(item => item.id === directFa.id)) {
          list.push(directFa);
        }
      });
    } else if (p.interestedFocusAreaId) {
      const directFa = focusAreas.find(fa => fa.id === p.interestedFocusAreaId);
      if (directFa) {
        list.push(directFa);
      }
    }
    
    // 2. Focus Areas of challenge proposals they created/submitted
    if (proposedChallenges && p.uid) {
      proposedChallenges.forEach(pc => {
        if (pc.uid === p.uid && pc.focusAreaId) {
          const pitchFa = focusAreas.find(fa => fa.id === pc.focusAreaId);
          if (pitchFa && !list.some(item => item.id === pitchFa.id)) {
            list.push(pitchFa);
          }
        }
      });
    }

    // Fallback: match by name if Auth uid is missing or mismatched
    if (proposedChallenges && p.name) {
      proposedChallenges.forEach(pc => {
        if (pc.submitterName && pc.submitterName.toLowerCase().trim() === p.name.toLowerCase().trim() && pc.focusAreaId) {
          const pitchFa = focusAreas.find(fa => fa.id === pc.focusAreaId);
          if (pitchFa && !list.some(item => item.id === pitchFa.id)) {
            list.push(pitchFa);
          }
        }
      });
    }

    return list;
  };

  const renderInterests = (p: any) => {
    const pInterests = getParticipantFocusInterests(p);
    if (pInterests.length === 0) {
      return <span className="text-zinc-650 italic text-[11px] select-none">No interests declared</span>;
    }

    return (
      <div className="flex flex-wrap gap-1 max-w-[240px]">
        {pInterests.map((fa, idx) => (
          <span 
            key={fa.id || idx} 
            title={fa.description || fa.title}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 select-none cursor-help transition-all hover:bg-emerald-900/40"
          >
            {fa.title}
          </span>
        ))}
      </div>
    );
  };

  const renderArchetype = (p: any) => {
    if (!p.archetypeScores) {
      return <span className="text-zinc-600 italic text-[11px] select-none">-</span>;
    }
    const { primary, secondary } = getLeanings(p.archetypeScores);
    if (!primary) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-medium border border-zinc-700/30 select-none">
          🕊️ Neutral
        </span>
      );
    }
    const primaryArch = ARCHETYPES[primary];
    const secondaryArch = secondary ? ARCHETYPES[secondary] : null;

    return (
      <div className="flex flex-wrap items-center gap-1.5 select-none" title={`Primary Leaning: ${primaryArch?.label || ''}${secondaryArch ? `, Secondary Leaning: ${secondaryArch.label}` : ''}`}>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
          <span>{primaryArch?.emoji}</span>
          <span>{primaryArch?.label}</span>
        </span>
        {secondaryArch && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
            <span>{secondaryArch?.emoji}</span>
            <span>{secondaryArch?.label}</span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {sessionId && <EventRolesEditor sessionId={sessionId} participants={participants} challenges={challenges} />}
      <details className="p-4 border border-zinc-700 rounded-xl">
        <summary>Link a legacy registration</summary>
        <p className="my-3 text-sm">Independently verify the person and their account ID before linking. An old UID, name or phone passcode is not proof. Linking preserves workshop/team history and refuses conflicting registrations.</p>
        <form className="space-y-3" onSubmit={async event => {
          event.preventDefault(); clearMessages();
          if (!participants.some(participant => participant.id === legacyParticipantId && !participant.memberId)) { setErrorMessage('Select an unlinked participant from this event.'); return; }
          try { await identityRequest('link-legacy', { participantId: legacyParticipantId, memberUid }); setSuccessMessage('Legacy registration linked.'); } catch (issue: any) { setErrorMessage(issue.message); }
        }}>
          <label className="block">Legacy participant<select aria-label="Legacy participant" className="block bg-zinc-900 p-2" value={legacyParticipantId} onChange={event => setLegacyParticipantId(event.target.value)} required><option value="">Select participant</option>{participants.filter(participant => !participant.memberId && participant.name !== 'Deleted member').map(participant => <option key={participant.id} value={participant.id}>{participant.name} ({participant.id})</option>)}</select></label>
          <label className="block">Verified member account ID<input className="block bg-zinc-900 p-2" value={memberUid} onChange={event => setMemberUid(event.target.value.trim())} required /></label>
          <button className="p-2 rounded bg-emerald-700">Link verified member</button>
        </form>
      </details>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Participants ({participants.length})</h2>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-805 hover:bg-zinc-800 hover:text-white text-zinc-200 border border-zinc-750/80 rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-950/50 border border-emerald-900 text-emerald-400 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} />
            <p>{successMessage}</p>
          </div>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-400 hover:text-emerald-200">
            <X size={18} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-950/50 border border-red-900 text-red-400 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} />
            <p>{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-red-400 hover:text-red-200">
            <X size={18} />
          </button>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/50 text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Descriptor</th>
                <th className="px-4 py-3 font-medium">Proficiency</th>
                <th className="px-4 py-3 font-medium">Archetype</th>
                {enableChallengeDiscovery && (
                  <th className="px-4 py-3 font-medium">Focus Area Interests</th>
                )}
                <th className="px-4 py-3 font-medium">Current Alignment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {participants.map(p => (
                <tr key={p.id} className="hover:bg-zinc-800/50 transition-colors">
                  {editingId === p.id ? (
                    <>
                      <td className="px-4 py-3">
                        <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" value={editData.adjective} onChange={e => setEditData({...editData, adjective: e.target.value})} className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <select value={editData.designThinkingProficiency} onChange={e => setEditData({...editData, designThinkingProficiency: e.target.value})} className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded">
                          <option value="Experienced">Experienced</option>
                          <option value="Trained">Trained</option>
                          <option value="Some exposure">Some exposure</option>
                          <option value="New to it">New to it</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {renderArchetype(p)}
                      </td>
                      {enableChallengeDiscovery && (
                        <td className="px-4 py-3 min-w-[200px]">
                          {session?.focusAreaSelectionMode === 'single' ? (
                            <select
                              value={editData.interestedFocusAreaIds?.[0] || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setEditData({
                                  ...editData,
                                  interestedFocusAreaIds: val ? [val] : []
                                });
                              }}
                              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
                            >
                              <option value="">-- No Selection --</option>
                              {focusAreas.map(fa => (
                                <option key={fa.id} value={fa.id}>{fa.title}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-col gap-1.5 bg-zinc-950/40 p-2 rounded-lg border border-zinc-800 max-h-[140px] overflow-y-auto">
                              {focusAreas.length === 0 ? (
                                <span className="text-[10px] text-zinc-500 italic">No Focus Areas added</span>
                              ) : (
                                focusAreas.map(fa => {
                                  const isChecked = (editData.interestedFocusAreaIds || []).includes(fa.id);
                                  return (
                                    <label key={fa.id} className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-zinc-300 hover:text-white">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          const prev = editData.interestedFocusAreaIds || [];
                                          const next = isChecked
                                            ? prev.filter((id: string) => id !== fa.id)
                                            : [...prev, fa.id];
                                          setEditData({
                                            ...editData,
                                            interestedFocusAreaIds: next
                                          });
                                        }}
                                        className="w-3.5 h-3.5 text-emerald-600 bg-zinc-900 border-zinc-700 rounded focus:ring-emerald-500/50"
                                      />
                                      <span className="truncate text-[11px] font-medium" title={fa.title}>{fa.title}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <select value={editData.selectedChallengeId} onChange={e => setEditData({...editData, selectedChallengeId: e.target.value})} className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded select-none">
                          <option value="">None / No Challenge Selected</option>
                          {challenges.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select disabled={!allocationEligible(p)} title={allocationEligible(p) ? undefined : "Only official participants are eligible for team allocation"} value={editData.teamId} onChange={e => setEditData({...editData, teamId: e.target.value})} className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded">
                          <option value="">Unassigned</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{t.name || 'Unnamed Team'} ({challenges.find((c: any) => c.id === t.challengeId)?.title})</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={() => handleSave(p)} className="text-emerald-400 hover:text-emerald-300 font-medium">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-300">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-zinc-400">{p.adjective || '-'}</td>
                      <td className="px-4 py-3 text-zinc-400">{p.designThinkingProficiency}</td>
                      <td className="px-4 py-3 font-medium">
                        {renderArchetype(p)}
                      </td>
                      {enableChallengeDiscovery && (
                        <td className="px-4 py-3">
                          {renderInterests(p)}
                        </td>
                      )}
                      <td className="px-4 py-3 truncate max-w-[200px]">
                        {p.selectedChallengeId ? (
                          <span className="text-zinc-300">{challenges.find(c => c.id === p.selectedChallengeId)?.title || 'Unknown'}</span>
                        ) : (
                          <span className="text-zinc-500 italic text-xs">None / Not selected</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {solutionTeamId(p) ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-semibold"><CheckCircle2 size={13} /> Assigned</span>
                            <span className="text-[11px] text-zinc-500 mt-0.5">{teams.find((t: any) => t.id === solutionTeamId(p))?.name || 'Unnamed Team'}</span>
                          </div>
                        ) : p.selectedChallengeId ? (
                          <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-semibold"><AlertCircle size={13} /> Unassigned</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-blue-400 text-xs font-semibold"><HelpCircle size={13} /> Selecting Challenge</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleEdit(p)} className="p-1 text-zinc-400 hover:text-white transition-colors" title="Edit Participant">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => { setDeletingParticipantId(p.id); setDeleteConfirmationText(''); clearMessages(); }} className="p-1 text-zinc-400 hover:text-red-400 transition-colors" title="Delete Participant">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {participants.length === 0 && (
                <tr>
                  <td colSpan={enableChallengeDiscovery ? 7 : 6} className="px-4 py-8 text-center text-zinc-500">No participants have joined yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingParticipantId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle size={24} />
              <h3 className="text-xl font-bold">Delete this participant?</h3>
            </div>
            
            <div className="text-zinc-300 space-y-2">
              <p>This will permanently remove <strong>{participants.find(p => p.id === deletingParticipantId)?.name}</strong> from the session.</p>
              <p className="text-sm text-zinc-400">They will also be removed from any team they are currently in.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-zinc-400">Type <span className="text-white font-mono font-bold">DELETE</span> to confirm</label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-center font-mono tracking-widest"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setDeletingParticipantId(null)} 
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
               >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                disabled={deleteConfirmationText !== 'DELETE'}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                Delete Participant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
