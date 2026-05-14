import { useEffect, useState } from 'react';
import {
  listTools,
  registerTool,
  subscribeToolRegistry,
  type ToolDefinition,
  type ToolSchema,
} from '@/ai/toolRegistry';

export function useRegisteredTools(): ToolDefinition[] {
  const [tools, setTools] = useState<ToolDefinition[]>(() => listTools());
  useEffect(() => subscribeToolRegistry(() => setTools(listTools())), []);
  return tools;
}

/**
 * Register a set of tools for the lifetime of the component. Tools are
 * unregistered automatically when the component unmounts.
 */
export function useAppTools(
  appId: string,
  defs: Array<{
    toolName: string;
    description: string;
    input_schema: ToolSchema;
    handler: (input: Record<string, unknown>) => Promise<unknown> | unknown;
  }>,
) {
  useEffect(() => {
    const disposers = defs.map((d) =>
      registerTool(appId, d.toolName, d.description, d.input_schema, d.handler),
    );
    return () => {
      for (const d of disposers) d();
    };
    // We deliberately depend on appId only — the defs array identity is expected
    // to be stable per render of the same app instance. If callers need dynamic
    // tools, they should remount with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);
}
