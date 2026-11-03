import React, { useState } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Plus, Edit2, Trash2, Link as LinkIcon, Download, ArrowUp, ArrowDown } from 'lucide-react';
import RichTextEditor from '../../components/RichTextEditor';
import SafeHtml from '../../components/SafeHtml';
import { exportToCSV } from '../../utils/csv';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function ChallengesTab({
  sessionId,
  challenges,
  session = {},
  focusAreas = [],
  participants = [],
  teams = [],
  proposedChallenges = []
}: {
  sessionId: string;
  challenges: any[];
  session?: any;
  focusAreas?: any[];
  participants?: any[];
  teams?: any[];
  proposedChallenges?: any[];
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [docLink, setDocLink] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  const handleExportCSV = () => {
    const headers = [
      'Challenge Name',
      'Description',
      'Focus Area',
      'Number of Participants Selecting Challenge',
      'Number of Solution Teams',
      'Published Timestamp',
      'Origin Proposed Challenges Count'
    ];

    const rows = challenges.map(c => {
      const origin = proposedChallenges.find(pc => pc.id === c.proposedChallengeId || pc.publishedChallengeId === c.id);
      const fa = focusAreas.find(fa => fa.id === (c.focusAreaId || origin?.focusAreaId));
      
      const selectCount = participants.filter(p => p.selectedChallengeId === c.id || p.selected_challenge_id === c.id).length;
      const teamCount = teams.filter(t => t.challengeId === c.id || t.challenge_id === c.id).length;
      
      const origCount = proposedChallenges.filter(pc => 
        pc.publishedChallengeId === c.id || 
        (pc.title?.trim().toLowerCase() === c.title?.trim().toLowerCase() && pc.sessionId === c.sessionId)
      ).length;

      // Strip html tags from description summary for beautiful CSV
      const cleanSummary = c.summary ? c.summary.replace(/<[^>]*>/g, '') : '';
      const timestamp = c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString();

      return [
        c.title || '',
        cleanSummary,
        fa?.title || '',
        String(selectCount),
        String(teamCount),
        timestamp,
        String(origCount)
      ];
    });

    const cleanName = (session?.name || sessionId || 'session')
      .toLowerCase()
      .replace(/[^a-z0-0a-z_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `hacklive_published_challenges_${cleanName}_${dateStr}.csv`;

    exportToCSV(filename, headers, rows);
  };

  const resetForm = () => {
    setTitle('');
    setSummary('');
    setDocLink('');
    setIsPublished(false);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleEdit = (c: any) => {
    setTitle(c.title);
    setSummary(c.summary);
    setDocLink(c.docLink);
    setIsPublished(c.isPublished);
    setEditingId(c.id);
    setIsAdding(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'challenges', editingId), {
          title, summary, docLink, isPublished
        });
      } else {
        await addDoc(collection(db, 'challenges'), {
          sessionId,
          title,
          summary,
          docLink,
          isPublished,
          displayOrder: challenges.length
        });
      }
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'challenges', deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting challenge:', err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `challenges/${deleteConfirmId}`);
      } catch (fErr) {
        alert('Failed to delete challenge due to database permission restrictions.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const [isReordering, setIsReordering] = useState(false);

  const handleMoveChallenge = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= challenges.length || isReordering) return;

    setIsReordering(true);
    try {
      const newOrder = [...challenges];
      const temp = newOrder[index];
      newOrder[index] = newOrder[targetIndex];
      newOrder[targetIndex] = temp;

      const batch = writeBatch(db);
      newOrder.forEach((c, idx) => {
        if (c.displayOrder !== idx) {
          batch.update(doc(db, 'challenges', c.id), { displayOrder: idx });
        }
      });
      await batch.commit();
    } catch (err) {
      console.error('Error reordering challenge:', err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, 'challenges');
      } catch (fErr) {
        alert('Failed to update challenge order.');
      }
    } finally {
      setIsReordering(false);
    }
  };

  const togglePublish = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, 'challenges', id), { isPublished: !currentStatus });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Challenges</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-805 hover:bg-zinc-800 hover:text-white text-zinc-200 border border-zinc-750/80 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download size={14} /> Export CSV
          </button>
          {!isAdding && (
            <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-sm font-semibold">
              <Plus size={18} /> Add Challenge
            </button>
          )}
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-lg font-semibold">{editingId ? 'Edit Challenge' : 'New Challenge'}</h3>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500" required />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Summary</label>
            <RichTextEditor content={summary} onChange={setSummary} />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Google Doc Link</label>
            <input type="url" value={docLink} onChange={e => setDocLink(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="published" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} className="w-4 h-4 text-emerald-600 bg-zinc-900 border-zinc-700 rounded focus:ring-emerald-500" />
            <label htmlFor="published" className="text-sm text-zinc-300">Publish immediately</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">Save</button>
            <button type="button" onClick={resetForm} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {challenges.map((c, index) => (
          <div 
            key={c.id} 
            className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700/80 p-5 rounded-2xl flex flex-col md:flex-row gap-4 justify-between transition-all group"
          >
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3">
                {challenges.length > 1 && (
                  <div className="flex flex-col gap-0.5 mr-1">
                    <button
                      type="button"
                      onClick={() => handleMoveChallenge(index, 'up')}
                      disabled={index === 0 || isReordering}
                      title="Move Challenge Up"
                      aria-label="Move Challenge Up"
                      className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-zinc-500 disabled:cursor-not-allowed"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveChallenge(index, 'down')}
                      disabled={index === challenges.length - 1 || isReordering}
                      title="Move Challenge Down"
                      aria-label="Move Challenge Down"
                      className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-zinc-500 disabled:cursor-not-allowed"
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                )}
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-750">
                  #{index + 1}
                </span>
                <h3 className="text-lg font-semibold text-white">{c.title}</h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${c.isPublished ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                  {c.isPublished ? 'Published' : 'Draft'}
                </span>
              </div>
              <SafeHtml html={c.summary} className="text-sm text-zinc-400 mt-2" />
              {c.docLink && (
                <a href={c.docLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
                  <LinkIcon size={14} /> View Document
                </a>
              )}
            </div>
            <div className="flex items-start gap-2">
              <button onClick={() => togglePublish(c.id, c.isPublished)} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-lg transition-colors">
                {c.isPublished ? 'Unpublish' : 'Publish'}
              </button>
              <button onClick={() => handleEdit(c)} className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                <Edit2 size={18} />
              </button>
              <button onClick={() => handleDelete(c.id)} className="p-1.5 text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-900/50 rounded-lg transition-colors">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
        {challenges.length === 0 && !isAdding && (
          <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
            No challenges added yet.
          </div>
        )}
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">Delete Challenge?</h3>
            <p className="text-zinc-300">
              Are you sure you want to delete this challenge? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
