import { InfoHelp } from '../../components/ui/InfoHelp';
import React, { useState } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Plus, Edit2, Trash2, Link as LinkIcon, ArrowUp, ArrowDown, Copy } from 'lucide-react';
import RichTextEditor from '../../components/RichTextEditor';
import SafeHtml from '../../components/SafeHtml';

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

export default function ResourcesTab({ sessionId, resources }: { sessionId: string, resources: any[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [title, setTitle] = useState('');
  const [shortSummary, setShortSummary] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('Prompt');
  const [sheetLink, setSheetLink] = useState('');
  const [linkButtonLabel, setLinkButtonLabel] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  const [isGeneratingShort, setIsGeneratingShort] = useState(false);
  const [isGeneratingFull, setIsGeneratingFull] = useState(false);
  const [showFullContentPrompt, setShowFullContentPrompt] = useState(false);

  const categories = ["Workshop Materials", "Prompt", "Guide", "Framework", "Example", "Reflection", "Scripture", "Tool", "Podcasts", "Videos"];

  const resetForm = () => {
    setTitle('');
    setShortSummary('');
    setSummary('');
    setCategory('Prompt');
    setSheetLink('');
    setLinkButtonLabel('');
    setIsPublished(false);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleEdit = (r: any) => {
    setTitle(r.title);
    setShortSummary(r.shortSummary || '');
    setSummary(r.summary);
    setCategory(r.category || 'Prompt');
    setSheetLink(r.sheetLink || '');
    setLinkButtonLabel(r.linkButtonLabel || '');
    setIsPublished(r.isPublished);
    setEditingId(r.id);
    setIsAdding(false);
  };

  const handleDuplicate = async (r: any) => {
    try {
      await addDoc(collection(db, 'resources'), {
        sessionId,
        title: `${r.title} (Copy)`,
        shortSummary: r.shortSummary || '',
        summary: r.summary || '',
        category: r.category || 'Prompt',
        sheetLink: r.sheetLink || '',
        linkButtonLabel: r.linkButtonLabel || '',
        isPublished: r.isPublished || false,
        displayOrder: resources.length
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'resources', editingId), {
          title, shortSummary, summary, category, sheetLink, linkButtonLabel, isPublished
        });
      } else {
        await addDoc(collection(db, 'resources'), {
          sessionId,
          title,
          shortSummary,
          summary,
          category,
          sheetLink,
          linkButtonLabel,
          isPublished,
          displayOrder: resources.length
        });
      }
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const generateFullContent = async () => {
    if (!sheetLink) {
      alert("Add a valid Resource Link first to generate Full Content.");
      return;
    }
    setIsGeneratingFull(true);
    try {
      const prompt = `Extract and rewrite the linked content into a clean, participant-friendly formatted resource. Preserve the main ideas faithfully and structure it for workshop use. Preserve rich text structure where possible, including paragraphs, headings, bullet points, numbered lists, links, and emphasis such as bold where helpful. Output HTML format suitable for a rich text editor. Do not include markdown code block backticks like \`\`\`html. Link: ${sheetLink}`;
      
      const response = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) throw new Error('ChatGPT request failed');
      const result = await response.json();
      
      if (result.text) {
        setSummary(result.text.replace(/^```html\n?|```$/g, '').trim());
      }
    } catch (err) {
      console.error(err);
      alert("Could not generate Full Content from this link. Please check the link and try again.");
    } finally {
      setIsGeneratingFull(false);
    }
  };

  const generateShortSummary = async (fullContentToUse: string = summary) => {
    if (!fullContentToUse || fullContentToUse.replace(/<[^>]*>?/gm, '').trim() === '') {
      if (sheetLink) {
        setShowFullContentPrompt(true);
      } else {
        alert("Add a Resource Link or Full Content first before generating a summary.");
      }
      return;
    }
    
    setIsGeneratingShort(true);
    try {
      const prompt = `Create a compact summary for a resource card based on the following content. Make it clear, scannable, and useful for participants. Avoid sounding robotic. Aim for about 140-160 characters, but allow a little flexibility for readability. Do not include any HTML tags, just plain text.\n\nContent:\n${fullContentToUse}`;
      
      const response = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) throw new Error('ChatGPT request failed');
      const result = await response.json();

      if (result.text) {
        setShortSummary(result.text.trim());
      }
    } catch (err) {
      console.error(err);
      alert("Could not generate Short Summary. Please try again.");
    } finally {
      setIsGeneratingShort(false);
    }
  };

  const handleGenerateFullThenShort = async () => {
    setShowFullContentPrompt(false);
    if (!sheetLink) return;
    
    setIsGeneratingFull(true);
    let generatedFullContent = "";
    try {
      const prompt = `Extract and rewrite the linked content into a clean, participant-friendly formatted resource. Preserve the main ideas faithfully and structure it for workshop use. Preserve rich text structure where possible, including paragraphs, headings, bullet points, numbered lists, links, and emphasis such as bold where helpful. Output HTML format suitable for a rich text editor. Do not include markdown code block backticks like \`\`\`html. Link: ${sheetLink}`;
      
      const response = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) throw new Error('ChatGPT request failed');
      const result = await response.json();

      if (result.text) {
        generatedFullContent = result.text.replace(/^```html\n?|```$/g, '').trim();
        setSummary(generatedFullContent);
      }
    } catch (err) {
      console.error(err);
      alert("Could not generate Full Content from this link. Please check the link and try again.");
      setIsGeneratingFull(false);
      return;
    }
    setIsGeneratingFull(false);
    
    if (generatedFullContent) {
      await generateShortSummary(generatedFullContent);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'resources', deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting resource:', err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `resources/${deleteConfirmId}`);
      } catch (fErr) {
        alert('Failed to delete resource due to database permission restrictions.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const togglePublish = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, 'resources', id), { isPublished: !currentStatus });
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const current = resources[index];
    const prev = resources[index - 1];
    
    await updateDoc(doc(db, 'resources', current.id), { displayOrder: prev.displayOrder ?? index - 1 });
    await updateDoc(doc(db, 'resources', prev.id), { displayOrder: current.displayOrder ?? index });
  };

  const handleMoveDown = async (index: number) => {
    if (index === resources.length - 1) return;
    const current = resources[index];
    const next = resources[index + 1];
    
    await updateDoc(doc(db, 'resources', current.id), { displayOrder: next.displayOrder ?? index + 1 });
    await updateDoc(doc(db, 'resources', next.id), { displayOrder: current.displayOrder ?? index });
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

  const renderForm = () => (
    <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
      <h3 className="text-lg font-semibold">{editingId ? 'Edit Resource' : 'New Resource'}</h3>
      <div>
        <label className="block text-sm text-zinc-400 mb-1">Title</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500" required />
      </div>
      <div>
        <label className="block text-sm text-zinc-400 mb-1">Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500">
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm text-zinc-400">Short Summary (Displayed on card)</label>
          <button 
            type="button" 
            onClick={() => generateShortSummary(summary)}
            disabled={isGeneratingShort}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
          >
            {isGeneratingShort ? 'Generating...' : 'Generate via AI'}
          </button>
        </div>
        <textarea value={shortSummary} onChange={e => setShortSummary(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500" rows={2} placeholder="Brief description for the resource card..." />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm text-zinc-400">Full Content (Displayed in modal)</label>
          <button 
            type="button" 
            onClick={generateFullContent}
            disabled={isGeneratingFull}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
          >
            {isGeneratingFull ? 'Generating...' : 'Generate via AI'}
          </button>
        </div>
        <RichTextEditor content={summary} onChange={setSummary} />
      </div>
      <div>
        <label className="block text-sm text-zinc-400 mb-1">Resource Link (Google Doc / Sheet / Website)</label>
        <input type="url" value={sheetLink} onChange={e => setSheetLink(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="Optional: https://..." />
      </div>
      <div>
        <label className="block text-sm text-zinc-400 mb-1">External Link Button Label (Optional)</label>
        <input type="text" value={linkButtonLabel} onChange={e => setLinkButtonLabel(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Open Google Doc, View Full Guide" />
        <InfoHelp label="External link button label">If left blank, a default label based on the category will be used.</InfoHelp>
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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Resources</h2>
        {!isAdding && (
          <button onClick={() => { resetForm(); setIsAdding(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">
            <Plus size={18} /> Add Resource
          </button>
        )}
      </div>

      {isAdding && !editingId && renderForm()}

      <div className="space-y-4">
        {resources.map((r, index) => {
          if (editingId === r.id) {
            return (
              <div key={r.id}>
                {renderForm()}
              </div>
            );
          }

          const isExpanded = expandedSummaries[r.id];
          const plainTextSummary = r.summary ? r.summary.replace(/<[^>]+>/g, '') : '';
          const isLong = plainTextSummary.length > 200;

          return (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex flex-col md:flex-row gap-4 justify-between">
              <div className="space-y-4 flex-1">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1 mr-2">
                    <button onClick={() => handleMoveUp(index)} disabled={index === 0} className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 transition-colors">
                      <ArrowUp size={16} />
                    </button>
                    <button onClick={() => handleMoveDown(index)} disabled={index === resources.length - 1} className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 transition-colors">
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <h3 className="text-lg font-semibold">{r.title}</h3>
                  {r.category && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-900/30 text-blue-400 border border-blue-800/50">
                      {r.category}
                    </span>
                  )}
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${r.isPublished ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    {r.isPublished ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="text-sm text-zinc-300">
                  {r.shortSummary && <p className="mb-2 text-zinc-400 italic">{r.shortSummary}</p>}
                  <div className={`overflow-hidden relative transition-all duration-300 ${isExpanded ? '' : (isLong ? 'max-h-32' : '')}`}>
                    <SafeHtml html={r.summary} />
                    {!isExpanded && isLong && (
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
                    )}
                  </div>
                  {isLong && (
                    <button 
                      onClick={() => setExpandedSummaries(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
                      className="mt-2 text-blue-400 hover:text-blue-300 text-xs font-medium"
                    >
                      {isExpanded ? 'Read less' : 'Read more'}
                    </button>
                  )}
                </div>
                {r.sheetLink && (
                  <a href={r.sheetLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 bg-blue-950/30 px-3 py-1.5 rounded-lg transition-colors w-fit">
                    <LinkIcon size={14} /> {getExternalLinkButtonLabel(r)} &rarr;
                  </a>
                )}
              </div>
              <div className="flex items-start gap-2">
                <button onClick={() => togglePublish(r.id, r.isPublished)} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-lg transition-colors">
                  {r.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => handleEdit(r)} className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors" title="Edit">
                  <Edit2 size={18} />
                </button>
                <button onClick={() => handleDuplicate(r)} className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors" title="Duplicate">
                  <Copy size={18} />
                </button>
                <button onClick={() => handleDelete(r.id)} className="p-1.5 text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-900/50 rounded-lg transition-colors" title="Delete">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
        {resources.length === 0 && !isAdding && (
          <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
            No resources added yet.
          </div>
        )}
      </div>

      {showFullContentPrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">Generate Full Content First?</h3>
            <p className="text-zinc-300">
              Full Content is empty. Would you like to generate Full Content first?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setShowFullContentPrompt(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleGenerateFullThenShort}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                Generate Full Content
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">Delete Resource?</h3>
            <p className="text-zinc-300">
              Are you sure you want to delete this resource? This action cannot be undone.
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
