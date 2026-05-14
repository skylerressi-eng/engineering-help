import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Download, Search } from 'lucide-react';
import { NotesIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import { useNotesStore } from '@/store/notesStore';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import MessageContent from '@/ai/MessageContent';

function NotesApp({ appId }: { appId: string }) {
  const notes = useNotesStore((s) => s.notes);
  const activeId = useNotesStore((s) => s.activeId);
  const setActive = useNotesStore((s) => s.setActive);
  const createNote = useNotesStore((s) => s.createNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);

  const [preview, setPreview] = useState(false);
  const [filter, setFilter] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Open the first note (or create one) when the app launches
  useEffect(() => {
    if (!activeId) {
      if (notes.length) setActive(notes[0].id);
      else createNote('Welcome to Notes', WELCOME_BODY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = notes.find((n) => n.id === activeId) ?? null;

  const filteredNotes = useMemo(() => {
    if (!filter.trim()) return notes;
    const q = filter.trim().toLowerCase();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
    );
  }, [notes, filter]);

  // Publish state
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: active
        ? `Notes app open. The currently-selected note is titled "${active.title}". Body length: ${active.body.length} chars. Preview mode: ${preview ? 'on' : 'off'}.`
        : 'Notes app open with no note selected.',
      state: {
        activeId,
        activeTitle: active?.title ?? null,
        activeBodyPreview: active?.body.slice(0, 800) ?? null,
        noteCount: notes.length,
      },
    }));
  }, [appId, active, activeId, notes.length, preview]);

  // AI tools
  useAppTools(appId, [
    {
      toolName: 'create_note',
      description: 'Create a new note in Notes. Returns the note id.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string', description: 'Markdown body (supports $LaTeX$ and code blocks)' },
        },
        required: ['title'],
      },
      handler: ({ title, content }: any) =>
        ({ id: createNote(String(title), String(content ?? '')) }),
    },
    {
      toolName: 'append_to_note',
      description: 'Append text to an existing note, optionally adding a newline before it.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Note id (if omitted, uses the active note)' },
          content: { type: 'string' },
          newline: { type: 'string', description: 'true to prepend a newline' },
        },
        required: ['content'],
      },
      handler: ({ id, content, newline }: any) => {
        const targetId: string = id || activeId || '';
        if (!targetId) throw new Error('No note id and no active note');
        const prefix = String(newline) === 'true' ? '\n' : '';
        useNotesStore.getState().appendToNote(targetId, prefix + String(content));
        return { id: targetId };
      },
    },
    {
      toolName: 'list_notes',
      description: 'List all notes with id, title, and updatedAt.',
      input_schema: { type: 'object', properties: {} },
      handler: () =>
        useNotesStore.getState().notes.map((n) => ({
          id: n.id,
          title: n.title,
          updatedAt: n.updatedAt,
        })),
    },
  ]);

  const exportMd = () => {
    if (!active) return;
    const blob = new Blob([`# ${active.title}\n\n${active.body}`], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.title || 'note'}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 border-r border-white/10 flex flex-col chrome bg-black/15">
        <div className="p-2 flex items-center gap-1">
          <button
            onClick={() => createNote()}
            title="New note"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-accent/85 hover:bg-accent text-white"
          >
            <Plus size={12} /> New
          </button>
          <div className="ml-1 flex-1 flex items-center gap-1 bg-white/5 rounded-md px-1.5">
            <Search size={11} className="text-white/45" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent outline-none text-xs py-1 min-w-0"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 && (
            <div className="text-center text-white/40 text-xs mt-4">No notes</div>
          )}
          {filteredNotes.map((n) => (
            <button
              key={n.id}
              onClick={() => setActive(n.id)}
              className={`w-full text-left px-3 py-2 border-b border-white/5 ${
                n.id === activeId ? 'bg-white/8' : 'hover:bg-white/5'
              }`}
            >
              <div className="font-medium text-[12.5px] text-white truncate">
                {n.title || 'Untitled'}
              </div>
              <div className="text-[11px] text-white/45 truncate">
                {n.body.replace(/[#*`>\n]/g, ' ').slice(0, 60) || '—'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor / preview */}
      <div className="flex-1 flex flex-col min-w-0 app-content">
        {active ? (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10 chrome">
              <input
                value={active.title}
                onChange={(e) => updateNote(active.id, { title: e.target.value })}
                placeholder="Note title"
                className="flex-1 bg-transparent outline-none text-sm font-semibold text-white min-w-0"
              />
              <button
                onClick={() => setPreview((p) => !p)}
                title={preview ? 'Edit' : 'Preview'}
                className={`p-1.5 rounded-md ${preview ? 'bg-white/15' : 'hover:bg-white/10'}`}
              >
                {preview ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                onClick={exportMd}
                title="Export as .md"
                className="p-1.5 rounded-md hover:bg-white/10"
              >
                <Download size={13} />
              </button>
              <button
                onClick={() => deleteNote(active.id)}
                title="Delete"
                className="p-1.5 rounded-md hover:bg-white/10 text-traffic-red/80"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {preview ? (
              <div className="flex-1 overflow-auto p-5">
                <MessageContent text={active.body || '_(empty note)_'} />
              </div>
            ) : (
              <textarea
                ref={taRef}
                value={active.body}
                onChange={(e) => updateNote(active.id, { body: e.target.value })}
                placeholder="Start writing in Markdown. $LaTeX$ and ```code blocks``` supported."
                className="flex-1 w-full bg-transparent outline-none resize-none p-5 font-mono text-[13px] text-white/90 leading-relaxed"
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-rose-500 shadow-lg">
              <Plus size={26} className="text-white" />
            </div>
            <div>
              <div className="text-white text-base font-semibold">No note open</div>
              <div className="text-white/55 text-xs mt-0.5">
                Markdown + LaTeX. Auto-saved to this browser.
              </div>
            </div>
            <button
              onClick={() => createNote()}
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium shadow"
            >
              New note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const WELCOME_BODY = `Welcome to **EngOS Notes** — a markdown notepad for engineering students.

## Features
- Markdown with **GitHub-flavored** extensions
- Inline math: $C_L = 2\\pi\\alpha$
- Block math:
$$
\\sigma = \\frac{F}{A}, \\quad \\varepsilon = \\frac{\\Delta L}{L_0}, \\quad E = \\frac{\\sigma}{\\varepsilon}
$$
- Syntax-highlighted code:
\`\`\`python
def reynolds(rho, v, L, mu):
    return rho * v * L / mu
\`\`\`

## Shortcut
- Press the eye icon to toggle Live Preview.
- Use the AI assistant (Cmd+I) and ask it to "append a derivation to this note".
`;

const module: AppModule = {
  manifest: {
    id: 'notes',
    name: 'Notes',
    description: 'Markdown notepad with LaTeX and code highlighting',
    icon: NotesIcon,
    defaultSize: { width: 760, height: 540 },
    accent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  },
  Component: NotesApp,
};

export default module;
