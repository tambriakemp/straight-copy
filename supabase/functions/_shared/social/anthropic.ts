// Anthropic Claude caller for social copy generation.
// Uses tool_use to enforce a structured response shape.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export async function callClaudeStructured<T>(args: {
  system: string;
  user: string;
  tool: AnthropicTool;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}): Promise<T> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured for this project");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: args.model ?? DEFAULT_MODEL,
      max_tokens: args.max_tokens ?? 2048,
      temperature: args.temperature ?? 0.9,
      system: args.system,
      tools: [args.tool],
      tool_choice: { type: "tool", name: args.tool.name },
      messages: [{ role: "user", content: args.user }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude ${res.status}: ${txt.slice(0, 400)}`);
  }
  const j = await res.json() as {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
  };
  const toolUse = j.content?.find((c) => c.type === "tool_use" && c.name === args.tool.name);
  if (!toolUse?.input) throw new Error("Claude returned no tool_use payload");
  return toolUse.input as T;
}
