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

/** Stage display names as they read in SureContact's "Cre8 Prospect"
 *  pipeline. Matched case-insensitively against `GET /pipelines/{uuid}`. */
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

let stageCache: { fetchedAt: number; byName: Map<string, string> } | null = null;
const STAGE_CACHE_TTL_MS = 5 * 60_000;

interface PipelineStageShape {
  uuid?: string;
  id?: string;
  name?: string;
  label?: string;
}
interface PipelineResponseShape {
  pipeline?: { stages?: PipelineStageShape[]; pipeline_stages?: PipelineStageShape[] };
  data?: { stages?: PipelineStageShape[]; pipeline_stages?: PipelineStageShape[] };
  stages?: PipelineStageShape[];
  pipeline_stages?: PipelineStageShape[];
}

/** Lowercased stage name -> stage_uuid for the Cre8 Prospect pipeline.
 *  Cached in-module for a few minutes — stages are hand-edited in
 *  SureContact, not something that needs live-every-request freshness. */
export async function getStageUuidMap(): Promise<Map<string, string>> {
  if (stageCache && Date.now() - stageCache.fetchedAt < STAGE_CACHE_TTL_MS) {
    return stageCache.byName;
  }
  const result = await call<PipelineResponseShape>(`/pipelines/${CRE8_PROSPECT_PIPELINE_UUID}`);
  if (!result.ok) {
    throw new Error(`Could not load the Cre8 Prospect pipeline: ${result.error}`);
  }
  const pipeline = result.data?.pipeline ?? result.data?.data ?? result.data;
  const stages: PipelineStageShape[] = pipeline?.stages ?? pipeline?.pipeline_stages ?? [];
  const byName = new Map<string, string>();
  for (const s of stages) {
    const name = String(s?.name ?? s?.label ?? "").trim().toLowerCase();
    const uuid = s?.uuid ?? s?.id;
    if (name && uuid) byName.set(name, String(uuid));
  }
  if (byName.size === 0) throw new Error("Cre8 Prospect pipeline returned no stages");
  stageCache = { fetchedAt: Date.now(), byName };
  return byName;
}

export async function resolveStageUuid(stageKey: StageKey): Promise<string> {
  const map = await getStageUuidMap();
  const name = STAGE_NAMES[stageKey];
  const uuid = map.get(name.toLowerCase());
  if (!uuid) throw new Error(`Stage "${name}" not found on the Cre8 Prospect pipeline`);
  return uuid;
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
