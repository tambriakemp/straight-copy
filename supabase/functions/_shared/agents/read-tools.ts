// The tools that let an agent look things up.
//
// Before these existed, whatever the gatherer pre-fetched was an agent's entire
// world — so when something was missing, its only physical move was to ask the
// owner. That is what made the agents feel like forms rather than colleagues.
//
// Four tools, not fifty. A large hand-written tool surface would bloat the
// cached tool block, drift from the schema, and still miss the one thing the
// agent wanted. Generic tools over a hard allowlist reach everything with a
// fixed, cacheable schema.
//
// Every safety property is enforced here and in table-access.ts, never in the
// prompt: an instruction is a suggestion, and these run with the service role.
import {
  clampLimit, FILTER_OPS, isFilterable, isReadable, projectionFor,
  READABLE, searchableEntities, tableForEntity, type FilterOp,
} from "./table-access.ts";

/** Bytes one tool result may occupy before rows are dropped off the end. */
export const MAX_RESULT_BYTES = 8_000;
/** Bytes all tool results in one turn may occupy before reads are refused. */
export const MAX_TURN_BYTES = 120_000;
/** Characters of a long field returned in a list. */
const LIST_FIELD_CHARS = 600;
/** Characters of a long field returned by get_record. */
const READ_FIELD_CHARS = 12_000;

export interface ToolOutcome {
  ok: boolean;
  /** Serialized for the model. Always compact JSON or a short sentence. */
  content: string;
  /** Row count, when the call returned rows. Used for the progress line. */
  count?: number;
  note?: string;
}

const compact = (v: unknown) => JSON.stringify(v);

/** Trim long text fields so one fat row cannot eat a whole turn's budget. */
function trimFields(
  rows: Array<Record<string, unknown>>,
  table: string,
  chars: number,
): Array<Record<string, unknown>> {
  const long = READABLE[table]?.long ?? [];
  if (!long.length) return rows;
  return rows.map((row) => {
    const out = { ...row };
    for (const field of long) {
      const value = out[field];
      if (typeof value === "string" && value.length > chars) {
        out[field] = `${value.slice(0, chars)}…[truncated — use get_record for the full text]`;
      }
    }
    return out;
  });
}

/**
 * Drop rows off the end until the payload fits, and say so.
 *
 * Saying so matters as much as the trimming: a silently shortened list reads as
 * a complete one, and the agent draws a conclusion from data it did not get.
 */
function fitToBudget(rows: unknown[], extra: Record<string, unknown>): string {
  let kept = rows;
  let body = compact({ ...extra, returned: kept.length, rows: kept });
  while (kept.length > 1 && body.length > MAX_RESULT_BYTES) {
    kept = kept.slice(0, Math.max(1, Math.floor(kept.length * 0.6)));
    body = compact({
      ...extra,
      returned: kept.length,
      truncated: true,
      hint: "Result was too large. Narrow it with filters or fewer columns.",
      rows: kept,
    });
  }
  return body;
}

/**
 * The slice of the Supabase client these tools use.
 *
 * Declared structurally rather than importing SupabaseClient, because a Deno
 * `npm:` specifier does not resolve under the app tsconfig and this module is
 * reached by the frontend test suite — the same constraint rules.ts documents.
 */
export interface DbResult {
  data: Array<Record<string, unknown>> | null;
  count?: number | null;
  error: { message: string } | null;
}

/**
 * A PostgREST query builder: every filter returns the builder, and the builder
 * itself is awaitable. Declared rather than imported for the reason above.
 */
export interface QueryBuilder extends PromiseLike<DbResult> {
  select(columns: string, options?: Record<string, unknown>): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  or(filter: string): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  not(column: string, op: string, value: unknown): QueryBuilder;
  filter(column: string, op: string, value: unknown): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(n: number): QueryBuilder;
}

export interface QueryClient {
  from(table: string): QueryBuilder;
}

export interface ReadToolContext {
  sb: QueryClient;
  /** Running total of result bytes this turn. Mutated by the executors. */
  spent: { bytes: number };
}

/** The tool definitions handed to the model. Byte-stable, so they cache. */
export function readToolDefinitions(): Array<Record<string, unknown>> {
  const entities = searchableEntities();
  const tables = Object.keys(READABLE).sort();

  return [
    {
      name: "search",
      description:
        "Find records by name or text. This is how you resolve something the owner mentioned — a client, " +
        "a project, a proposal — into an id you can then read. Use it before asking who or what someone meant.",
      input_schema: {
        type: "object",
        properties: {
          entity: { type: "string", enum: entities, description: "What kind of thing to look for." },
          q: { type: "string", description: "Text to match, case-insensitive and partial." },
          limit: { type: "integer", description: "Rows to return. Default 10." },
        },
        required: ["entity", "q"],
        additionalProperties: false,
      },
    },
    {
      name: "query",
      description:
        "List records matching conditions, or count them. Use this for questions like " +
        "'which invoices are unpaid', 'what tasks are overdue on this project', " +
        "'how many proposals went out last month'.",
      input_schema: {
        type: "object",
        properties: {
          table: { type: "string", enum: tables },
          filters: {
            type: "array",
            description: "Conditions, ANDed together.",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                op: { type: "string", enum: FILTER_OPS },
                value: { description: "Omit for is_null and not_null. An array for in." },
              },
              required: ["column", "op"],
              additionalProperties: false,
            },
          },
          select: {
            type: "array",
            items: { type: "string" },
            description: "Columns to return. Omit for all readable columns.",
          },
          order: { type: "string", description: "Column to sort by, newest or largest first." },
          limit: { type: "integer", description: "Rows to return. Default 20." },
          count_only: { type: "boolean", description: "Return just the number of matches." },
        },
        required: ["table"],
        additionalProperties: false,
      },
    },
    {
      name: "get_record",
      description:
        "Read one record in full, including long text that lists truncate — a proposal's content, " +
        "a task's description and acceptance criteria, a wiki page. Read the thing before judging it.",
      input_schema: {
        type: "object",
        properties: {
          table: { type: "string", enum: tables },
          id: { type: "string" },
        },
        required: ["table", "id"],
        additionalProperties: false,
      },
    },
    {
      name: "read_proposal",
      description:
        "Read a proposal you are writing or revising. Without `heading` you get the section list — " +
        "headings and lengths only, cheap. With `heading` you get that ONE section in full. " +
        "Always read a section before rewriting it: revising from memory of what you wrote earlier " +
        "is where invented numbers come from. Never pull the whole document back when you only need one part.",
      input_schema: {
        type: "object",
        properties: {
          proposal_id: { type: "string" },
          heading: {
            type: "string",
            description: "Exact or partial section heading. Omit for the section list.",
          },
        },
        required: ["proposal_id"],
        additionalProperties: false,
      },
    },
  ];
}

/** Run one read tool. Never throws — a failure comes back as a tool result. */
export async function executeReadTool(
  ctx: ReadToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (ctx.spent.bytes > MAX_TURN_BYTES) {
    return {
      ok: false,
      content: "You have read enough for one turn. Answer with what you have.",
      note: "read budget spent",
    };
  }

  try {
    const outcome = await dispatch(ctx, name, input);
    ctx.spent.bytes += outcome.content.length;
    return outcome;
  } catch (e) {
    return { ok: false, content: `That lookup failed: ${String((e as Error).message || e)}` };
  }
}

async function dispatch(
  ctx: ReadToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (name === "search") return await runSearch(ctx, input);
  if (name === "query") return await runQuery(ctx, input);
  if (name === "get_record") return await runGetRecord(ctx, input);
  if (name === "read_proposal") return await runReadProposal(ctx, input);
  return { ok: false, content: `No such tool: ${name}` };
}

async function runSearch(
  ctx: ReadToolContext,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const entity = String(input.entity ?? "");
  const table = tableForEntity(entity);
  if (!table) {
    return { ok: false, content: `Cannot search "${entity}". Try one of: ${searchableEntities().join(", ")}` };
  }
  const q = String(input.q ?? "").trim();
  if (!q) return { ok: false, content: "Search needs something to look for." };

  const access = READABLE[table];
  const limit = clampLimit(table, Number(input.limit) || 10);
  const columns = projectionFor(table);

  // Matched in the database rather than by fetching and filtering: a LIKE per
  // searchable column, ORed, with the term escaped so a comma or a paren in a
  // client's name cannot alter the filter's structure.
  const safe = q.replace(/[%,()\\]/g, " ").trim();
  const clause = (access.searchable ?? [])
    .map((c) => `${c}.ilike.%${safe}%`)
    .join(",");
  if (!clause) return { ok: false, content: `Nothing on ${table} is searchable.` };

  const { data, error } = await ctx.sb
    .from(table)
    .select(columns.join(","))
    .or(clause)
    .limit(limit);
  if (error) return { ok: false, content: `Search failed: ${error.message}` };

  const rows = trimFields(data ?? [], table, LIST_FIELD_CHARS);
  return {
    ok: true,
    count: rows.length,
    content: fitToBudget(rows, { entity, table, query: q }),
  };
}

async function runQuery(
  ctx: ReadToolContext,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const table = String(input.table ?? "");
  if (!isReadable(table)) {
    return { ok: false, content: `"${table}" is not a table you can read.` };
  }

  const columns = projectionFor(table, input.select as string[] | undefined);
  const limit = clampLimit(table, Number(input.limit) || undefined);
  const countOnly = input.count_only === true;

  let q = ctx.sb.from(table).select(
    countOnly ? "id" : columns.join(","),
    countOnly ? { count: "exact", head: true } : undefined,
  );

  const filters = Array.isArray(input.filters) ? input.filters : [];
  for (const raw of filters as Array<Record<string, unknown>>) {
    const column = String(raw.column ?? "");
    const op = String(raw.op ?? "") as FilterOp;
    if (!isFilterable(table, column)) {
      return { ok: false, content: `Cannot filter ${table} on "${column}".` };
    }
    if (!FILTER_OPS.includes(op)) {
      return { ok: false, content: `"${op}" is not a filter I can apply.` };
    }
    if (op === "is_null") { q = q.is(column, null); continue; }
    if (op === "not_null") { q = q.not(column, "is", null); continue; }
    if (op === "in") {
      const list = Array.isArray(raw.value) ? raw.value : [raw.value];
      q = q.in(column, list);
      continue;
    }
    // Value goes through the client's parameter binding, never string-built.
    q = q.filter(column, op, raw.value);
  }

  if (input.order && isFilterable(table, String(input.order))) {
    q = q.order(String(input.order), { ascending: false });
  }

  if (countOnly) {
    const { count, error } = await q;
    if (error) return { ok: false, content: `Query failed: ${error.message}` };
    return { ok: true, count: count ?? 0, content: compact({ table, matches: count ?? 0 }) };
  }

  const { data, error } = await q.limit(limit);
  if (error) return { ok: false, content: `Query failed: ${error.message}` };

  const rows = trimFields(data ?? [], table, LIST_FIELD_CHARS);
  return { ok: true, count: rows.length, content: fitToBudget(rows, { table }) };
}

async function runGetRecord(
  ctx: ReadToolContext,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const table = String(input.table ?? "");
  const id = String(input.id ?? "");
  if (!isReadable(table)) {
    return { ok: false, content: `"${table}" is not a table you can read.` };
  }
  if (!id) return { ok: false, content: "get_record needs an id." };

  const columns = projectionFor(table);
  const { data, error } = await ctx.sb
    .from(table)
    .select(columns.join(","))
    .eq("id", id)
    .limit(1);
  if (error) return { ok: false, content: `Read failed: ${error.message}` };

  const row = (data ?? [])[0];
  if (!row) return { ok: false, content: `No ${table} with id ${id}.` };

  const [trimmed] = trimFields([row], table, READ_FIELD_CHARS);
  const body = compact({ table, record: trimmed });
  return {
    ok: true,
    content: body.length > MAX_RESULT_BYTES * 3
      ? compact({
        table,
        truncated: true,
        hint: "This record is very large; ask for the part you need.",
        record: Object.fromEntries(
          Object.entries(trimmed).map(([k, v]) => [
            k,
            typeof v === "string" && v.length > 4000 ? `${v.slice(0, 4000)}…` : v,
          ]),
        ),
      })
      : body,
  };
}

/**
 * Read a proposal, one section at a time.
 *
 * The Menovia retainer runs to about 24,000 characters. Dragging all of it
 * back into context to change a number would cost ~6,000 tokens a turn, and a
 * ten-turn revision session would spend sixty thousand tokens re-reading
 * itself — while making the model pick a needle out of a haystack it has to
 * re-read each time. So the default is the section list, and a heading gets
 * exactly one section.
 */
async function runReadProposal(
  ctx: ReadToolContext,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const id = String(input.proposal_id ?? "").trim();
  if (!id) return { ok: false, content: "read_proposal needs a proposal_id." };

  const res = await ctx.sb.from("client_proposals")
    .select("id, title, status, content, content_version")
    .eq("id", id).limit(1);
  if (res.error) return { ok: false, content: `That lookup failed: ${res.error.message}` };

  const row = (res.data ?? [])[0] as
    | { id: string; title: string; status: string; content: unknown; content_version: number }
    | undefined;
  if (!row) return { ok: false, content: `No proposal with id ${id}.` };

  const content = (row.content ?? {}) as {
    kind?: string;
    sections?: Array<{ heading?: string; summary?: string; body?: string }>;
  };
  const sections = (content.sections ?? []).filter(
    (s) => (s.body ?? "").trim().length > 0,
  );

  const wanted = String(input.heading ?? "").trim().toLowerCase();
  if (!wanted) {
    // The list. Headings and sizes, so the agent can work out which section a
    // vague instruction like "the pricing" is pointing at without reading any
    // of them.
    const list = sections.map((s, i) => ({
      position: i + 1,
      heading: (s.heading ?? "").trim() || "Untitled section",
      summary: (s.summary ?? "").trim() || undefined,
      chars: (s.body ?? "").trim().length,
    }));
    return {
      ok: true,
      content: JSON.stringify({
        proposal_id: row.id,
        title: row.title,
        status: row.status,
        kind: content.kind,
        version: row.content_version,
        sections: list,
        note: list.length
          ? "Call read_proposal again with a heading to read one section in full."
          : "Nothing written yet.",
      }),
    };
  }

  const exact = sections.findIndex(
    (s) => (s.heading ?? "").trim().toLowerCase() === wanted,
  );
  const at = exact >= 0
    ? exact
    : sections.findIndex((s) => (s.heading ?? "").toLowerCase().includes(wanted));

  if (at < 0) {
    return {
      ok: false,
      content: `No section matching "${input.heading}". The sections are: ` +
        sections.map((s) => (s.heading ?? "").trim()).filter(Boolean).join("; "),
    };
  }

  const s = sections[at];
  return {
    ok: true,
    content: JSON.stringify({
      proposal_id: row.id,
      version: row.content_version,
      position: at + 1,
      heading: (s.heading ?? "").trim(),
      summary: (s.summary ?? "").trim() || undefined,
      body: (s.body ?? "").trim(),
    }),
  };
}
