/**
 * Global tool registry. Apps register tools when they mount; the AI sends the
 * current set of registered tools with every request. When the model returns a
 * tool_use block, we route it to the corresponding handler.
 */

export interface ToolSchema {
  /** JSON Schema-ish description of expected input */
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: unknown[] }>;
  required?: string[];
}

export interface ToolDefinition {
  /** Fully-qualified name we send to the API, e.g. "logiclab__spawn_gate" */
  name: string;
  /** Friendly tool name */
  toolName: string;
  /** App that owns this tool */
  appId: string;
  description: string;
  input_schema: ToolSchema;
  handler: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

type Listener = () => void;

const tools = new Map<string, ToolDefinition>();
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

export function registerTool(
  appId: string,
  toolName: string,
  description: string,
  input_schema: ToolSchema,
  handler: ToolDefinition['handler'],
): () => void {
  const name = `${appId}__${toolName}`;
  tools.set(name, { name, toolName, appId, description, input_schema, handler });
  notify();
  return () => {
    tools.delete(name);
    notify();
  };
}

export function listTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

export function listToolsForApps(appIds: string[]): ToolDefinition[] {
  const set = new Set(appIds);
  return Array.from(tools.values()).filter((t) => set.has(t.appId));
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(input);
}

export function subscribeToolRegistry(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
