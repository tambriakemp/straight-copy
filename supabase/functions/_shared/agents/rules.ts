// Standing rules — the things that are always true, so nobody has to say them
// again.
//
// Without these the agent asked about governing law, warranty length and
// revision policy on every single proposal, because from its point of view it
// had never been told. Rules are loaded fresh each run and rendered into the
// prompt as plain instruction text.
//
// They deliberately sit AFTER the cached system prefix in the message, not
// inside it: a rule edited in the UI has to take effect on the next run, and
// anything in the cached prefix would go stale or blow the cache on every edit.
// Deliberately no supabase-js import. Every shared module the frontend tests
// reach is import-free, because a Deno `npm:` specifier does not resolve under
// the app's tsconfig. The three methods loadRules actually calls are described
// here instead, which also states its dependency more precisely than the full
// client type would.
interface RulesQuery {
  select(columns: string): RulesQuery;
  eq(column: string, value: unknown): RulesQuery;
  or(filter: string): RulesQuery;
  order(
    column: string,
    opts: { ascending: boolean },
  ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

export interface RulesClient {
  from(table: string): RulesQuery;
}

export interface AgentRule {
  id: string;
  label: string;
  body: string;
  category: string;
  order_index: number;
}

/** Rules for one agent: the global ones plus its own, in order. */
export async function loadRules(
  sb: RulesClient,
  agentId: string,
): Promise<AgentRule[]> {
  const { data, error } = await sb
    .from("agent_rules")
    .select("id, label, body, category, order_index, scope, agent_id")
    .eq("enabled", true)
    .or(`scope.eq.all,agent_id.eq.${agentId}`)
    .order("order_index", { ascending: true });

  if (error) {
    // A missing rules table must not take the agent down — it just means it
    // runs without standing rules, exactly as it did before they existed.
    console.warn("[rules] load failed", error.message);
    return [];
  }
  return (data ?? []) as AgentRule[];
}

/** Render rules as the instruction block that goes into the user message. */
export function renderRules(rules: AgentRule[]): string {
  if (!rules.length) return "";
  const grouped = new Map<string, AgentRule[]>();
  for (const r of rules) {
    const list = grouped.get(r.category) ?? [];
    list.push(r);
    grouped.set(r.category, list);
  }
  const body = [...grouped.entries()]
    .map(([category, items]) =>
      `${category.toUpperCase()}\n` +
      items.map((r) => `  * ${r.label}: ${r.body}`).join("\n"))
    .join("\n\n");

  return `## Standing rules

These are settled. Follow them without restating them as questions, and never
ask about anything they already answer.

${body}`;
}
