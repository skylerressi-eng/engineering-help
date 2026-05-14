import { create } from 'zustand';

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Result from local handler, attached after the tool runs */
  result?: unknown;
  error?: string;
  /** Friendly display label */
  displayName?: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export type ContentBlock = TextBlock | ToolUseBlock;

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  blocks: ContentBlock[];
  /** When this message is mid-stream */
  streaming?: boolean;
  createdAt: number;
}

export interface AiConversation {
  id: string;
  title: string;
  messages: AiMessage[];
  createdAt: number;
  updatedAt: number;
}

export const AI_MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
];

const STORAGE_KEY = 'engos.ai.conversations.v1';

function loadConversations(): AiConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiConversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(convos: AiConversation[]) {
  try {
    // Cap to 50 most recent to avoid runaway storage
    const trimmed = [...convos].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota errors */
  }
}

let idSeq = 1;
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

interface AiStore {
  open: boolean;
  pinnedRight: boolean;
  width: number;
  conversations: AiConversation[];
  activeId: string | null;
  model: string;
  pending: boolean;
  toolIndicator: { tool: string; appId: string } | null;
  historyEnabled: boolean;

  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  setPinnedRight: (v: boolean) => void;
  setWidth: (w: number) => void;
  setModel: (m: string) => void;

  newChat: () => string;
  setActive: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearHistory: () => void;
  renameConversation: (id: string, title: string) => void;

  appendMessage: (m: AiMessage) => void;
  updateMessage: (id: string, mutator: (m: AiMessage) => AiMessage) => void;
  setPending: (p: boolean) => void;
  setToolIndicator: (t: { tool: string; appId: string } | null) => void;
  setHistoryEnabled: (b: boolean) => void;
}

export const useAiStore = create<AiStore>((set, get) => ({
  open: false,
  pinnedRight: true,
  width: 400,
  conversations: loadConversations(),
  activeId: null,
  model: AI_MODELS[0].id,
  pending: false,
  toolIndicator: null,
  historyEnabled: true,

  openChat: () => {
    const { activeId, conversations } = get();
    let id = activeId;
    if (!id) {
      if (conversations.length) id = conversations[0].id;
      else id = get().newChat();
    }
    set({ open: true, activeId: id });
  },
  closeChat: () => set({ open: false }),
  toggleChat: () => {
    if (get().open) set({ open: false });
    else get().openChat();
  },
  setPinnedRight: (v) => set({ pinnedRight: v }),
  setWidth: (w) => set({ width: Math.max(320, Math.min(720, w)) }),
  setModel: (m) => set({ model: m }),

  newChat: () => {
    const id = uid('conv');
    const c: AiConversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => {
      const next = [c, ...s.conversations];
      if (s.historyEnabled) saveConversations(next);
      return { conversations: next, activeId: id };
    });
    return id;
  },

  setActive: (id) => set({ activeId: id }),

  deleteConversation: (id) =>
    set((s) => {
      const next = s.conversations.filter((c) => c.id !== id);
      if (s.historyEnabled) saveConversations(next);
      return {
        conversations: next,
        activeId: s.activeId === id ? next[0]?.id ?? null : s.activeId,
      };
    }),

  clearHistory: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ conversations: [], activeId: null });
  },

  renameConversation: (id, title) =>
    set((s) => {
      const next = s.conversations.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
      );
      if (s.historyEnabled) saveConversations(next);
      return { conversations: next };
    }),

  appendMessage: (m) =>
    set((s) => {
      const id = s.activeId;
      if (!id) return s;
      const next = s.conversations.map((c) =>
        c.id === id
          ? {
              ...c,
              messages: [...c.messages, m],
              updatedAt: Date.now(),
              title:
                c.title === 'New Chat' && m.role === 'user' && m.blocks[0]?.type === 'text'
                  ? (m.blocks[0] as TextBlock).text.slice(0, 40)
                  : c.title,
            }
          : c,
      );
      if (s.historyEnabled) saveConversations(next);
      return { conversations: next };
    }),

  updateMessage: (msgId, mutator) =>
    set((s) => {
      const id = s.activeId;
      if (!id) return s;
      const next = s.conversations.map((c) =>
        c.id === id
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === msgId ? mutator(m) : m)),
              updatedAt: Date.now(),
            }
          : c,
      );
      if (s.historyEnabled) saveConversations(next);
      return { conversations: next };
    }),

  setPending: (p) => set({ pending: p }),
  setToolIndicator: (t) => set({ toolIndicator: t }),
  setHistoryEnabled: (b) => {
    if (!b) localStorage.removeItem(STORAGE_KEY);
    set({ historyEnabled: b });
  },
}));

export function nextMessageId(): string {
  return uid('msg');
}
