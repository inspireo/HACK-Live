import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Unlink, Heading2, Heading3, Quote, Code } from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 border-b border-zinc-700 bg-zinc-800/50 rounded-t-xl">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Heading 2"
      >
        <Heading2 size={18} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Heading 3"
      >
        <Heading3 size={18} />
      </button>
      <div className="w-px h-6 bg-zinc-700 mx-1 self-center" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('bold') ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Bold"
      >
        <Bold size={18} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('italic') ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Italic"
      >
        <Italic size={18} />
      </button>
      <div className="w-px h-6 bg-zinc-700 mx-1 self-center" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('bulletList') ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Bullet List"
      >
        <List size={18} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('orderedList') ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Numbered List"
      >
        <ListOrdered size={18} />
      </button>
      <div className="w-px h-6 bg-zinc-700 mx-1 self-center" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('blockquote') ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Blockquote"
      >
        <Quote size={18} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('codeBlock') ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Code Block"
      >
        <Code size={18} />
      </button>
      <div className="w-px h-6 bg-zinc-700 mx-1 self-center" />
      <button
        type="button"
        onClick={setLink}
        className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${editor.isActive('link') ? 'bg-zinc-700 text-emerald-400' : 'text-zinc-300'}`}
        title="Add Link"
      >
        <LinkIcon size={18} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive('link')}
        className="p-1.5 rounded hover:bg-zinc-700 transition-colors text-zinc-300 disabled:opacity-50"
        title="Remove Link"
      >
        <Unlink size={18} />
      </button>
    </div>
  );
};

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-emerald-400 hover:text-emerald-300 underline',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none min-h-[150px] p-4 focus:outline-none',
      },
    },
  });

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
