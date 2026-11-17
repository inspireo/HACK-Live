import { InfoHelp } from '../../components/ui/InfoHelp';
import React, { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch, onSnapshot, query, where, deleteField } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, Check, X, Sparkles, Folder, Target, Award, ThumbsUp, Users, User, Download } from 'lucide-react';
import SafeHtml from '../../components/SafeHtml';
import { exportToCSV } from '../../utils/csv';

interface FocusArea {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  displayOrder: number;
}

interface ProposedChallenge {
  id: string;
  sessionId: string;
  focusAreaId: string;
  title: string;
  description: string;
  supportingContext?: string;
  submitterName?: string;
  uid: string;
  createdAt: number;
  isPublished?: boolean;
  publishedChallengeId?: string;
  submitterParticipantId?: string;
  submitterRealName?: string;
  submitterProfileDescriptor?: string;
  discoveryTeamId?: string;
  discoveryTeamName?: string;
  isRefinedByFacilitator?: boolean;
  lastEditedAt?: number;
}

interface ProposedChallengeVote {
  id: string;
  proposedChallengeId: string;
  uid: string;
}

export default function DiscoveryTab({
  sessionId,
  focusAreas,
  proposedChallenges,
  proposedChallengeVotes,
  challengesCount,
  participants = [],
  challenges = [],
  session = {}
}: {
  sessionId: string;
  focusAreas: FocusArea[];
  proposedChallenges: ProposedChallenge[];
  proposedChallengeVotes: ProposedChallengeVote[];
  challengesCount: number;
  participants: any[];
  challenges?: any[];
  session?: any;
}) {
  const [activeSection, setActiveSection] = useState<'focusAreas' | 'proposed' | 'discoveryTeams'>(() => {
    const saved = localStorage.getItem(`discoverySec_${sessionId}`);
    if (saved === 'focusAreas' || saved === 'proposed' || saved === 'discoveryTeams') {
      return saved;
    }
    return 'focusAreas';
  });

  const handleSectionChange = (section: 'focusAreas' | 'proposed' | 'discoveryTeams') => {
    setActiveSection(section);
    localStorage.setItem(`discoverySec_${sessionId}`, section);
  };

  const [discoveryTeams, setDiscoveryTeams] = useState<any[]>([]);
  const [formingDiscoveryTeams, setFormingDiscoveryTeams] = useState<any[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    
    const unsubTeams = onSnapshot(
      query(collection(db, 'discoveryTeams'), where('sessionId', '==', sessionId)),
      (snap) => {
        setDiscoveryTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => console.error('Error listening to discoveryTeams in admin:', err)
    );

    const unsubForming = onSnapshot(
      query(collection(db, 'formingDiscoveryTeams'), where('sessionId', '==', sessionId)),
      (snap) => {
        setFormingDiscoveryTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => console.error('Error listening to formingDiscoveryTeams in admin:', err)
    );

    return () => {
      unsubTeams();
      unsubForming();
    };
  }, [sessionId]);

  const sortedDiscoveryTeams = useMemo(() => {
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

  // Focus Area Form State
  const [isFocusFormOpen, setIsFocusFormOpen] = useState(false);
  const [focusEditingId, setFocusEditingId] = useState<string | null>(null);
  const [focusTitle, setFocusTitle] = useState('');
  const [focusDescription, setFocusDescription] = useState('');

  // Proposed Challenge Moderation State (Publish / Edit)
  const [moderatingChallenge, setModeratingChallenge] = useState<ProposedChallenge | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishSummary, setPublishSummary] = useState('');
  const [publishDocLink, setPublishDocLink] = useState('');

  // Proposed Challenge Editing State
  const [editingProposedChallenge, setEditingProposedChallenge] = useState<ProposedChallenge | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSupportingContext, setEditSupportingContext] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Inline non-blocking confirmation states (essential for iframe environments)
  const [confirmUnpublishId, setConfirmUnpublishId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteFocusId, setConfirmDeleteFocusId] = useState<string | null>(null);

  // Count votes per proposed challenge
  const voteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    proposedChallengeVotes.forEach(v => {
      counts[v.proposedChallengeId] = (counts[v.proposedChallengeId] || 0) + 1;
    });
    return counts;
  }, [proposedChallengeVotes]);

  // Group proposed challenges by focus area, sorted by vote count desc
  const sortedProposed = useMemo(() => {
    return [...proposedChallenges].sort((a, b) => {
      const votesA = voteCounts[a.id] || 0;
      const votesB = voteCounts[b.id] || 0;
      return votesB - votesA;
    });
  }, [proposedChallenges, voteCounts]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'proposed' | 'published'>('all');
  const [filterFocusAreaId, setFilterFocusAreaId] = useState<string>('all');
  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [adminSearchQuery, setAdminSearchQuery] = useState<string>('');

  const annotatedProposed = useMemo(() => {
    return sortedProposed.map(pc => {
      const matchedChallenge = (challenges || []).find(c => c.proposedChallengeId === pc.id || (c.title?.trim().toLowerCase() === pc.title?.trim().toLowerCase() && c.sessionId === pc.sessionId));
      return {
        ...pc,
        isPublished: !!matchedChallenge,
        publishedChallengeId: matchedChallenge?.id || pc.publishedChallengeId || null
      };
    });
  }, [sortedProposed, challenges]);

  const filteredProposed = useMemo(() => {
    let list = annotatedProposed;
    if (filterStatus === 'proposed') {
      list = list.filter(pc => !pc.isPublished);
    } else if (filterStatus === 'published') {
      list = list.filter(pc => pc.isPublished);
    }

    if (filterFocusAreaId !== 'all') {
      list = list.filter(pc => pc.focusAreaId === filterFocusAreaId);
    }

    if (filterTeamId !== 'all') {
      list = list.filter(pc => {
        const submitterParticipant = participants.find(p => p.uid === pc.uid || p.id === pc.submitterParticipantId);
        const submitterTeamId = pc.discoveryTeamId || submitterParticipant?.discoveryTeamId || submitterParticipant?.discovery_team_id;
        return submitterTeamId === filterTeamId;
      });
    }

    if (adminSearchQuery.trim()) {
      const q = adminSearchQuery.toLowerCase().trim();
      list = list.filter(pc => {
        const submitterParticipant = participants.find(p => p.uid === pc.uid || p.id === pc.submitterParticipantId);
        const realName = (pc.submitterRealName || submitterParticipant?.name || '').toLowerCase();
        const subName = (pc.submitterName || '').toLowerCase();
        const desc = (pc.submitterProfileDescriptor || submitterParticipant?.adjective || '').toLowerCase();
        const teamName = (pc.discoveryTeamName || '').toLowerCase();

        return pc.title.toLowerCase().includes(q) ||
               pc.description.toLowerCase().includes(q) ||
               (pc.supportingContext && pc.supportingContext.toLowerCase().includes(q)) ||
               realName.includes(q) ||
               subName.includes(q) ||
               teamName.includes(q) ||
               desc.includes(q);
      });
    }

    return list;
  }, [annotatedProposed, filterStatus, filterFocusAreaId, filterTeamId, adminSearchQuery, participants]);

  const handleExportProposedCSV = () => {
    const headers = [
      'Proposed Challenge Title',
      'Description',
      'Supporting Context',
      'Focus Area',
      'Votes',
      'Published Status',
      'Submitted By (Display)',
      'Actual Participant Name',
      'Participant Email (if available/admin-visible)',
      'Challenge Workgroup',
      'Submitted Timestamp'
    ];

    const rows = filteredProposed.map(pc => {
      const focus = focusAreas.find(fa => fa.id === pc.focusAreaId);
      const votes = voteCounts[pc.id] || 0;
      const submitterParticipant = participants?.find(p => p.uid === pc.uid || p.id === pc.submitterParticipantId);
      const submitterTeamId = pc.discoveryTeamId || submitterParticipant?.discoveryTeamId || submitterParticipant?.discovery_team_id;
      const team = discoveryTeams.find(t => t.id === submitterTeamId);
      const workgroupName = team?.name || (team?.code ? `Group ${team.code}` : pc.discoveryTeamName || '');

      return [
        pc.title || '',
        pc.description || '',
        pc.supportingContext || '',
        focus?.title || '',
        String(votes),
        pc.isPublished ? 'Published' : 'Unpublished',
        pc.submitterName || '',
        submitterParticipant?.name || pc.submitterRealName || '',
        submitterParticipant?.email || submitterParticipant?.emailAddress || '',
        workgroupName,
        pc.createdAt ? new Date(pc.createdAt).toISOString() : ''
      ];
    });

    const cleanName = (session?.name || sessionId || 'session')
      .toLowerCase()
      .replace(/[^a-z0-0a-z_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `hacklive_proposed_challenges_${cleanName}_${dateStr}.csv`;

    exportToCSV(filename, headers, rows);
  };

  const handleSaveFocusArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!focusTitle.trim()) return;

    try {
      if (focusEditingId) {
        await updateDoc(doc(db, 'focusAreas', focusEditingId), {
          title: focusTitle,
          description: focusDescription
        });
      } else {
        await addDoc(collection(db, 'focusAreas'), {
          sessionId,
          title: focusTitle,
          description: focusDescription,
          displayOrder: focusAreas.length
        });
      }
      setFocusTitle('');
      setFocusDescription('');
      setFocusEditingId(null);
      setIsFocusFormOpen(false);
    } catch (err) {
      console.error('Error saving Focus Area:', err);
    }
  };

  const handleEditFocusArea = (fa: FocusArea) => {
    setFocusEditingId(fa.id);
    setFocusTitle(fa.title);
    setFocusDescription(fa.description || '');
    setIsFocusFormOpen(true);
  };

  const handleDeleteFocusArea = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'focusAreas', id));
    } catch (err) {
      console.error('Error deleting focus area:', err);
    }
  };

  const startPublishFlow = (pc: ProposedChallenge) => {
    setModeratingChallenge(pc);
    setPublishTitle(pc.title);
    
    // Auto fabricate a summary with context and submitter
    let summaryHtml = `<p>${pc.description}</p>`;
    if (pc.supportingContext) {
      summaryHtml += `<p><strong>Supporting Context:</strong><br/>${pc.supportingContext}</p>`;
    }
    setPublishSummary(summaryHtml);
    setPublishDocLink('');
    setIsPublishing(true);
  };

  const handleConfirmPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moderatingChallenge || !publishTitle.trim()) return;

    try {
      // 1. Add to official Challenges collection with correlation ID
      const challengeRef = await addDoc(collection(db, 'challenges'), {
        sessionId,
        title: publishTitle,
        summary: publishSummary,
        docLink: publishDocLink,
        isPublished: true,
        displayOrder: challengesCount,
        submitterName: moderatingChallenge.submitterName || '',
        proposedChallengeId: moderatingChallenge.id
      });

      // 2. Simply update the proposedChallenge document state
      await updateDoc(doc(db, 'proposedChallenges', moderatingChallenge.id), {
        isPublished: true,
        publishedChallengeId: challengeRef.id
      });

      // 3. Clear state
      setIsPublishing(false);
      setModeratingChallenge(null);
    } catch (err) {
      console.error('Error publishing challenge:', err);
    }
  };

  const handleBulkPublish = async () => {
    if (selectedIds.length === 0) return;
    const pendingToPublish = annotatedProposed.filter(pc => selectedIds.includes(pc.id) && !pc.isPublished);
    if (pendingToPublish.length === 0) {
      alert("All selected proposed challenges are already published!");
      return;
    }

    try {
      const batch = writeBatch(db);
      let orderIndex = challengesCount;

      for (const pc of pendingToPublish) {
        const challengeRef = doc(collection(db, 'challenges'));
        
        let summaryHtml = `<p>${pc.description}</p>`;
        if (pc.supportingContext) {
          summaryHtml += `<p><strong>Supporting Context:</strong><br/>${pc.supportingContext}</p>`;
        }

        batch.set(challengeRef, {
          sessionId,
          title: pc.title,
          summary: summaryHtml,
          docLink: '',
          isPublished: true,
          displayOrder: orderIndex++,
          submitterName: pc.submitterName || '',
          proposedChallengeId: pc.id
        });

        const proposedRef = doc(db, 'proposedChallenges', pc.id);
        batch.update(proposedRef, {
          isPublished: true,
          publishedChallengeId: challengeRef.id
        });
      }

      await batch.commit();
      setSelectedIds([]); // Reset selection
    } catch (err) {
      console.error('Error executing bulk publish:', err);
    }
  };

  const handleUnpublish = async (pc: any) => {
    try {
      // Robustly locate the published challenge in case publishedChallengeId isn't on pc
      const matched = (challenges || []).find(c => 
        c.proposedChallengeId === pc.id || 
        (c.title?.trim().toLowerCase() === pc.title?.trim().toLowerCase() && c.sessionId === pc.sessionId)
      );

      const challengeIdToDelete = matched?.id || pc.publishedChallengeId;

      if (challengeIdToDelete) {
        await deleteDoc(doc(db, 'challenges', challengeIdToDelete));
      }

      await updateDoc(doc(db, 'proposedChallenges', pc.id), {
        isPublished: false,
        publishedChallengeId: deleteField()
      });

      setSelectedIds(prev => prev.filter(id => id !== pc.id));
    } catch (err) {
      console.error('Error unpublishing challenge:', err);
    }
  };

  const handleDeleteProposed = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'proposedChallenges', id));
    } catch (err) {
      console.error('Error deleting proposed challenge:', err);
    }
  };

  const handleSaveEditedProposed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProposedChallenge || !editTitle.trim() || !editDescription.trim()) return;

    try {
      await updateDoc(doc(db, 'proposedChallenges', editingProposedChallenge.id), {
        title: editTitle.trim(),
        description: editDescription.trim(),
        supportingContext: editSupportingContext.trim(),
        isRefinedByFacilitator: true,
        lastEditedAt: Date.now()
      });

      setEditingProposedChallenge(null);
      setEditTitle('');
      setEditDescription('');
      setEditSupportingContext('');
    } catch (err) {
      console.error('Error saving edited proposed challenge:', err);
    }
  };

  const handleRefineWithAI = async () => {
    if (!editDescription.trim() && !editTitle.trim()) return;
    setIsRefining(true);
    try {
      const prompt = `You are an expert workshop facilitator moderating participant proposed challenge pitches.
Your goal is to gently refine the grammar, spelling, clarity, and formatting of the pitch to prepare it for high-quality workshop presentation.
DO NOT change the underlying goal, idea, or meaning. Keep the participant's original intent.
Refine the title to be clear, concise, and compelling (approx 3-6 words).
Refine the description to be a professional, well-stated challenge (grammar-corrected and clear).
Refine the supporting context to be readable and polished, or keep it similarly constructive.

Format your output exactly like this:
TITLE: <refined title text>
DESCRIPTION: <refined description text>
CONTEXT: <refined supporting context text or original if no changes needed>

Original Pitch to refine:
TITLE: ${editTitle}
DESCRIPTION: ${editDescription}
CONTEXT: ${editSupportingContext || 'N/A'}`;

      const response = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) throw new Error('AI request failed');
      const result = await response.json();
      
      if (result.text) {
        const textMessage = result.text;
        
        const titleMatch = textMessage.match(/TITLE:\s*(.*)/i);
        const descMatch = textMessage.match(/DESCRIPTION:\s*([\s\S]*?)(?=CONTEXT:|$)/i);
        const contextMatch = textMessage.match(/CONTEXT:\s*([\s\S]*)/i);

        if (titleMatch && titleMatch[1]) {
          setEditTitle(titleMatch[1].trim());
        }
        if (descMatch && descMatch[1]) {
          setEditDescription(descMatch[1].trim());
        }
        if (contextMatch && contextMatch[1]) {
          const refinedContext = contextMatch[1].trim();
          if (refinedContext !== 'N/A' && refinedContext.toLowerCase() !== 'n/a') {
            setEditSupportingContext(refinedContext);
          }
        }
      }
    } catch (err) {
      console.error('AI Refinement failed:', err);
      alert('AI Refinement failed. Please refine manually.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleMoveFocusArea = async (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= focusAreas.length) return;

    const current = focusAreas[index];
    const target = focusAreas[nextIndex];

    const batch = writeBatch(db);
    batch.update(doc(db, 'focusAreas', current.id), { displayOrder: target.displayOrder || nextIndex });
    batch.update(doc(db, 'focusAreas', target.id), { displayOrder: current.displayOrder || index });
    await batch.commit();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="text-emerald-500" /> Challenge Discovery Panel
          </h2>
          <InfoHelp label="Challenge discovery">Formulate shared ministry focus areas, view participant pitches, and curate them into official challenges.</InfoHelp>
        </div>
        <div className="flex flex-wrap bg-zinc-900 border border-zinc-800 p-1 rounded-xl w-fit max-w-full">
          <button
            onClick={() => handleSectionChange('focusAreas')}
            className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeSection === 'focusAreas' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Folder size={16} /> Focus Areas ({focusAreas.length})
          </button>
          <button
            onClick={() => handleSectionChange('discoveryTeams')}
            className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeSection === 'discoveryTeams' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users size={16} /> Challenge Workgroups ({discoveryTeams.length})
          </button>
          <button
            onClick={() => handleSectionChange('proposed')}
            className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeSection === 'proposed' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Target size={16} /> Proposed Challenges ({proposedChallenges.length})
          </button>
        </div>
      </div>

      {activeSection === 'focusAreas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-zinc-200">Workshop Focus Areas</h3>
            {!isFocusFormOpen && (
              <button
                onClick={() => {
                  setFocusEditingId(null);
                  setFocusTitle('');
                  setFocusDescription('');
                  setIsFocusFormOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-all"
              >
                <Plus size={16} /> Add Focus Area
              </button>
            )}
          </div>

          {isFocusFormOpen && (
            <form onSubmit={handleSaveFocusArea} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
              <h4 className="font-bold text-white text-md">
                {focusEditingId ? 'Edit Focus Area' : 'Create Focus Area'}
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Focus Area Title</label>
                  <input
                    type="text"
                    value={focusTitle}
                    onChange={e => setFocusTitle(e.target.value)}
                    placeholder="e.g. Leader Development, Digital Tensions"
                    className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Brief Context / Guiding Prompt (Optional)</label>
                  <textarea
                    value={focusDescription}
                    onChange={e => setFocusDescription(e.target.value)}
                    placeholder="Enter short description to guide participants on what this focus area covers."
                    rows={3}
                    className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsFocusFormOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-4">
            {focusAreas
              .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
              .map((fa, idx) => (
                <div key={fa.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <h4 className="font-semibold text-lg text-zinc-100 flex items-center gap-2">
                      <Folder size={18} className="text-teal-500" /> {fa.title}
                    </h4>
                    {fa.description && <p className="text-zinc-400 text-sm">{fa.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleMoveFocusArea(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => handleMoveFocusArea(idx, 'down')}
                      disabled={idx === focusAreas.length - 1}
                      className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      <ArrowDown size={16} />
                    </button>
                    {confirmDeleteFocusId === fa.id ? (
                      <div className="flex items-center gap-1.5 bg-zinc-950/60 border border-zinc-800 p-1.5 rounded-lg text-xs animate-in fade-in duration-200">
                        <span className="text-zinc-400 font-semibold px-1">Delete Focus Area?</span>
                        <button
                          onClick={() => {
                            handleDeleteFocusArea(fa.id);
                            setConfirmDeleteFocusId(null);
                          }}
                          className="px-2 py-1 bg-red-650 hover:bg-red-650/90 text-white font-bold rounded transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteFocusId(null)}
                          className="px-2 py-1 bg-zinc-800 text-zinc-300 font-bold rounded transition-colors hover:bg-zinc-700"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleEditFocusArea(fa)}
                          className="p-1.5 text-blue-400 hover:text-blue-300 bg-zinc-800 hover:bg-zinc-700/80 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteFocusId(fa.id)}
                          className="p-1.5 text-red-400 hover:text-red-300 bg-zinc-800 hover:bg-red-950/20 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            {focusAreas.length === 0 && (
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
                No Focus Areas added yet. Add focus areas to guide your session's discovery.
              </div>
            )}
          </div>
        </div>
      )}

      {activeSection === 'proposed' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-zinc-200">Participant Pitches</h3>
              <InfoHelp label="Publishing pitches">Select multiple pitches to batch publish them or manage individually.</InfoHelp>
            </div>
            <div className="flex items-center gap-3">
              {/* Filter Toggles */}
              <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-xl select-none">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterStatus === 'all'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-250'
                  }`}
                >
                  All ({annotatedProposed.length})
                </button>
                <button
                  onClick={() => setFilterStatus('proposed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterStatus === 'proposed'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-250'
                  }`}
                >
                  Pending ({annotatedProposed.filter(pc => !pc.isPublished).length})
                </button>
                <button
                  onClick={() => setFilterStatus('published')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterStatus === 'published'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-250'
                  }`}
                >
                  Published ({annotatedProposed.filter(pc => pc.isPublished).length})
                </button>
              </div>

              <button
                onClick={handleExportProposedCSV}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-805 hover:bg-zinc-800 hover:text-white text-zinc-200 border border-zinc-750/80 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          {/* Advanced Admin Filters Block */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-zinc-950/45 p-4 border border-zinc-800/60 rounded-2xl shadow-inner">
            <div className="space-y-1 font-sans">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Filter by Focus Area</label>
              <select
                value={filterFocusAreaId}
                onChange={(e) => setFilterFocusAreaId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/55 transition-colors"
                id="admin-filter-focus-area"
              >
                <option value="all">All Focus Areas ({focusAreas.length})</option>
                {focusAreas.map(fa => (
                  <option key={fa.id} value={fa.id}>
                    {fa.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Filter by Workgroup</label>
              <select
                value={filterTeamId}
                onChange={(e) => setFilterTeamId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/55 transition-colors"
                id="admin-filter-workgroup"
              >
                <option value="all">All Workgroups ({discoveryTeams.length})</option>
                {sortedDiscoveryTeams.map(dt => (
                  <option key={dt.id} value={dt.id}>
                    {dt.name || `Workgroup ${dt.code}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Search Proposals</label>
              <input
                type="text"
                placeholder="Search text, name or workgroup..."
                value={adminSearchQuery}
                onChange={(e) => setAdminSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 placeholder-zinc-650 focus:outline-none focus:border-emerald-500/55 transition-colors"
                id="admin-proposals-search"
              />
            </div>
          </div>
 
          {isPublishing && moderatingChallenge && (
            <form onSubmit={handleConfirmPublish} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4 shadow-xl">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <h4 className="font-bold text-white text-lg flex items-center gap-2">
                  <Award className="text-amber-500" /> Curate and Publish Challenge
                </h4>
                <button
                  type="button"
                  onClick={() => setIsPublishing(false)}
                  className="p-1 text-zinc-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Final Challenge Title</label>
                  <input
                    type="text"
                    value={publishTitle}
                    onChange={e => setPublishTitle(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Final Challenge Summary / Presentation Copy</label>
                  <textarea
                    value={publishSummary}
                    onChange={e => setPublishSummary(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Google Doc Link (Optional)</label>
                  <input
                    type="url"
                    value={publishDocLink}
                    onChange={e => setPublishDocLink(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="https://docs.google.com/..."
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm transition-colors"
                >
                  Approve and Publish
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublishing(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {editingProposedChallenge && (
            <form onSubmit={handleSaveEditedProposed} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4 shadow-xl animate-in fade-in slide-in-from-top-4 duration-200">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <h4 className="font-bold text-white text-lg flex items-center gap-2">
                  <Edit2 className="text-blue-500" /> Refined Proposed Pitch Stewardship
                </h4>
                <button
                  type="button"
                  onClick={() => setEditingProposedChallenge(null)}
                  className="p-1 text-zinc-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-450 leading-relaxed flex items-start gap-2.5">
                <div className="p-1.5 bg-emerald-950/40 text-emerald-400 rounded-lg shrink-0">
                  <Sparkles size={14} />
                </div>
                <div>
                  <p className="font-semibold text-zinc-300">Lightweight Editorial Moderation</p>
                  <p className="mt-0.5">Use this form to correct spelling mistakes, clarify awkward phrasing, adjust inconsistent capitalization, or tidy up formatting. This should function as moderation and refinement—never rewriting participant intent entirely.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Challenge Title</label>
                    <span className="text-[10px] text-zinc-500">e.g. spelling corrections & concise summary</span>
                  </div>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-semibold"
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Brief Description</label>
                    <span className="text-[10px] text-zinc-500">The core problem framing & statement</span>
                  </div>
                  <textarea
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    rows={5}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all leading-relaxed"
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Supporting Context</label>
                    <span className="text-[10px] text-zinc-500">Optional notes, links, or clarifications</span>
                  </div>
                  <textarea
                    value={editSupportingContext}
                    onChange={e => setEditSupportingContext(e.target.value)}
                    rows={3}
                    placeholder="Provide optional rationale, links or secondary clarifications if available."
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all leading-relaxed text-zinc-300"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-zinc-800/60">
                <button
                  type="button"
                  onClick={handleRefineWithAI}
                  disabled={isRefining}
                  className="px-4 py-2 bg-gradient-to-r from-violet-600/30 to-indigo-600/30 hover:from-violet-600/50 hover:to-indigo-600/50 text-indigo-300 border border-indigo-500/40 hover:border-indigo-500/60 disabled:opacity-40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 mr-auto w-full sm:w-auto"
                >
                  <Sparkles size={14} className={isRefining ? "animate-spin text-indigo-400" : "text-indigo-400"} />
                  {isRefining ? 'Refining with AI...' : 'Refine with AI Assist'}
                </button>

                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-55 text-white font-semibold rounded-xl text-sm transition-colors flex items-center gap-1.5 w-full sm:w-auto justify-center"
                  >
                    <Check size={16} /> Save Refinements
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProposedChallenge(null);
                      setEditTitle('');
                      setEditDescription('');
                      setEditSupportingContext('');
                    }}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl text-sm transition-colors w-full sm:w-auto justify-center flex"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}
 
          <div className="space-y-4">
            {filteredProposed.map(pc => {
              const focus = focusAreas.find(f => f.id === pc.focusAreaId);
              const votes = voteCounts[pc.id] || 0;
              const isSelected = selectedIds.includes(pc.id);
              
              return (
                <div 
                  key={pc.id}
                  data-testid={`proposal-${pc.id}`}
                  className={`bg-zinc-900 border rounded-2xl p-6 flex gap-4 items-start justify-between transition-all ${
                    pc.isPublished 
                      ? 'border-emerald-600/30 bg-emerald-950/5 shadow-inner' 
                      : isSelected 
                        ? 'border-emerald-500 bg-emerald-950/10 shadow-md ring-1 ring-emerald-500/10' 
                        : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Select Checkbox */}
                  <div className="shrink-0 mt-1 select-none">
                    {!pc.isPublished ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => [...prev, pc.id]);
                          } else {
                            setSelectedIds(prev => prev.filter(id => id !== pc.id));
                          }
                        }}
                        className="w-5 h-5 cursor-pointer rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 bg-zinc-950 accent-emerald-500 transition-all"
                      />
                    ) : (
                      <div 
                        className="w-5 h-5 flex items-center justify-center bg-emerald-500/20 border border-emerald-500/45 rounded-md text-emerald-400"
                        title="Already Published"
                      >
                        <Check size={12} className="stroke-[3]" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-900/30 text-blue-400 border border-blue-800/40">
                        {focus?.title || 'Unknown Focus Area'}
                      </span>
                      <span className="text-zinc-400 text-xs font-medium bg-zinc-800 px-2 py-1 rounded">
                        Proposed by: {pc.submitterName?.trim() ? pc.submitterName : 'Anonymous'}
                      </span>
                      {pc.isRefinedByFacilitator && (
                        <span className="px-2 py-0.5 bg-blue-950/40 border border-blue-900/30 text-blue-400 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm animate-in fade-in">
                          <Sparkles size={11} className="text-amber-500 animate-pulse" /> Refinement Stewarded
                        </span>
                      )}
                      {pc.isPublished && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm animate-in fade-in">
                          <Check size={10} className="stroke-[3]" /> Published
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-xl text-zinc-100">{pc.title}</h4>
                      <p className="text-zinc-305 text-sm leading-relaxed mt-2 whitespace-pre-wrap">{pc.description}</p>
                    </div>
                    {pc.supportingContext && (
                      <div className="bg-zinc-950/40 border border-zinc-800/40 p-3 rounded-lg text-xs text-zinc-400 leading-relaxed">
                        <strong>Supporting Context:</strong> {pc.supportingContext}
                      </div>
                    )}

                    {/* System Attribution Row (Admin/Facilitator Eyes Only) */}
                    {(() => {
                      const submitterParticipant = participants.find(p => p.uid === pc.uid || p.id === pc.submitterParticipantId);
                      const submitterTeamId = pc.discoveryTeamId || submitterParticipant?.discoveryTeamId || submitterParticipant?.discovery_team_id;
                      const submitterTeam = discoveryTeams.find(dt => dt.id === submitterTeamId);

                      const realName = pc.submitterRealName || submitterParticipant?.name || 'Unknown Participant';
                      const pId = pc.submitterParticipantId || submitterParticipant?.id || pc.uid || '';
                      const profileDesc = pc.submitterProfileDescriptor || 
                        (submitterParticipant?.adjective 
                          ? (submitterParticipant.adjective + (submitterParticipant.designThinkingProficiency ? ' - ' + submitterParticipant.designThinkingProficiency : '')) 
                          : (submitterParticipant?.designThinkingProficiency || ''));
                      const teamName = pc.discoveryTeamName || submitterTeam?.name || 'None / Individual';
                      const timeString = pc.createdAt ? new Date(pc.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Unknown time';

                      return (
                        <div className="mt-3 pt-3 border-t border-dashed border-zinc-800/80 text-[11px] text-zinc-400 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 bg-zinc-950/20 p-2.5 rounded-lg border border-zinc-800/60">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-zinc-500">System Attribution:</span>
                              <span className="text-zinc-300 font-semibold">{realName}</span>
                              {pId && <span className="text-zinc-500 font-mono text-[10px]">({pId.substring(0, 8)})</span>}
                              {profileDesc && (
                                <span className="text-zinc-500 bg-zinc-900/60 font-medium px-1.5 py-0.5 rounded border border-zinc-800/40">
                                  {profileDesc}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-zinc-500">
                              <span className="font-semibold text-zinc-500">Challenge Workgroup:</span>
                              <span className="text-blue-450 font-bold bg-blue-950/20 px-2 py-0.5 rounded border border-blue-900/30 text-[10px]">
                                {teamName}
                              </span>
                            </div>
                          </div>
                          <div className="text-zinc-500 font-mono text-[10px] self-end sm:self-start shrink-0">
                            Submitted: {timeString}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex flex-row md:flex-col items-center gap-3 shrink-0 self-stretch md:self-auto justify-between border-t md:border-t-0 border-zinc-800 pt-3 md:pt-0">
                    <div className="flex items-center gap-2 bg-emerald-950/45 text-emerald-400 border border-emerald-900/40 px-3 py-1.5 rounded-full">
                      <ThumbsUp size={16} />
                      <span className="font-bold font-mono text-lg">{votes}</span>
                      <span className="text-xs text-emerald-500 uppercase font-semibold">votes</span>
                    </div>
                    <div className="flex gap-2">
                      {pc.isPublished ? (
                        confirmUnpublishId === pc.id ? (
                          <div className="flex items-center gap-1.5 bg-zinc-950/60 border border-zinc-800 p-1.5 rounded-lg text-xs animate-in fade-in duration-200">
                            <span className="text-zinc-400 font-semibold px-1">Unpublish?</span>
                            <button
                              onClick={() => {
                                handleUnpublish(pc);
                                setConfirmUnpublishId(null);
                              }}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmUnpublishId(null)}
                              className="px-2.5 py-1 bg-zinc-800 text-zinc-300 font-bold rounded transition-colors hover:bg-zinc-700"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmUnpublishId(pc.id)}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-amber-950/20 hover:text-amber-400 text-zinc-300 border border-zinc-700 hover:border-amber-900/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                          >
                            <X size={14} /> Unpublish
                          </button>
                        )
                      ) : (
                        confirmDeleteId === pc.id ? (
                          <div className="flex items-center gap-1.5 bg-zinc-950/60 border border-zinc-800 p-1.5 rounded-lg text-xs animate-in fade-in duration-200">
                            <span className="text-zinc-400 font-semibold px-1">Reject Pitch?</span>
                            <button
                              onClick={() => {
                                handleDeleteProposed(pc.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1 bg-red-650 hover:bg-red-600 text-white font-bold rounded transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 bg-zinc-800 text-zinc-300 font-bold rounded transition-colors hover:bg-zinc-700"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingProposedChallenge(pc);
                                setEditTitle(pc.title);
                                setEditDescription(pc.description);
                                setEditSupportingContext(pc.supportingContext || '');
                                window.scrollTo({ top: 300, behavior: 'smooth' });
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <Edit2 size={13} /> Edit
                            </button>
                            <button
                              onClick={() => startPublishFlow(pc)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <Check size={14} /> Publish
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(pc.id)}
                              className="p-1.5 text-red-400 hover:text-red-350 bg-zinc-805 hover:bg-red-950/30 rounded-lg transition-colors"
                              title="Reject / Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredProposed.length === 0 && (
              <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
                No proposed pitches found for this filter.
              </div>
            )}
          </div>

          {/* Sticky Bulk Action Bar */}
          {selectedIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900/95 backdrop-blur border border-zinc-800 px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
              <div className="flex items-center gap-2 select-none">
                <span className="bg-emerald-500 text-black text-xs font-black w-5 h-5 flex items-center justify-center rounded-full">
                  {selectedIds.length}
                </span>
                <span className="text-zinc-200 text-sm font-semibold">Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkPublish}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/20"
                >
                  <Award size={14} /> Publish Selected ({selectedIds.length})
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl text-xs transition-all"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection === 'discoveryTeams' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
            <div>
              <h3 className="text-lg font-bold text-zinc-200">Challenge Workgroups</h3>
              <InfoHelp label="Challenge workgroups">View launched and forming Challenge Workgroups. You can dissolve groups or inspect membership.</InfoHelp>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. ACTIVE LAUNCHED TEAMS */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase text-zinc-500 tracking-wider flex items-center justify-between">
                <span>Launched Challenge Workgroups ({discoveryTeams.length})</span>
              </h4>

              <div className="space-y-3">
                {sortedDiscoveryTeams.map(dt => {
                  const members = participants.filter(p => p.discoveryTeamId === dt.id || p.discovery_team_id === dt.id);
                  const leader = participants.find(p => p.id === dt.leaderId) || members[0];
                  
                  return (
                    <div key={dt.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h5 className="font-bold text-white text-md">{dt.name || 'Unnamed Challenge Workgroup'}</h5>
                          <span className="font-mono text-xs text-zinc-500 block mt-0.5">Codeword: <strong className="text-blue-400">{dt.code || dt.id}</strong></span>
                        </div>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Dissolve "${dt.name || 'Unnamed'}"? Members will be removed from this group.`)) return;
                            const batch = writeBatch(db);
                            members.forEach(m => {
                              batch.update(doc(db, 'participants', m.id), {
                                discovery_team_id: null,
                                discoveryTeamId: null
                              });
                            });
                            batch.delete(doc(db, 'discoveryTeams', dt.id));
                            await batch.commit();
                          }}
                          className="px-2.5 py-1 text-red-400 hover:text-white bg-red-950/20 hover:bg-red-900 border border-red-900/30 rounded text-[11px] font-bold transition-all"
                        >
                          Dissolve Group
                        </button>
                      </div>

                      <div className="border-t border-zinc-800/60 pt-3">
                        <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider block mb-2">Members ({members.length})</span>
                        <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto">
                          {members.map(m => (
                            <div key={m.id} className="bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-xs flex flex-col justify-center">
                              <span className="text-white font-medium truncate">{m.name}</span>
                              {dt.leaderId === m.id && <span className="text-[9px] text-blue-400 uppercase font-semibold">Leader</span>}
                            </div>
                          ))}
                        </div>
                        {members.length === 0 && (
                          <p className="text-xs text-zinc-500 italic">No members currently in this team.</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {discoveryTeams.length === 0 && (
                  <div className="text-center py-10 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
                    No challenge workgroups have been locked & launched yet.
                  </div>
                )}
              </div>
            </div>

            {/* 2. FORMING TEAMS */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase text-zinc-500 tracking-wider">
                Forming Challenge Workgroups ({formingDiscoveryTeams.length})
              </h4>

              <div className="space-y-3">
                {formingDiscoveryTeams.map(fdt => {
                  const members = participants.filter(p => p.discoveryTeamId === fdt.id || p.discovery_team_id === fdt.id);
                  const leader = participants.find(p => p.id === fdt.leaderId);

                  return (
                    <div key={fdt.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="font-mono font-bold text-xs text-amber-400 uppercase tracking-wide">Forming Group: {fdt.id}</span>
                          <span className="text-[10px] text-zinc-500 block mt-0.5">Leader: {leader?.name || 'Unknown'}</span>
                        </div>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Dissolve forming group "${fdt.id}"?`)) return;
                            const batch = writeBatch(db);
                            members.forEach(m => {
                              batch.update(doc(db, 'participants', m.id), {
                                discovery_team_id: null,
                                discoveryTeamId: null
                              });
                            });
                            batch.delete(doc(db, 'formingDiscoveryTeams', fdt.id));
                            await batch.commit();
                          }}
                          className="px-2.5 py-1 text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 rounded text-[11px] font-bold transition-all"
                        >
                          Dissolve Group
                        </button>
                      </div>

                      <div className="border-t border-zinc-800/60 pt-3">
                        <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider block mb-2">Forming Members ({members.length})</span>
                        <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto w-full">
                          {members.map(m => (
                            <div key={m.id} className="bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-xs flex flex-col justify-center">
                              <span className="text-white font-medium truncate">{m.name}</span>
                            </div>
                          ))}
                        </div>
                        {members.length === 0 && (
                          <p className="text-xs text-zinc-500 italic">Nobody joined yet.</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {formingDiscoveryTeams.length === 0 && (
                  <div className="text-center py-10 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
                    No active forming challenge workgroups currently.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
