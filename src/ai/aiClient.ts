/**
 * Streaming Anthropic Messages API client. The user supplies their own
 * Anthropic API key (stored locally in settings); it is sent with each
 * request via the `x-api-key` header.
 */

import type { ToolDefinition } from './toolRegistry';
import { useSettingsStore } from '@/store/settingsStore';

/** Thrown when no API key is configured. The UI prompts the user for one. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('No Anthropic API key set. Add one in the AI panel to start chatting.');
    this.name = 'MissingApiKeyError';
  }
}

const API_URL = 'https://api.anthropic.com/v1/messages';

export interface ApiMessage {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        | {
            type: 'tool_result';
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }
      >;
}

export interface StreamCallbacks {
  onText?: (delta: string) => void;
  onToolStart?: (id: string, name: string) => void;
  onToolInput?: (id: string, partial: string) => void;
  onToolEnd?: (id: string, finalInput: Record<string, unknown>) => void;
  onMessageStop?: (stopReason?: string) => void;
  onError?: (err: unknown) => void;
}

export interface StreamRequest {
  model: string;
  system?: string;
  messages: ApiMessage[];
  tools?: ToolDefinition[];
  max_tokens?: number;
  signal?: AbortSignal;
}

interface ToolAccumulator {
  id: string;
  name: string;
  jsonBuffer: string;
}

export async function streamMessage(req: StreamRequest, cb: StreamCallbacks): Promise<{
  text: string;
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason?: string;
}> {
  const body = {
    model: req.model,
    max_tokens: req.max_tokens ?? 1024,
    stream: true,
    system: req.system,
    messages: req.messages,
    tools: req.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
  };

  const apiKey = useSettingsStore.getState().apiKey.trim();
  if (!apiKey) {
    const err = new MissingApiKeyError();
    cb.onError?.(err);
    throw err;
  }

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (err) {
    cb.onError?.(err);
    throw err;
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    const err = new Error(`API error: ${res.status} ${errText}`);
    cb.onError?.(err);
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason: string | undefined;
  const toolBlocks = new Map<number, ToolAccumulator>();
  const finishedTools: Array<{ id: string; name: string; input: Record<string, unknown> }> =
    [];

  const handleEvent = (event: string, data: string) => {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    switch (event) {
      case 'content_block_start': {
        const block = parsed.content_block;
        if (block?.type === 'tool_use') {
          toolBlocks.set(parsed.index, {
            id: block.id,
            name: block.name,
            jsonBuffer: '',
          });
          cb.onToolStart?.(block.id, block.name);
        }
        break;
      }
      case 'content_block_delta': {
        const delta = parsed.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          text += delta.text;
          cb.onText?.(delta.text);
        } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const acc = toolBlocks.get(parsed.index);
          if (acc) {
            acc.jsonBuffer += delta.partial_json;
            cb.onToolInput?.(acc.id, delta.partial_json);
          }
        }
        break;
      }
      case 'content_block_stop': {
        const acc = toolBlocks.get(parsed.index);
        if (acc) {
          let input: Record<string, unknown> = {};
          try {
            input = acc.jsonBuffer ? JSON.parse(acc.jsonBuffer) : {};
          } catch {
            input = { _raw: acc.jsonBuffer };
          }
          finishedTools.push({ id: acc.id, name: acc.name, input });
          cb.onToolEnd?.(acc.id, input);
        }
        break;
      }
      case 'message_delta': {
        if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
        break;
      }
      case 'message_stop': {
        cb.onMessageStop?.(stopReason);
        break;
      }
      case 'error': {
        cb.onError?.(parsed.error ?? parsed);
        break;
      }
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events separated by double newlines
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) handleEvent(event, dataLines.join('\n'));
    }
  }

  return { text, toolUses: finishedTools, stopReason };
}
