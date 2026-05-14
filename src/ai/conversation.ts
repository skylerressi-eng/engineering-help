import {
  useAiStore,
  nextMessageId,
  type AiMessage,
  type ContentBlock,
  type ToolUseBlock,
} from '@/store/aiStore';
import { listTools, runTool } from './toolRegistry';
import { streamMessage, type ApiMessage } from './aiClient';
import { formatScanForPrompt, scanFocusedScreen } from './screenScanner';

const SYSTEM_BASE = `You are EngOS AI, an in-OS assistant for engineering students using a desktop \
environment with apps for circuits, logic, physics, aerodynamics, 3D modeling, and parts. \
Be concise and technically precise. Prefer formulas in LaTeX (e.g. $C_L = 2\\pi\\alpha$) \
and use fenced code blocks for code. When the user is asking about something they \
can do in an open app, use the available tools to operate that app directly rather \
than just describing the steps.`;

interface SendOptions {
  text: string;
  /** If true, prepend a screen-scan system message */
  includeScan?: boolean;
  /** Optional inline quick action label */
  prefix?: string;
}

/** Convert the store's messages into the API's wire format. */
function toApiMessages(messages: AiMessage[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      // Check whether previous assistant message had tool_use blocks awaiting results.
      const toolUses = m.blocks.filter(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      );
      if (toolUses.length) {
        out.push({
          role: 'user',
          content: toolUses.map((t) => ({
            type: 'tool_result' as const,
            tool_use_id: t.id,
            content:
              t.error !== undefined
                ? `Error: ${t.error}`
                : JSON.stringify(t.result ?? null),
            is_error: t.error !== undefined,
          })),
        });
        continue;
      }
      const textBlocks = m.blocks.filter((b) => b.type === 'text');
      if (textBlocks.length === 1) {
        out.push({ role: 'user', content: (textBlocks[0] as { text: string }).text });
      } else if (textBlocks.length > 1) {
        out.push({
          role: 'user',
          content: textBlocks.map((b) => ({
            type: 'text' as const,
            text: (b as { text: string }).text,
          })),
        });
      }
    } else if (m.role === 'assistant') {
      const content: ApiMessage['content'] = [];
      for (const b of m.blocks) {
        if (b.type === 'text' && b.text) content.push({ type: 'text', text: b.text });
        else if (b.type === 'tool_use') {
          content.push({
            type: 'tool_use',
            id: b.id,
            name: b.name,
            input: b.input,
          });
        }
      }
      if (Array.isArray(content) && content.length) {
        out.push({ role: 'assistant', content });
      }
    }
  }
  return out;
}

let activeAbort: AbortController | null = null;

export function abortActive() {
  activeAbort?.abort();
  activeAbort = null;
  useAiStore.getState().setPending(false);
  useAiStore.getState().setToolIndicator(null);
}

export async function sendMessage(opts: SendOptions) {
  const store = useAiStore.getState();
  if (!store.activeId) store.newChat();
  if (store.pending) return;
  store.setPending(true);

  let userText = opts.text;
  if (opts.includeScan) {
    const scan = scanFocusedScreen();
    userText = `${formatScanForPrompt(scan)}\n\n---\n${opts.text}`;
  }
  if (opts.prefix) userText = `${opts.prefix}\n\n${userText}`;

  const userMsg: AiMessage = {
    id: nextMessageId(),
    role: 'user',
    blocks: [{ type: 'text', text: userText }],
    createdAt: Date.now(),
  };
  store.appendMessage(userMsg);

  await runTurn();
}

async function runTurn() {
  const store = useAiStore.getState();
  const convoId = store.activeId;
  if (!convoId) {
    store.setPending(false);
    return;
  }

  // Up to 5 sequential tool-use cycles, then we stop to prevent runaway loops.
  for (let iter = 0; iter < 5; iter++) {
    const convo = useAiStore.getState().conversations.find((c) => c.id === convoId);
    if (!convo) break;
    const apiMessages = toApiMessages(convo.messages);
    const tools = listTools();
    const assistantId = nextMessageId();
    const assistantMsg: AiMessage = {
      id: assistantId,
      role: 'assistant',
      blocks: [{ type: 'text', text: '' }],
      streaming: true,
      createdAt: Date.now(),
    };
    useAiStore.getState().appendMessage(assistantMsg);

    activeAbort = new AbortController();
    let textBuf = '';
    const toolBlocks = new Map<string, ToolUseBlock>();

    let result;
    try {
      result = await streamMessage(
        {
          model: useAiStore.getState().model,
          system: SYSTEM_BASE,
          messages: apiMessages,
          tools,
          max_tokens: 1024,
          signal: activeAbort.signal,
        },
        {
          onText: (delta) => {
            textBuf += delta;
            useAiStore.getState().updateMessage(assistantId, (m) => {
              const blocks: ContentBlock[] = [...m.blocks];
              const textIdx = blocks.findIndex((b) => b.type === 'text');
              if (textIdx >= 0) blocks[textIdx] = { type: 'text', text: textBuf };
              else blocks.unshift({ type: 'text', text: textBuf });
              return { ...m, blocks };
            });
          },
          onToolStart: (id, name) => {
            const block: ToolUseBlock = { type: 'tool_use', id, name, input: {} };
            toolBlocks.set(id, block);
            useAiStore.getState().setToolIndicator({
              tool: name,
              appId: name.split('__')[0] ?? 'ai',
            });
            useAiStore.getState().updateMessage(assistantId, (m) => ({
              ...m,
              blocks: [...m.blocks, block],
            }));
          },
          onToolEnd: (id, input) => {
            const b = toolBlocks.get(id);
            if (b) b.input = input;
            useAiStore.getState().updateMessage(assistantId, (m) => ({
              ...m,
              blocks: m.blocks.map((blk) =>
                blk.type === 'tool_use' && blk.id === id ? { ...blk, input } : blk,
              ),
            }));
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useAiStore.getState().updateMessage(assistantId, (m) => ({
        ...m,
        streaming: false,
        blocks: [
          {
            type: 'text',
            text: textBuf
              ? `${textBuf}\n\n_⚠️ ${message}_`
              : `⚠️ Couldn't reach EngOS AI. ${message}`,
          },
        ],
      }));
      useAiStore.getState().setPending(false);
      useAiStore.getState().setToolIndicator(null);
      activeAbort = null;
      return;
    }

    useAiStore.getState().updateMessage(assistantId, (m) => ({ ...m, streaming: false }));
    useAiStore.getState().setToolIndicator(null);

    if (!result.toolUses.length || result.stopReason !== 'tool_use') {
      break;
    }

    // Execute each tool and append a user-role message holding tool_results.
    const toolResultMsg: AiMessage = {
      id: nextMessageId(),
      role: 'user',
      blocks: [],
      createdAt: Date.now(),
    };
    for (const t of result.toolUses) {
      let res: unknown;
      let error: string | undefined;
      useAiStore.getState().setToolIndicator({
        tool: t.name,
        appId: t.name.split('__')[0] ?? 'ai',
      });
      try {
        res = await runTool(t.name, t.input);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      toolResultMsg.blocks.push({
        type: 'tool_use',
        id: t.id,
        name: t.name,
        input: t.input,
        result: res,
        error,
      });
    }
    useAiStore.getState().setToolIndicator(null);
    useAiStore.getState().appendMessage(toolResultMsg);
    // Loop back to let the model see the tool results.
  }

  useAiStore.getState().setPending(false);
  activeAbort = null;
}
