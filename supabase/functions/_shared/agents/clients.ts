// The client directory, given to every agent on every turn.
//
// An agent that asks "what is the client's company name?" when the answer is a
// row in the CRM is worse than useless — it makes the person do the lookup the
// software exists to do. So rather than each agent deciding whether it needs
// client data, every agent gets the whole roster: who they are, how to reach
// them, and what projects they have.
//
// Deliberately compact. This rides along on every message, so it carries the
// fields an agent would otherwise ask about and nothing else — no intake blobs,
// no brand-kit JSON, no notes. Anything deeper is a lookup the agent can
// request, not something to pay for on every turn.
import type { RulesClient } from "./rules.ts";

export interface DirectoryProject {
  id: string;
  name: string | null;
  type: string | null;
  status: string | null;
}

export interface DirectoryClient {
  id: string;
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  pipeline_stage: string | null;
  tier: string | null;
  in_surecontact: boolean;
  projects: DirectoryProject[];
}

/** Cap: past this the directory costs more than it saves on every turn. */
const MAX_CLIENTS = 150;

export async function clientDirectory(sb: RulesClient): Promise<DirectoryClient[]> {
  const [clientsRes, projectsRes] = await Promise.all([
    sb.from("clients")
      .select(
        "id, business_name, contact_name, contact_email, contact_phone, " +
          "pipeline_stage, tier, surecontact_contact_uuid, archived",
      )
      .eq("archived", false)
      .order("business_name", { ascending: true }),
    sb.from("client_projects")
      .select("id, client_id, name, type, status")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsRes.error) {
    console.warn("[clients] directory load failed", clientsRes.error.message);
    return [];
  }

  const byClient = new Map<string, DirectoryProject[]>();
  for (const p of (projectsRes.data ?? []) as Array<Record<string, string | null>>) {
    const cid = p.client_id as string;
    if (!cid) continue;
    const list = byClient.get(cid) ?? [];
    list.push({ id: p.id as string, name: p.name, type: p.type, status: p.status });
    byClient.set(cid, list);
  }

  return ((clientsRes.data ?? []) as Array<Record<string, unknown>>)
    .slice(0, MAX_CLIENTS)
    .map((c) => ({
      id: c.id as string,
      company: (c.business_name as string) ?? null,
      contact_name: (c.contact_name as string) ?? null,
      contact_email: (c.contact_email as string) ?? null,
      contact_phone: (c.contact_phone as string) ?? null,
      pipeline_stage: (c.pipeline_stage as string) ?? null,
      tier: (c.tier as string) ?? null,
      in_surecontact: !!c.surecontact_contact_uuid,
      projects: byClient.get(c.id as string) ?? [],
    }));
}

/**
 * How the directory is described to the model.
 *
 * The instruction matters as much as the data. Given a roster with no framing,
 * an agent will still ask for a "full legal entity name" rather than use the
 * company name it already has — so the rule about what to do when a field is
 * genuinely absent is stated explicitly.
 */
export function renderDirectory(clients: DirectoryClient[]): string {
  if (!clients.length) return "";
  return `## Clients

Every client in the CRM, with their contact details and projects. When a client
or company is named to you, match it against this list — by company name,
contact name, or email — and use what is here.

Do not ask for anything this list already contains. The company name IS the
business name; the signer IS the named contact unless you are told otherwise.
If a detail genuinely is not here, either proceed without it and say which
placeholder you used, or ask for that one field — never re-ask for the ones you
were given.

If a name matches more than one client, ask which, as a choice between them.

${JSON.stringify(clients, null, 2)}`;
}

/**
 * The roster as an index rather than a data dump.
 *
 * `renderDirectory` pretty-prints every field of every client on every single
 * call — 40 to 80KB, after the only cache breakpoint, re-billed at full rate
 * every turn for every agent. It was the largest fixed cost in the system.
 *
 * An index is enough for the job that actually matters: resolving a name
 * someone typed ("Menovia") to an id, without a round trip. Everything else —
 * email, phone, projects, stage history — is one lookup away, and only paid for
 * when it is wanted.
 */
export function renderClientIndex(clients: DirectoryClient[]): string {
  if (!clients.length) return "";
  const lines = clients.map((c) => {
    const bits = [
      c.company || c.contact_name || "Untitled",
      c.contact_name && c.company ? c.contact_name : null,
      c.pipeline_stage,
      c.projects.length ? `${c.projects.length} project${c.projects.length === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return `${c.id}  ${bits.join(" · ")}`;
  });

  return `## Clients

Every client, as id and name. When a client or company is named to you, match it
here — by company name or contact name — and use that id to look up whatever
else you need. Do not ask the owner for a detail you can fetch.

If a name matches more than one row, ask which, as a choice between them.

${lines.join("\n")}`;
}
