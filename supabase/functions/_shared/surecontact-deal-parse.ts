// Pure parsing of a SureContact deal/deals-list response into the shape the
// Pipeline page needs (CRE-332 Phase 6). No network call and no `Deno`
// reference in this file on purpose, so it can be unit tested without the
// Supabase edge runtime — the live fetch lives in surecontact-deals.ts, which
// re-exports everything here for its own callers (pipeline-board/index.ts).

/** A deal as the Pipeline page needs it — already unwrapped from whatever
 *  envelope SureContact returns, and already converted to cents. Field
 *  names confirmed against a real `GET /deals?pipeline_uuid=` response
 *  (Ara, Oct 7 2026): `amount` is a numeric string ("5000.00"), the stage
 *  reference is a nested `stage.uuid` (there is no flat `stage_uuid` /
 *  `pipeline_stage_uuid`), and `company`/`contact` are plural arrays
 *  (`companies[]` / `contacts[]`) with no singular form. The flat/singular
 *  fallbacks below are kept defensively in case the API varies by deal
 *  state, but `stage.uuid` and the plural arrays are the confirmed shape.
 *  Any deal that can't be matched to a known stage uuid is surfaced via
 *  `unmatched` rather than silently dropped (see pipeline-board/index.ts). */
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
export interface DealShape {
  uuid?: string;
  id?: string;
  name?: string;
  title?: string;
  amount?: number | string | null;
  stage?: { uuid?: string };
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
interface DealsListMeta {
  current_page?: number;
  last_page?: number;
}
export interface DealsListResponseShape {
  deals?: DealShape[];
  data?: { deals?: DealShape[] } | DealShape[];
  meta?: DealsListMeta;
}

function contactDisplayName(c?: DealContactShape): string | null {
  if (!c) return null;
  if (c.name) return c.name;
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || null;
}

/** Exported for unit testing against the confirmed envelope shape
 *  (`{ success, message, data: [...], meta }`) without a live fetch. */
export function extractDealsPage(raw: DealsListResponseShape | DealShape[] | null): { list: DealShape[]; meta?: DealsListMeta } {
  if (Array.isArray(raw)) return { list: raw };
  if (Array.isArray(raw?.deals)) return { list: raw.deals, meta: raw.meta };
  if (Array.isArray(raw?.data)) return { list: raw.data as DealShape[], meta: raw.meta };
  const nestedDeals = (raw?.data as { deals?: DealShape[] } | undefined)?.deals;
  if (Array.isArray(nestedDeals)) return { list: nestedDeals, meta: raw?.meta };
  return { list: [] };
}

/** Exported for unit testing against a real deal object (Ara, Oct 7 2026)
 *  without a live fetch. */
export function toLiveDeal(d: DealShape): LiveDeal {
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
    stageUuid: d.stage?.uuid ?? d.pipeline_stage_uuid ?? d.stage_uuid ?? d.pipeline_stage?.uuid ?? null,
    companyName,
    contactName: contactDisplayName(d.contact) ?? contactDisplayName(d.contacts?.[0]),
    createdAt: d.created_at ?? null,
    stageUpdatedAt: d.stage_updated_at ?? d.updated_at ?? null,
  };
}
