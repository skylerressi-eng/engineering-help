import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles,
  Send,
  ScanLine,
  PlusCircle,
  X,
  PanelRightClose,
  PanelRightOpen,
  History,
  Wand2,
  Wrench,
  ChevronDown,
} from 'lucide-react';
import { useAiStore, AI_MODELS, type AiMessage } from '@/store/aiStore';
import { sendMessage, abortActive } from './conversation';
import { useRegisteredTools } from '@/hooks/useToolRegistry';
import MessageContent from './MessageContent';
import { getApp } from '@/apps/registry';
import { useSettingsStore } from '@/store/settingsStore';
import { useWindowStore } from '@/store/windowStore';

const MENU_BAR = 28;

export default function AiChat() {
  const open = useAiStore((s) => s.open);
  const pinned = useAiStore((s) => s.pinnedRight);
  const width = useAiStore((s) => s.width);
  const closeChat = useAiStore((s) => s.closeChat);
  const setPinnedRight = useAiStore((s) => s.setPinnedRight);
  const setWidth = useAiStore((s) => s.setWidth);
  const conversations = useAiStore((s) => s.conversations);
  const activeId = useAiStore((s) => s.activeId);
  const newChat = useAiStore((s) => s.newChat);
  const setActive = useAiStore((s) => s.setActive);
  const pending = useAiStore((s) => s.pending);
  const toolIndicator = useAiStore((s) => s.toolIndicator);
  const model = useAiStore((s) => s.model);
  const setModel = useAiStore((s) => s.setModel);

  // Free-float position (used when un-pinned)
  const [pos, setPos] = useState({ x: window.innerWidth - 416, y: MENU_BAR + 12 });
  const [floatSize, setFloatSize] = useState({ w: 400, h: window.innerHeight - 120 });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  const convo = conversations.find((c) => c.id === activeId);

  // Drag state
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (pinned) return;
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const d = dragRef.current;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, d.px + ev.clientX - d.ox)),
        y: Math.max(MENU_BAR, Math.min(window.innerHeight - 80, d.py + ev.clientY - d.oy)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Resize state (when pinned: resize from left edge of the panel)
  const resizeRef = useRef<{ ox: number; pw: number } | null>(null);
  const onResizeStart = (e: React.MouseEvent) => {
    resizeRef.current = { ox: e.clientX, pw: pinned ? width : floatSize.w };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const d = resizeRef.current;
      const next = d.pw - (ev.clientX - d.ox) * (pinned ? 1 : -1);
      if (pinned) setWidth(next);
      else setFloatSize((s) => ({ ...s, w: Math.max(320, Math.min(720, next)) }));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const containerStyle: React.CSSProperties = pinned
    ? {
        top: MENU_BAR,
        right: 0,
        height: `calc(100vh - ${MENU_BAR}px - 96px)`,
        width,
      }
    : {
        top: pos.y,
        left: pos.x,
        width: floatSize.w,
        height: floatSize.h,
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: pinned ? 40 : 0, y: pinned ? 0 : -10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: pinned ? 40 : 0, y: pinned ? 0 : -10 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={containerStyle}
          className="fixed z-[7000] flex flex-col rounded-2xl overflow-hidden glass-strong glass-edge shadow-window border border-white/10"
        >
          {/* Resize handle */}
          <div
            onMouseDown={onResizeStart}
            className={`absolute top-0 ${pinned ? 'left-0' : 'right-0'} h-full w-1 cursor-ew-resize hover:bg-accent/30`}
          />

          {/* Header */}
          <div
            onMouseDown={onHeaderMouseDown}
            className={`flex items-center gap-2 px-3 h-11 border-b border-white/10 chrome ${
              pinned ? '' : 'cursor-grab active:cursor-grabbing'
            }`}
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-gradient-to-br from-fuchsia-500 to-rose-500">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="font-semibold text-sm">EngOS AI</div>

            <div className="relative ml-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setModelOpen((o) => !o);
                }}
                className="text-[11px] flex items-center gap-1 text-white/60 hover:text-white/90 rounded-md px-1.5 py-0.5 hover:bg-white/10"
              >
                {AI_MODELS.find((m) => m.id === model)?.label ?? model}
                <ChevronDown size={11} />
              </button>
              {modelOpen && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute top-full left-0 mt-1 glass-strong rounded-md py-1 min-w-[160px] text-[12px] shadow-window z-10"
                >
                  {AI_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModel(m.id);
                        setModelOpen(false);
                      }}
                      className="block w-full text-left px-2 py-1 hover:bg-white/10"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1">
              <HeaderButton
                title="New Chat"
                onClick={() => {
                  newChat();
                  setHistoryOpen(false);
                }}
              >
                <PlusCircle size={14} />
              </HeaderButton>
              <HeaderButton
                title="History"
                onClick={() => setHistoryOpen((o) => !o)}
              >
                <History size={14} />
              </HeaderButton>
              <HeaderButton
                title={pinned ? 'Float window' : 'Dock to right'}
                onClick={() => setPinnedRight(!pinned)}
              >
                {pinned ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
              </HeaderButton>
              <HeaderButton title="Close" onClick={closeChat}>
                <X size={14} />
              </HeaderButton>
            </div>
          </div>

          {/* History drawer */}
          {historyOpen && (
            <HistoryDrawer
              onPick={(id) => {
                setActive(id);
                setHistoryOpen(false);
              }}
            />
          )}

          {/* Messages */}
          <MessageList messages={convo?.messages ?? []} />

          {/* Tool indicator */}
          {toolIndicator && (
            <div className="px-3 py-1 text-[11px] text-white/70 flex items-center gap-1.5 border-t border-white/5 bg-accent/10">
              <Wrench size={12} className="text-accent" />
              AI is using <span className="font-mono">{toolIndicator.tool}</span>
            </div>
          )}

          {/* Input */}
          <ApiKeyBanner />
          <ChatInput pending={pending} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HeaderButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="p-1 rounded-md hover:bg-white/10 text-white/80"
    >
      {children}
    </button>
  );
}

function HistoryDrawer({ onPick }: { onPick: (id: string) => void }) {
  const conversations = useAiStore((s) => s.conversations);
  const deleteConversation = useAiStore((s) => s.deleteConversation);
  return (
    <div className="border-b border-white/10 max-h-48 overflow-y-auto">
      {conversations.length === 0 && (
        <div className="px-3 py-2 text-xs text-white/50">No conversations yet.</div>
      )}
      {conversations.map((c) => (
        <div key={c.id} className="flex items-center group hover:bg-white/5">
          <button
            onClick={() => onPick(c.id)}
            className="flex-1 text-left px-3 py-1.5 text-[12.5px] truncate"
            title={c.title}
          >
            {c.title}
          </button>
          <button
            onClick={() => deleteConversation(c.id)}
            className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded hover:bg-white/10 text-white/60"
            title="Delete"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function MessageList({ messages }: { messages: AiMessage[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const tools = useRegisteredTools();
  const empty = messages.length === 0;

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 app-content">
      {empty && <EmptyState toolCount={tools.length} />}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}

function EmptyState({ toolCount }: { toolCount: number }) {
  return (
    <div className="text-center py-6 text-white/65 px-2">
      <div
        className="w-14 h-14 mx-auto flex items-center justify-center shadow-lg border border-white/15 relative overflow-hidden"
        style={{
          borderRadius: '26%',
          background: 'linear-gradient(135deg, #f0abfc 0%, #c084fc 35%, #ec4899 100%)',
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 100%)',
          }}
        />
        <Sparkles size={22} className="text-white relative z-10" />
      </div>
      <div className="mt-3 text-base font-semibold text-white">EngOS AI</div>
      <div className="text-[12px] mt-0.5 text-white/55">
        Your engineering co-pilot.
      </div>
      <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-white/8 border border-white/10 text-[10px] text-white/65 font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]" />
        {toolCount} tool{toolCount === 1 ? '' : 's'} live
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 text-left">
        <QuickActionTile
          icon={<ScanLine size={13} />}
          title="Explain this"
          subtitle="Use the focused app"
          onClick={() =>
            sendMessage({ text: 'Explain what I am currently looking at.', includeScan: true })
          }
        />
        <QuickActionTile
          icon={<Wand2 size={13} />}
          title="Build for me"
          subtitle="Pick a fun demo"
          onClick={() =>
            sendMessage({
              text: 'Pick something cool to build using the tools you have right now and walk me through it as you do it.',
            })
          }
        />
      </div>
      <div className="mt-3 text-[10px] text-white/40">
        Cmd+I to toggle · Cmd+K for Spotlight
      </div>
    </div>
  );
}

function QuickActionTile({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-2 text-left"
    >
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
        {icon}
        {title}
      </div>
      <div className="text-[11px] text-white/55 mt-0.5">{subtitle}</div>
    </button>
  );
}

function MessageBubble({ message }: { message: AiMessage }) {
  if (message.role === 'user') {
    const text = message.blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n');
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md px-3 py-2 bg-accent text-white text-[14px] leading-relaxed whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {message.blocks.map((b, i) => {
        if (b.type === 'text') {
          if (!b.text && !message.streaming) return null;
          return (
            <div
              key={i}
              className="rounded-2xl rounded-bl-md px-3 py-2 bg-white/5 border border-white/10"
            >
              <MessageContent text={b.text} streaming={message.streaming && i === message.blocks.length - 1} />
            </div>
          );
        }
        // tool_use block
        return <ToolCallBlock key={b.id} block={b} />;
      })}
    </div>
  );
}

function ToolCallBlock({
  block,
}: {
  block: {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
    error?: string;
  };
}) {
  const [appId, toolName] = block.name.split('__');
  const app = appId ? getApp(appId) : undefined;
  const label = `${app?.manifest.name ?? appId ?? 'tool'} · ${toolName ?? block.name}`;
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-[12px]">
      <div className="flex items-center gap-1.5 text-accent font-medium">
        <Wrench size={11} />
        {label}
        {block.error && <span className="text-traffic-red ml-1">error</span>}
      </div>
      {Object.keys(block.input).length > 0 && (
        <div className="mt-1 font-mono text-[11px] text-white/65 break-all">
          {JSON.stringify(block.input)}
        </div>
      )}
      {block.result !== undefined && (
        <div className="mt-1 font-mono text-[11px] text-white/55 break-all">
          → {JSON.stringify(block.result)}
        </div>
      )}
      {block.error && (
        <div className="mt-1 font-mono text-[11px] text-traffic-red break-all">
          {block.error}
        </div>
      )}
    </div>
  );
}

function ApiKeyBanner() {
  const key = useSettingsStore((s) => s.aiApiKey);
  const openApp = useWindowStore((s) => s.openApp);
  if (key.trim()) return null;
  return (
    <div className="border-t border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100 flex items-center gap-2">
      <Sparkles size={13} className="text-amber-300 shrink-0" />
      <span className="flex-1">
        Add your Anthropic API key to start chatting.
      </span>
      <button
        onClick={() => openApp('settings', { title: 'Settings' })}
        className="px-2 py-0.5 rounded-md bg-amber-300/20 hover:bg-amber-300/30 text-amber-100 text-[11px] font-medium"
      >
        Open Settings
      </button>
    </div>
  );
}

function ChatInput({ pending }: { pending: boolean }) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = (includeScan = false) => {
    const text = value.trim();
    if (!text || pending) return;
    setValue('');
    if (taRef.current) taRef.current.style.height = 'auto';
    sendMessage({ text, includeScan });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div className="border-t border-white/10 p-2">
      <div
        className={`flex items-end gap-2 rounded-xl bg-white/5 border px-2.5 py-2 transition-colors ${
          value.trim() ? 'border-accent/40' : 'border-white/10 hover:border-white/20'
        }`}
      >
        <button
          title="Scan focused app"
          onClick={() => submit(true)}
          disabled={!value.trim() || pending}
          className="text-white/70 hover:text-white disabled:opacity-40 p-1 rounded-md hover:bg-white/10"
        >
          <ScanLine size={15} />
        </button>
        <textarea
          ref={taRef}
          value={value}
          onChange={onInput}
          onKeyDown={onKey}
          rows={1}
          placeholder={pending ? 'Thinking…' : 'Ask EngOS AI…'}
          className="flex-1 bg-transparent outline-none resize-none text-[14px] leading-relaxed placeholder:text-white/40 max-h-40"
        />
        {pending ? (
          <button
            title="Stop"
            onClick={() => abortActive()}
            className="w-8 h-8 rounded-md bg-white/15 hover:bg-white/20 flex items-center justify-center"
          >
            <span className="w-2.5 h-2.5 bg-white rounded-sm" />
          </button>
        ) : (
          <button
            title="Send (Enter)"
            onClick={() => submit()}
            disabled={!value.trim()}
            className="w-8 h-8 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-40 flex items-center justify-center text-white"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
