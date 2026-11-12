import TeamRoleEditor from '../../components/TeamRoleEditor';
import { allocationEligible, solutionTeamId } from '../../../shared/participation';
import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, addDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { User, Target, FileText, CheckCircle2, Copy, AlertCircle, LogOut, X, HelpCircle, UserPlus, Users, Send, Edit2, Folder, Sparkles, ThumbsUp, Trash2, Award, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import SafeHtml from '../../components/SafeHtml';
import { identityRequest, useProfile } from '../../identity';
import ShareEventButton from '../../components/ShareEventButton';
import { QUESTION_PACKS, calculateArchetypeScores, getLeanings, ARCHETYPES } from '../../data/questionPacks';

const getParticipantStatusLabel = (status: string) => {
  switch (status) {
    case 'Opening': return 'Welcome / Opening';
    case 'ResourcesOnly': return 'View Resources Only';
    case 'Focus Areas': return 'Focus Areas';
    case 'Discovery Team Formation': return 'Challenge Workgroup Formation';
    case 'Challenge Drafting': return 'Challenge Drafting';
    case 'Challenge Discovery':
    case 'Challenge Proposing': return 'Challenge Proposing';
    case 'Challenge Voting': return 'Challenge Voting';
    case 'Voting Review': return 'Voting Review';
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

const getParticipantStatusGuidance = (status: string) => {
  switch (status) {
    case 'Opening':
      return 'Join the participant directory and respond to the onboarding prompt.';
    case 'ResourcesOnly':
      return 'Access resources and materials curated for you.';
    case 'Focus Areas':
      return 'Explore the workshop themes and register your interest.';
    case 'Discovery Team Formation':
      return 'Create or join a challenge workgroup to pitch ideas.';
    case 'Challenge Drafting':
      return 'Collaboratively sketch, discuss, and refine challenge framing with your workgroup.';
    case 'Challenge Discovery':
    case 'Challenge Proposing':
      return 'Formally propose your challenge ideas for voting.';
    case 'Challenge Voting':
      return 'Vote for the challenge ideas you believe should move forward.';
    case 'Voting Review':
      return 'Facilitators are reviewing and calibrating challenge proposals.';
    case 'Published Challenges':
      return 'Explore the official, filtered challenges chosen for the session.';
    case 'Draft':
      return 'Facilitators are checking challenge proposals.';
    case 'Challenge Selection Open':
      return 'Browse published challenges and choose the problem you want to solve.';
    case 'Selection Locked':
      return 'Challenge selection is locked. Transitioning to team formation...';
    case 'Team Formation':
      return 'Form solution teams with others around your chosen challenge.';
    case 'Team Assignment In Progress':
      return 'Facilitator is organizing the final solution teams.';
    case 'Team Naming Open':
      return 'Give your team a unique name and draft your core focus.';
    case 'Team Naming Locked':
      return 'Solution team names and descriptions are finalized.';
    case 'Live':
      return 'Work with your team to detail solutions and strategies.';
    case 'Presentations':
      return 'Pitch your team\'s solutions and review others.';
    case 'Closed':
      return 'This workshop has closed. Excellent work!';
    default:
      return '';
  }
};

export default function ParticipantDashboard() {
  const { sessionId } = useParams();
  const profile = useProfile();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  
  const maxWgSize = session?.maxWgSize !== undefined ? session.maxWgSize : (session?.maxTeamSize || 6);
  const minWgSize = session?.minWgSize !== undefined ? session.minWgSize : (session?.minTeamSize || 3);
  const preferredWgSize = session?.preferredWgSize !== undefined ? session.preferredWgSize : (session?.preferredTeamSize || 4);
  const enableParticipantWgFormation = session?.enableParticipantWgFormation !== undefined 
    ? Boolean(session.enableParticipantWgFormation)
    : Boolean(session?.enableParticipantTeamFormation);
  const enableParticipantTeamFormation = Boolean(session?.enableParticipantTeamFormation);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [participant, setParticipant] = useState<any>(null);
  const [team, setTeam] = useState<any>(null);
  const [teammates, setTeammates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [welcomeResponses, setWelcomeResponses] = useState<any[]>([]);
  const [focusAreas, setFocusAreas] = useState<any[]>([]);
  const [proposedChallenges, setProposedChallenges] = useState<any[]>([]);
  const [proposedChallengeVotes, setProposedChallengeVotes] = useState<any[]>([]);

  // Join form state
  const [name, setName] = useState(profile.name);
  const [adjective, setAdjective] = useState('');
  const [proficiency, setProficiency] = useState('New to it');
  const [joinError, setJoinError] = useState('');
  

  // Resource modal state
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const [isResourceSummaryExpanded, setIsResourceSummaryExpanded] = useState(false);

  useEffect(() => {
    setIsResourceSummaryExpanded(false);
  }, [selectedResource]);

  // Team naming state
  const [teamName, setTeamName] = useState('');
  const [localParticipantId, setLocalParticipantId] = useState<string | null>(null);
  const [registrationReady, setRegistrationReady] = useState(false);

  useEffect(() => {
    let active = true;
    setParticipant(null); setLocalParticipantId(null); setRegistrationReady(false);
    Promise.all([
      getDoc(doc(db, 'registrations', `${sessionId}~${auth.currentUser!.uid}`)),
      getDoc(doc(db, 'registrationDefaults', auth.currentUser!.uid)),
    ]).then(([registration, defaults]) => {
      if (!active) return;
      if (registration.exists()) setLocalParticipantId(registration.data().participantId);
      if (defaults.exists()) { setAdjective(defaults.data().adjective || ''); setProficiency(defaults.data().designThinkingProficiency || 'New to it'); }
      setRegistrationReady(true);
    }).catch(() => { if (active) { setJoinError('Could not load registration. Refresh to retry.'); setRegistrationReady(true); } });
    return () => { active = false; };
  }, [sessionId]);
  const [copied, setCopied] = useState(false);
  const [teamNameSaved, setTeamNameSaved] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // Team formation state
  const [formingTeam, setFormingTeam] = useState<any>(null);
  const [joinCodeword, setJoinCodeword] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [teamJoinError, setTeamJoinError] = useState('');
  const [formingMembers, setFormingMembers] = useState<any[]>([]);

  // Discovery Team state
  const [discTeam, setDiscTeam] = useState<any>(null);
  const [discTeamName, setDiscTeamName] = useState('');
  const [discTeammates, setDiscTeammates] = useState<any[]>([]);
  const [formingDiscTeam, setFormingDiscTeam] = useState<any>(null);
  const [formingDiscMembers, setFormingDiscMembers] = useState<any[]>([]);
  const [showFormingDiscModal, setShowFormingDiscModal] = useState(false);
  const [showJoinDiscModal, setShowJoinDiscModal] = useState(false);
  const [discJoinCodeword, setDiscJoinCodeword] = useState('');
  const [discTeamJoinError, setDiscTeamJoinError] = useState('');
  const [isDiscJoining, setIsDiscJoining] = useState(false);
  const [isWgRecapExpanded, setIsWgRecapExpanded] = useState(false);

  // Challenge selection state
  const [confirmChallengeId, setConfirmChallengeId] = useState<string | null>(null);
  const [confirmLeaveTeam, setConfirmLeaveTeam] = useState(false);
  const [showFormingTeamModal, setShowFormingTeamModal] = useState(false);
  const [showJoinTeamModal, setShowJoinTeamModal] = useState(false);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [isCancellingTeam, setIsCancellingTeam] = useState(false);
  const [toastMessage, setToastMessage] = useState<{title: string, message: string, type: 'success' | 'error'} | null>(null);

  // Pitch Form State
  const [isPcFormOpen, setIsPcFormOpen] = useState(false);
  const [pcFocusAreaId, setPcFocusAreaId] = useState('');
  const [pcTitle, setPcTitle] = useState('');
  const [pcDescription, setPcDescription] = useState('');
  const [pcSupportingContext, setPcSupportingContext] = useState('');
  const [pcSubmitterName, setPcSubmitterName] = useState('');
  const [pcEditingId, setPcEditingId] = useState<string | null>(null);
  const [deletePitchConfirmId, setDeletePitchConfirmId] = useState<string | null>(null);
  const [isDeletingPitch, setIsDeletingPitch] = useState(false);

  const handleSavePitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pcFocusAreaId || !pcTitle.trim() || !pcDescription.trim() || !participant) return;

    try {
      const activeDiscTeamId = participant.discoveryTeamId || participant.discovery_team_id || '';
      const currentDiscTeamName = (activeDiscTeamId && discTeam && (discTeam.id === activeDiscTeamId))
        ? (discTeam.name || discTeamName || '')
        : '';
      const profileDescriptor = participant.adjective || participant.designThinkingProficiency || '';

      if (pcEditingId) {
        await updateDoc(doc(db, 'proposedChallenges', pcEditingId), {
          focusAreaId: pcFocusAreaId,
          title: pcTitle.trim(),
          description: pcDescription.trim(),
          supportingContext: pcSupportingContext.trim(),
          submitterName: pcSubmitterName.trim() || participant.name,
          discoveryTeamId: activeDiscTeamId,
          submitterParticipantId: participant.id,
          submitterRealName: participant.name,
          submitterProfileDescriptor: profileDescriptor,
          discoveryTeamName: currentDiscTeamName
        });
        showToast('Success', 'Challenge proposal updated!', 'success');
      } else {
        await addDoc(collection(db, 'proposedChallenges'), {
          sessionId,
          focusAreaId: pcFocusAreaId,
          title: pcTitle.trim(),
          description: pcDescription.trim(),
          supportingContext: pcSupportingContext.trim(),
          submitterName: pcSubmitterName.trim() || participant.name,
          uid: auth.currentUser?.uid || '',
          createdAt: Date.now(),
          discoveryTeamId: activeDiscTeamId,
          submitterParticipantId: participant.id,
          submitterRealName: participant.name,
          submitterProfileDescriptor: profileDescriptor,
          discoveryTeamName: currentDiscTeamName
        });
        showToast('Success', 'Your challenge proposal has been submitted!', 'success');
      }
      setIsPcFormOpen(false);
      setPcEditingId(null);
      setPcFocusAreaId('');
      setPcTitle('');
      setPcDescription('');
      setPcSupportingContext('');
      setPcSubmitterName('');
    } catch (err) {
      console.error('Error saving pitch:', err);
      showToast('Error', 'Failed to save proposal.', 'error');
    }
  };

  const handleEditPitch = (pc: any) => {
    setPcEditingId(pc.id);
    setPcFocusAreaId(pc.focusAreaId);
    setPcTitle(pc.title);
    setPcDescription(pc.description);
    setPcSupportingContext(pc.supportingContext || '');
    setPcSubmitterName(pc.submitterName || '');
    setIsPcFormOpen(true);
  };

  const handleDeletePitch = (id: string) => {
    setDeletePitchConfirmId(id);
  };

  const handleConfirmDeletePitch = async () => {
    if (!deletePitchConfirmId) return;
    setIsDeletingPitch(true);
    try {
      await deleteDoc(doc(db, 'proposedChallenges', deletePitchConfirmId));
      showToast('Deleted', 'Challenge proposal deleted.', 'success');
      setDeletePitchConfirmId(null);
    } catch (err) {
      console.error('Error deleting proposed challenge:', err);
      showToast('Error', 'Failed to delete challenge proposal.', 'error');
    } finally {
      setIsDeletingPitch(false);
    }
  };

  const handleVoteProposed = async (proposedChallengeId: string) => {
    if (!auth.currentUser) return;
    if (session?.status !== 'Challenge Voting') {
      showToast('Voting Closed', 'Challenge voting is currently closed.', 'error');
      return;
    }
    const currentVotes = proposedChallengeVotes.filter(v => v.uid === auth.currentUser?.uid);
    if (currentVotes.length >= 3) {
      showToast('Limit Reached', 'You have already used all 3 of your votes.', 'error');
      return;
    }

    try {
      await addDoc(collection(db, 'proposedChallengeVotes'), {
        sessionId,
        proposedChallengeId,
        uid: auth.currentUser.uid,
        createdAt: Date.now()
      });
      showToast('Voted', 'Your vote has been cast!', 'success');
    } catch (err) {
      console.error('Error voting:', err);
      showToast('Error', 'Failed to cast vote.', 'error');
    }
  };

  const handleRemoveVoteProposed = async (proposedChallengeId: string) => {
    if (!auth.currentUser) return;
    if (session?.status !== 'Challenge Voting') {
      showToast('Voting Lock', 'Challenge voting is locked during review.', 'error');
      return;
    }
    const voteDoc = proposedChallengeVotes.find(v => v.proposedChallengeId === proposedChallengeId && v.uid === auth.currentUser?.uid);
    if (!voteDoc) return;

    try {
      await deleteDoc(doc(db, 'proposedChallengeVotes', voteDoc.id));
      showToast('Vote Removed', 'Your vote has been retracted.', 'success');
    } catch (err) {
      console.error('Error removing vote:', err);
      showToast('Error', 'Failed to retract vote.', 'error');
    }
  };

  const showToast = (title: string, message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ title, message, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

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
      case 'Podcasts': return 'Watch/Listen to Podcast';
      case 'Videos': return 'Watch Video';
      default: return 'Open External Link';
    }
  };

  const handleCopyResourcePrompt = async () => {
    if (!selectedResource) return;
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = selectedResource.summary;
      
      // Process block elements for spacing
      const blockElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, blockquote');
      blockElements.forEach(el => {
        el.insertAdjacentText('afterend', '\n\n');
      });

      // Process line breaks
      const brElements = tempDiv.querySelectorAll('br');
      brElements.forEach(br => {
        br.replaceWith('\n');
      });

      // Process list items
      const listItems = tempDiv.querySelectorAll('li');
      listItems.forEach(li => {
        // Check if it's in an ordered list
        const parentOl = li.closest('ol');
        if (parentOl) {
          const index = Array.from(parentOl.children).indexOf(li) + 1;
          li.textContent = `${index}. ${li.textContent}`;
        } else {
          li.textContent = `• ${li.textContent}`;
        }
        li.insertAdjacentText('afterend', '\n');
      });

      let plainText = tempDiv.textContent || tempDiv.innerText || '';
      
      // Clean up extra newlines (more than 2)
      plainText = plainText.replace(/\n{3,}/g, '\n\n').trim();
      
      await navigator.clipboard.writeText(plainText);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const resourceSummaryText = React.useMemo(() => {
    if (!selectedResource) return '';
    if (selectedResource.shortSummary) return selectedResource.shortSummary;
    if (!selectedResource.summary) return '';
    
    // Extract first paragraph or full text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectedResource.summary;
    const firstP = tempDiv.querySelector('p');
    if (firstP && firstP.textContent) {
      return firstP.textContent.trim();
    }
    const text = tempDiv.textContent || tempDiv.innerText || '';
    return text.trim();
  }, [selectedResource]);

  const workgroupFocusAreas = React.useMemo(() => {
    const list: any[] = [];
    if (discTeam?.focusAreaId) {
      const fa = focusAreas.find(f => f.id === discTeam.focusAreaId);
      if (fa) list.push(fa);
    }
    const members = [participant, ...discTeammates];
    members.forEach(m => {
      if (!m) return;
      if (m.interestedFocusAreaIds && Array.isArray(m.interestedFocusAreaIds)) {
        m.interestedFocusAreaIds.forEach((id: string) => {
          const fa = focusAreas.find(f => f.id === id);
          if (fa && !list.some(item => item.id === fa.id)) {
            list.push(fa);
          }
        });
      } else if (m.interestedFocusAreaId) {
        const fa = focusAreas.find(f => f.id === m.interestedFocusAreaId);
        if (fa && !list.some(item => item.id === fa.id)) {
          list.push(fa);
        }
      }
    });
    return list;
  }, [discTeam, discTeammates, participant, focusAreas]);

  useEffect(() => {
    if (participant) {
      document.title = `${participant.name}'s Dashboard – #HACK Live`;
    } else {
      document.title = 'Join Session – #HACK Live';
    }
  }, [participant]);

  useEffect(() => {
    if (!sessionId || !auth.currentUser) return;

    let activeSolutionId: string | null = null;
    const subscriptions: (() => void)[] = [];
    const subscribe: typeof onSnapshot = ((...snapshotArgs: any[]) => {
      const unsubscribe = (onSnapshot as any)(...snapshotArgs);
      subscriptions.push(unsubscribe);
      return unsubscribe;
    }) as typeof onSnapshot;
    const unsubSession = subscribe(doc(db, 'sessions', sessionId), (doc) => {
      if (doc.exists()) {
        setSession({ id: doc.id, ...doc.data() });
      } else {
        navigate('/');
      }
    }, (error) => {
      console.error('Session listener error:', error);
    });

    const unsubChallenges = subscribe(query(collection(db, 'challenges'), where('sessionId', '==', sessionId), where('isPublished', '==', true)), (snapshot) => {
      setChallenges(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => ((a.displayOrder ?? 0) - (b.displayOrder ?? 0)) || a.id.localeCompare(b.id)));
    }, (error) => {
      console.error('Challenges listener error:', error);
    });

    const unsubResources = subscribe(query(collection(db, 'resources'), where('sessionId', '==', sessionId), where('isPublished', '==', true)), (snapshot) => {
      setResources(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0)));
    }, (error) => {
      console.error('Resources listener error:', error);
    });

    const unsubFocusAreas = subscribe(query(collection(db, 'focusAreas'), where('sessionId', '==', sessionId)), (snapshot) => {
      setFocusAreas(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a,b) => (a.displayOrder || 0) - (b.displayOrder || 0)));
    }, (error) => {
      console.error('Focus areas listener error:', error);
    });

    const unsubProposed = subscribe(query(collection(db, 'proposedChallenges'), where('sessionId', '==', sessionId)), (snapshot) => {
      setProposedChallenges(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (error) => {
      console.error('Proposed challenges listener error:', error);
    });

    const unsubProposedVotes = subscribe(query(collection(db, 'proposedChallengeVotes'), where('sessionId', '==', sessionId)), (snapshot) => {
      setProposedChallengeVotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (error) => {
      console.error('Proposed votes listener error:', error);
    });

    let unsubWelcome: any = null;
    if (localParticipantId) {
      // Simplify query to just sessionId to debug permission issues
      unsubWelcome = subscribe(query(collection(db, 'welcomeResponses'), where('sessionId', '==', sessionId)), (snapshot) => {
        const allResponses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Filter locally for now
        setWelcomeResponses(allResponses.filter((r: any) => r.participantId === localParticipantId));
      }, (error) => {
        console.error('Welcome responses listener error:', error);
      });
    }

    // Check local storage for existing participant ID
    if (localParticipantId) {
      const unsubParticipant = subscribe(doc(db, 'participants', localParticipantId), (docSnap) => {
        if (docSnap.exists()) {
          const pData = { id: docSnap.id, ...docSnap.data(), teamId: solutionTeamId(docSnap.data()) } as any;
          if (pData.uid !== auth.currentUser?.uid || pData.memberId !== auth.currentUser?.uid || pData.sessionId !== sessionId) { setJoinError('Registration conflict. Contact the organizer.'); setLoading(false); return; }
          setParticipant(pData);
          setName(pData.name || '');
          setAdjective(pData.adjective || '');
          setProficiency(pData.designThinkingProficiency || 'New to it');

          activeSolutionId = pData.teamId;
          if (pData.teamId) {
            // Fetch team
            subscribe(doc(db, 'teams', pData.teamId), (teamSnap) => {
              if (activeSolutionId !== pData.teamId) return;
              if (teamSnap.exists()) {
                setTeam({ id: teamSnap.id, ...teamSnap.data() });
                setTeamName(teamSnap.data().name || '');
              }
            }, (error) => {
              console.error('Team listener error:', error);
            });
            // Fetch teammates
            subscribe(query(collection(db, 'participants'), where('sessionId', '==', sessionId)), (matesSnap) => {
              if (activeSolutionId !== pData.teamId) return;
              setTeammates(matesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(member => solutionTeamId(member) === pData.teamId));
            }, (error) => {
              console.error('Teammates listener error:', error);
            });
          } else {
            setTeam(null); setTeammates([]); setTeamName('');
            // Fetch forming team if any
            subscribe(query(collection(db, 'formingTeams'), where('memberIds', 'array-contains', localParticipantId)), (formingSnap) => {
              if (!formingSnap.empty) {
                const fTeam = { id: formingSnap.docs[0].id, ...formingSnap.docs[0].data() } as any;
                setFormingTeam(fTeam);
                // Fetch forming members
                subscribe(query(collection(db, 'participants'), where('sessionId', '==', sessionId)), (allPartsSnap) => {
                  const allParts = allPartsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                  setFormingMembers(allParts.filter(p => fTeam.memberIds.includes(p.id)));
                }, (error) => {
                  console.error('Forming members listener error:', error);
                });
              } else {
                setFormingTeam(null);
                setFormingMembers([]);
              }
            }, (error) => {
              console.error('Forming team listener error:', error);
            });
          }

          // --- Discovery Team Listeners ---
          const activeDiscTeamId = pData.discoveryTeamId || pData.discovery_team_id;
          if (activeDiscTeamId) {
            subscribe(doc(db, 'discoveryTeams', activeDiscTeamId), (teamSnap) => {
              if (teamSnap.exists()) {
                setDiscTeam({ id: teamSnap.id, ...teamSnap.data() });
                setDiscTeamName(teamSnap.data().name || '');
              }
            }, (error) => {
              console.error('Discovery team listener error:', error);
            });
            subscribe(query(collection(db, 'participants'), where('sessionId', '==', sessionId)), (allPartsSnap) => {
              const allParts = allPartsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
              setDiscTeammates(allParts.filter(p => p.discoveryTeamId === activeDiscTeamId || p.discovery_team_id === activeDiscTeamId));
            }, (error) => {
              console.error('Discovery teammates listener error:', error);
            });
          } else {
            subscribe(query(collection(db, 'formingDiscoveryTeams'), where('memberIds', 'array-contains', localParticipantId)), (formingSnap) => {
              if (!formingSnap.empty) {
                const fTeam = { id: formingSnap.docs[0].id, ...formingSnap.docs[0].data() } as any;
                setFormingDiscTeam(fTeam);
                subscribe(query(collection(db, 'participants'), where('sessionId', '==', sessionId)), (allPartsSnap) => {
                  const allParts = allPartsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                  setFormingDiscMembers(allParts.filter(p => fTeam.memberIds.includes(p.id)));
                }, (error) => {
                  console.error('Forming discovery members listener error:', error);
                });
              } else {
                setFormingDiscTeam(null);
                setFormingDiscMembers([]);
              }
            }, (error) => {
              console.error('Forming discovery team listener error:', error);
            });
          }
          // ---------------------------------
        } else {
          localStorage.removeItem(`participant_${sessionId}`);
        }
        setLoading(false);
      });
      return () => {
        subscriptions.forEach(unsubscribe => unsubscribe());
        unsubSession();
        unsubChallenges();
        unsubResources();
        unsubParticipant();
        unsubFocusAreas();
        unsubProposed();
        unsubProposedVotes();
      };
    } else {
      setLoading(false);
    }

    return () => {
      subscriptions.forEach(unsubscribe => unsubscribe());
      unsubSession();
      unsubChallenges();
      unsubResources();
      unsubFocusAreas();
      unsubProposed();
      unsubProposedVotes();
      if (unsubWelcome) unsubWelcome();
    };
  }, [sessionId, navigate, localParticipantId, auth.currentUser]);

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setJoinError('');
    try {
      const { participantId } = await identityRequest('register', { sessionId, adjective, designThinkingProficiency: proficiency });
      setLocalParticipantId(participantId);
    } catch (issue: any) { setJoinError(issue.message); } finally { setLoading(false); }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participant) return;

    try {
      const profileBatch = writeBatch(db);
      profileBatch.set(doc(db, 'profiles', auth.currentUser!.uid), { name: name.trim(), state: 'active' });
      profileBatch.set(doc(db, 'registrationDefaults', auth.currentUser!.uid), { adjective, designThinkingProficiency: proficiency });
      profileBatch.update(doc(db, 'participants', participant.id), {
        name: name.trim(),
        adjective,
        designThinkingProficiency: proficiency
      });
      await profileBatch.commit();
      showToast('Success', 'Profile updated successfully.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error', 'Could not update profile. Please try again.', 'error');
    }
  };

  const handleStartTeam = async () => {
    if (!enableParticipantTeamFormation) {
      showToast('Error', 'Participant-led team formation is currently disabled by the facilitator.', 'error');
      return;
    }
    if (!participant.selectedChallengeId) return;
    
    const words = [
      // Space & Sci-Fi
      'ORBIT', 'NOVA', 'LUMEN', 'SOLAR', 'UMBRA', 'VENUS', 'XENON', 'ASTRO', 'COMET', 'GALAXY', 
      'METEOR', 'PULSE', 'QUASAR', 'ROCKET', 'STELLAR', 'VORTEX', 'COSMOS', 'LUNAR', 'NEBULA', 'ZENITH',
      'APOLLO', 'AURORA', 'CELEST', 'ECLIPSE', 'GRAVITY', 'HORIZON', 'INFINITY', 'JUPITER', 'MARS', 'NEPTUNE',
      'ORION', 'PLUTO', 'SATURN', 'SIRIUS', 'URANUS', 'ZODIAC', 'ASTRAL', 'COSMIC', 'GALACTIC', 'METEORIC',
      // Nature & Elements
      'MANGO', 'RIVER', 'EAGLE', 'FLAME', 'GRAPE', 'OCEAN', 'PANDA', 'TIGER', 'WATER', 'ZEBRA',
      'BLAZE', 'FROST', 'GLOW', 'HALO', 'TORCH', 'DUSK', 'EMBER', 'GROVE', 'HAVEN', 'IVY',
      'JADE', 'LILY', 'MINT', 'OASIS', 'PEAK', 'REEF', 'STONE', 'TIMBER', 'VALLEY', 'WILLOW',
      'ACORN', 'BRICK', 'CLAY', 'DUNE', 'FLINT', 'GRAVEL', 'HEDGE', 'IRON', 'JEWEL', 'LEAF',
      'MOSS', 'PETAL', 'ROOT', 'SAND', 'THORN', 'VINE', 'WOOD', 'BRASS', 'COPPER', 'GLASS',
      'STEEL', 'AMBER', 'BASALT', 'BERYL', 'BRONZE', 'CARBON', 'CHALK', 'COBALT', 'CORAL', 'CRYSTAL',
      'DIAMOND', 'EMERALD', 'GARNET', 'GOLD', 'GRANITE', 'IVORY', 'MARBLE', 'NICKEL', 'ONYX', 'OPAL',
      'PEARL', 'PLATINUM', 'RUBY', 'SAPPHIRE', 'SILVER', 'TOPAZ', 'ZIRCON', 'BAMBOO', 'BIRCH', 'CEDAR',
      'CHERRY', 'ELM', 'FIR', 'HAZEL', 'HOLLY', 'MAPLE', 'OAK', 'PINE', 'PLUM', 'ROSE',
      // Action & Energy
      'SPARK', 'JUMBO', 'NINJA', 'MAGIC', 'NEXUS', 'SONIC', 'TITAN', 'ULTRA', 'VIPER', 'WAVE',
      'DASH', 'FLASH', 'HAVOC', 'LASER', 'NEON', 'JUMP', 'KINETIC', 'MYSTIC', 'NIMBUS', 'OPTIC',
      'PHASE', 'QUANTUM', 'RIFT', 'SURGE', 'UNITY', 'VECTOR', 'WARP', 'APEX', 'BEACON', 'CREST',
      'FORGE', 'KITE', 'QUARTZ', 'YIELD', 'ZINC', 'KNOT', 'YARN', 'ACTION', 'ACTIVE', 'AGILE',
      'ALERT', 'ALIVE', 'AWAKE', 'BOLD', 'BRAVE', 'BRIGHT', 'BRISK', 'CHIEF', 'CLEAR', 'CLEVER',
      'CRISP', 'EXACT', 'EXPERT', 'FAIR', 'FAST', 'FINE', 'FIRM', 'FIT', 'FLAIR', 'FLEET',
      'FLUID', 'FRESH', 'GLAD', 'GOOD', 'GRAND', 'GREAT', 'HANDY', 'HAPPY', 'HARDY', 'HEAVY',
      'HERO', 'HIGH', 'IDEAL', 'JOLLY', 'KEEN', 'KIND', 'LIGHT', 'LIVELY', 'LOGIC', 'LOYAL',
      'LUCKY', 'MAJOR', 'MERRY', 'MIGHTY', 'MODEL', 'MODERN', 'NEAT', 'NEW', 'NICE',
      'NOBLE', 'NOVEL', 'PEACE', 'PERK', 'PIVOT', 'PLUS', 'POWER', 'PRIME', 'PRO',
      'PROMPT', 'PROUD', 'PURE', 'QUICK', 'QUIET', 'RAPID', 'READY', 'REAL', 'RIGHT', 'ROBUST',
      'SAFE', 'SENSE', 'SHARP', 'SHINE', 'SKILL', 'SMART', 'SMILE', 'SOLID', 'SOUND', 'SPEED',
      'STOUT', 'STRONG', 'SUPER', 'SWIFT', 'TALENT', 'TOUGH', 'TRUST', 'TRUTH', 'VALID', 'VALUE',
      'VIGOR', 'VITAL', 'VIVID', 'WARM', 'WEALTH', 'WISE', 'WORTH', 'YOUNG', 'ZEAL', 'ZEST'
    ];
    
    try {
      let codeword = '';
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 20) {
        codeword = words[Math.floor(Math.random() * words.length)];
        
        // Check formingTeams
        const formingDoc = await getDoc(doc(db, 'formingTeams', codeword));
        if (formingDoc.exists() && formingDoc.data().sessionId === sessionId) {
          attempts++;
          continue;
        }
        
        // Check teams
        const teamsQ = query(collection(db, 'teams'), where('sessionId', '==', sessionId), where('code', '==', codeword));
        const teamsSnap = await getDocs(teamsQ);
        if (!teamsSnap.empty) {
          attempts++;
          continue;
        }
        
        isUnique = true;
      }
      
      if (!isUnique) {
        showToast('Error', 'Could not generate a unique codeword. Please try again.', 'error');
        return;
      }

      await setDoc(doc(db, 'formingTeams', codeword), {
        sessionId,
        leaderId: participant.id,
        challengeId: participant.selectedChallengeId,
        memberIds: [participant.id],
        isOpenToMore: true,
        createdAt: Date.now()
      });
      setShowFormingTeamModal(true);
    } catch (err) {
      console.error(err);
      showToast('Error', 'Failed to start team.', 'error');
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    if (!allocationEligible(participant)) return;
    e.preventDefault();
    setTeamJoinError('');
    if (!enableParticipantTeamFormation) {
      setTeamJoinError('Participant-led team formation is currently disabled by the facilitator.');
      return;
    }
    if (!joinCodeword.trim() || !participant.selectedChallengeId) return;
    
    setIsJoining(true);
    try {
      const codeword = joinCodeword.trim().toUpperCase();
      const docRef = doc(db, 'formingTeams', codeword);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists() || docSnap.data().sessionId !== sessionId) {
        // Check if it's an already created team
        const q = query(collection(db, 'teams'), where('sessionId', '==', sessionId), where('code', '==', codeword));
        const teamSnap = await getDocs(q);
        
        if (teamSnap.empty) {
          setTeamJoinError('Team code not found');
          setIsJoining(false);
          return;
        }
        
        const existingTeam = teamSnap.docs[0].data();
        if (existingTeam.challengeId !== participant.selectedChallengeId) {
          setTeamJoinError('You can only join teams working on the same challenge');
          setIsJoining(false);
          return;
        }
        
        if (!existingTeam.isOpenToMore) {
          setTeamJoinError('Team is full');
          setIsJoining(false);
          return;
        }
        
        // Check size
        const membersQ = query(collection(db, 'participants'), where('sessionId', '==', sessionId));
        const membersSnap = await getDocs(membersQ);
        if (session.maxTeamSize && membersSnap.docs.filter(member => solutionTeamId(member.data()) === teamSnap.docs[0].id).length >= session.maxTeamSize) {
          setTeamJoinError('Team is full');
          setIsJoining(false);
          return;
        }
        
        // Join existing team
        await updateDoc(doc(db, 'participants', participant.id), {
          teamId: teamSnap.docs[0].id,
          solutioning_team_id: teamSnap.docs[0].id,
          isAssigned: true
        });
        
        setJoinCodeword('');
        setShowJoinTeamModal(false);
        setIsJoining(false);
        return;
      }
      
      const fTeam = docSnap.data();
      if (fTeam.challengeId !== participant.selectedChallengeId) {
        setTeamJoinError('You can only join teams working on the same challenge');
        setIsJoining(false);
        return;
      }
      
      if (!fTeam.isOpenToMore || (session.maxTeamSize && fTeam.memberIds.length >= session.maxTeamSize)) {
        setTeamJoinError('Team is full');
        setIsJoining(false);
        return;
      }

      await updateDoc(docRef, {
        memberIds: [...fTeam.memberIds, participant.id]
      });
      setJoinCodeword('');
      setShowJoinTeamModal(false);
      setShowFormingTeamModal(true);
    } catch (err) {
      console.error(err);
      setTeamJoinError('Failed to join team. Please try again.');
    }
    setIsJoining(false);
  };

  const handleLeaveTeam = async () => {
    if (!participant) return;
    if (solutionTeamId(participant) && !enableParticipantTeamFormation) {
      showToast('Error', 'Participant-led team changes are currently disabled by the facilitator.', 'error');
      return;
    }
    setIsCancellingTeam(true);
    try {
      if (solutionTeamId(participant)) {
        await updateDoc(doc(db, 'participants', participant.id), {
          teamId: null,
          solutioning_team_id: null,
          isAssigned: false
        });
        showToast('Success', 'Left the team.', 'success');
      } else if (formingTeam) {
        if (formingTeam.leaderId === participant.id) {
          await deleteDoc(doc(db, 'formingTeams', formingTeam.id));
          showToast('Success', 'Team creation cancelled.', 'success');
        } else {
          await updateDoc(doc(db, 'formingTeams', formingTeam.id), {
            memberIds: formingTeam.memberIds.filter((id: string) => id !== participant.id)
          });
          showToast('Success', 'Left the forming team.', 'success');
        }
      }
      setConfirmLeaveTeam(false);
      setShowFormingTeamModal(false);
      setShowCancelConfirmModal(false);
    } catch (err) {
      console.error(err);
      showToast('Error', 'Could not leave team. Please try again.', 'error');
    } finally {
      setIsCancellingTeam(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!allocationEligible(participant)) return;
    if (!formingTeam || formingTeam.leaderId !== participant.id) return;
    if (!enableParticipantTeamFormation) {
      showToast('Error', 'Participant-led team formation is currently disabled by the facilitator.', 'error');
      return;
    }
    
    if (formingTeam.memberIds.length < session.minTeamSize && !formingTeam.isOpenToMore) {
      showToast('Error', `You must keep "I welcome more to join this team" turned on because your team is below the minimum size of ${session.minTeamSize}.`, 'error');
      return;
    }

    try {
      await identityRequest('finalize-team', { kind: 'solution', formingId: formingTeam.id });
      showToast('Success', 'Team created successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error', 'Failed to create team.', 'error');
      throw err;
    }
  };

  const handleUpdateTeamName = async () => {
    if (!team || !canEditTeamName) return;
    try {
      await updateDoc(doc(db, 'teams', team.id), {
        name: teamName.trim(),
        nameSubmittedBy: auth.currentUser?.uid
      });
      setTeamNameSaved(true);
      setTimeout(() => setTeamNameSaved(false), 2000);
      showToast('Success', 'Team name saved successfully.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error', 'Could not save team name. Please try again.', 'error');
    }
  };

  // --- Discovery Team Formation Handlers ---
  const handleStartDiscTeam = async () => {
    if (!enableParticipantWgFormation) {
      showToast('Error', 'Participant-led formation is currently disabled by the facilitator.', 'error');
      return;
    }
    const words = [
      'ORBIT', 'NOVA', 'LUMEN', 'SOLAR', 'UMBRA', 'VENUS', 'XENON', 'ASTRO', 'COMET', 'GALAXY', 
      'METEOR', 'PULSE', 'QUASAR', 'ROCKET', 'STELLAR', 'VORTEX', 'COSMOS', 'LUNAR', 'NEBULA', 'ZENITH',
      'APOLLO', 'AURORA', 'CELEST', 'ECLIPSE', 'GRAVITY', 'HORIZON', 'INFINITY', 'JUPITER', 'MARS', 'NEPTUNE',
      'ORION', 'PLUTO', 'SATURN', 'SIRIUS', 'URANUS', 'ZODIAC', 'ASTRAL', 'COSMIC', 'GALACTIC', 'METEORIC',
      'MANGO', 'RIVER', 'EAGLE', 'FLAME', 'GRAPE', 'OCEAN', 'PANDA', 'TIGER', 'WATER', 'ZEBRA',
      'SPARK', 'JUMBO', 'NINJA', 'MAGIC', 'NEXUS', 'SONIC', 'TITAN', 'ULTRA', 'VIPER', 'WAVE'
    ];
    
    try {
      let codeword = '';
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 20) {
        codeword = words[Math.floor(Math.random() * words.length)];
        
        // Check formingDiscoveryTeams
        const formingDoc = await getDoc(doc(db, 'formingDiscoveryTeams', codeword));
        if (formingDoc.exists() && formingDoc.data().sessionId === sessionId) {
          attempts++;
          continue;
        }
        
        // Check discoveryTeams
        const teamsQ = query(collection(db, 'discoveryTeams'), where('sessionId', '==', sessionId), where('code', '==', codeword));
        const teamsSnap = await getDocs(teamsQ);
        if (!teamsSnap.empty) {
          attempts++;
          continue;
        }
        
        isUnique = true;
      }
      
      if (!isUnique) {
        showToast('Error', 'Could not generate a unique codeword. Please try again.', 'error');
        return;
      }
 
      await setDoc(doc(db, 'formingDiscoveryTeams', codeword), {
        sessionId,
        leaderId: participant.id,
        memberIds: [participant.id],
        isOpenToMore: true,
        createdAt: Date.now()
      });
      setShowFormingDiscModal(true);
    } catch (err) {
      console.error(err);
      showToast('Error', 'Failed to start Challenge Workgroup.', 'error');
    }
  };
 
  const handleJoinDiscTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setDiscTeamJoinError('');
    if (!enableParticipantWgFormation) {
      setDiscTeamJoinError('Participant-led formation is disabled.');
      return;
    }
    if (!discJoinCodeword.trim()) return;
    
    setIsDiscJoining(true);
    try {
      const codeword = discJoinCodeword.trim().toUpperCase();
      const docRef = doc(db, 'formingDiscoveryTeams', codeword);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists() || docSnap.data().sessionId !== sessionId) {
        // Check if it's an already created discovery team
        const q = query(collection(db, 'discoveryTeams'), where('sessionId', '==', sessionId), where('code', '==', codeword));
        const teamSnap = await getDocs(q);
        
        if (teamSnap.empty) {
          setDiscTeamJoinError('Challenge Workgroup code not found');
          setIsDiscJoining(false);
          return;
        }
        
        const existingTeam = teamSnap.docs[0].data();
        if (!existingTeam.isOpenToMore) {
          setDiscTeamJoinError('Group is full');
          setIsDiscJoining(false);
          return;
        }
        
        // Check size
        const membersQ = query(collection(db, 'participants'), where('discoveryTeamId', '==', teamSnap.docs[0].id));
        const membersSnap = await getDocs(membersQ);
        if (maxWgSize && membersSnap.size >= maxWgSize) {
          setDiscTeamJoinError('Group is full');
          setIsDiscJoining(false);
          return;
        }
 
        // Join existing discovery team
        await updateDoc(doc(db, 'participants', participant.id), {
          discoveryTeamId: teamSnap.docs[0].id,
          discovery_team_id: teamSnap.docs[0].id
        });
        
        setDiscJoinCodeword('');
        setShowJoinDiscModal(false);
        setIsDiscJoining(false);
        return;
      }
      
      const fTeam = docSnap.data();
      if (!fTeam.isOpenToMore || (maxWgSize && fTeam.memberIds.length >= maxWgSize)) {
        setDiscTeamJoinError('Team is full');
        setIsDiscJoining(false);
        return;
      }

      await updateDoc(docRef, {
        memberIds: [...fTeam.memberIds, participant.id]
      });
      setDiscJoinCodeword('');
      setShowJoinDiscModal(false);
      setShowFormingDiscModal(true);
    } catch (err) {
      console.error(err);
      setDiscTeamJoinError('Failed to join Challenge Workgroup. Please try again.');
    }
    setIsDiscJoining(false);
  };

  const handleLeaveDiscTeam = async () => {
    if (!participant) return;
    setIsCancellingTeam(true);
    try {
      const activeDiscTeamId = participant.discoveryTeamId || participant.discovery_team_id;
      if (activeDiscTeamId) {
        await updateDoc(doc(db, 'participants', participant.id), {
          discoveryTeamId: null,
          discovery_team_id: null
        });
        showToast('Success', 'Left the discovery team.', 'success');
      } else if (formingDiscTeam) {
        if (formingDiscTeam.leaderId === participant.id) {
          await deleteDoc(doc(db, 'formingDiscoveryTeams', formingDiscTeam.id));
          showToast('Success', 'Team creation cancelled.', 'success');
        } else {
          await updateDoc(doc(db, 'formingDiscoveryTeams', formingDiscTeam.id), {
            memberIds: formingDiscTeam.memberIds.filter((id: string) => id !== participant.id)
          });
          showToast('Success', 'Left the forming discovery team.', 'success');
        }
      }
      setShowFormingDiscModal(false);
    } catch (err) {
      console.error(err);
      showToast('Error', 'Could not leave discovery team. Please try again.', 'error');
    } finally {
      setIsCancellingTeam(false);
    }
  };

  const handleCreateDiscTeam = async () => {
    if (!formingDiscTeam || formingDiscTeam.leaderId !== participant.id) return;
    
    if (formingDiscTeam.memberIds.length < session.minTeamSize && !formingDiscTeam.isOpenToMore) {
      showToast('Error', `You must keep "I welcome more to join this team" turned on because your team is below the minimum size of ${session.minTeamSize}.`, 'error');
      return;
    }

    try {
      await identityRequest('finalize-team', { kind: 'discovery', formingId: formingDiscTeam.id });
      showToast('Success', 'Challenge Workgroup created successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error', 'Failed to create discovery team.', 'error');
      throw err;
    }
  };

  const handleUpdateDiscTeamName = async () => {
    if (!discTeam) return;
    try {
      await updateDoc(doc(db, 'discoveryTeams', discTeam.id), {
        name: discTeamName.trim()
      });
      setTeamNameSaved(true);
      setTimeout(() => setTeamNameSaved(false), 2000);
      showToast('Success', 'Challenge Workgroup name saved.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error', 'Could not save team name.', 'error');
    }
  };
  // ---------------------------------------------

  const handleSelectChallenge = async (challengeId: string) => {
    if (!participant || participant.isAssigned) return;
    // Only allow changing if selection is open
    if (participant.selectedChallengeId && session.status !== 'Challenge Selection Open') return;

    try {
      const isSwitching = !!participant.selectedChallengeId;
      await updateDoc(doc(db, 'participants', participant.id), {
        selectedChallengeId: challengeId
      });
      setConfirmChallengeId(null);
      showToast('Success', isSwitching ? 'Challenge selection updated.' : 'Challenge selected.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error', 'Failed to select challenge.', 'error');
    }
  };

  const handleLogout = () => signOut(auth);

  const copyPrompt = () => {
    if (!teammates.length) return;
    const adjectives = teammates.map(t => t.adjective).filter(Boolean).join(', ');
    const prompt = `Suggest 3 group names with the following team members: ${adjectives}.`;
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || !session || !registrationReady) return <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">Loading...</div>;

  if (!participant) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">{session.title}</h1>
            <ShareEventButton sessionId={sessionId!} publicTitle={session.title} stage={session.status} />
            <div className="text-zinc-400">
              <p className="font-medium text-emerald-400">#HACK Live</p>
              <p>Join the session and get ready to collaborate.</p>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4 bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
            <p>Register as <strong>{profile.name}</strong>. <a href="/account" className="underline">Edit your profile</a></p>
            <p className="text-sm text-zinc-400">Returning from the old sign-in? Ask your organizer to link your previous registration before continuing. Phone passcodes cannot recover it.</p>
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-zinc-800/50 p-4 rounded-xl">
                  <p className="text-zinc-300 text-sm">Tell us a little about yourself so we can form great teams.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Pick a word that describes you today</label>
                  <input type="text" maxLength={100} value={adjective} onChange={e => setAdjective(e.target.value)} placeholder="e.g. Curious, Builder, Explorer" className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Design Thinking Proficiency</label>
                  <select value={proficiency} onChange={e => setProficiency(e.target.value)} className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500">
                    <option value="Experienced">Experienced</option>
                    <option value="Trained">Trained</option>
                    <option value="Some exposure">Some exposure</option>
                    <option value="New to it">New to it</option>
                  </select>
                </div>
              </div>

            {joinError && <p className="text-red-400 text-sm">{joinError}</p>}

            <button type="submit" disabled={loading} className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
              {loading ? 'Joining...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (session.status === 'Opening' && allocationEligible(participant)) {
    // 1. Resolve enabled question packs and questions
    const enabledPackIds = session.enabledQuestionPacks || ['welcome_icebreakers', 'collaboration_archetypes'];
    const packOrder = session.questionPackOrder || QUESTION_PACKS.map(p => p.id);
    const sortedPacks = [...QUESTION_PACKS].sort((a, b) => {
      let idxA = packOrder.indexOf(a.id);
      let idxB = packOrder.indexOf(b.id);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
    const activePacks = sortedPacks.filter(p => enabledPackIds.includes(p.id));
    const enabledQuestions = activePacks.flatMap(pack => pack.questions)
      .filter(q => !session.disabledQuestionIds || !session.disabledQuestionIds.includes(q.id));

    // Get answers completed so far
    const answeredCount = enabledQuestions.filter(q => welcomeResponses.some(r => r.questionId === q.id)).length;
    const totalCount = enabledQuestions.length;
    const progressPercent = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;

    // First unanswered question ID
    const firstUnanswered = enabledQuestions.find(q => !welcomeResponses.some(r => r.questionId === q.id));

    // Dynamic, conversational groupings based on user intent
    const sections = [
      {
        id: 'warmup',
        title: 'Warm-up Questions',
        helperText: 'Help us get a sense of the room. These responses help us build overall team energy, alignment, and collective spark.',
        emoji: '🎈',
        packs: ['welcome_icebreakers', 'mission_icebreakers', 'mission_pulse']
      },
      {
        id: 'collaboration',
        title: 'Collaboration Style',
        helperText: 'These questions help us understand how people naturally collaborate, think, and design solutions. This helps support balanced team formation.',
        emoji: '🤝',
        packs: ['collaboration_archetypes', 'working_preferences', 'innovation_readiness', 'digital_ministry_signals', 'lausanne_lens', 'ai_signals']
      }
    ];

    const activeSections = sections.map(sec => {
      const questionsInSec = enabledQuestions.filter(q => {
        // Find the pack this question belongs to
        const parentPack = activePacks.find(pack => pack.questions.some(pq => pq.id === q.id));
        const packId = parentPack?.id || '';
        if (sec.id === 'warmup') {
          return ['welcome_icebreakers', 'mission_icebreakers', 'mission_pulse'].includes(packId);
        } else {
          return !['welcome_icebreakers', 'mission_icebreakers', 'mission_pulse'].includes(packId);
        }
      });
      return { ...sec, questions: questionsInSec };
    }).filter(sec => sec.questions.length > 0);

    const getQuestionHelpText = (q: any) => {
      if (q.mode === 'anonymous') {
        if (q.showOnProjector) {
          return "Answers contribute to the live room view and appear anonymously on screen.";
        }
        return "Responses are shared anonymously with the room.";
      } else {
        if (q.persistToProfile) {
          return "Helps us understand how you naturally collaborate and supports balanced team formation.";
        }
        return "Used to help form balanced teams and spark collaborative synergy.";
      }
    };

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-start p-6 overflow-y-auto w-full">
        <div className="w-full max-w-xl space-y-8 py-8">
          <ShareEventButton sessionId={sessionId!} publicTitle={session.title} stage={session.status} />
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Participant Onboarding
            </h1>
            <p className="text-zinc-400 text-xs max-w-xs mx-auto">
              Welcome to the workshop! Let's cultivate your profile and share lightweight signals before we begin.
            </p>

            {/* Overall Progress Indicator */}
            {totalCount > 0 && (
              <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-2xl space-y-2 text-left max-w-md mx-auto">
                <div className="flex justify-between text-xs font-semibold text-zinc-400">
                  <span>Profile Completion</span>
                  <span>{answeredCount} of {totalCount} completed</span>
                </div>
                <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Subtle Transparency Section */}
            <details className="group text-left bg-zinc-900/30 border border-zinc-800/40 rounded-2xl p-3.5 max-w-md mx-auto text-xs text-zinc-400 cursor-pointer select-none transition-all duration-200">
              <summary className="font-semibold text-zinc-400 hover:text-zinc-300 flex items-center gap-2 focus:outline-none">
                <HelpCircle size={15} className="text-zinc-500 group-hover:text-zinc-400 transition-colors shrink-0" />
                <span>How your answers are used</span>
              </summary>
              <div className="mt-2 text-[11px] text-zinc-500 leading-relaxed space-y-1.5 bg-zinc-950/40 p-3 rounded-xl border border-zinc-900/50 cursor-default font-sans">
                <p>
                  Some questions help facilitators understand collaboration styles and form balanced teams. Anonymous questions are only shown collectively to cultivate shared reflection and room engagement.
                </p>
                <p>
                  Your individual data acts as a creative signal to enrich your local workshop profile and is never shared for grading or evaluation.
                </p>
              </div>
            </details>
          </div>

          <div className="space-y-10">
            {activeSections.map((sec) => (
              <div key={sec.id} className="space-y-4 pt-6 border-t border-zinc-900 first:border-0 first:pt-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-1 px-1 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{sec.emoji}</span>
                    <h2 className="text-base font-bold text-zinc-100">{sec.title}</h2>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-sm">
                    {sec.helperText}
                  </p>
                </div>

                <div className="space-y-4">
                  {sec.questions.map((q) => {
                    const idx = enabledQuestions.indexOf(q);
                    const responseObj = welcomeResponses.find(r => r.questionId === q.id);
              const isAnswered = !!responseObj;
              const isFirstUnanswered = q.id === firstUnanswered?.id;
              
              // Only focus on the current active/unanswered question or already answered ones.
              // Subsequent unanswered questions are shown as locked/subdued.
              const isLocked = !isAnswered && !isFirstUnanswered;

              if (isLocked) {
                return (
                  <div key={q.id} className="bg-zinc-900/40 border border-zinc-900/60 p-4 rounded-2xl opacity-40 select-none flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center bg-zinc-950 text-zinc-600 rounded-full text-xs font-bold">{idx + 1}</span>
                    <span className="text-zinc-500 text-sm font-medium">Question {idx + 1}</span>
                  </div>
                );
              }

              return (
                <div key={q.id} className={`bg-zinc-900 border p-6 rounded-2xl transition-all duration-300 ${
                  isAnswered 
                    ? 'border-zinc-800 opacity-70 bg-zinc-950/20' 
                    : 'border-emerald-500/50 ring-2 ring-emerald-500/10'
                }`}>
                  <div className="flex justify-between items-start mb-4 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-500 font-mono tracking-wider block">Question {idx + 1}</span>
                      <h3 className="text-base font-bold text-zinc-100 leading-normal">{q.text}</h3>
                      <p className="text-[11px] text-zinc-400 font-normal leading-relaxed mt-1">
                        {getQuestionHelpText(q)}
                      </p>
                    </div>
                  </div>

                  {!isAnswered ? (
                    q.type === 'wordcloud' ? (
                      <form 
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const input = (e.target as any).response.value.trim();
                          if (!input) return;
                          
                          // 1. Save response to welcomeResponses
                          await setDoc(doc(collection(db, 'welcomeResponses')), {
                            sessionId,
                            participantId: participant.id,
                            uid: auth.currentUser?.uid,
                            questionId: q.id,
                            response: input,
                            createdAt: Date.now()
                          });

                          // 2. Persist to participant profile if needed
                          if (q.persistToProfile) {
                            await updateDoc(doc(db, 'participants', participant.id), {
                              persistedAnswers: {
                                ...(participant.persistedAnswers || {}),
                                [q.id]: input
                              }
                            });
                          }
                        }}
                        className="space-y-3"
                      >
                        <input 
                          name="response"
                          type="text" 
                          placeholder={q.placeholder || "Your answer..."}
                          className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
                          required
                        />
                        <button type="submit" className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 text-sm transition-colors">
                          <Send size={16} />
                          Submit Response
                        </button>
                      </form>
                    ) : (
                      <div className="space-y-2">
                        {q.options?.map((option) => {
                          const optText = typeof option === 'string' ? option : option.text;
                          return (
                            <button
                              key={optText}
                              onClick={async () => {
                                // 1. Save to welcomeResponses
                                await setDoc(doc(collection(db, 'welcomeResponses')), {
                                  sessionId,
                                  participantId: participant.id,
                                  uid: auth.currentUser?.uid,
                                  questionId: q.id,
                                  response: optText,
                                  createdAt: Date.now()
                                });

                                // 2. Persist and score
                                if (q.persistToProfile) {
                                  const updatedResponses = [
                                    ...welcomeResponses.filter(r => r.questionId !== q.id),
                                    { questionId: q.id, response: optText }
                                  ];
                                  const scores = calculateArchetypeScores(updatedResponses);
                                  const leanings = getLeanings(scores);

                                  await updateDoc(doc(db, 'participants', participant.id), {
                                    archetypeScores: scores,
                                    primaryArchetype: leanings.primary,
                                    secondaryArchetype: leanings.secondary,
                                    persistedAnswers: {
                                      ...(participant.persistedAnswers || {}),
                                      [q.id]: optText
                                    }
                                  });
                                }
                              }}
                              className="w-full p-4 text-left bg-zinc-950 border border-zinc-800 rounded-xl hover:bg-zinc-800 hover:border-zinc-700 transition-all text-sm leading-relaxed"
                            >
                              {optText}
                            </button>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="flex items-center justify-between bg-zinc-950/60 p-3 rounded-xl border border-zinc-900/60">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                        <span className="text-sm font-medium line-clamp-1">{responseObj.response}</span>
                      </div>
                      <button 
                        onClick={async () => {
                          await deleteDoc(doc(db, 'welcomeResponses', responseObj.id));

                          if (q.persistToProfile) {
                            const updatedResponses = welcomeResponses.filter(r => r.questionId !== q.id);
                            const scores = calculateArchetypeScores(updatedResponses);
                            const leanings = getLeanings(scores);

                            const updatedPersisted = { ...(participant.persistedAnswers || {}) };
                            delete updatedPersisted[q.id];

                            await updateDoc(doc(db, 'participants', participant.id), {
                              archetypeScores: scores,
                              primaryArchetype: leanings.primary,
                              secondaryArchetype: leanings.secondary,
                              persistedAnswers: updatedPersisted
                            });
                          }
                        }}
                        className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 text-xs shrink-0 ml-2 font-medium bg-transparent border-0 cursor-pointer"
                      >
                        <Edit2 size={12} />
                        Edit
                      </button>
                    </div>
                  )}
                    </div>
                  );
                })}
                </div>
              </div>
            ))}
          </div>

            {/* Finished Profile Enrichment summary */}
            {!firstUnanswered && (
              <div id="participant-onboarding-complete" className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 flex items-center justify-center rounded-2xl mx-auto shadow-inner">
                  <Sparkles size={24} />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold font-sans tracking-tight text-white">Onboarding Complete!</h2>
                  <p className="text-zinc-400 text-xs max-w-sm mx-auto">
                    You have answered all onboarding questions. Here is your custom profile summary:
                  </p>
                </div>

                {/* Profile display mapping */}
                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl text-left space-y-5 max-w-md mx-auto">
                  {/* Adjective descriptor (Manual) */}
                  <div className="border-b border-zinc-900 pb-3">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 block mb-1">Your Spark / Descriptor</span>
                    <div className="flex justify-between items-center">
                      <span className="text-base font-medium text-emerald-400">
                        {participant.adjective || 'Active Contributor'}
                      </span>
                      <button 
                        onClick={() => {
                          const newAdj = prompt("Update your self-described descriptor/adjective:", participant.adjective || '');
                          if (newAdj !== null) {
                            updateDoc(doc(db, 'participants', participant.id), { adjective: newAdj.trim() });
                          }
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 font-medium bg-transparent border-0 cursor-pointer"
                      >
                        <Edit2 size={12} />
                        Change
                      </button>
                    </div>
                  </div>

                  {/* Derived Archetypes Leaning */}
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 block mb-3">Your Collaborative Style</span>
                    
                    {participant.primaryArchetype ? (
                      <div className="space-y-4">
                        {/* Playful & Encouraging Reveal Screen (No immediate map quiz, shown as cohesive outcome) */}
                        {(() => {
                          const main = participant.primaryArchetype as 'driver' | 'champion' | 'futurist' | 'builder';
                          const reveals = {
                            driver: {
                              title: "Project Driver",
                              emoji: "🚀",
                              sub: "You naturally bring focus, structure, and momentum.",
                              detail: "You love setting milestones, structuring action plans, and keeping the group aligned to timelines. Your team relies on your focus to drive progress!"
                            },
                            champion: {
                              title: "User Champion",
                              emoji: "🗣",
                              sub: "You keep empathy and human experience at the center.",
                              detail: "You excel at listening, observing, and center-staging user stories. Your team relies on your compassion to make sure the work matters to real people!"
                            },
                            futurist: {
                              title: "Futurist",
                              emoji: "✨",
                              sub: "You explore bold ideas and unexpected connections.",
                              detail: "You naturally challenge constraints and help teams imagine new, visionary pathways forward. Your team relies on you to see the forest and not just the trees!"
                            },
                            builder: {
                              title: "Builder",
                              emoji: "🛠",
                              sub: "You turn abstract concepts into tactile, real experiments.",
                              detail: "You love prototyping, sketching, building, and figuring out mechanics practically. Your team relies on you to make wild ideas real and testable!"
                            }
                          };
                          const data = reveals[main] || reveals.futurist;
                          
                          return (
                            <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl space-y-3">
                              <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                                <span>{data.emoji}</span>
                                <span>You lean toward: {data.title}</span>
                              </h3>
                              <p className="text-zinc-300 text-xs font-semibold leading-relaxed">
                                {data.sub}
                              </p>
                              <p className="text-zinc-400 text-[11px] leading-relaxed">
                                {data.detail}
                              </p>

                              {participant.secondaryArchetype && (
                                <div className="mt-4 pt-3 border-t border-zinc-800/60">
                                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Secondary Leaning</p>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="text-xs">{ARCHETYPES[participant.secondaryArchetype as keyof typeof ARCHETYPES]?.emoji}</span>
                                    <span className="text-xs font-semibold text-zinc-300">
                                      {ARCHETYPES[participant.secondaryArchetype as keyof typeof ARCHETYPES]?.label}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Scores breakdown */}
                        <div className="pt-3 border-t border-zinc-900">
                          <span className="text-[10px] text-zinc-500 block mb-2 font-bold uppercase tracking-wider">Collaboration Style Scores</span>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {Object.entries(ARCHETYPES).map(([key, details]) => {
                              const score = (participant.archetypeScores as any)?.[key] || 0;
                              return (
                                <div key={key} className="flex items-center justify-between bg-zinc-900/40 p-2 rounded-lg border border-zinc-900/40">
                                  <span className="text-zinc-400 flex items-center gap-1">
                                    <span>{details.emoji}</span>
                                    <span>{details.label.split(' ')[1] || details.label}</span>
                                  </span>
                                  <span className="font-bold text-emerald-400">{score}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <p className="text-[10px] text-zinc-500 p-2 bg-zinc-900/20 rounded-lg text-center font-medium italic">
                          "This style analysis outlines your natural contribution leanings neutrally and softly as a collaboration signal rather than standardising identities."
                        </p>
                      </div>
                    ) : (
                      <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-xl space-y-2">
                        <p className="text-zinc-300 text-xs font-semibold flex items-center gap-2">
                          <span>🌱</span>
                          <span>You are currently in an explorer posture</span>
                        </p>
                        <p className="text-zinc-400 text-[10px] leading-relaxed">
                          You are keeping your options open and exploring where you can best support your team. You are a valuable, highly adaptive collaborator ready to build collective momentum!
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-emerald-400 font-bold text-sm tracking-wide animate-pulse">
                    🚀 Ready!
                  </p>
                  <p className="text-zinc-500 text-[10px]">Waiting for the facilitator to kick off the next session phase.</p>
                </div>
              </div>
            )}
          </div>
        </div>
    );
  }

  const isSelectionOpen = session.status === 'Challenge Selection Open';
  const canJoinLeaveTeam = ['Team Formation', 'Team Naming Open', 'Team Naming Locked', 'Live'].includes(session.status);
  const canEditTeamName = session.status === 'Team Naming Open';
  const showTeamCode = ['Team Formation', 'Team Naming Open', 'Team Naming Locked', 'Live'].includes(session.status);
  const showNameGenerator = session.status === 'Team Naming Open';

  const renderResourceCard = (r: any) => {
    const plainTextSummary = r.shortSummary || (r.summary ? r.summary.replace(/<[^>]+>/g, '') : '');
    const isExpanded = expandedSummaries[r.id];
    const isLong = plainTextSummary.length > 150;
    const displayText = (isLong && !isExpanded) ? plainTextSummary.substring(0, 150) + '...' : plainTextSummary;

    return (
      <div key={r.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-3">
        <div>
          <h3 className="font-semibold text-blue-400 text-lg">{r.title}</h3>
          {r.category && (
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-md bg-zinc-800 text-zinc-400">
              {r.category}
            </span>
          )}
        </div>
        
        <div className="text-sm text-zinc-300">
          {displayText}
          {isLong && !isExpanded && (
            <button 
              onClick={() => setExpandedSummaries(prev => ({ ...prev, [r.id]: true }))}
              className="text-blue-400 hover:text-blue-300 ml-1 font-medium"
            >
              Read more
            </button>
          )}
          {isLong && isExpanded && (
            <button 
              onClick={() => setExpandedSummaries(prev => ({ ...prev, [r.id]: false }))}
              className="text-blue-400 hover:text-blue-300 ml-1 font-medium"
            >
              Show less
            </button>
          )}
        </div>
        
        <button 
          onClick={() => {
            if (r.category === 'Workshop Materials' && r.sheetLink) {
              window.open(r.sheetLink, '_blank');
            } else {
              setSelectedResource(r);
            }
          }}
          className="inline-flex items-center gap-1 text-sm text-white bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors w-full justify-center font-medium mt-2"
        >
          {r.category === 'Workshop Materials' && r.sheetLink ? (r.linkButtonLabel || 'Access materials') : 'View Details'} &rarr;
        </button>
      </div>
    );
  };

  const resourcesContent = resources.length === 0 ? null : (
    <>
      {/* Workshop Materials Section */}
      {resources.filter(r => r.category === 'Workshop Materials').length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><FileText size={20} /> Workshop Materials</h2>
          <div className="space-y-3">
            {resources.filter(r => r.category === 'Workshop Materials').map(renderResourceCard)}
          </div>
        </section>
      )}

      {/* Resources Section */}
      {resources.filter(r => r.category !== 'Workshop Materials').length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><FileText size={20} /> Resources</h2>
          <div className="space-y-3">
            {resources.filter(r => r.category !== 'Workshop Materials').map(renderResourceCard)}
          </div>
        </section>
      )}
    </>
  );

  const resourceModal = selectedResource && (
        <div role="dialog" aria-modal="true" aria-label="Resource details" className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start sticky top-0 bg-zinc-900/95 backdrop-blur z-10 rounded-t-2xl">
              <div className="flex-1 pr-4">
                <h2 className="text-2xl font-bold text-blue-400">{selectedResource.title}</h2>
                
                {(() => {
                  if (!resourceSummaryText) return null;
                  const isLong = resourceSummaryText.length > 100;
                  return (
                    <div className="mt-2 text-sm text-zinc-400">
                      <span>
                        {(!isResourceSummaryExpanded && isLong) 
                          ? resourceSummaryText.substring(0, 100) + '...' 
                          : resourceSummaryText}
                      </span>
                      {isLong && (
                        <button 
                          onClick={() => setIsResourceSummaryExpanded(!isResourceSummaryExpanded)}
                          className="text-blue-400 hover:text-blue-300 transition-colors font-medium ml-1 inline-block"
                        >
                          {isResourceSummaryExpanded ? "Show less" : "Read more"}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {selectedResource.category && (
                  <span className="inline-block mt-3 px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-800 text-zinc-300">
                    {selectedResource.category}
                  </span>
                )}
              </div>
              <button 
                aria-label="Close resource details"
                onClick={() => setSelectedResource(null)}
                className="p-2 text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-full transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="text-zinc-300 text-base leading-relaxed">
                <SafeHtml html={selectedResource.summary} />
              </div>
            </div>
            
            <div className="p-6 border-t border-zinc-800 bg-zinc-900/95 rounded-b-2xl flex justify-between items-center gap-3">
              <div>
                {selectedResource.category === 'Prompt' && (
                  <button 
                    onClick={handleCopyResourcePrompt}
                    className={`px-6 py-2.5 rounded-xl transition-colors font-medium flex items-center gap-2 ${
                      promptCopied 
                        ? 'bg-emerald-950/30 border border-emerald-900/50 text-emerald-400' 
                        : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                    }`}
                  >
                    {promptCopied ? (
                      <>
                        <CheckCircle2 size={18} />
                        Copied to clipboard
                      </>
                    ) : (
                      <>
                        <Copy size={18} />
                        Copy Prompt
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedResource(null)}
                  className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors font-medium"
                >
                  Close
                </button>
                {selectedResource.sheetLink && (
                  <a 
                    href={selectedResource.sheetLink} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors font-medium flex items-center gap-2"
                  >
                    {getExternalLinkButtonLabel(selectedResource)} &rarr;
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
  );

  if (!allocationEligible(participant)) return <div className="min-h-screen bg-zinc-950 text-white px-4 py-6"><main className="max-w-md mx-auto space-y-5">
    <h1 className="text-2xl font-bold break-words">{session.title || 'Event'}</h1>
    {participant.participationState === 'inactive' ? <p>Your event participation is inactive. Contact an organizer to restore access to your badge.</p> : <>
      <p>Your official roles do not include discovery or solution team allocation. You can use the event resources and share an invitation. Contact an organizer to change your official roles.</p>
      <a className="inline-block underline" href={`/badge?event=${sessionId}`}>My badge</a>
      <ShareEventButton sessionId={sessionId!} publicTitle={session.title} stage={session.status} />
      {resourcesContent}
    </>}
  </main>{resourceModal}</div>;
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      <header className="bg-zinc-900 border-b border-zinc-800 py-3 px-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex flex-col gap-1.5">
          <h1 className="text-base font-bold text-white truncate leading-snug">{session.title}</h1><a className="text-sm underline" href={`/badge?event=${sessionId}`}>My badge</a>
          <div className="flex items-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 bg-zinc-850 text-zinc-300 rounded-full border border-zinc-800">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {getParticipantStatusLabel(session.status)}
            </span>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-md mx-auto">
        <ShareEventButton sessionId={sessionId!} publicTitle={session.title} stage={session.status} />
        {team && <TeamRoleEditor collectionName="teams" teamId={team.id} members={teammates} />}
        {discTeam && <TeamRoleEditor collectionName="discoveryTeams" teamId={discTeam.id} members={discTeammates} />}
        {formingTeam && <TeamRoleEditor collectionName="formingTeams" teamId={formingTeam.id} members={formingMembers} />}
        {formingDiscTeam && <TeamRoleEditor collectionName="formingDiscoveryTeams" teamId={formingDiscTeam.id} members={formingDiscMembers} />}
        {/* Resources Section (First if ResourcesOnly) */}
        {session.status === 'ResourcesOnly' && resourcesContent}

        {/* DISCOVERY TEAM COLLABORATION CONTAINER / GROUP UP! PANEL */}
        {['Discovery Team Formation', 'Challenge Drafting', 'Challenge Discovery', 'Challenge Proposing', 'Challenge Voting', 'Voting Review', 'Published Challenges'].includes(session.status) && (
          discTeam ? (
            /* State B — Participant IS assigned to a Challenge Workgroup: "Your Challenge Workgroup" */
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5 relative overflow-hidden animate-in fade-in duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
              
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                  <Users size={20} /> Your Challenge Workgroup
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                  Collaborate with your group to explore tensions and shape challenge ideas.
                </p>
              </div>
              
              <div className="space-y-5">
                {/* Active Discovery Team info */}
                <div className="pt-3 border-t border-zinc-800/60 space-y-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Group Identity</p>
                    <p className="text-xl font-extrabold text-white tracking-tight mt-1">{discTeam.name}</p>
                  </div>
                  
                  {enableParticipantWgFormation && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500 font-semibold">Invite Code:</span>
                      <span className="font-mono font-bold text-blue-400 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-900/30">{discTeam.code}</span>
                    </div>
                  )}
                </div>

                {/* Exploring Focus Areas */}
                {workgroupFocusAreas.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <h4 className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Exploring Focus Areas</h4>
                    <ul className="space-y-1.5">
                      {workgroupFocusAreas.map(fa => (
                        <li key={fa.id} className="text-xs text-zinc-300 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>{fa.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Discovery Teammates */}
                <div className="space-y-2.5 pt-1">
                  <h4 className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Group Teammates ({discTeammates.length})</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {discTeammates.map(mate => (
                      <div key={mate.id} className="bg-zinc-900/60 p-3 rounded-xl text-xs flex flex-col space-y-0.5 transition-all hover:bg-zinc-800/40 border border-zinc-800/50">
                        <span className="font-semibold text-zinc-100 truncate">{mate.name}</span>
                        <span className="text-[10px] text-zinc-400 truncate">{mate.adjective || 'Active'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Allow name editing if leader and self-formation is on */}
                {discTeam.leaderId === participant?.id && enableParticipantWgFormation && (
                  <div className="space-y-2 pt-3 border-t border-zinc-800/60">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Rename Challenge Workgroup</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discTeamName}
                        onChange={e => setDiscTeamName(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleUpdateDiscTeamName}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {enableParticipantWgFormation && (
                  <button
                    onClick={handleLeaveDiscTeam}
                    className="w-full py-2.5 bg-red-950/10 hover:bg-red-950/30 border border-red-900/20 text-red-400 font-bold rounded-xl text-xs transition-colors mt-2"
                  >
                    Leave Challenge Workgroup
                  </button>
                )}
              </div>
            </section>
          ) : (
            /* State A — Participant is NOT assigned to a Challenge Workgroup: "Group Up!" */
            <section className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden animate-in fade-in duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
              
              <h2 className="text-xl font-bold flex items-center gap-2 text-blue-400">
                <Users size={22} className="text-blue-400 animate-pulse" /> Group Up!
              </h2>
              <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
                Join or form a workgroup to explore tensions, shape ideas, and collaboratively draft challenge proposals.
              </p>

              {enableParticipantWgFormation ? (
                formingDiscTeam ? (
                  /* Forming Team view inside Group Up! panel */
                  <div className="mt-4 pt-4 border-t border-zinc-800/60 space-y-4 animate-in fade-in duration-200">
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Forming Workgroup</p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-xs text-zinc-400">Share this codeword to group up:</span>
                        <span className="font-mono text-sm text-amber-400 font-bold px-3 py-1 bg-amber-950/20 rounded-lg border border-amber-900/30 tracking-wider">
                          {formingDiscTeam.id}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Share this code with other participants so they can join your forming Challenge Workgroup.
                    </p>
                    
                    {/* Members list */}
                    <div className="space-y-2.5">
                      <h4 className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Members Joining ({formingDiscMembers.length})</h4>
                      <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                        {formingDiscMembers.map(m => (
                          <div key={m.id} className="bg-zinc-900/60 p-3 rounded-xl text-xs flex flex-col space-y-1 transition-all hover:bg-zinc-800/40 border border-zinc-800/50 justify-between">
                            <div className="flex flex-col space-y-0.5">
                              <span className="font-semibold text-zinc-100 truncate">{m.name}</span>
                              <span className="text-[10px] text-zinc-500 truncate">{m.adjective || 'Active'}</span>
                            </div>
                            {m.id === formingDiscTeam.leaderId && (
                              <span className="text-[9px] font-bold tracking-wider uppercase text-blue-400/90 w-fit">
                                Leader
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 pt-2">
                      {formingDiscTeam.leaderId === participant?.id && (
                        <button
                          onClick={handleCreateDiscTeam}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors border border-emerald-500/30 cursor-pointer"
                        >
                          Launch Challenge Workgroup
                        </button>
                      )}

                      <button
                        onClick={handleLeaveDiscTeam}
                        className="w-full py-2 bg-zinc-800/50 hover:bg-zinc-850 text-zinc-400 text-xs font-bold rounded-xl transition-colors border border-zinc-800 cursor-pointer"
                      >
                        {formingDiscTeam.leaderId === participant?.id ? 'Cancel Workgroup' : 'Leave Forming Workgroup'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Start / Join options inside Group Up! panel */
                  <div className="mt-4 pt-4 border-t border-zinc-800/60 space-y-4 animate-in fade-in duration-200">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Form a new workgroup or join an existing dynamic workspace using its codeword!
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={handleStartDiscTeam}
                        className="flex flex-col items-center justify-center gap-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 px-4 py-4 rounded-xl transition-all hover:border-emerald-900/40 group cursor-pointer"
                      >
                        <UserPlus size={22} className="text-emerald-400 transition-transform group-hover:scale-110" />
                        <span className="font-bold text-xs text-zinc-200">Start Workgroup</span>
                      </button>
                      <button 
                        onClick={() => setShowJoinDiscModal(true)}
                        className="flex flex-col items-center justify-center gap-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 px-4 py-4 rounded-xl transition-all hover:border-blue-900/40 group cursor-pointer"
                      >
                        <Users size={22} className="text-blue-400 transition-transform group-hover:scale-110" />
                        <span className="font-bold text-xs text-zinc-200">Join Workgroup</span>
                      </button>
                    </div>
                  </div>
                )
              ) : (
                /* Waiting message for assignment */
                <div className="mt-4 pt-4 border-t border-zinc-800/60 space-y-2 animate-in fade-in duration-200">
                  <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                    You’ll see your workgroup here once groups are assigned.
                  </p>
                </div>
              )}
            </section>
          )
        )}

        {/* 1. Challenge discovery phase router wrapper */}
        {['Focus Areas', 'Discovery Team Formation', 'Challenge Drafting', 'Challenge Discovery', 'Challenge Proposing', 'Challenge Voting', 'Voting Review', 'Published Challenges'].includes(session.status) ? (
          <div className="space-y-6">

            {/* 1. FOCUS AREAS PHASE */}
            {session.status === 'Focus Areas' && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-teal-400">
                      <Folder size={22} /> Explore Focus Areas
                    </h2>
                    {session.focusAreaSelectionMode === 'single' ? (
                      <span className="text-[10px] uppercase tracking-wider font-extrabold bg-teal-500/10 border border-teal-500/20 text-teal-400 px-2 py-1 rounded">
                        Single Selection Mode
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider font-extrabold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-1 rounded">
                        Multi-Interest Registration
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-300 text-sm mt-3 leading-relaxed font-normal">
                    {session.focusAreaSelectionMode === 'single'
                      ? 'Select the Focus Area you’d most like to explore. You may select only one Focus Area at a time.'
                      : 'Explore the focus areas below and select the ones you’d like to explore further.'}
                  </p>
                </div>
                
                <div className="space-y-3">
                  {focusAreas.map(fa => {
                    const interestedIds = participant?.interestedFocusAreaIds && Array.isArray(participant.interestedFocusAreaIds)
                      ? participant.interestedFocusAreaIds
                      : (participant?.interestedFocusAreaId ? [participant.interestedFocusAreaId] : []);
                    const isInterested = interestedIds.includes(fa.id);
                    return (
                      <div
                        key={fa.id}
                        className={`w-full text-left p-6 rounded-2xl border transition-all duration-300 relative group overflow-hidden ${
                          isInterested 
                            ? 'bg-emerald-950/20 border-emerald-500/80 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-500/40' 
                            : 'bg-zinc-900 hover:bg-zinc-850/80 border-zinc-800 hover:border-zinc-700 hover:shadow-md'
                        }`}
                      >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                        
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <h3 className="font-bold text-lg text-white leading-snug">{fa.title}</h3>
                            {fa.description && (
                              <p className="text-zinc-400 text-sm leading-relaxed mt-1 font-normal">{fa.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-zinc-800/60 flex items-center justify-between gap-4">
                          <span className="text-[11px] font-semibold text-zinc-500 tracking-wider uppercase select-none">
                            Interest Registration
                          </span>
                          
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!participant) return;
                              
                              const isSingleSelector = session.focusAreaSelectionMode === 'single';
                              const newIds = isSingleSelector
                                ? (isInterested ? [] : [fa.id])
                                : (isInterested 
                                    ? interestedIds.filter(id => id !== fa.id)
                                    : [...interestedIds, fa.id]);
                              
                              await updateDoc(doc(db, 'participants', participant.id), {
                                interestedFocusAreaIds: newIds,
                                interestedFocusAreaId: newIds.length > 0 ? newIds[0] : null
                              });
                              
                              showToast(
                                isInterested ? 'Interest Removed' : 'Interest Registered', 
                                isInterested ? `Removed interest in: ${fa.title}` : `Added interest in: ${fa.title}`, 
                                'success'
                              );
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold tracking-tight cursor-pointer transition-all flex items-center gap-1.5 ${
                              isInterested
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30 border border-emerald-500'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700'
                            }`}
                          >
                            {isInterested ? (
                              <span>✓ Selected</span>
                            ) : (
                              <span>Select this Focus Area</span>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {focusAreas.length === 0 && (
                    <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl font-normal">
                      Waiting for facilitators to post Focus Areas.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 1.5. CHALLENGE DRAFTING PHASE */}
            {session.status === 'Challenge Drafting' && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
                  <h2 className="text-xl font-bold flex items-center gap-2 text-amber-400">
                    <Sparkles size={22} className="text-amber-400" /> Challenge Drafting
                  </h2>
                  <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
                    This is a collaborative working phase. Work with your group to brainstorm tensions, explore friction, and refine potential challenge statements.
                  </p>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800 p-6 rounded-2xl space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Collaborative Prompts</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed font-normal">
                    Revisiting your experiences can reveal surprising friction. Discuss these prompts with your workgroup to deepen your focus:
                  </p>
                  
                  <ul className="space-y-3 pt-1">
                    <li className="flex gap-2.5 items-start">
                      <span className="text-emerald-400 font-bold text-xs shrink-0 select-none">👉</span>
                      <p className="text-sm text-zinc-300 font-medium leading-tight">What tension keeps surfacing in our conversations?</p>
                    </li>
                    <li className="flex gap-2.5 items-start">
                      <span className="text-emerald-400 font-bold text-xs shrink-0 select-none">👉</span>
                      <p className="text-sm text-zinc-300 font-medium leading-tight">Who is affected most deeply by this friction?</p>
                    </li>
                    <li className="flex gap-2.5 items-start">
                      <span className="text-emerald-400 font-bold text-xs shrink-0 select-none">👉</span>
                      <p className="text-sm text-zinc-300 font-medium leading-tight">What underlying assumptions are we making?</p>
                    </li>
                    <li className="flex gap-2.5 items-start">
                      <span className="text-emerald-400 font-bold text-xs shrink-0 select-none">👉</span>
                      <p className="text-sm text-zinc-300 font-medium leading-tight">Where is the friction actually happening on the ground?</p>
                    </li>
                  </ul>
                  
                  <div className="pt-2 border-t border-zinc-800/40">
                    <p className="text-[11px] text-zinc-500 font-semibold italic text-center select-none">
                      Note: Challenge Proposing submissions will open when the facilitator advances the session. Keep refining your concepts!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 2. CHALLENGE PROPOSING / DISCOVERY PHASE */}
            {['Challenge Discovery', 'Challenge Proposing'].includes(session.status) && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
                  <h2 className="text-xl font-bold flex items-center gap-2 text-blue-400">
                    <Sparkles size={22} className="text-blue-400 animate-pulse" /> Pitch Your Challenges
                  </h2>
                  <p className="text-zinc-300 text-sm leading-relaxed">
                    Brainstorm and propose challenge statements with your team or focus group. Pitch any tension, friction, or missional opportunity you see.
                  </p>
                  
                  {!isPcFormOpen && (
                    <button
                      onClick={() => {
                        setPcEditingId(null);
                        setPcFocusAreaId(focusAreas[0]?.id || '');
                        setPcTitle('');
                        setPcDescription('');
                        setPcSupportingContext('');
                        setPcSubmitterName(participant?.name || '');
                        setIsPcFormOpen(true);
                      }}
                      className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-center transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Propose a Challenge
                    </button>
                  )}
                </div>

                {isPcFormOpen && (
                  <form onSubmit={handleSavePitch} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                      <h3 className="font-bold text-white text-md">
                        {pcEditingId ? 'Edit Your Proposal' : 'New Challenge Proposal'}
                      </h3>
                      <button type="button" onClick={() => setIsPcFormOpen(false)} className="text-zinc-400 hover:text-white">
                        <X size={18} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1">Select Focus Area</label>
                        <select
                          value={pcFocusAreaId}
                          onChange={e => setPcFocusAreaId(e.target.value)}
                          className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white font-medium"
                          required
                        >
                          <option value="" disabled>-- Select a Focus Area --</option>
                          {focusAreas.map(fa => (
                            <option key={fa.id} value={fa.id}>{fa.title}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1">Challenge Title</label>
                        <input
                          type="text"
                          value={pcTitle}
                          onChange={e => setPcTitle(e.target.value)}
                          placeholder="e.g. Scaling digital welcoming"
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1">Brief Description (The friction / tension / need)</label>
                        <textarea
                          value={pcDescription}
                          onChange={e => setPcDescription(e.target.value)}
                          placeholder="What needs solving? Describe the user pain point..."
                          rows={4}
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1">Supporting Context / Data / Link (Optional)</label>
                        <textarea
                          value={pcSupportingContext}
                          onChange={e => setPcSupportingContext(e.target.value)}
                          placeholder="Any numbers, experiences, or context that sheds light on this..."
                          rows={2}
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1">Proposer Name / Group (Optional)</label>
                        <input
                          type="text"
                          value={pcSubmitterName}
                          onChange={e => setPcSubmitterName(e.target.value)}
                          placeholder="e.g. John Doe, Group 5"
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm transition-colors"
                      >
                        Submit Proposal
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPcFormOpen(false)}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-lg text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* All pitches list */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase text-zinc-500 tracking-wider">All Submissions</h3>
                  {proposedChallenges.map(pc => {
                    const isAuthor = pc.uid === auth.currentUser?.uid;
                    const focus = focusAreas.find(f => f.id === pc.focusAreaId);
                    return (
                      <div key={pc.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-900/30 text-blue-400 border border-blue-800/40">
                            {focus?.title || 'General Focus Area'}
                          </span>
                          {isAuthor && (
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                onClick={() => handleEditPitch(pc)}
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                              <span className="text-zinc-700">•</span>
                              <button
                                onClick={() => handleDeletePitch(pc.id)}
                                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="font-bold text-md text-white">{pc.title}</h4>
                          <p className="text-zinc-300 text-sm mt-1 whitespace-pre-wrap">{pc.description}</p>
                        </div>

                        {pc.supportingContext && (
                          <div className="text-xs text-zinc-400 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                            <strong>Context:</strong> {pc.supportingContext}
                          </div>
                        )}

                        <div className="flex justify-between items-center text-xs text-zinc-550 italic">
                          <span>
                            Proposed by: {pc.submitterName?.trim() ? pc.submitterName : 'Anonymous'}
                          </span>
                          {pc.isRefinedByFacilitator && (
                            <span className="flex items-center gap-1.5 text-zinc-550 font-bold not-italic text-[10px]">
                              <Sparkles size={11} className="text-amber-500 animate-pulse" /> • Refined by facilitator
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {proposedChallenges.length === 0 && (
                    <div className="text-center py-10 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
                      No challenge proposals yet. Be the first to pitch!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. CHALLENGE VOTING PHASE */}
            {session.status === 'Challenge Voting' && (
              <div className="space-y-4">
                {(() => {
                  const userCastCount = proposedChallengeVotes.filter(v => v.uid === auth.currentUser?.uid).length;
                  return (
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
                      <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400">
                        <Award size={22} /> Vote on Challenges
                      </h2>
                      <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
                        Cast your checkmark for any proposed challenges you feel should become official workshop options.
                      </p>
                      
                      <div className="mt-4 flex items-center justify-between bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                        <span className="text-zinc-400 text-sm font-semibold">Your votes used:</span>
                        <div className="flex gap-1 items-center">
                          {[1, 2, 3].map(v => (
                            <div 
                              key={v} 
                              className={`w-3.5 h-3.5 rounded-full border ${
                                v <= userCastCount 
                                  ? 'bg-emerald-500 border-emerald-400 shadow-sm' 
                                  : 'bg-zinc-850 border-zinc-700'
                              }`} 
                            />
                          ))}
                          <span className="ml-2 font-mono text-sm text-emerald-400 font-bold">{userCastCount}/3</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-4">
                  {proposedChallenges.map(pc => {
                    const hasVoted = proposedChallengeVotes.some(v => v.proposedChallengeId === pc.id && v.uid === auth.currentUser?.uid);
                    const focus = focusAreas.find(f => f.id === pc.focusAreaId);
                    const totalVotesCount = proposedChallengeVotes.filter(v => v.proposedChallengeId === pc.id).length;
                    
                    return (
                      <div key={pc.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-zinc-800 text-zinc-400">
                            {focus?.title || 'General Focus Area'}
                          </span>
                        </div>

                        <div>
                          <h4 className="font-bold text-md text-white">{pc.title}</h4>
                          <p className="text-zinc-300 text-sm mt-1 whitespace-pre-wrap">{pc.description}</p>
                        </div>

                        {pc.supportingContext && (
                          <div className="text-xs text-zinc-400 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                            <strong>Context:</strong> {pc.supportingContext}
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t border-zinc-800 mt-1">
                          <div className="flex flex-col gap-0.5 font-sans justify-start">
                            <span className="text-xs text-zinc-500 italic">
                              Proposed by: {pc.submitterName?.trim() ? pc.submitterName : 'Anonymous'}
                            </span>
                            {pc.isRefinedByFacilitator && (
                              <span className="flex items-center gap-1 text-zinc-550 font-bold text-[10px]">
                                <Sparkles size={11} className="text-amber-500 animate-pulse" /> Refined by facilitator
                              </span>
                            )}
                          </div>
                          
                          {hasVoted ? (
                            <button
                              onClick={() => handleRemoveVoteProposed(pc.id)}
                              className="px-4 py-1.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/60 hover:bg-emerald-900/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 animate-in zoom-in-95 duration-100"
                            >
                              <ThumbsUp size={14} className="fill-emerald-400" /> Voted! (Retract)
                            </button>
                          ) : (
                            <button
                              onClick={() => handleVoteProposed(pc.id)}
                              disabled={proposedChallengeVotes.filter(v => v.uid === auth.currentUser?.uid).length >= 3}
                              className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-750 disabled:opacity-30 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                            >
                              <ThumbsUp size={14} /> Cast Vote
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {proposedChallenges.length === 0 && (
                    <div className="text-center py-10 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
                      Waiting for facilitators to post proposed challenges to vote on.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3.5. VOTING REVIEW PHASE */}
            {session.status === 'Voting Review' && (
              <div className="space-y-4 animate-in fade-in duration-500">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
                  <h2 className="text-xl font-bold flex items-center gap-2 text-amber-500 font-sans">
                    <Award size={22} className="text-amber-500" /> Voting in Review
                  </h2>
                  <p className="text-zinc-200 text-sm mt-2.5 leading-relaxed font-semibold">
                    Challenge voting has closed. Facilitators are reviewing the proposed challenges now. Published challenges will be available shortly.
                  </p>
                  <p className="text-zinc-400 text-xs mt-2 font-normal">
                    The pitches below represent your workshop's collective input. Have a look while facilitators consolidate the final selections.
                  </p>
                </div>

                <div className="space-y-4">
                  {proposedChallenges.map(pc => {
                    const focus = focusAreas.find(f => f.id === pc.focusAreaId);
                    const totalVotesCount = proposedChallengeVotes.filter(v => v.proposedChallengeId === pc.id).length;
                    const hasVoted = proposedChallengeVotes.some(v => v.proposedChallengeId === pc.id && v.uid === auth.currentUser?.uid);
                    
                    return (
                      <div key={pc.id} className="bg-zinc-900/80 border border-zinc-800 opacity-90 rounded-2xl p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-zinc-850 text-zinc-400">
                            {focus?.title || 'General Focus Area'}
                          </span>
                          <span className="text-[10px] bg-amber-950/40 text-amber-400 border border-amber-900/30 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                            Voting Ended
                          </span>
                        </div>

                        <div>
                          <h4 className="font-bold text-md text-white">{pc.title}</h4>
                          <p className="text-zinc-300 text-sm mt-1 whitespace-pre-wrap">{pc.description}</p>
                        </div>

                        {pc.supportingContext && (
                          <div className="text-xs text-zinc-400 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                            <strong>Context:</strong> {pc.supportingContext}
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t border-zinc-800 mt-1">
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className="text-xs text-zinc-500 italic">
                              Proposed by: {pc.submitterName?.trim() ? pc.submitterName : 'Anonymous'}
                            </span>
                            {pc.isRefinedByFacilitator && (
                              <span className="flex items-center gap-1 text-zinc-550 font-bold text-[10px]">
                                <Sparkles size={11} className="text-amber-500 animate-pulse" /> Refined by facilitator
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono text-sm bg-emerald-950/20 px-3 py-1.5 rounded-xl border border-emerald-900/30 font-sans">
                            <ThumbsUp size={14} className={hasVoted ? "fill-emerald-400" : ""} />
                            <span>{totalVotesCount} {totalVotesCount === 1 ? 'vote' : 'votes'}</span>
                            {hasVoted && <span className="text-xs text-zinc-400 font-normal normal-case"> (your vote)</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {proposedChallenges.length === 0 && (
                    <div className="text-center py-10 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
                      No challenge proposals were pitched.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. PUBLISHED CHALLENGES PHASE */}
            {session.status === 'Published Challenges' && (
              <div className="space-y-4 animate-in fade-in duration-500">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/10 rounded-full blur-2xl pointer-events-none" />
                  <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400">
                    <Award size={22} className="text-emerald-400 animate-bounce" /> Challenges Official!
                  </h2>
                  <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
                    Facilitators have evaluated all submitted pitches and published the official session challenges! 
                  </p>
                  <p className="text-zinc-400 text-xs mt-1.5">
                    Read through them below. Challenge Selection and Team Formation will begin shortly.
                  </p>
                </div>
                
                <div className="space-y-4">
                  {challenges.map(c => (
                    <div key={c.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
                      <h3 className="font-bold text-lg text-emerald-400">{c.title}</h3>
                      <SafeHtml html={c.summary} className="text-sm text-zinc-400 mt-2 leading-relaxed" />
                      {c.submitterName && <p className="text-sm text-zinc-400 italic">Proposed by: {c.submitterName}</p>}
                      {c.docLink && (
                        <a href={c.docLink} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm text-emerald-500 hover:underline">
                          View Google Doc &rarr;
                        </a>
                      )}
                    </div>
                  ))}
                  {challenges.length === 0 && (
                    <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
                      Waiting for some official challenges to be published.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Resources tab rendered always at bottom of custom phases */}
            {resourcesContent}
            
            {/* Self profile block rendered always for clean access */}
            <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-md font-bold flex items-center gap-2 text-zinc-300"><User size={18} /> About You</h2>
                <button onClick={handleLogout} className="text-xs text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1">
                  <LogOut size={12} /> Log Out
                </button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Pick a word for yourself today</label>
                  <input type="text" value={adjective || ''} onChange={e => setAdjective(e.target.value)} className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm" />
                </div>
                <button type="submit" className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-semibold transition-colors">
                  Save Profile
                </button>
              </form>
            </section>
          </div>
        ) : (
          <>
            {/* Team Section */}
            {session.status !== 'ResourcesOnly' && participant.isAssigned && team && (
              <section className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-5 space-y-4">
                <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                  <User size={24} /> Your Solution Team
                </h2>
                
                <div className="space-y-2">
                  <p className="text-sm text-zinc-400">Solution Team Details</p>
                  {canEditTeamName ? (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={teamName} 
                        onChange={e => setTeamName(e.target.value)}
                        placeholder="Enter team name..."
                        className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm text-white"
                      />
                      <button 
                        onClick={handleUpdateTeamName} 
                        className={`px-4 py-2 text-white rounded-lg font-medium transition-colors flex items-center gap-2 ${
                          teamNameSaved ? 'bg-emerald-700' : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        {teamNameSaved ? (
                          <>
                            <CheckCircle2 size={18} />
                            Saved
                          </>
                        ) : (
                          'Save'
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-3xl font-extrabold text-white tracking-tight">{team.name || 'Unnamed Solution Team'}</p>
                      {(() => {
                        const chal = challenges.find((c: any) => c.id === team.challengeId);
                        if (chal) {
                          return (
                            <div className="bg-zinc-900/80 border border-zinc-800/80 p-3.5 rounded-xl">
                              <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-400">Solving Challenge</p>
                              <p className="text-sm font-medium text-zinc-200 mt-1 leading-relaxed">
                                {chal.title.replace(/^(?:#\d+|Challenge\s*\d+)\s*[-–:]\s*/i, '').trim()}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                </div>

                {showTeamCode && team.code && enableParticipantTeamFormation && (
                  <div className="space-y-2">
                    <p className="text-sm text-zinc-400">Solution Team Code</p>
                    <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
                      <span className="font-mono text-lg tracking-widest text-emerald-400">{team.code}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(team.code);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="text-zinc-400 hover:text-white transition-colors"
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm text-zinc-400 mb-2">Solution Teammates</p>
                  <ul className="space-y-2">
                    {teammates.map(t => (
                      <li key={t.id} className="bg-zinc-900/50 p-3 rounded-lg flex justify-between items-center">
                        <span className="font-medium">{t.name} {t.id === participant.id && '(You)'}</span>
                        <span className="text-xs text-zinc-500 italic">{t.adjective}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {canJoinLeaveTeam && enableParticipantTeamFormation && (
                  <button 
                    onClick={() => setConfirmLeaveTeam(true)}
                    className="w-full py-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded-lg transition-colors font-medium text-sm mt-4"
                  >
                    Leave Solution Team
                  </button>
                )}

                {showNameGenerator && (
                  <button 
                    onClick={copyPrompt} 
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-colors mt-4 border ${
                      copied 
                        ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' 
                        : 'bg-zinc-800 hover:bg-zinc-700 border-transparent text-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 size={18} />
                        <span>Copied to clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={18} /> Copy Name Generator Prompt
                      </>
                    )}
                  </button>
                )}
              </section>
            )}

            {/* Team Formation Section */}
            {session.status !== 'ResourcesOnly' && canJoinLeaveTeam && !participant.isAssigned && (
              enableParticipantTeamFormation ? (
                <section className="bg-blue-950/20 border border-blue-900/30 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2">
                      <Users size={24} /> Form a Solution Team
                    </h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800/40">
                      Self-Formation
                    </span>
                  </div>
                  
                  {!participant.selectedChallengeId ? (
                    <p className="text-sm text-zinc-400">Please select a challenge below before forming or joining a solution team.</p>
                  ) : formingTeam ? (
                    <div className="space-y-4">
                      <p className="text-sm text-zinc-300">You are currently in a forming solution team.</p>
                      <button 
                        onClick={() => setShowFormingTeamModal(true)}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors font-medium flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Users size={20} />
                        View Forming Solution Team
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-zinc-300">This step is optional. You can always wait to be assigned to a solution team.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={handleStartTeam}
                          className="flex flex-col items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-xl transition-colors cursor-pointer"
                        >
                          <UserPlus size={24} className="text-emerald-400" />
                          <span className="font-medium text-sm">Start a Solution Team</span>
                        </button>
                        <button 
                          onClick={() => setShowJoinTeamModal(true)}
                          className="flex flex-col items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-xl transition-colors cursor-pointer"
                        >
                          <Users size={24} className="text-blue-400" />
                          <span className="font-medium text-sm">Join a Solution Team</span>
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-zinc-300 flex items-center gap-2">
                      <Users size={20} className="text-zinc-400" /> Solution Team Formation
                    </h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Facilitator-Managed
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                    Participant self-formation is turned off for this workshop. Facilitators will organize and assign solution teams. You will see your assigned team and teammates here once teams are published.
                  </p>
                </section>
              )
            )}

            {/* Challenges Section */}
            {session.status !== 'ResourcesOnly' && (
              <section className="space-y-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Target size={24} /> Challenges</h2>
                
                {session.status === 'Draft' ? (
                  <div className="bg-blue-950/30 border border-blue-900/50 p-4 rounded-xl text-blue-400 text-sm">
                    You can review the challenge statements now. Challenge selection will open soon.
                  </div>
                ) : !participant.selectedChallengeId && (
                  <div className="bg-emerald-950/30 border border-emerald-900/50 p-4 rounded-xl text-emerald-400 text-sm font-medium">
                    {session.status === 'Challenge Selection Open' 
                      ? "Choose a challenge to continue. You can switch your selection until it is locked."
                      : "Choose a challenge to continue. This is a final choice."}
                  </div>
                )}

                <div className="space-y-4">
                  {challenges.map(c => {
                    const isSelected = participant.selectedChallengeId === c.id;
                    return (
                      <div key={c.id} className={`bg-zinc-900 border ${isSelected ? 'border-emerald-500' : 'border-zinc-800'} p-5 rounded-2xl transition-colors`}>
                        <h3 className="font-semibold text-lg text-emerald-400">{c.title}</h3>
                        <SafeHtml html={c.summary} className="text-sm text-zinc-400 mt-2" />
                      {c.submitterName && <p className="text-sm text-zinc-400 italic">Proposed by: {c.submitterName}</p>}
                        {c.docLink && (
                          <a href={c.docLink} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm text-emerald-500 hover:underline">View Google Doc &rarr;</a>
                        )}
                        
                        {session.status !== 'Draft' && !participant.isAssigned && (
                          <div className="mt-4 pt-4 border-t border-zinc-800">
                            {isSelected ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 size={16}/> Selected</span>
                                <span className="text-xs text-zinc-500">
                                  {session.status === 'Challenge Selection Open' 
                                    ? 'You can switch to another challenge while selection is open' 
                                    : 'Challenge selected — this choice can no longer be changed'}
                                </span>
                              </div>
                            ) : (
                              (session.status === 'Challenge Selection Open' || !participant.selectedChallengeId) && (
                                <button 
                                  onClick={() => setConfirmChallengeId(c.id)}
                                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium"
                                >
                                  {participant.selectedChallengeId ? 'Switch to This Challenge' : 'Select This Challenge'}
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* HISTORICAL DISCOVERY WORKGROUP RECAP */}
            {!['Focus Areas', 'Discovery Team Formation', 'Challenge Drafting', 'Challenge Discovery', 'Challenge Proposing', 'Challenge Voting', 'Voting Review'].includes(session.status) && discTeam && (
              <section className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl transition-all duration-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsWgRecapExpanded(!isWgRecapExpanded)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-900/40 transition-colors focus:outline-none cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Users size={16} className="text-zinc-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-400 font-bold tracking-tight">Your Previous Challenge Workgroup</p>
                      <p className="text-xs text-zinc-500 truncate mt-0.5 font-normal">
                        Collaborated with <span className="text-zinc-300 font-semibold">{discTeam.name}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 pl-2">
                    {isWgRecapExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </button>

                {isWgRecapExpanded && (
                  <div className="px-4 pb-4 pt-1.5 border-t border-zinc-900 bg-zinc-950/20 space-y-3 animate-in slide-in-from-top-1 duration-200">
                    <p className="text-[11px] text-zinc-500 leading-normal font-normal">
                      You worked with this group during the Challenge Discovery phase to explore tensions, brainstorm opportunities, and draft challenge ideas.
                    </p>
                    {discTeammates && discTeammates.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Group Teammates ({discTeammates.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {discTeammates.map(mate => (
                            <div key={mate.id} className="bg-zinc-900/40 px-3 py-2 rounded-lg text-xs flex flex-col space-y-0.5 border border-zinc-800/20 hover:border-zinc-800/40 transition-colors">
                              <span className="font-medium text-zinc-300 truncate">{mate.name} {mate.id === participant?.id && '(You)'}</span>
                              <span className="text-[10px] text-zinc-500 truncate">{mate.adjective || 'Active'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Resources Section (Normal position) */}
            {session.status !== 'ResourcesOnly' && resourcesContent}

            {/* Profile Section */}
            <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-300"><User size={20} /> About You</h2>
                <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1">
                  <LogOut size={14} /> Log Out
                </button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Pick a word for yourself today</label>
                  <input type="text" value={adjective || ''} onChange={e => setAdjective(e.target.value)} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Design thinking experience</label>
                  <select value={proficiency} onChange={e => setProficiency(e.target.value)} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white">
                    <option value="Experienced">Experienced</option>
                    <option value="Trained">Trained</option>
                    <option value="Some exposure">Some exposure</option>
                    <option value="New to it">New to it</option>
                  </select>
                </div>

                {participant.selectedChallengeId && (
                  <div className="pt-2">
                    <label className="block text-sm text-zinc-400 mb-1">Your challenge</label>
                    <div className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-emerald-400 text-sm font-medium">
                      {challenges.find(c => c.id === participant.selectedChallengeId)?.title || 'Unknown Challenge'}
                    </div>
                  </div>
                )}
                
                <button type="submit" className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
                  Save Profile
                </button>
              </form>
            </section>
          </>
        )}
      </main>
      {resourceModal}

      {/* Challenge Confirmation Modal */}
      {confirmChallengeId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-emerald-400">Confirm your challenge selection</h2>
            </div>
            <div className="p-6">
              <p className="text-zinc-300">
                {participant?.selectedChallengeId 
                  ? 'Are you sure you want to switch to this challenge?' 
                  : 'Are you sure you want to choose this challenge?'}
                {' '}
                {session.status === 'Challenge Selection Open' 
                  ? 'You can switch to another challenge while selection is open.' 
                  : 'Once submitted, your challenge choice cannot be changed.'}
              </p>
            </div>
            <div className="p-6 border-t border-zinc-800 flex gap-3">
              <button 
                onClick={() => setConfirmChallengeId(null)}
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSelectChallenge(confirmChallengeId)}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium"
              >
                Confirm Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Team Confirmation Modal */}
      {confirmLeaveTeam && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-red-400">Leave this solution team?</h2>
            </div>
            <div className="p-6">
              <p className="text-zinc-300">Are you sure you want to leave this solution team? You can join another solution team later if team formation is still open.</p>
            </div>
            <div className="p-6 border-t border-zinc-800 flex gap-3">
              <button 
                onClick={() => setConfirmLeaveTeam(false)}
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleLeaveTeam}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium"
              >
                Leave Solution Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Discovery Team Modal */}
      {showJoinDiscModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2">
                <Users size={24} /> Join a Challenge Workgroup
              </h2>
              <button 
                onClick={() => { setShowJoinDiscModal(false); setDiscJoinCodeword(''); setDiscTeamJoinError(''); }}
                className="text-zinc-500 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleJoinDiscTeam} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Enter Codeword</label>
                  <input 
                    type="text" 
                    value={discJoinCodeword.trim()} 
                    onChange={e => setDiscJoinCodeword(e.target.value.toUpperCase())}
                    placeholder="e.g. METEOR"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-center tracking-widest uppercase text-white"
                    required
                  />
                  <p className="text-xs text-zinc-500">Ask the workgroup leader for their codeword.</p>
                </div>
                {discTeamJoinError && <p className="text-red-400 text-sm">{discTeamJoinError}</p>}
                
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => { setShowJoinDiscModal(false); setDiscJoinCodeword(''); setDiscTeamJoinError(''); }}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isDiscJoining || !discJoinCodeword.trim()}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm"
                  >
                    {isDiscJoining ? 'Joining...' : 'Join Workgroup'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Forming Discovery Team Modal */}
      {showFormingDiscModal && formingDiscTeam && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2">
                <Users size={24} /> Challenge Workgroup Setup
              </h2>
              <button 
                onClick={() => setShowFormingDiscModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {formingDiscTeam.leaderId === participant.id ? (
                <>
                  <div className="text-center space-y-2">
                    <p className="text-xs text-zinc-400">Share this codeword with your peers to let them join:</p>
                    <div className="flex items-center justify-center gap-3 bg-zinc-950 py-3.5 rounded-lg border border-zinc-800">
                      <div className="text-3xl font-mono font-bold tracking-[0.2em] text-blue-400 uppercase">
                        {formingDiscTeam.id}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(formingDiscTeam.id);
                          showToast('Copied', 'Codeword copied to clipboard!', 'success');
                        }}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-850 rounded"
                        title="Copy Codeword"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-zinc-400 tracking-wider">
                      Members ({formingDiscMembers.length} of {maxWgSize || '∞'})
                    </h4>
                    <div className="space-y-2">
                      {formingDiscMembers.map(m => (
                        <div key={m.id} className="flex items-center gap-2 bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800 text-sm text-zinc-200">
                          <User size={14} />
                          <span>{m.name} {m.adjective ? `(${m.adjective})` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleCreateDiscTeam}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-all"
                  >
                    Launch Challenge Workgroup
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <p className="text-sm text-zinc-400 font-medium">Waiting for leader to launch group...</p>
                    <div className="font-mono text-xl text-blue-400 font-bold bg-zinc-950 py-2.5 rounded border border-zinc-800 uppercase">
                      Codeword: {formingDiscTeam.id}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-zinc-400 tracking-wider">Members</h4>
                    <div className="space-y-1.5">
                      {formingDiscMembers.map(m => (
                        <div key={m.id} className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded border border-zinc-800 text-sm text-zinc-200">
                          <User size={14} />
                          <span>{m.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              
              <button
                onClick={handleLeaveDiscTeam}
                className="w-full py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 text-red-400 font-bold rounded-lg text-xs"
              >
                Leave Group Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Team Modal */}
      {showJoinTeamModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2">
                <Users size={24} /> Join a Solution Team
              </h2>
              <button 
                onClick={() => { setShowJoinTeamModal(false); setJoinCodeword(''); setTeamJoinError(''); }}
                className="text-zinc-500 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleJoinTeam} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Enter Codeword</label>
                  <input 
                    type="text" 
                    value={joinCodeword.trim()} 
                    onChange={e => setJoinCodeword(e.target.value.toUpperCase())}
                    placeholder="e.g. ORBIT"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono text-center tracking-widest uppercase"
                    required
                  />
                  <p className="text-xs text-zinc-500">Ask the solution team leader for their codeword.</p>
                </div>
                {teamJoinError && <p className="text-red-400 text-sm">{teamJoinError}</p>}
                
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => { setShowJoinTeamModal(false); setJoinCodeword(''); setTeamJoinError(''); }}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isJoining || !joinCodeword.trim()}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
                  >
                    {isJoining ? 'Joining...' : 'Join Solution Team'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Forming Team Modal */}
      {showFormingTeamModal && formingTeam && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                <Users size={24} /> Solution Team Formation
              </h2>
              <button 
                onClick={() => setShowFormingTeamModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {formingTeam.leaderId === participant.id ? (
                <>
                  <div className="text-center space-y-2">
                    <p className="text-sm text-zinc-400">Show this codeword to your teammates:</p>
                    <div className="flex items-center justify-center gap-3 bg-zinc-950 py-4 rounded-lg border border-zinc-800">
                      <div className="text-4xl font-mono font-bold tracking-[0.2em] text-emerald-400 uppercase">
                        {formingTeam.id}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(formingTeam.id);
                          showToast('Copied', 'Codeword copied to clipboard', 'success');
                        }}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Copy Codeword"
                      >
                        <Copy size={20} />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500">Only participants who selected the same challenge can join.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-zinc-300 flex items-center justify-between">
                      <span>Members ({formingMembers.length} of {session.maxTeamSize || '∞'})</span>
                      <span className="text-xs text-zinc-500">Min {session.minTeamSize} required</span>
                    </h4>
                    <div className="space-y-2">
                      {formingMembers.map(m => (
                        <div key={m.id} className="flex items-center gap-2 bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800">
                          <User size={16} className="text-zinc-500" />
                          <span className="text-sm text-zinc-300">{m.name}</span>
                          {m.id === participant.id && <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full ml-auto">You</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input 
                      type="checkbox" 
                      id="isOpenToMoreModal"
                      checked={formingTeam.isOpenToMore}
                      onChange={(e) => updateDoc(doc(db, 'formingTeams', formingTeam.id), { isOpenToMore: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 bg-zinc-950 border-zinc-700 rounded focus:ring-emerald-500"
                    />
                    <label htmlFor="isOpenToMoreModal" className="text-sm text-zinc-300">
                      I welcome more to join this solution team
                    </label>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-4 py-4">
                  <div className="animate-pulse flex justify-center">
                    <Users size={48} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-zinc-200">Waiting for solution team leader...</h3>
                    <p className="text-sm text-zinc-400 mt-2">You've joined the solution team. The leader will finalize it soon.</p>
                  </div>
                  
                  <div className="pt-4 border-t border-zinc-800 mt-6">
                    <h4 className="text-sm font-medium text-zinc-300 mb-3 text-left">Current Members</h4>
                    <div className="space-y-2 text-left">
                      {formingMembers.map(m => (
                        <div key={m.id} className="flex items-center gap-2 bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800">
                          <User size={16} className="text-zinc-500" />
                          <span className="text-sm text-zinc-300">{m.name}</span>
                          {m.id === participant.id && <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full ml-auto">You</span>}
                          {m.id === formingTeam.leaderId && <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded-full ml-auto">Leader</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex flex-col gap-3">
              {formingTeam.leaderId === participant.id ? (
                <>
                  <button 
                    onClick={async () => {
                      if (formingTeam.memberIds.length < session.minTeamSize && !formingTeam.isOpenToMore) {
                        showToast('Error', `You must keep "I welcome more to join this solution team" turned on because your team is below the minimum size of ${session.minTeamSize}.`, 'error');
                        return;
                      }
                      try {
                        await handleCreateTeam();
                        setShowFormingTeamModal(false);
                      } catch (err) {
                        // error handled in handleCreateTeam
                      }
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium"
                  >
                    Finalize & Create Solution Team ({formingMembers.length} members)
                  </button>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowFormingTeamModal(false)}
                      className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium text-sm"
                    >
                      Hide Window
                    </button>
                    <button 
                      onClick={() => setShowCancelConfirmModal(true)}
                      className="flex-1 py-2 bg-red-900/50 hover:bg-red-900/70 text-red-400 rounded-lg transition-colors font-medium text-sm"
                    >
                      Cancel Solution Team
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowFormingTeamModal(false)}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium text-sm"
                  >
                    Hide Window
                  </button>
                  <button 
                    onClick={() => {
                      setConfirmLeaveTeam(true);
                    }}
                    className="flex-1 py-2 bg-red-900/50 hover:bg-red-900/70 text-red-400 rounded-lg transition-colors font-medium text-sm"
                  >
                    Leave Solution Team
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Team Confirmation Modal */}
      {showCancelConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-red-900/30 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-white">Cancel this solution team?</h3>
              <p className="text-zinc-400 text-sm">
                This will discard the current solution team and remove all members from it.
              </p>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowCancelConfirmModal(false)}
                  disabled={isCancellingTeam}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors font-medium disabled:opacity-50"
                >
                  Go Back
                </button>
                <button 
                  onClick={handleLeaveTeam}
                  disabled={isCancellingTeam}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCancellingTeam ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    'Cancel Solution Team'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletePitchConfirmId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">Delete Proposal?</h3>
            <p className="text-zinc-300">
              Are you sure you want to delete this proposal? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setDeletePitchConfirmId(null)}
                disabled={isDeletingPitch}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDeletePitch}
                disabled={isDeletingPitch}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeletingPitch ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`rounded-lg shadow-lg border p-4 max-w-sm flex items-start gap-3 ${
            toastMessage.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-900/50 text-emerald-400' 
              : 'bg-red-950/90 border-red-900/50 text-red-400'
          }`}>
            {toastMessage.type === 'success' ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> : <AlertCircle size={20} className="mt-0.5 shrink-0" />}
            <div className="flex-1">
              <h4 className="font-medium text-sm">{toastMessage.title}</h4>
              <p className="text-sm opacity-90 mt-0.5">{toastMessage.message}</p>
            </div>
            <button 
              onClick={() => setToastMessage(null)}
              className="opacity-70 hover:opacity-100 transition-opacity"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
