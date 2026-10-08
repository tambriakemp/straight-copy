// SureContact Sales Pipeline API client (CRE-286).
//
// Pure fetch-based, no Supabase import here on purpose — this is just the
// SureContact wire format, reusable by any caller (proposal-sign,
// surecart-webhook) without pulling a DB client type into the signature.
// `../_shared/surecontact.ts` is the parallel client for the older
// contacts-upsert endpoint; this one is deals/pipelines.

const SURECONTACT_BASE = "https://api.surecontact.com/api/v1/public";

/** Bree's one sales pipeline, confirmed live 2026-10-06. */
export const CRE8_PROSPECT_PIPELINE_UUID = "457d7961-cc70-4ee3-908b-34cf38a71475";

/** Human-readable stage labels, for log/note text only (CRE-332). Resolving
 *  a stage to its uuid no longer matches on these — see STAGE_ORDER below —
 *  so renaming a stage in SureContact does not require touching this map,
 *  though it's worth keeping in sync for anyone reading the logs. */
export const STAGE_NAMES = {
  new: "New",
  qualifying: "Qualifying",
  demoScheduled: "Demo Scheduled",
  proposalSent: "Proposal Sent",
  inNegotiation: "In Negotiation",
  won: "Won",
  lost: "Lost",
} as const;

export type StageKey = keyof typeof STAGE_NAMES;

/** Forward-progress rank for the active (non-terminal) stages only. Won and
 *  Lost are reached through their own endpoints (`/won`, `/lost`, `/reopen`),
 *  never through a plain stage PUT, so they are deliberately not ranked here. */
const STAGE_RANK: Record<string, number> = {
  new: 0,
  qualifying: 1,
  demoScheduled: 2,
  proposalSent: 3,
  inNegotiation: 4,
};

export function stageRank(stageKey: string): number {
  return STAGE_RANK[stageKey] ?? -1;
}

interface SureContactApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<SureContactApiResult<T>> {
  const apiKey = Deno.env.get("SURECONTACT_API_KEY");
  if (!apiKey) {
    return { ok: false, status: 0, data: null as T, error: "SURECONTACT_API_KEY not configured" };
  }
  try {
    const resp = await fetch(`${SURECONTACT_BASE}${path}`, {
      ...init,
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    let data: unknown = null;
    try {
      data = await resp.json();
    } catch {
      // some responses (e.g. won/lost) may return an empty body
    }
    if (!resp.ok) {
      const msg =
        (data && typeof data === "object" && "message" in (data as Record<string, unknown>)
          ? String((data as Record<string, unknown>).message)
          : `SureContact ${resp.status}`);
      return { ok: false, status: resp.status, data: data as T, error: msg };
    }
    return { ok: true, status: resp.status, data: data as T };
  } catch (e) {
    return { ok: false, status: 0, data: null as T, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Extracts a uuid from an ambiguously-wrapped SureContact response, same
 *  defensive pattern `sync-client-to-surecontact` already uses for contacts. */
function extractUuid(d: unknown): string | null {
  if (!d || typeof d !== "object") return null;
  const obj = d as Record<string, unknown>;
  const deal = (obj.deal ?? undefined) as Record<string, unknown> | undefined;
  const nested = (obj.data ?? undefined) as Record<string, unknown> | undefined;
  const uuid = deal?.uuid ?? deal?.id ?? nested?.uuid ?? nested?.id ?? obj.uuid ?? obj.id;
  return typeof uuid === "string" ? uuid : null;
}

/** Pipeline position (0-based) of each stage this codebase ever resolves to
 *  a uuid. CRE-332 renames "New"->"Lead", "Qualifying"->"Intake", and
 *  inserts a new "Signed" stage after "In Negotiation" — none of that moves
 *  these five stages, so position stays a stable identifier through all of
 *  it where display name would not. Won/Lost are reached through their own
 *  `/won` and `/lost` endpoints and never need a position here. */
const STAGE_ORDER: StageKey[] = [
  "new",
  "qualifying",
  "demoScheduled",
  "proposalSent",
  "inNegotiation",
];

/** Display names accepted at each position, old or new. A name outside this
 *  list at its expected position doesn't fail the lookup — position is the
 *  real key — but it does mean the pipeline was reordered, not just
 *  renamed, which this scheme doesn't cover, so it's logged loudly. */
const STAGE_NAME_ALIASES: Record<StageKey, string[]> = {
  new: ["new", "lead"],
  qualifying: ["qualifying", "intake"],
  demoScheduled: ["demo scheduled"],
  proposalSent: ["proposal sent"],
  inNegotiation: ["in negotiation"],
  won: ["won"],
  lost: ["lost"],
};

interface PipelineStageShape {
  uuid?: string;
  id?: string;
  name?: string;
  label?: string;
  position?: number;
  order?: number;
  sort_order?: number;
  is_won?: boolean;
  is_lost?: boolean;
}
interface PipelineResponseShape {
  pipeline?: { stages?: PipelineStageShape[]; pipeline_stages?: PipelineStageShape[] };
  data?: { stages?: PipelineStageShape[]; pipeline_stages?: PipelineStageShape[] };
  stages?: PipelineStageShape[];
  pipeline_stages?: PipelineStageShape[];
}

function stagePosition(s: PipelineStageShape): number | null {
  const p = s.position ?? s.order ?? s.sort_order;
  return typeof p === "number" ? p : null;
}

let stageCache: { fetchedAt: number; uuidsByPosition: string[] } | null = null;
const STAGE_CACHE_TTL_MS = 5 * 60_000;

/** Ordered list of stage uuids for the Cre8 Prospect pipeline, index-aligned
 *  to STAGE_ORDER. Fetched live and cached a few minutes — stages are
 *  hand-edited in SureContact, not something that needs live-every-request
 *  freshness — but never hardcoded, since the pipeline can change again. */
async function getOrderedStageUuids(): Promise<string[]> {
  if (stageCache && Date.now() - stageCache.fetchedAt < STAGE_CACHE_TTL_MS) {
    return stageCache.uuidsByPosition;
  }
  const result = await call<PipelineResponseShape>(`/pipelines/${CRE8_PROSPECT_PIPELINE_UUID}`);
  if (!result.ok) {
    throw new Error(`Could not load the Cre8 Prospect pipeline: ${result.error}`);
  }
  const pipeline = result.data?.pipeline ?? result.data?.data ?? result.data;
  const stages: PipelineStageShape[] = pipeline?.stages ?? pipeline?.pipeline_stages ?? [];
  if (stages.length < STAGE_ORDER.length) {
    throw new Error(
      `Cre8 Prospect pipeline returned ${stages.length} stage(s), expected at least ${STAGE_ORDER.length}`,
    );
  }

  const haveExplicitPositions = stages.every((s) => stagePosition(s) != null);
  const ordered = haveExplicitPositions
    ? [...stages].sort((a, b) => (stagePosition(a) as number) - (stagePosition(b) as number))
    : stages; // no position field on any stage — trust the API's own array order

  const uuidsByPosition: string[] = [];
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const stage = ordered[i];
    const uuid = stage?.uuid ?? stage?.id;
    if (!uuid) throw new Error(`Cre8 Prospect pipeline stage at position ${i} has no uuid`);
    const expectedKey = STAGE_ORDER[i];
    const name = String(stage?.name ?? stage?.label ?? "").trim().toLowerCase();
    if (name && !STAGE_NAME_ALIASES[expectedKey].includes(name)) {
      console.warn(
        `[surecontact-deals] stage at position ${i} is named "${name}", expected one of ` +
          `${STAGE_NAME_ALIASES[expectedKey].join("/")} for "${expectedKey}" — the pipeline may have been ` +
          `reordered, not just renamed. Using position ${i}'s uuid anyway.`,
      );
    }
    uuidsByPosition.push(String(uuid));
  }
  stageCache = { fetchedAt: Date.now(), uuidsByPosition };
  return uuidsByPosition;
}

export async function resolveStageUuid(stageKey: StageKey): Promise<string> {
  const index = STAGE_ORDER.indexOf(stageKey);
  if (index === -1) {
    throw new Error(
      `Stage "${stageKey}" has no pipeline position mapping (only ${STAGE_ORDER.join(", ")} resolve to a uuid)`,
    );
  }
  const uuids = await getOrderedStageUuids();
  return uuids[index];
}

/** One stage in the full 8-stage Cre8 Prospect pipeline (CRE-332 Phase 6 —
 *  the Pipeline page needs every stage including Won/Lost to bucket every
 *  deal, unlike getOrderedStageUuids above which only covers the five
 *  active stages CRE-286 ever writes to). `isWon`/`isLost` come straight off
 *  the API's own `is_won`/`is_lost` flags (confirmed live via Ara's Oct 7
 *  stage-rename GET, not name-matched) rather than matching "Won"/"Lost" by
 *  name, so a future rename of those two doesn't silently break this. */
export interface LivePipelineStage {
  uuid: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

let fullStageCache: { fetchedAt: number; stages: LivePipelineStage[] } | null = null;

export async function listPipelineStages(): Promise<LivePipelineStage[]> {
  if (fullStageCache && Date.now() - fullStageCache.fetchedAt < STAGE_CACHE_TTL_MS) {
    return fullStageCache.stages;
  }
  const result = await call<PipelineResponseShape>(`/pipelines/${CRE8_PROSPECT_PIPELINE_UUID}`);
  if (!result.ok) {
    throw new Error(`Could not load the Cre8 Prospect pipeline: ${result.error}`);
  }
  const pipeline = result.data?.pipeline ?? result.data?.data ?? result.data;
  const raw: PipelineStageShape[] = pipeline?.stages ?? pipeline?.pipeline_stages ?? [];
  if (!raw.length) throw new Error("Cre8 Prospect pipeline returned no stages");

  const haveExplicitPositions = raw.every((s) => stagePosition(s) != null);
  const ordered = haveExplicitPositions
    ? [...raw].sort((a, b) => (stagePosition(a) as number) - (stagePosition(b) as number))
    : raw;

  const stages: LivePipelineStage[] = ordered.map((s, i) => {
    const uuid = s.uuid ?? s.id;
    if (!uuid) throw new Error(`Cre8 Prospect pipeline stage at position ${i} has no uuid`);
    return {
      uuid: String(uuid),
      name: String(s.name ?? s.label ?? `Stage ${i}`),
      position: stagePosition(s) ?? i,
      isWon: Boolean(s.is_won),
      isLost: Boolean(s.is_lost),
    };
  });
  fullStageCache = { fetchedAt: Date.now(), stages };
  return stages;
}

/** A deal as the Pipeline page needs it — already unwrapped from whatever
 *  envelope SureContact returns, and already converted to cents. Field
 *  names here are a best-effort read of the live deal shape: confirmed
 *  fields are `uuid`/`id` (used by extractUuid above) and `amount` in
 *  dollars (createDeal/updateDealAmount both send `amount` in dollars), and
 *  the list endpoint itself (`GET /deals?pipeline_uuid=`) is the one this
 *  issue's own two-way-sync design section specifies for reconciliation.
 *  Company/contact/timestamp field names are not yet confirmed against a
 *  real response — parsed defensively with fallbacks, and any deal that
 *  can't be matched to a known stage uuid is surfaced via `unmatched`
 *  rather than silently dropped (see pipeline-board/index.ts). */
export interface LiveDeal {
  uuid: string;
  name: string;
  amountCents: number | null;
  stageUuid: string | null;
  companyName: string | null;
  contactName: string | null;
  createdAt: string | null;
  stageUpdatedAt: string | null;
}

interface DealCompanyShape { name?: string; business_name?: string }
interface DealContactShape { name?: string; first_name?: string; last_name?: string }
interface DealShape {
  uuid?: string;
  id?: string;
  name?: string;
  title?: string;
  amount?: number | string | null;
  pipeline_stage_uuid?: string;
  stage_uuid?: string;
  pipeline_stage?: { uuid?: string };
  company?: DealCompanyShape | string;
  companies?: DealCompanyShape[];
  contact?: DealContactShape;
  contacts?: DealContactShape[];
  created_at?: string;
  stage_updated_at?: string;
  updated_at?: string;
}
interface DealsListResponseShape {
  deals?: DealShape[];
  data?: { deals?: DealShape[] } | DealShape[];
}

function contactDisplayName(c?: DealContactShape): string | null {
  if (!c) return null;
  if (c.name) return c.name;
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || null;
}

export async function listPipelineDeals(): Promise<LiveDeal[]> {
  const result = await call<DealsListResponseShape | DealShape[]>(
    `/deals?pipeline_uuid=${CRE8_PROSPECT_PIPELINE_UUID}`,
  );
  if (!result.ok) throw new Error(`Could not load Cre8 Prospect deals: ${result.error}`);
  const raw = result.data;
  const list: DealShape[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.deals)
      ? raw.deals
      : Array.isArray(raw?.data)
        ? (raw.data as DealShape[])
        : Array.isArray((raw?.data as { deals?: DealShape[] } | undefined)?.deals)
          ? (raw!.data as { deals: DealShape[] }).deals
          : [];

  return list
    .map((d): LiveDeal => {
      const company = d.company;
      const companyName =
        typeof company === "string"
          ? company
          : company?.name ?? company?.business_name ?? d.companies?.[0]?.name ?? d.companies?.[0]?.business_name ?? null;
      const amountNum = d.amount == null ? null : Number(d.amount);
      return {
        uuid: String(d.uuid ?? d.id ?? ""),
        name: String(d.name ?? d.title ?? "Untitled deal"),
        amountCents: amountNum != null && Number.isFinite(amountNum) ? Math.round(amountNum * 100) : null,
        stageUuid: d.pipeline_stage_uuid ?? d.stage_uuid ?? d.pipeline_stage?.uuid ?? null,
        companyName,
        contactName: contactDisplayName(d.contact) ?? contactDisplayName(d.contacts?.[0]),
        createdAt: d.created_at ?? null,
        stageUpdatedAt: d.stage_updated_at ?? d.updated_at ?? null,
      };
    })
    .filter((d) => d.uuid);
}

export interface CreateDealInput {
  name: string;
  stageKey: StageKey;
  amountCents?: number | null;
  contactUuids?: string[];
  companyUuids?: string[];
  sourceId?: string | null;
}

/** Creates a deal and returns its uuid. */
export async function createDeal(input: CreateDealInput): Promise<string> {
  const stageUuid = await resolveStageUuid(input.stageKey);
  const body: Record<string, unknown> = {
    name: input.name.slice(0, 255),
    pipeline_stage_uuid: stageUuid,
    source: "cre8visions_crm",
  };
  if (input.amountCents != null) body.amount = Math.round(input.amountCents) / 100;
  if (input.contactUuids?.length) body.contact_uuids = input.contactUuids;
  if (input.companyUuids?.length) body.company_uuids = input.companyUuids;
  if (input.sourceId) body.source_id = input.sourceId;

  const result = await call("/deals", { method: "POST", body: JSON.stringify(body) });
  if (!result.ok) throw new Error(`Create deal failed: ${result.error}`);
  const uuid = extractUuid(result.data);
  if (!uuid) throw new Error("Create deal succeeded but the response carried no uuid");
  return uuid;
}

/** Updates a deal's title and amount in place — does not touch its stage. */
export async function updateDealAmount(dealUuid: string, name: string, amountCents: number | null): Promise<void> {
  const body: Record<string, unknown> = { name: name.slice(0, 255) };
  if (amountCents != null) body.amount = Math.round(amountCents) / 100;
  const result = await call(`/deals/${dealUuid}`, { method: "PUT", body: JSON.stringify(body) });
  if (!result.ok) throw new Error(`Update deal failed: ${result.error}`);
}

export async function moveDealStage(dealUuid: string, stageKey: StageKey): Promise<void> {
  const stageUuid = await resolveStageUuid(stageKey);
  const result = await call(`/deals/${dealUuid}/stage`, {
    method: "PUT",
    body: JSON.stringify({ stage_uuid: stageUuid }),
  });
  if (!result.ok) throw new Error(`Move deal stage failed: ${result.error}`);
}

/** The one path allowed to move a deal backwards — out of Lost, into an
 *  active stage, when the proposal it was lost on comes back to life. */
export async function reopenDeal(dealUuid: string, stageKey: StageKey): Promise<void> {
  const stageUuid = await resolveStageUuid(stageKey);
  const result = await call(`/deals/${dealUuid}/reopen`, {
    method: "POST",
    body: JSON.stringify({ stage_uuid: stageUuid }),
  });
  if (!result.ok) throw new Error(`Reopen deal failed: ${result.error}`);
}

export async function markDealWon(dealUuid: string): Promise<void> {
  const result = await call(`/deals/${dealUuid}/won`, { method: "POST" });
  if (!result.ok) throw new Error(`Mark deal won failed: ${result.error}`);
}

export async function markDealLost(dealUuid: string, lossReason: string): Promise<void> {
  const result = await call(`/deals/${dealUuid}/lost`, {
    method: "POST",
    body: JSON.stringify({ loss_reason: lossReason.slice(0, 2000) }),
  });
  if (!result.ok) throw new Error(`Mark deal lost failed: ${result.error}`);
}

export async function attachContacts(dealUuid: string, contactUuids: string[]): Promise<void> {
  if (!contactUuids.length) return;
  const result = await call(`/deals/${dealUuid}/contacts/attach`, {
    method: "POST",
    body: JSON.stringify({ contact_uuids: contactUuids }),
  });
  if (!result.ok) throw new Error(`Attach contact failed: ${result.error}`);
}

export async function attachCompanies(dealUuid: string, companyUuids: string[]): Promise<void> {
  if (!companyUuids.length) return;
  const result = await call(`/deals/${dealUuid}/companies/attach`, {
    method: "POST",
    body: JSON.stringify({ company_uuids: companyUuids }),
  });
  if (!result.ok) throw new Error(`Attach company failed: ${result.error}`);
}

export async function addDealNote(dealUuid: string, content: string, title?: string): Promise<void> {
  const body: Record<string, unknown> = { content: content.slice(0, 10000) };
  if (title) body.title = title.slice(0, 255);
  const result = await call(`/deals/${dealUuid}/notes`, { method: "POST", body: JSON.stringify(body) });
  if (!result.ok) throw new Error(`Add deal note failed: ${result.error}`);
}
