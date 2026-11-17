import { InfoHelp } from '../../components/ui/InfoHelp';
import TeamRoleEditor from '../../components/TeamRoleEditor';
import { allocationEligible, solutionTeamId } from '../../../shared/participation';
import { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, updateDoc, doc, writeBatch, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Sparkles, Users, AlertCircle, CheckCircle2, Edit2, Trash2, Plus, Search, X, ArrowRightLeft, UserPlus, UserMinus, Folder, Target, Download } from 'lucide-react';
import { ARCHETYPES, getLeanings } from '../../data/questionPacks';
import { exportToCSV } from '../../utils/csv';

const cleanChallengeName = (name: string) => {
  return name.replace(/^(?:#\d+|Challenge\s*\d+)\s*[-–:]\s*/i, '').trim();
};

const words = [
  'ORBIT', 'NOVA', 'LUMEN', 'SOLAR', 'UMBRA', 'VENUS', 'XENON', 'ASTRO', 'COMET', 'GALAXY', 
  'METEOR', 'PULSE', 'QUASAR', 'ROCKET', 'STELLAR', 'VORTEX', 'COSMOS', 'LUNAR', 'NEBULA', 'ZENITH',
  'APEX', 'BEAM', 'ECHO', 'FLARE', 'GRID', 'HALO', 'IONIC', 'JOLT', 'KINETIC', 'MIRAGE',
  'NEXUS', 'OMEGA', 'PHASE', 'QUARK', 'RADAR', 'SPECTRA', 'VECTOR', 'WARP'
];

const getNextTeamNumber = (currentTeams: any[]) => {
  let maxNumber = 0;
  currentTeams.forEach(t => {
    const match = t.name?.match(/Team\s*#?\s*(\d+)\b/i);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  });
  return maxNumber + 1;
};

const getNextWorkingGroupNumber = (currentGroups: any[]) => {
  let maxNumber = 0;
  currentGroups.forEach(g => {
    const match = g.name?.match(/(?:Working Group|Challenge Workgroup|Discovery Team|Group)\s*#?\s*(\d+)\b/i);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  });
  return maxNumber + 1;
};

export default function TeamsTab({ 
  sessionId, 
  session, 
  participants, 
  teams, 
  challenges,
  focusAreas = [],
  proposedChallenges = []
}: { 
  sessionId: string, 
  session: any, 
  participants: any[], 
  teams: any[], 
  challenges: any[],
  focusAreas?: any[],
  proposedChallenges?: any[]
}) {
  // Context toggle: 'groups' = Challenge Discovery (Challenge Workgroups), 'teams' = Solution Building (Solution Teams)
  const [activeMode, setActiveMode] = useState<'groups' | 'teams'>('groups');
  const isGroupMode = activeMode === 'groups';

  // Local state for Challenge Workgroups (discoveryTeams)
  const [discoveryTeams, setDiscoveryTeams] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChallenge, setFilterChallenge] = useState('');
  const [filterFocusArea, setFilterFocusArea] = useState('');
  const [filterProposedChallenge, setFilterProposedChallenge] = useState('');
  const [filterProficiency, setFilterProficiency] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  // Editing state
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState('');

  // Modal states
  const [movingParticipantId, setMovingParticipantId] = useState<string | null>(null);
  const [addingToTeamId, setAddingToTeamId] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  // Extract all Focus Area interests/interactions for a participant
  const getParticipantFocusInterests = (p: any) => {
    const list: any[] = [];
    
    // 1. Directly selected Focus Area interests (array or single string)
    if (p.interestedFocusAreaIds && Array.isArray(p.interestedFocusAreaIds)) {
      p.interestedFocusAreaIds.forEach((id: string) => {
        const directFa = focusAreas?.find(fa => fa.id === id);
        if (directFa && !list.some(item => item.id === directFa.id)) {
          list.push(directFa);
        }
      });
    } else if (p.interestedFocusAreaId) {
      const directFa = focusAreas?.find(fa => fa.id === p.interestedFocusAreaId);
      if (directFa) {
        list.push(directFa);
      }
    }
    
    // 2. Focus Areas of challenge proposals they created/submitted
    if (proposedChallenges && p.uid) {
      proposedChallenges.forEach(pc => {
        if (pc.uid === p.uid && pc.focusAreaId) {
          const pitchFa = focusAreas?.find(fa => fa.id === pc.focusAreaId);
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
          const pitchFa = focusAreas?.find(fa => fa.id === pc.focusAreaId);
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
      return <span className="text-zinc-650 italic text-[11px] select-none">-</span>;
    }

    return (
      <div className="flex flex-wrap gap-1 max-w-[200px]">
        {pInterests.map((fa, idx) => (
          <span 
            key={fa.id || idx} 
            title={fa.description || fa.title}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 select-none cursor-help transition-all hover:bg-emerald-900/40"
          >
            {fa.title}
          </span>
        ))}
      </div>
    );
  };

  // Load discovery teams in real-time
  useEffect(() => {
    if (!sessionId) return;
    const unsubGroups = onSnapshot(
      query(collection(db, 'discoveryTeams'), where('sessionId', '==', sessionId)),
      (snapshot) => {
        setDiscoveryTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error('Error listening to discoveryTeams in TeamsTab:', err)
    );
    return () => unsubGroups();
  }, [sessionId]);

  // Derived arrays based on context
  const activeUnits = useMemo(() => {
    if (!isGroupMode) {
      const sortedChallengesList = [...challenges].sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });

      const getChallengeIndex = (cId: string) => {
        if (!cId) return 9999;
        const idx = sortedChallengesList.findIndex(c => c.id === cId);
        return idx === -1 ? 9998 : idx;
      };

      return [...teams].sort((a, b) => {
        const idxA = getChallengeIndex(a.challengeId);
        const idxB = getChallengeIndex(b.challengeId);
        if (idxA !== idxB) return idxA - idxB;
        
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      });
    }
    
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
      
      const nameCodeA = a.name || '';
      const nameCodeB = b.name || '';
      return nameCodeA.localeCompare(nameCodeB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [isGroupMode, discoveryTeams, teams, focusAreas, challenges]);

  const unassignedParticipants = useMemo(() => {
    return participants.filter(p => allocationEligible(p) && (isGroupMode ? (!p.discoveryTeamId && !p.discovery_team_id) : !solutionTeamId(p)));
  }, [isGroupMode, participants]);

  const assignedParticipants = useMemo(() => {
    return participants.filter(p => isGroupMode ? (p.discoveryTeamId || p.discovery_team_id) : solutionTeamId(p));
  }, [isGroupMode, participants]);

  const clearMessages = () => {
    setError('');
    setSuccessMessage('');
  };

  // Upstream: Fallback auto-assignment for Challenge Workgroups (Challenge Discovery)
  const fallbackWorkingGroupAssignment = (unassigned: any[], sessionData: any, existingGroups: any[], allParticipants: any[]) => {
    const proposedGroups: any[] = [];
    const minSize = sessionData.minWgSize !== undefined ? sessionData.minWgSize : (sessionData.minTeamSize || 3);
    const prefSize = sessionData.preferredWgSize !== undefined ? sessionData.preferredWgSize : (sessionData.preferredTeamSize || 4);
    const maxSize = sessionData.maxWgSize !== undefined ? sessionData.maxWgSize : (sessionData.maxTeamSize || 6);

    const parts = [...unassigned];
    const proficiencyOrder: Record<string, number> = { 'Experienced': 0, 'Trained': 1, 'Some exposure': 2, 'New to it': 3 };

    // Group unassigned participants by their primary Focus Area choice using overlap density matching
    const unassignedByFa: Record<string, any[]> = {};
    parts.forEach(p => {
      const faIds: string[] = [];
      if (p.interestedFocusAreaIds && Array.isArray(p.interestedFocusAreaIds)) {
        p.interestedFocusAreaIds.forEach((id: string) => {
          if (id && !faIds.includes(id)) faIds.push(id);
        });
      } else if (p.interestedFocusAreaId) {
        faIds.push(p.interestedFocusAreaId);
      }

      let primaryFaId = 'general';
      if (faIds.length > 0) {
        // Find the focus area in their selections that has the highest interest overall among all unassigned
        let bestId = faIds[0];
        let maxPop = 0;
        faIds.forEach(id => {
          const pop = parts.filter(other => {
            const otherIds = other.interestedFocusAreaIds && Array.isArray(other.interestedFocusAreaIds)
              ? other.interestedFocusAreaIds
              : (other.interestedFocusAreaId ? [other.interestedFocusAreaId] : []);
            return otherIds.includes(id);
          }).length;
          if (pop > maxPop) {
            maxPop = pop;
            bestId = id;
          }
        });
        primaryFaId = bestId;
      }

      if (!unassignedByFa[primaryFaId]) {
        unassignedByFa[primaryFaId] = [];
      }
      unassignedByFa[primaryFaId].push(p);
    });

    // We will build groups here
    const tempGroups: {
      teamId: string | null;
      focusAreaId: string;
      participantIds: string[];
    }[] = [];

    // Map open existing groups and prioritize them
    const openGroups = existingGroups.filter(g => g.isOpenToMore !== false);
    const activeOpenGroups = openGroups.map(g => {
      const currentMembers = allParticipants.filter(p => p.discoveryTeamId === g.id || p.discovery_team_id === g.id);
      return {
        teamId: g.id,
        focusAreaId: g.focusAreaId || '',
        participantIds: [] as string[],
        currentCount: currentMembers.length,
        capacity: Math.max(0, maxSize - currentMembers.length)
      };
    }).filter(g => g.capacity > 0);

    // 1. Fill existing groups that match focus area of unassigned participants
    activeOpenGroups.forEach(g => {
      if (g.focusAreaId && unassignedByFa[g.focusAreaId] && unassignedByFa[g.focusAreaId].length > 0) {
        const bucket = unassignedByFa[g.focusAreaId];
        // Sort bucket by proficiency to keep quality balanced
        bucket.sort((a, b) => (proficiencyOrder[a.designThinkingProficiency] ?? 4) - (proficiencyOrder[b.designThinkingProficiency] ?? 4));
        
        while (g.participantIds.length < g.capacity && bucket.length > 0) {
          const nextP = bucket.shift();
          g.participantIds.push(nextP.id);
        }
      }
    });

    // 2. Form new thematic groups for Focus Areas with enough unassigned participants (>= minSize)
    Object.keys(unassignedByFa).forEach(faId => {
      if (faId === 'general') return;
      
      const bucket = unassignedByFa[faId];
      if (bucket.length >= minSize) {
        const numNewGroups = Math.max(1, Math.round(bucket.length / prefSize));
        const newGroups: typeof tempGroups = [];
        for (let i = 0; i < numNewGroups; i++) {
          newGroups.push({
            teamId: null,
            focusAreaId: faId,
            participantIds: []
          });
        }

        // Sort by proficiency to distribute them evenly (Experienced -> Trained -> Some exposure -> New to it)
        bucket.sort((a, b) => (proficiencyOrder[a.designThinkingProficiency] ?? 4) - (proficiencyOrder[b.designThinkingProficiency] ?? 4));

        // Distribute round-robin to ensure balanced proficiency
        let grpIdx = 0;
        bucket.forEach(p => {
          newGroups[grpIdx].participantIds.push(p.id);
          grpIdx = (grpIdx + 1) % newGroups.length;
        });

        tempGroups.push(...newGroups);
        unassignedByFa[faId] = []; // Empty the bucket
      } else if (bucket.length > 0) {
        // Too few participants to form a dedicated minimum size group for this focus area. Merge them to 'general' pool.
        unassignedByFa['general'] = [
          ...(unassignedByFa['general'] || []),
          ...bucket
        ];
        unassignedByFa[faId] = [];
      }
    });

    // Create a flat list of any remaining participants in 'general'
    const generalPool = [...(unassignedByFa['general'] || [])];
    // Also include any left over from partially filled focus areas that couldn't be placed in existing open groups
    Object.keys(unassignedByFa).forEach(faId => {
      if (faId !== 'general') {
        generalPool.push(...unassignedByFa[faId]);
      }
    });

    // Sort general pool by proficiency
    generalPool.sort((a, b) => (proficiencyOrder[a.designThinkingProficiency] ?? 4) - (proficiencyOrder[b.designThinkingProficiency] ?? 4));

    // Combine active existing groups and new groups
    const allFormedGroups = [
      ...activeOpenGroups.map(g => ({
        teamId: g.teamId,
        focusAreaId: g.focusAreaId,
        participantIds: g.participantIds,
        capacity: g.capacity
      })),
      ...tempGroups.map(g => ({
        teamId: null,
        focusAreaId: g.focusAreaId,
        participantIds: g.participantIds,
        capacity: maxSize - g.participantIds.length
      }))
    ];

    // 3. Distribute general/flexible participants to existing formed groups up to prefSize, then maxSize
    // First, fill up to preferred size
    allFormedGroups.forEach(g => {
      const currentTotal = (g.teamId ? (allParticipants.filter(p => p.discoveryTeamId === g.teamId || p.discovery_team_id === g.teamId).length) : 0) + g.participantIds.length;
      const targetFill = Math.max(0, prefSize - currentTotal);
      let filled = 0;
      while (filled < targetFill && generalPool.length > 0) {
        const p = generalPool.shift();
        g.participantIds.push(p.id);
        filled++;
      }
    });

    // If still have general participants left, fill further up to maxSize
    allFormedGroups.forEach(g => {
      const currentTotal = (g.teamId ? (allParticipants.filter(p => p.discoveryTeamId === g.teamId || p.discovery_team_id === g.teamId).length) : 0) + g.participantIds.length;
      const targetFill = Math.max(0, maxSize - currentTotal);
      let filled = 0;
      while (filled < targetFill && generalPool.length > 0) {
        const p = generalPool.shift();
        g.participantIds.push(p.id);
        filled++;
      }
    });

    // 4. If we STILL have general/flexible participants, form new 'general' groups
    if (generalPool.length > 0) {
      const numNewGeneral = Math.max(1, Math.round(generalPool.length / prefSize));
      const newGeneralGroups: typeof allFormedGroups = [];
      for (let i = 0; i < numNewGeneral; i++) {
        newGeneralGroups.push({
          teamId: null,
          focusAreaId: '',
          participantIds: [],
          capacity: maxSize
        });
      }

      let gIdx = 0;
      generalPool.forEach(p => {
        newGeneralGroups[gIdx].participantIds.push(p.id);
        gIdx = (gIdx + 1) % newGeneralGroups.length;
      });

      allFormedGroups.push(...newGeneralGroups);
    }

    // 5. Post-Process pass: Avoid groups where NOBODY understands Design Thinking by performing swaps
    // Define a helper to check if a participant ID has DT proficiency
    const isProficientId = (pid: string) => {
      const p = allParticipants.find(part => part.id === pid) || parts.find(part => part.id === pid);
      if (!p) return false;
      return ['Experienced', 'Trained', 'Some exposure'].includes(p.designThinkingProficiency);
    };

    // Find groups lacking proficient members, and groups with excess proficient members (>= 2)
    const lackingGroups = allFormedGroups.filter(g => g.participantIds.length > 0 && !g.participantIds.some(isProficientId));
    const excessGroups = allFormedGroups.filter(g => g.participantIds.filter(isProficientId).length >= 2);

    lackingGroups.forEach(lackingGroup => {
      if (excessGroups.length > 0) {
        const donorGroup = excessGroups[0];
        // Find a non-proficient member in lackingGroup to swap
        const nonProficientIdx = lackingGroup.participantIds.findIndex(id => !isProficientId(id));
        // Find a proficient member in donorGroup to swap
        const proficientIdx = donorGroup.participantIds.findIndex(id => isProficientId(id));

        if (nonProficientIdx !== -1 && proficientIdx !== -1) {
          const lackingPid = lackingGroup.participantIds[nonProficientIdx];
          const donorPid = donorGroup.participantIds[proficientIdx];

          // Swap them
          lackingGroup.participantIds[nonProficientIdx] = donorPid;
          donorGroup.participantIds[proficientIdx] = lackingPid;

          // Re-evaluate donor group. If it no longer has >= 2 proficient members, remove from excess list
          if (donorGroup.participantIds.filter(isProficientId).length < 2) {
            excessGroups.shift();
          }
        }
      }
    });

    // Populate final proposed groups
    allFormedGroups.forEach(g => {
      if (g.participantIds.length > 0) {
        proposedGroups.push({
          teamId: g.teamId,
          focusAreaId: g.focusAreaId || '',
          participantIds: g.participantIds
        });
      }
    });

    return proposedGroups;
  };

  // Downstream: Fallback auto-assignment for Solution Teams
  const fallbackAssignment = (unassigned: any[], challengesList: any[], sessionData: any, existingTeams: any[], allParticipants: any[]) => {
    const proposedTeams: any[] = [];
    
    const byChallenge: Record<string, any[]> = {};
    unassigned.forEach(p => {
      if (!p.selectedChallengeId) return;
      if (!byChallenge[p.selectedChallengeId]) byChallenge[p.selectedChallengeId] = [];
      byChallenge[p.selectedChallengeId].push(p);
    });

    const minSize = sessionData.minTeamSize || 3;
    const prefSize = sessionData.preferredTeamSize || 4;
    const maxSize = sessionData.maxTeamSize || 6;

    const isProficientId = (pid: string) => {
      const p = allParticipants.find(part => part.id === pid) || unassigned.find(part => part.id === pid);
      if (!p) return false;
      return ['Experienced', 'Trained', 'Some exposure'].includes(p.designThinkingProficiency);
    };

    for (const [challengeId, parts] of Object.entries(byChallenge)) {
      if (parts.length === 0) continue;

      const openTeams = existingTeams.filter(t => t.challengeId === challengeId && t.isOpenToMore !== false);
      
      const activeOpenTeams = openTeams.map(t => {
        const currentMembers = allParticipants.filter(p => solutionTeamId(p) === t.id);
        return {
          teamId: t.id,
          participantIds: [] as string[],
          currentCount: currentMembers.length,
          capacity: Math.max(0, maxSize - currentMembers.length),
          isExisting: true
        };
      }).filter(t => t.capacity > 0);

      let neededCapacity = parts.length;
      for (const bucket of activeOpenTeams) {
        const capacityToPref = Math.max(0, prefSize - bucket.currentCount);
        neededCapacity -= capacityToPref;
      }
      
      const numNewTeams = neededCapacity > 0 ? Math.max(0, Math.ceil(neededCapacity / prefSize)) : 0;

      const challengeTeams = [
        ...activeOpenTeams,
        ...Array.from({ length: numNewTeams }, () => ({
          teamId: null as string | null,
          participantIds: [] as string[],
          capacity: maxSize,
          currentCount: 0,
          isExisting: false
        }))
      ];

      if (challengeTeams.length === 0) {
        challengeTeams.push({
          teamId: null,
          participantIds: [],
          capacity: maxSize,
          currentCount: 0,
          isExisting: false
        });
      }

      // Archetype balancing sorting
      const archetypeBuckets: Record<string, any[]> = {
        driver: [],
        champion: [],
        futurist: [],
        builder: [],
        none: []
      };

      parts.forEach(p => {
        const pArch = p.primaryArchetype || (p.archetypeScores ? getLeanings(p.archetypeScores)?.primary : 'none');
        const key = (pArch && pArch in archetypeBuckets) ? pArch : 'none';
        archetypeBuckets[key].push(p);
      });

      const proficiencyOrder: Record<string, number> = { 'Experienced': 0, 'Trained': 1, 'Some exposure': 2, 'New to it': 3 };
      Object.keys(archetypeBuckets).forEach(key => {
        archetypeBuckets[key].sort((a, b) => 
          (proficiencyOrder[a.designThinkingProficiency] ?? 4) - (proficiencyOrder[b.designThinkingProficiency] ?? 4)
        );
      });

      let teamIdx = 0;
      const archetypesList = ['driver', 'champion', 'futurist', 'builder', 'none'];

      archetypesList.forEach(arch => {
        const bucket = archetypeBuckets[arch];
        while (bucket.length > 0) {
          const p = bucket.shift();
          let found = false;
          let startIdx = teamIdx;
          
          do {
            const team = challengeTeams[teamIdx];
            const memberCount = team.currentCount + team.participantIds.length;
            if (memberCount < prefSize) {
              team.participantIds.push(p.id);
              found = true;
              teamIdx = (teamIdx + 1) % challengeTeams.length;
              break;
            }
            teamIdx = (teamIdx + 1) % challengeTeams.length;
          } while (teamIdx !== startIdx);

          if (!found) {
            do {
              const team = challengeTeams[teamIdx];
              const memberCount = team.currentCount + team.participantIds.length;
              if (memberCount < maxSize) {
                team.participantIds.push(p.id);
                found = true;
                teamIdx = (teamIdx + 1) % challengeTeams.length;
                break;
              }
              teamIdx = (teamIdx + 1) % challengeTeams.length;
            } while (teamIdx !== startIdx);
          }
        }
      });

      // Post-balancing check: swap to cover Design Thinking if possible
      const getFullTeamMembers = (team: typeof challengeTeams[0]) => {
        const existingMemberIds = team.teamId 
          ? allParticipants.filter(p => solutionTeamId(p) === team.teamId).map(p => p.id)
          : [];
        return [...existingMemberIds, ...team.participantIds];
      };

      const getProficientCount = (team: typeof challengeTeams[0]) => {
        return getFullTeamMembers(team).filter(isProficientId).length;
      };

      let lacking = challengeTeams.filter(t => getProficientCount(t) === 0);
      let excess = challengeTeams.filter(t => getProficientCount(t) >= 2);

      lacking.forEach(lackTeam => {
        if (excess.length > 0) {
          const donorTeam = excess[0];
          const nonProficientNewIdx = lackTeam.participantIds.findIndex(id => !isProficientId(id));
          const proficientNewIdx = donorTeam.participantIds.findIndex(id => isProficientId(id));
          
          if (nonProficientNewIdx !== -1 && proficientNewIdx !== -1) {
            const lackPid = lackTeam.participantIds[nonProficientNewIdx];
            const donorPid = donorTeam.participantIds[proficientNewIdx];
            lackTeam.participantIds[nonProficientNewIdx] = donorPid;
            donorTeam.participantIds[proficientNewIdx] = lackPid;
            if (getProficientCount(donorTeam) < 2) {
              excess.shift();
            }
          }
        }
      });

      challengeTeams.forEach(t => {
        if (t.participantIds.length > 0) {
          proposedTeams.push({
            teamId: t.teamId,
            challengeId,
            participantIds: t.participantIds
          });
        }
      });
    }

    return proposedTeams;
  };

  // Save auto-assignment assignments for Challenge Workgroups
  const applyWorkingGroups = async (proposedGroups: any[]) => {
    const batch = writeBatch(db);

    interface GroupPostProcess {
      id: string;
      isNew: boolean;
      focusAreaId: string;
      currentName: string;
      hasManualName: boolean;
      docRef: any;
      codeword?: string;
    }

    const processedProposed: GroupPostProcess[] = [];

    for (const pg of proposedGroups) {
      if (!pg.participantIds || pg.participantIds.length === 0) continue;

      if (pg.teamId) {
        // Updating an existing group
        const existing = discoveryTeams.find(g => g.id === pg.teamId);
        const name = existing?.name || '';
        const hasManualName = existing && !(/^(?:Group|Working\s+Group|Challenge\s+Workgroup|Discovery\s+Team)\s*#?\s*\d+/i.test(name));
        processedProposed.push({
          id: pg.teamId,
          isNew: false,
          focusAreaId: pg.focusAreaId || existing?.focusAreaId || '',
          currentName: name,
          hasManualName: !!hasManualName,
          docRef: doc(db, 'discoveryTeams', pg.teamId)
        });
        (pg as any).resolvedGroupId = pg.teamId;
      } else {
        // Creating a new group
        const groupRef = doc(collection(db, 'discoveryTeams'));
        const codeword = words[Math.floor(Math.random() * words.length)] + Math.floor(100 + Math.random() * 900);
        processedProposed.push({
          id: groupRef.id,
          isNew: true,
          focusAreaId: pg.focusAreaId || '',
          currentName: '',
          hasManualName: false,
          docRef: groupRef,
          codeword
        });
        (pg as any).resolvedGroupId = groupRef.id;
      }
    }

    // Include other existing discoveryTeams that were not targeted in proposedGroups
    const otherExisting: GroupPostProcess[] = [];
    discoveryTeams.forEach(dt => {
      if (!processedProposed.some(p => p.id === dt.id)) {
        const name = dt.name || '';
        const hasManualName = !(/^(?:Group|Working\s+Group|Challenge\s+Workgroup|Discovery\s+Team)\s*#?\s*\d+/i.test(name));
        otherExisting.push({
          id: dt.id,
          isNew: false,
          focusAreaId: dt.focusAreaId || '',
          currentName: name,
          hasManualName: !!hasManualName,
          docRef: doc(db, 'discoveryTeams', dt.id)
        });
      }
    });

    const allGroups = [...processedProposed, ...otherExisting];

    // Cluster and Sort all groups consistently
    // Sort Focus Areas consistently: Alphabetically by title
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

    allGroups.sort((a, b) => {
      const idxA = getFaIndex(a.focusAreaId);
      const idxB = getFaIndex(b.focusAreaId);
      if (idxA !== idxB) return idxA - idxB;
      // Stable sort by ID if same focus area
      return a.id.localeCompare(b.id);
    });

    // Assign sequential group numbers: Group #1, Group #2, etc. (preserving manual name if applicable)
    let groupNum = 1;
    allGroups.forEach(groupObj => {
      let finalName = `Group #${groupNum}`;
      if (groupObj.hasManualName && groupObj.currentName) {
        finalName = groupObj.currentName;
      }

      if (groupObj.isNew) {
        batch.set(groupObj.docRef, {
          sessionId,
          name: finalName,
          code: groupObj.codeword,
          isOpenToMore: true,
          isParticipantCreated: false,
          createdAt: Date.now(),
          focusAreaId: groupObj.focusAreaId,
          proposedChallengeId: ''
        });
      } else {
        batch.update(groupObj.docRef, {
          name: finalName,
          focusAreaId: groupObj.focusAreaId
        });
      }

      groupNum++;
    });

    // Write participant updates to Firestore
    for (const pg of proposedGroups) {
      if (!pg.participantIds || pg.participantIds.length === 0) continue;
      
      const finalGroupId = (pg as any).resolvedGroupId;
      if (finalGroupId) {
        for (const pid of pg.participantIds) {
          const pRef = doc(db, 'participants', pid);
          batch.update(pRef, {
            discoveryTeamId: finalGroupId,
            discovery_team_id: finalGroupId
          });
        }
      }
    }

    await batch.commit();
  };

  // Save auto-assignment assignments for Solution Teams
  const applyTeams = async (proposedTeams: any[]) => {
    const batch = writeBatch(db);

    interface TeamPostProcess {
      id: string;
      isNew: boolean;
      challengeId: string;
      currentName: string;
      hasManualName: boolean;
      docRef: any;
    }

    const processedProposed: TeamPostProcess[] = [];

    for (const pt of proposedTeams) {
      if (!pt.participantIds || pt.participantIds.length === 0) continue;

      if (pt.teamId) {
        // Updating an existing team
        const existing = teams.find(t => t.id === pt.teamId);
        const name = existing?.name || '';
        const hasManualName = existing && !(/^(?:Team|Working\s+Group|Challenge\s+Workgroup|Discovery\s+Team|Group)\s*#?\s*\d+/i.test(name));
        processedProposed.push({
          id: pt.teamId,
          isNew: false,
          challengeId: pt.challengeId || existing?.challengeId || '',
          currentName: name,
          hasManualName: !!hasManualName,
          docRef: doc(db, 'teams', pt.teamId)
        });
        (pt as any).resolvedTeamId = pt.teamId;
      } else {
        // Creating a new team
        const teamRef = doc(collection(db, 'teams'));
        processedProposed.push({
          id: teamRef.id,
          isNew: true,
          challengeId: pt.challengeId || '',
          currentName: '',
          hasManualName: false,
          docRef: teamRef
        });
        (pt as any).resolvedTeamId = teamRef.id;
      }
    }

    // Include other existing teams that were not targeted in proposedTeams
    const otherExisting: TeamPostProcess[] = [];
    teams.forEach(t => {
      if (!processedProposed.some(p => p.id === t.id)) {
        const name = t.name || '';
        const hasManualName = !(/^(?:Team|Working\s+Group|Challenge\s+Workgroup|Discovery\s+Team|Group)\s*#?\s*\d+/i.test(name));
        otherExisting.push({
          id: t.id,
          isNew: false,
          challengeId: t.challengeId || '',
          currentName: name,
          hasManualName: !!hasManualName,
          docRef: doc(db, 'teams', t.id)
        });
      }
    });

    const allTeams = [...processedProposed, ...otherExisting];

    // Cluster and Sort all teams consistently by challenge title (alphabetically)
    const sortedChallengesList = [...challenges].sort((a, b) => {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });

    const getChallengeIndex = (cId: string) => {
      if (!cId) return 9999;
      const idx = sortedChallengesList.findIndex(c => c.id === cId);
      return idx === -1 ? 9998 : idx;
    };

    allTeams.sort((a, b) => {
      const idxA = getChallengeIndex(a.challengeId);
      const idxB = getChallengeIndex(b.challengeId);
      if (idxA !== idxB) return idxA - idxB;
      // Stable sort by ID if same challenge
      return a.id.localeCompare(b.id);
    });

    // Assign sequential team numbers: Team #1, Team #2, etc., preserving manual name if applicable
    let teamNum = 1;
    allTeams.forEach(teamObj => {
      let finalName = `Team #${teamNum}`;
      if (teamObj.hasManualName && teamObj.currentName) {
        finalName = teamObj.currentName;
      }

      if (teamObj.isNew) {
        batch.set(teamObj.docRef, {
          sessionId,
          challengeId: teamObj.challengeId,
          name: finalName,
          nameSubmittedBy: '',
          isAutoAssigned: true,
          isOpenToMore: true,
          createdAt: Date.now()
        });
      } else {
        batch.update(teamObj.docRef, {
          name: finalName,
          challengeId: teamObj.challengeId
        });
      }

      teamNum++;
    });

    // Write participant updates to Firestore
    for (const pt of proposedTeams) {
      if (!pt.participantIds || pt.participantIds.length === 0) continue;
      
      const finalTeamId = (pt as any).resolvedTeamId;
      if (finalTeamId) {
        for (const pid of pt.participantIds) {
          const pRef = doc(db, 'participants', pid);
          batch.update(pRef, {
            teamId: finalTeamId,
            solutioning_team_id: finalTeamId,
            isAssigned: true
          });
        }
      }
    }

    await batch.commit();
  };

  // AI-powered dynamic context assignment
  const generateTeams = async () => {
    setIsGenerating(true);
    clearMessages();
    
    if (unassignedParticipants.length === 0) {
      setError(`No participants available to assign to ${isGroupMode ? 'Challenge Workgroups' : 'Solution Teams'}.`);
      setIsGenerating(false);
      return;
    }

    if (!isGroupMode) {
      const withoutChallenge = unassignedParticipants.filter(p => !p.selectedChallengeId);
      if (withoutChallenge.length === unassignedParticipants.length) {
        setError('Participants must select a challenge before auto-assignment.');
        setIsGenerating(false);
        return;
      }
    }

    try {
      if (isGroupMode) {
        // --- Challenge Workgroup AI Promo Execution ---
        const openGroups = discoveryTeams.filter(g => g.isOpenToMore !== false);
        const openGroupSlots = openGroups.map(g => {
          const currentMembers = participants.filter(p => p.discoveryTeamId === g.id || p.discovery_team_id === g.id).length;
          return {
            teamId: g.id,
            name: g.name,
            currentMembers,
            maxCapacity: session.maxWgSize !== undefined ? session.maxWgSize : (session.maxTeamSize || 6),
            availableSlots: Math.max(0, (session.maxWgSize !== undefined ? session.maxWgSize : (session.maxTeamSize || 6)) - currentMembers)
          };
        }).filter(g => g.availableSlots > 0);

        const prompt = `
          You are an expert workshop facilitator. Assign the following unassigned participants into Challenge Workgroups (Challenge Discovery groups).
          Session Rules:
          - Preferred Group Size: ${session.preferredWgSize !== undefined ? session.preferredWgSize : (session.preferredTeamSize || 4)}
          - Min Group Size: ${session.minWgSize !== undefined ? session.minWgSize : (session.minTeamSize || 3)}
          - Max Group Size: ${session.maxWgSize !== undefined ? session.maxWgSize : (session.maxTeamSize || 6)}

          Assignment Logic:
          1. Cluster heavily by Focus Areas: Participants who selected the same Focus Area(s) should preferentially be grouped together to create strong thematic conversations and better challenge framing.
             If a participant selected multiple Focus Areas, use the strongest overlap matching (highest shared-interest density) across the group.
             Try to ensure each new Challenge Workgroup is focused on a specific Focus Area, and include that "focusAreaId" in your response.
          2. Try to balance Design Thinking proficiencies: distribute "Experienced", "Trained", and "Some exposure" participants evenly across groups, filling remaining slots with "New to it" participants.
             Avoid any groups where NOBODY understands Design Thinking (each group should ideally contain at least one participant with Design Thinking proficiency).
          3. Do NOT optimize around Collaboration Archetypes (Driver/User Champion/Futurist/Builder) at this stage. Discovery should remain tension-oriented and facilitation-oriented rather than execution-role-oriented.
          4. Respect group size limits as much as possible.
          5. IMPORTANT: You MUST fill existing open challenge workgroups before creating new challenge workgroups. If you assign participants to an existing open group, include its "teamId" in your response. Do not exceed the "availableSlots" for existing groups.
          
          Existing Open Challenge Workgroups:
          ${JSON.stringify(openGroupSlots)}

          Unassigned Participants:
          ${JSON.stringify(unassignedParticipants.map(p => ({
            id: p.id,
            name: p.name,
            proficiency: p.designThinkingProficiency,
            adjective: p.adjective || '',
            interestedFocusAreaIds: p.interestedFocusAreaIds && Array.isArray(p.interestedFocusAreaIds)
              ? p.interestedFocusAreaIds
              : (p.interestedFocusAreaId ? [p.interestedFocusAreaId] : [])
          })))}

          Available Focus Areas (maps focusAreaId -> title):
          ${JSON.stringify(focusAreas.map(fa => ({ id: fa.id, title: fa.title })))}

          Response Format:
          Return a JSON object with a "proposedTeams" array. Each group object should have:
          - teamId (string, optional, for existing groups)
          - focusAreaId (string, required if creating a new group, representing the primary Focus Area this group is anchored on)
          - participantIds (array of strings, required)
        `;

        const response = await fetch('/api/ai/generate-teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });

        if (!response.ok) throw new Error('AI request failed');

        const result = await response.json();
        if (!result.proposedTeams || !Array.isArray(result.proposedTeams)) {
          throw new Error('AI response format invalid');
        }

        const assignedIds = new Set();
        let isValid = true;
        for (const pg of result.proposedTeams) {
          if (!pg.participantIds) {
            isValid = false; break;
          }
          for (const pid of pg.participantIds) {
            if (assignedIds.has(pid)) {
              isValid = false; break; 
            }
            if (!unassignedParticipants.find(p => p.id === pid)) {
              isValid = false; break; 
            }
            assignedIds.add(pid);
          }
        }

        if (!isValid) throw new Error('AI returned invalid assignments');

        await applyWorkingGroups(result.proposedTeams);
        setSuccessMessage(`${result.proposedTeams.length} Challenge Workgroups assigned successfully via AI.`);

      } else {
        // --- Solution Teams AI Promo Execution ---
        const openTeams = teams.filter(t => t.isOpenToMore !== false && !t.isDraft);
        const openTeamSlots = openTeams.map(t => {
          const currentMembers = participants.filter(p => solutionTeamId(p) === t.id).length;
          return {
            teamId: t.id,
            challengeId: t.challengeId,
            currentMembers,
            maxCapacity: session.maxTeamSize || 6,
            availableSlots: Math.max(0, (session.maxTeamSize || 6) - currentMembers)
          };
        }).filter(t => t.availableSlots > 0);

        const prompt = `
          You are an expert workshop facilitator. Assign the following unassigned participants into Solution Teams based on their selected challenge.
          Session Rules:
          - Preferred Team Size: ${session.preferredTeamSize || 4}
          - Min Team Size: ${session.minTeamSize || 3}
          - Max Team Size: ${session.maxTeamSize || 6}

          Assignment Logic Checklist (Adhere in this order of priority):
          1. PRIMARY SIGNAL: Cluster participants strictly by their selected challenge (challengeId). Participants choosing the same challenge MUST be grouped together.
          2. SECONDARY SIGNAL: Balance Collaboration Archetypes. Each Solution Team should ideally contain a diverse mix of:
             - Project Driver (driver)
             - User Champion (champion)
             - Futurist (futurist)
             - Visualiser & Builder (builder)
             Avoid archetype-heavy imbalances (e.g. all Drivers on one team, or no Builders/Champions/Drivers).
          3. TERTIARY SIGNAL: Distribute Design Thinking proficiency. Ensure each Solution Team has at least ONE participant with some Design Thinking proficiency ('Experienced', 'Trained', 'Some exposure') to act as a facilitation and methodology guide. Try to distribute these proficient members evenly across all teams.
          4. FOURTH SIGNAL: Respect and balance preferred, minimum, and maximum team size constraints.
          5. FILL ACTIVE GROUPS: You MUST first fill existing open teams before proposing or creating new teams. If you assign unassigned members to an existing open team, include its "teamId" in your response. Do not exceed the "availableSlots" for existing teams.
          
          Existing Open Teams:
          ${JSON.stringify(openTeamSlots)}

          Unassigned Participants:
          ${JSON.stringify(unassignedParticipants.filter(p => p.selectedChallengeId).map(p => ({
            id: p.id,
            name: p.name,
            proficiency: p.designThinkingProficiency,
            challengeId: p.selectedChallengeId,
            primaryArchetype: p.primaryArchetype || 'none',
            secondaryArchetype: p.secondaryArchetype || 'none'
          })))}

          Response Format:
          Return a JSON object with a "proposedTeams" array. Each team object should have:
          - teamId (string, optional, representing an existing open team being filled)
          - challengeId (string, required)
          - participantIds (array of strings, required)
        `;

        const response = await fetch('/api/ai/generate-teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });

        if (!response.ok) throw new Error('AI request failed');

        const result = await response.json();
        if (!result.proposedTeams || !Array.isArray(result.proposedTeams)) {
          throw new Error('AI response format invalid');
        }

        const assignedIds = new Set();
        let isValid = true;
        for (const pt of result.proposedTeams) {
          if (!pt.challengeId || !pt.participantIds) {
            isValid = false; break;
          }
          for (const pid of pt.participantIds) {
            if (assignedIds.has(pid)) {
              isValid = false; break; 
            }
            if (!unassignedParticipants.find(p => p.id === pid)) {
              isValid = false; break; 
            }
            assignedIds.add(pid);
          }
        }

        if (!isValid) throw new Error('AI returned invalid assignments');

        await applyTeams(result.proposedTeams);
        setSuccessMessage(`${result.proposedTeams.length} teams created successfully via AI.`);
      }

    } catch (err: any) {
      console.warn('AI assignment failed, triggering fallback:', err);
      if (isGroupMode) {
        const proposedGroups = fallbackWorkingGroupAssignment(unassignedParticipants, session, discoveryTeams, participants);
        if (proposedGroups.length > 0) {
          await applyWorkingGroups(proposedGroups);
          setSuccessMessage(`${proposedGroups.length} Challenge Workgroups created successfully via fallback algorithm.`);
          setError(`AI Assignment failed (${err.message}). Fallback algorithm was used instead.`);
        } else {
          setError('Auto-assignment failed. Group size settings might make assignment impossible.');
        }
      } else {
        const proposedTeams = fallbackAssignment(unassignedParticipants, challenges, session, teams, participants);
        if (proposedTeams.length > 0) {
          await applyTeams(proposedTeams);
          setSuccessMessage(`${proposedTeams.length} teams created successfully via fallback algorithm.`);
          setError(`AI Assignment failed (${err.message}). Fallback algorithm was used instead.`);
        } else {
          setError('Auto-assignment failed. Team size settings might make assignment impossible.');
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Delete Unit Workflow
  const confirmRemoveTeam = async () => {
    if (!deletingTeamId) return;
    clearMessages();
    
    try {
      const batch = writeBatch(db);
      if (isGroupMode) {
        batch.delete(doc(db, 'discoveryTeams', deletingTeamId));
        const teamMembers = participants.filter(p => p.discoveryTeamId === deletingTeamId || p.discovery_team_id === deletingTeamId);
        for (const p of teamMembers) {
          batch.update(doc(db, 'participants', p.id), {
            discoveryTeamId: null,
            discovery_team_id: null
          });
        }
      } else {
        batch.delete(doc(db, 'teams', deletingTeamId));
        const teamMembers = participants.filter(p => solutionTeamId(p) === deletingTeamId);
        for (const p of teamMembers) {
          batch.update(doc(db, 'participants', p.id), {
            teamId: null,
            solutioning_team_id: null,
            isAssigned: false
          });
        }
      }
      
      await batch.commit();
      setSuccessMessage(`${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'} deleted successfully. Members are now unassigned.`);
    } catch (err) {
      setError(`Could not delete ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}.`);
    } finally {
      setDeletingTeamId(null);
    }
  };

  // Add a new Unit
  const createNewTeam = async () => {
    clearMessages();
    try {
      if (isGroupMode) {
        const groupNumber = getNextWorkingGroupNumber(discoveryTeams);
        const groupName = `Group #${groupNumber}`;
        const codeword = words[Math.floor(Math.random() * words.length)] + Math.floor(100 + Math.random() * 900);
        
        await addDoc(collection(db, 'discoveryTeams'), {
          sessionId,
          name: groupName,
          code: codeword,
          isOpenToMore: true,
          isParticipantCreated: false,
          createdAt: Date.now(),
          focusAreaId: '',
          proposedChallengeId: ''
        });
        setSuccessMessage('New Challenge Workgroup created.');
      } else {
        const challengeId = challenges[0]?.id || '';
        const teamNumber = getNextTeamNumber(teams);
        const teamName = `Team #${teamNumber}`;

        await addDoc(collection(db, 'teams'), {
          sessionId,
          challengeId,
          name: teamName,
          nameSubmittedBy: ''
        });
        setSuccessMessage('New Solution Team created.');
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to create new ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}.`);
    }
  };

  // Remove Participant from any unit
  const removeParticipant = async (participantId: string) => {
    clearMessages();
    try {
      if (isGroupMode) {
        await updateDoc(doc(db, 'participants', participantId), {
          discoveryTeamId: null,
          discovery_team_id: null
        });
        setSuccessMessage('Participant removed from Challenge Workgroup.');
      } else {
        await updateDoc(doc(db, 'participants', participantId), {
          teamId: null,
          solutioning_team_id: null,
          isAssigned: false
        });
        setSuccessMessage('Participant removed from Solution Team.');
      }
    } catch (err) {
      setError('Failed to remove participant.');
    }
  };

  // Rename a Unit
  const saveTeamName = async () => {
    if (!editingTeamId) return;
    clearMessages();
    try {
      if (isGroupMode) {
        await updateDoc(doc(db, 'discoveryTeams', editingTeamId), {
          name: editingTeamName
        });
        setSuccessMessage('Challenge Workgroup renamed successfully.');
      } else {
        await updateDoc(doc(db, 'teams', editingTeamId), {
          name: editingTeamName
        });
        setSuccessMessage('Solution Team renamed successfully.');
      }
      setEditingTeamId(null);
    } catch (err) {
      setError('Failed to rename context.');
    }
  };

  // Filtering list
  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      if (!allocationEligible(p)) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      if (isGroupMode) {
        const pGroup = discoveryTeams.find(g => g.id === p.discoveryTeamId || g.id === p.discovery_team_id);
        if (filterFocusArea && pGroup?.focusAreaId !== filterFocusArea) return false;
        if (filterProposedChallenge && pGroup?.proposedChallengeId !== filterProposedChallenge) return false;
        if (filterProficiency && p.designThinkingProficiency !== filterProficiency) return false;
        if (filterStatus === 'Assigned' && !p.discoveryTeamId && !p.discovery_team_id) return false;
        if (filterStatus === 'Unassigned' && (p.discoveryTeamId || p.discovery_team_id)) return false;
      } else {
        if (filterChallenge && p.selectedChallengeId !== filterChallenge) return false;
        if (filterProficiency && p.designThinkingProficiency !== filterProficiency) return false;
        if (filterStatus === 'Assigned' && !solutionTeamId(p)) return false;
        if (filterStatus === 'Unassigned' && solutionTeamId(p)) return false;
      }
      
      return true;
    });
  }, [participants, searchQuery, isGroupMode, discoveryTeams, filterFocusArea, filterProposedChallenge, filterChallenge, filterProficiency, filterStatus]);

  const handleExportCSV = () => {
    if (isGroupMode) {
      // 4. Challenge Workgroups
      const headers = [
        'Workgroup Name',
        'Focus Area Alignment',
        'Participant Name',
        'Participant Proficiency',
        'Archetype Leaning',
        'Workspace Assigned',
        'Workgroup Status'
      ];

      const rows: string[][] = [];

      discoveryTeams.forEach(dt => {
        const focus = focusAreas.find(fa => fa.id === dt.focusAreaId);
        const members = filteredParticipants.filter(p => p.discoveryTeamId === dt.id || p.discovery_team_id === dt.id);

        members.forEach(p => {
          let archetypeLeaning = 'None';
          if (p.archetypeScores) {
            const { primary, secondary } = getLeanings(p.archetypeScores);
            const primaryArch = primary ? ARCHETYPES[primary]?.label : '';
            const secondaryArch = secondary ? ARCHETYPES[secondary]?.label : '';
            archetypeLeaning = primaryArch ? (secondaryArch ? `${primaryArch} (Secondary: ${secondaryArch})` : primaryArch) : 'None';
          }

          rows.push([
            dt.name || (dt.code ? `Group ${dt.code}` : ''),
            focus?.title || dt.focusAreaId || '',
            p.name || '',
            p.designThinkingProficiency || '',
            archetypeLeaning,
            dt.workspaceUrl || dt.workspace ? 'Yes' : 'No',
            dt.isOpenToMore === false ? 'Locked' : 'Open'
          ]);
        });
      });

      const cleanName = (session?.name || sessionId || 'session')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `hacklive_challenge_workgroups_${cleanName}_${dateStr}.csv`;

      exportToCSV(filename, headers, rows);
    } else {
      // 5. Solution Teams
      const headers = [
        'Team Name',
        'Selected Challenge',
        'Participant Name',
        'Collaboration Archetype',
        'Design Thinking Proficiency',
        'Team Status',
        'Workspace Assigned'
      ];

      const rows: string[][] = [];

      teams.forEach(t => {
        const challenge = challenges.find(c => c.id === t.challengeId);
        const members = filteredParticipants.filter(p => solutionTeamId(p) === t.id);

        members.forEach(p => {
          let pArch = 'None';
          if (p.archetypeScores) {
            const { primary } = getLeanings(p.archetypeScores);
            pArch = primary ? ARCHETYPES[primary]?.label : 'None';
          }

          rows.push([
            t.name || (t.code ? `Team ${t.code}` : ''),
            challenge?.title ? cleanChallengeName(challenge.title) : '',
            p.name || '',
            pArch,
            p.designThinkingProficiency || '',
            t.isOpenToMore === false ? 'Locked' : 'Open',
            t.workspaceUrl || t.workspace ? 'Yes' : 'No'
          ]);
        });
      });

      const cleanName = (session?.name || sessionId || 'session')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `hacklive_solution_teams_${cleanName}_${dateStr}.csv`;

      exportToCSV(filename, headers, rows);
    }
  };

  const StatsBar = () => (
    <div className="flex gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
      <div className="flex-1 text-center border-r border-zinc-800">
        <p className="text-2xl font-bold text-emerald-400">{participants.length}</p>
        <p className="text-sm text-zinc-400">Total Participants</p>
      </div>
      <div className="flex-1 text-center border-r border-zinc-800">
        <p className="text-2xl font-bold text-amber-400">{unassignedParticipants.length}</p>
        <p className="text-sm text-zinc-400">Unassigned</p>
      </div>
      <div className="flex-1 text-center border-r border-zinc-800">
        <p className="text-2xl font-bold text-emerald-500">{assignedParticipants.length}</p>
        <p className="text-sm text-zinc-400">Assigned</p>
      </div>
      <div className="flex-1 text-center">
        <p className={`text-2xl font-bold ${isGroupMode ? 'text-blue-400' : 'text-emerald-400'}`}>{activeUnits.length}</p>
        <p className="text-sm text-zinc-400">{isGroupMode ? 'Active Challenge Workgroups' : 'Active Solution Teams'}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Collaboration Scope Switcher */}
      <div className="flex justify-between items-center bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl gap-4 flex-wrap">
        <div>
          <div className="ui-heading-row"><h3 className="text-lg font-bold text-zinc-200">Collaboration Management</h3><InfoHelp label="Collaboration management">Toggle context to manage upstream challenge discovery workgroups or downstream solution teams.</InfoHelp></div>
        </div>
        
        <div className="flex p-1 bg-zinc-950 border border-zinc-800 rounded-xl w-fit shrink-0">
          <button
            onClick={() => { setActiveMode('groups'); clearMessages(); }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeMode === 'groups'
                ? 'bg-blue-600 text-white shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users size={14} />
            Challenge Workgroups
          </button>
          <button
            onClick={() => { setActiveMode('teams'); clearMessages(); }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeMode === 'teams'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles size={14} />
            Solution Teams
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {isGroupMode ? (
            <span className="text-blue-400 flex items-center gap-2">
              <Users size={24} /> Challenge Workgroups Management
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-2">
              <Sparkles size={24} /> Solution Teams Management
            </span>
          )}
        </h2>
        
        <div className="flex gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-805 hover:bg-zinc-800 hover:text-white text-zinc-200 border border-zinc-750/80 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download size={14} /> Export CSV
          </button>
          <button 
            onClick={createNewTeam}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-semibold"
          >
            <Plus size={18} />
            {isGroupMode ? 'New Challenge Workgroup' : 'New Solution Team'}
          </button>
          <button 
            onClick={generateTeams}
            disabled={isGenerating || unassignedParticipants.length === 0}
            className={`flex items-center gap-2 px-4 py-2 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-semibold ${
              isGroupMode ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <Sparkles size={18} />
            {isGenerating 
              ? 'Assigning...' 
              : isGroupMode 
                ? 'Auto-Assign Challenge Workgroups' 
                : 'Auto-Assign Solution Teams'}
          </button>
        </div>
      </div>

      <StatsBar />

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 text-red-400 rounded-xl flex items-start gap-3">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/50 border border-emerald-900 text-emerald-400 rounded-xl flex items-start gap-3">
          <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
          <p>{successMessage}</p>
        </div>
      )}

      {/* Participants Search and Management Panel */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold">Participants Directory</h3>
        
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="text" 
                placeholder="Search participants by name..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-zinc-700 text-sm"
              />
            </div>

            {isGroupMode ? (
              <>
                <select 
                  value={filterFocusArea} 
                  onChange={e => setFilterFocusArea(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Focus Areas</option>
                  {focusAreas.map(fa => <option key={fa.id} value={fa.id}>{fa.title}</option>)}
                </select>
                <select 
                  value={filterProposedChallenge} 
                  onChange={e => setFilterProposedChallenge(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Proposed Challenges</option>
                  {proposedChallenges.map(pc => <option key={pc.id} value={pc.id}>{pc.title}</option>)}
                </select>
              </>
            ) : (
              <select 
                value={filterChallenge} 
                onChange={e => setFilterChallenge(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Published Challenges</option>
                {challenges.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            )}

            <select 
              value={filterProficiency} 
              onChange={e => setFilterProficiency(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs focus:outline-none"
            >
              <option value="">All Proficiencies</option>
              <option value="Experienced">Experienced</option>
              <option value="Trained">Trained</option>
              <option value="Some exposure">Some exposure</option>
              <option value="New to it">New to it</option>
            </select>
            <select 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Assigned">Assigned</option>
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Descriptor</th>
                  <th className="pb-3 font-medium">Proficiency</th>
                  {session?.enableChallengeDiscovery && (
                    <th className="pb-3 font-medium">Focus Area Interests</th>
                  )}
                  <th className="pb-3 font-medium">{isGroupMode ? 'Group Alignment' : 'Selected Challenge'}</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredParticipants.map(p => {
                  let alignmentNode = null;
                  let unitName = 'Unassigned';
                  let isAssignedToCurrentMode = false;

                  if (isGroupMode) {
                    const group = discoveryTeams.find(ug => ug.id === p.discoveryTeamId || ug.id === p.discovery_team_id);
                    isAssignedToCurrentMode = !!group;
                    if (group) {
                      unitName = group.name;
                      const fa = focusAreas.find(fa => fa.id === group.focusAreaId);
                      const pc = proposedChallenges.find(pc => pc.id === group.proposedChallengeId);
                      if (fa && pc) {
                        alignmentNode = <span className="text-xs text-zinc-400">{fa.title} / {pc.title}</span>;
                      } else if (fa) {
                        alignmentNode = <span className="text-xs text-zinc-400">FA: {fa.title}</span>;
                      } else if (pc) {
                        alignmentNode = <span className="text-xs text-zinc-400">PC: {pc.title}</span>;
                      } else {
                        alignmentNode = <span className="text-xs text-zinc-600 italic">No alignment set</span>;
                      }
                    } else {
                      alignmentNode = <span className="text-xs text-zinc-600 italic">-</span>;
                    }
                  } else {
                    const c = challenges.find(ch => ch.id === p.selectedChallengeId);
                    alignmentNode = <span className="text-xs text-zinc-400">{c?.title || 'None selected'}</span>;
                    const team = teams.find(t => t.id === solutionTeamId(p));
                    isAssignedToCurrentMode = !!team;
                    if (team) {
                      unitName = team.name;
                    }
                  }

                  return (
                    <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 font-medium text-zinc-200">{p.name}</td>
                      <td className="py-3 text-zinc-400">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center">
                          <span>{p.adjective || '-'}</span>
                          {p.primaryArchetype && (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 leading-none select-none" title={`primary: ${p.primaryArchetype} | secondary: ${p.secondaryArchetype || 'none'}`}>
                              <span>{p.primaryArchetype === 'driver' ? '🚀' : p.primaryArchetype === 'champion' ? '🗣' : p.primaryArchetype === 'futurist' ? '✨' : '🛠'}</span>
                              <span>{p.primaryArchetype}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-xs">{p.designThinkingProficiency}</span>
                      </td>
                      {session?.enableChallengeDiscovery && (
                        <td className="py-3">
                          {renderInterests(p)}
                        </td>
                      )}
                      <td className="py-3 max-w-[200px] truncate">{alignmentNode}</td>
                      <td className="py-3">
                        {isAssignedToCurrentMode ? (
                          <span className={`${isGroupMode ? 'text-blue-400' : 'text-emerald-400'} font-medium`}>{unitName}</span>
                        ) : (
                          <span className="text-amber-500 font-medium">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {isAssignedToCurrentMode ? (
                            <>
                              <button onClick={() => setMovingParticipantId(p.id)} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300" title={`Move to another ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}`}>
                                <ArrowRightLeft size={14} />
                              </button>
                              <button onClick={() => removeParticipant(p.id)} className="p-1.5 bg-red-950/30 hover:bg-red-900/50 rounded text-red-400" title={`Remove from ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}`}>
                                  <UserMinus size={14} />
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setAddingToTeamId(p.id)} className={`p-1.5 rounded transition-all ${isGroupMode ? 'bg-blue-950/30 hover:bg-blue-900/50 text-blue-400' : 'bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-400'}`} title={`Assign to ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}`}>
                              <UserPlus size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredParticipants.length === 0 && (
                  <tr>
                    <td colSpan={session?.enableChallengeDiscovery ? 7 : 6} className="py-8 text-center text-zinc-500">No participants found matching the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Collaboration Units Section: Challenge Workgroups or Solution Teams */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold">
          {isGroupMode ? 'Current Challenge Workgroups' : 'Current Solution Teams'}
        </h3>
        {activeUnits.length === 0 ? (
          <p className="text-zinc-500 text-center py-12 border border-dashed border-zinc-800 rounded-2xl">
            {isGroupMode ? 'No challenge workgroups created yet.' : 'No solution teams created yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeUnits.map(unit => {
              const members = participants.filter(p => isGroupMode ? (p.discoveryTeamId === unit.id || p.discovery_team_id === unit.id) : solutionTeamId(p) === unit.id);
              
              // Team identifier format parsers
              const nameMatch = unit.name?.match(/^((?:Team|Working Group|Challenge Workgroup|Group)\s*#?\s*\d+)(?:\s*[-–:]\s*(.*))?$/i);
              const systemId = nameMatch ? nameMatch[1] : '';
              const customName = nameMatch ? (nameMatch[2] || '') : unit.name;
              
              const displayName = customName || systemId;
              const subIdentifier = customName ? systemId : '';

              // Calculate Archetype and DT proficiency counts for Solution Teams
              const archCounts = { driver: 0, champion: 0, futurist: 0, builder: 0 };
              const dtCounts = { Experienced: 0, Trained: 0, 'Some exposure': 0, 'New to it': 0 };
              
              members.forEach(m => {
                const pArch = m.primaryArchetype || (m.archetypeScores ? getLeanings(m.archetypeScores)?.primary : 'none');
                if (pArch && pArch in archCounts) {
                  archCounts[pArch as keyof typeof archCounts]++;
                }
                const prof = m.designThinkingProficiency || 'New to it';
                if (prof in dtCounts) {
                  dtCounts[prof as keyof typeof dtCounts]++;
                }
              });
              const hasDtGuide = (dtCounts.Experienced + dtCounts.Trained + dtCounts['Some exposure']) > 0;

              return (
                <div key={unit.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col min-h-[340px] shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                   <TeamRoleEditor collectionName={isGroupMode ? 'discoveryTeams' : 'teams'} teamId={unit.id} members={members} />
                   {/* Card Main Properties Header */}
                  <div className={`p-5 border-b border-zinc-800/50 space-y-3 relative group ${isGroupMode ? 'bg-blue-950/5' : 'bg-emerald-950/5'}`}>
                    <div className="flex justify-between items-start pr-12">
                      <div className="space-y-1">
                        {editingTeamId === unit.id ? (
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={editingTeamName}
                              onChange={e => setEditingTeamName(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-zinc-500"
                              autoFocus
                            />
                            <button onClick={saveTeamName} className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white flex-shrink-0">
                              <CheckCircle2 size={16} />
                            </button>
                            <button onClick={() => setEditingTeamId(null)} className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-white flex-shrink-0">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <h4 className="font-bold text-lg text-white leading-tight">
                              {displayName || <span className="text-zinc-500 italic">Unnamed Unit</span>}
                            </h4>
                            {subIdentifier && (
                              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">{subIdentifier}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Unit Alignment Association Form */}
                    {isGroupMode ? (
                      <div className="space-y-2 mt-1 bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-800">
                        <div>
                          <label className="text-[9px] uppercase font-bold text-zinc-500 block mb-1 flex items-center gap-1">
                            <Folder size={10} /> Focus Area Alignment
                          </label>
                          <select
                            value={unit.focusAreaId || ''}
                            onChange={e => updateDoc(doc(db, 'discoveryTeams', unit.id), { focusAreaId: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">No Focus Area Alignment</option>
                            {focusAreas.map(fa => (
                              <option key={fa.id} value={fa.id}>{fa.title}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] uppercase font-bold text-zinc-500 block mb-1 flex items-center gap-1">
                            <Target size={10} /> Proposed Challenge
                          </label>
                          <select
                            value={unit.proposedChallengeId || ''}
                            onChange={e => updateDoc(doc(db, 'discoveryTeams', unit.id), { proposedChallengeId: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">No Proposed Challenge Alignment</option>
                            {proposedChallenges.map(pc => (
                              <option key={pc.id} value={pc.id}>{pc.title}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[9px] uppercase font-bold text-zinc-500 block mb-0.5">Assigned Design Challenge</label>
                          <select
                            value={unit.challengeId || ''}
                            onChange={e => updateDoc(doc(db, 'teams', unit.id), { challengeId: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">Omit Challenge Assignment</option>
                            {challenges.map(c => (
                              <option key={c.id} value={c.id}>{cleanChallengeName(c.title)}</option>
                            ))}
                          </select>
                        </div>

                        {/* Premium compositions metrics block */}
                        <div className="space-y-2.5 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/80">
                          {/* Solving Title display */}
                          {unit.challengeId && (
                            <div>
                              <span className="text-[9px] uppercase font-bold text-zinc-500 block mb-0.5">Solving</span>
                              <span className="text-xs font-semibold text-emerald-400">
                                {cleanChallengeName(challenges.find(c => c.id === unit.challengeId)?.title || '')}
                              </span>
                            </div>
                          )}

                          {/* Archetype composition */}
                          <div>
                            <span className="text-[9px] uppercase font-bold text-zinc-500 block mb-1">Archetypes Mix</span>
                            <div className="flex flex-wrap gap-1.5 text-[10px]">
                              <span className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${archCounts.driver ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 font-semibold' : 'bg-zinc-950/20 text-zinc-650 border-zinc-800/40 font-normal'}`} title="Driver">
                                <span>🚀</span> <span>Driver ({archCounts.driver})</span>
                              </span>
                              <span className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${archCounts.champion ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-semibold' : 'bg-zinc-950/20 text-zinc-650 border-zinc-800/40 font-normal'}`} title="User Champion">
                                <span>🗣</span> <span>Champ ({archCounts.champion})</span>
                              </span>
                              <span className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${archCounts.futurist ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 font-semibold' : 'bg-zinc-950/20 text-zinc-650 border-zinc-800/40 font-normal'}`} title="Futurist">
                                <span>✨</span> <span>Futurist ({archCounts.futurist})</span>
                              </span>
                              <span className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${archCounts.builder ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 font-semibold' : 'bg-zinc-950/20 text-zinc-650 border-zinc-800/40 font-normal'}`} title="Builder">
                                <span>🛠</span> <span>Builder ({archCounts.builder})</span>
                              </span>
                            </div>
                          </div>

                          {/* Design Thinking Coverage */}
                          <div>
                            <span className="text-[9px] uppercase font-bold text-zinc-500 block mb-1">DT Proficiency Coverage</span>
                            <div className="flex items-center justify-between">
                              <div className="flex gap-1 flex-wrap text-[9px]">
                                {dtCounts.Experienced > 0 && <span className="bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded border border-emerald-500/20">Exp ({dtCounts.Experienced})</span>}
                                {dtCounts.Trained > 0 && <span className="bg-blue-500/10 text-blue-400 px-1 py-0.5 rounded border border-blue-500/20">Tr ({dtCounts.Trained})</span>}
                                {dtCounts['Some exposure'] > 0 && <span className="bg-zinc-800 text-zinc-300 px-1 py-0.5 rounded border border-zinc-700/60">Some ({dtCounts['Some exposure']})</span>}
                                {dtCounts['New to it'] > 0 && <span className="bg-zinc-900 text-zinc-500 px-1 py-0.5 rounded border border-zinc-800/40">New ({dtCounts['New to it']})</span>}
                              </div>
                              {hasDtGuide ? (
                                <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/25">
                                  ✅ DT Covered
                                </span>
                              ) : (
                                <span className="text-[9px] uppercase tracking-wider font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/25 animate-pulse" title="Caution: Nobody on this team has DT exposure">
                                  ⚠️ No DT Guide
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Row - Edit / Delete */}
                    <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setEditingTeamId(unit.id); setEditingTeamName(unit.name); }}
                        className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 rounded-lg transition-colors"
                        title={`Rename ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}`}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => setDeletingTeamId(unit.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 bg-red-950/50 hover:bg-red-900/50 rounded-lg transition-colors"
                        title={`Delete ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Badge Controls */}
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        isGroupMode 
                          ? 'bg-blue-900/20 text-blue-400 border border-blue-800/30' 
                          : 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/30'
                      }`}>
                        {unit.isParticipantCreated ? 'Self-Formed' : 'Workspace Assigned'}
                      </span>
                      
                      <button
                        onClick={() => updateDoc(doc(db, isGroupMode ? 'discoveryTeams' : 'teams', unit.id), { isOpenToMore: unit.isOpenToMore !== false })}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider transition-colors ${
                          unit.isOpenToMore !== false
                            ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/20 hover:bg-emerald-900/30'
                            : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700'
                        }`}
                      >
                        {unit.isOpenToMore !== false ? 'Open' : 'Closed'}
                      </button>
                      {isGroupMode && unit.code && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-950 border border-zinc-800 text-zinc-350 tracking-wider">
                          Code: {unit.code}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Members List Section */}
                  <div className="flex-1 p-5 flex flex-col">
                    <div className="flex justify-between items-center mb-3">
                      <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        Group Members ({members.length})
                      </h5>
                    </div>
                    
                    <div className="flex-1">
                      {members.length > 0 ? (
                        <ul className="space-y-1.5">
                          {members.map(m => {
                            const leanings = m.archetypeScores ? getLeanings(m.archetypeScores) : null;
                            const primaryArch = leanings?.primary ? ARCHETYPES[leanings.primary] : null;
                            const secondaryArch = leanings?.secondary ? ARCHETYPES[leanings.secondary] : null;

                            return (
                              <li key={m.id} className="group/member flex items-center justify-between bg-zinc-950/50 hover:bg-zinc-950 border border-zinc-800/50 rounded-xl px-3 py-1.5 transition-colors">
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-sm font-medium text-zinc-205 truncate">{m.name}</span>
                                    {primaryArch && (
                                      <span 
                                        className="inline-flex items-center px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-[9px] font-bold select-none cursor-help shrink-0"
                                        title={`Primary Leaning: ${primaryArch.label}${secondaryArch ? `, Secondary: ${secondaryArch.label}` : ''}`}
                                      >
                                        <span>{primaryArch.emoji}</span>
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-zinc-500 font-medium">{m.designThinkingProficiency}</span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover/member:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => setMovingParticipantId(m.id)} 
                                    className="p-1 text-zinc-400 hover:text-white transition-colors"
                                    title={`Move to another ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}`}
                                  >
                                    <ArrowRightLeft size={12} />
                                  </button>
                                  <button 
                                    onClick={() => removeParticipant(m.id)} 
                                    className="p-1 text-red-400 hover:text-red-300 transition-colors"
                                    title={`Remove from ${isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}`}
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center py-6 text-center border border-dashed border-zinc-800/50 rounded-xl bg-zinc-950/20">
                          <p className="text-xs text-zinc-500 italic">No members assigned</p>
                          <button 
                            onClick={() => setAddingToTeamId(unit.id)}
                            className={`mt-2 text-[10px] font-bold hover:underline uppercase tracking-wider ${
                              isGroupMode ? 'text-blue-400' : 'text-emerald-400'
                            }`}
                          >
                            Assign Members
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Move Participant Modal */}
      {movingParticipantId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-xl font-bold">Move Participant</h3>
            <p className="text-sm text-zinc-400">
              Select a new destination for <strong className="text-white">{participants.find(p => p.id === movingParticipantId)?.name}</strong>:
            </p>
            
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {activeUnits.map(t => {
                let metadataLabel = '';
                if (isGroupMode) {
                  const fa = focusAreas.find(fa => fa.id === t.focusAreaId);
                  const pc = proposedChallenges.find(pc => pc.id === t.proposedChallengeId);
                  if (fa && pc) metadataLabel = `${fa.title} / ${pc.title}`;
                  else if (fa) metadataLabel = `FA: ${fa.title}`;
                  else if (pc) metadataLabel = `PC: ${pc.title}`;
                  else metadataLabel = 'No Alignment Associated';
                } else {
                  const challenge = challenges.find(c => c.id === t.challengeId);
                  metadataLabel = challenge?.title || 'No Challenge Assigned';
                }

                return (
                  <button
                    key={t.id}
                    onClick={async () => {
                      clearMessages();
                      try {
                        if (isGroupMode) {
                          await updateDoc(doc(db, 'participants', movingParticipantId), {
                            discoveryTeamId: t.id,
                            discovery_team_id: t.id
                          });
                          setSuccessMessage('Participant moved successfully.');
                        } else {
                          await updateDoc(doc(db, 'participants', movingParticipantId), {
                            teamId: t.id,
                            solutioning_team_id: t.id,
                            isAssigned: true
                          });
                          setSuccessMessage('Participant moved successfully.');
                        }
                        setMovingParticipantId(null);
                      } catch (err) {
                        setError('Failed to move participant.');
                      }
                    }}
                    className={`w-full text-left p-3 bg-zinc-950 border border-zinc-800 rounded-xl transition-colors ${
                      isGroupMode ? 'hover:border-blue-500' : 'hover:border-emerald-500'
                    }`}
                  >
                    <div className="font-medium text-sm text-white">{t.name}</div>
                    <div className={`text-xs mt-0.5 ${isGroupMode ? 'text-blue-400' : 'text-emerald-400'}`}>{metadataLabel}</div>
                  </button>
                );
              })}
              {activeUnits.length === 0 && (
                <div className="text-zinc-500 italic text-center text-sm py-4">No active groups or teams to move to.</div>
              )}
            </div>
            
            <div className="flex justify-end pt-4">
              <button onClick={() => setMovingParticipantId(null)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Participant to Team/Group Modal */}
      {addingToTeamId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-xl font-bold">Assign to {isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}</h3>
            <p className="text-sm text-zinc-400">
              Select a target unit to place <strong className="text-white">{participants.find(p => p.id === addingToTeamId)?.name}</strong>:
            </p>
            
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {activeUnits.map(t => {
                let metadataLabel = '';
                if (isGroupMode) {
                  const fa = focusAreas.find(fa => fa.id === t.focusAreaId);
                  const pc = proposedChallenges.find(pc => pc.id === t.proposedChallengeId);
                  if (fa && pc) metadataLabel = `${fa.title} / ${pc.title}`;
                  else if (fa) metadataLabel = `FA: ${fa.title}`;
                  else if (pc) metadataLabel = `PC: ${pc.title}`;
                  else metadataLabel = 'No Alignment Associated';
                } else {
                  const challenge = challenges.find(c => c.id === t.challengeId);
                  metadataLabel = challenge?.title || 'No Challenge Assigned';
                }

                return (
                  <button
                    key={t.id}
                    onClick={async () => {
                      clearMessages();
                      try {
                        if (isGroupMode) {
                          await updateDoc(doc(db, 'participants', addingToTeamId), {
                            discoveryTeamId: t.id,
                            discovery_team_id: t.id
                          });
                          setSuccessMessage('Participant assigned successfully.');
                        } else {
                          await updateDoc(doc(db, 'participants', addingToTeamId), {
                            teamId: t.id,
                            solutioning_team_id: t.id,
                            isAssigned: true
                          });
                          setSuccessMessage('Participant assigned to team.');
                        }
                        setAddingToTeamId(null);
                      } catch (err) {
                        setError('Failed to assign participant.');
                      }
                    }}
                    className={`w-full text-left p-3 bg-zinc-950 border border-zinc-800 rounded-xl transition-colors ${
                      isGroupMode ? 'hover:border-blue-500' : 'hover:border-emerald-500'
                    }`}
                  >
                    <div className="font-medium text-sm text-white">{t.name}</div>
                    <div className={`text-xs mt-0.5 ${isGroupMode ? 'text-blue-400' : 'text-emerald-400'}`}>{metadataLabel}</div>
                  </button>
                );
              })}
              {activeUnits.length === 0 && (
                <div className="text-zinc-500 italic text-center text-sm py-4">No active groups or teams created yet.</div>
              )}
            </div>
            
            <div className="flex justify-end pt-4">
              <button onClick={() => setAddingToTeamId(null)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Team/Group Confirmation Modal */}
      {deletingTeamId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-bold text-red-400 flex items-center gap-2">
              <AlertCircle size={24} />
              {participants.filter(p => isGroupMode ? (p.discoveryTeamId === deletingTeamId || p.discovery_team_id === deletingTeamId) : solutionTeamId(p) === deletingTeamId).length === 0
                ? `Delete this empty ${isGroupMode ? 'challenge workgroup' : 'solution team'}?` 
                : `Delete this ${isGroupMode ? 'challenge workgroup' : 'solution team'}?`
              }
            </h3>
            <div className="text-zinc-300 space-y-2">
              <p>This will delete the {isGroupMode ? 'challenge workgroup' : 'solution team'} container from the directory, but participant accounts are preserved.</p>
              {participants.filter(p => isGroupMode ? (p.discoveryTeamId === deletingTeamId || p.discovery_team_id === deletingTeamId) : solutionTeamId(p) === deletingTeamId).length > 0 && (
                <p>All members currently inside will be moved back to unassigned status for this mode.</p>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button 
                onClick={() => setDeletingTeamId(null)} 
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-semibold"
              >
                Cancel
              </button>
              <button 
                onClick={confirmRemoveTeam} 
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-semibold"
              >
                Delete {isGroupMode ? 'Challenge Workgroup' : 'Solution Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
