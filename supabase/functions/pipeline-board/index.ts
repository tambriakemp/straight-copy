// Pipeline page data (CRE-332 Phase 6). Read-only in this cut: fetches the
// live Cre8 Prospect pipeline + deals from SureContact, buckets each deal
// into the board columns Bree approved (Oct 7, 2026), and enriches a deal
// with its linked client/project when CRE-286 created it from this site.
//
// No mirror table, no webhook receiver, no drag-to-move write path yet —
// those are the two-way sync half of the original design and a separate,
// riskier follow-up (new schema + a signed webhook). This function only
// reads, so a bad response from SureContact can't put anything incorrect
// back into the live deal.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { listPipelineStages, listPipelineDeals, CRE8_PROSPECT_PIPELINE_UUID, type LiveDeal, type LivePipelineStage } from "../_shared/surecontact-deals.ts";
import { VISIBLE_BOARD_COLUMNS, columnForPosition, isRevisedFlag, type BoardColumnKey } from "../_shared/pipeline-stage-map.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
  const sb = serviceClient();
  const { data: admin } = await sb.from("admin_users").select("id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return { userId: data.user.id };
}

interface BoardCard {
  dealUuid: string;
  name: string;
  company: string;
  amountCents: number | null;
  column: BoardColumnKey;
  stageName: string;
  revised: boolean;
  daysInStage: number | null;
  clientId: string | null;
  clientProjectId: string | null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  try {
    const [stages, deals]: [LivePipelineStage[], LiveDeal[]] = await Promise.all([
      listPipelineStages(),
      listPipelineDeals(),
    ]);
    const stageByUuid = new Map(stages.map((s) => [s.uuid, s]));

    const sb = serviceClient();
    const dealUuids = deals.map((d) => d.uuid);
    const { data: linkedProjects, error: linkErr } = dealUuids.length
      ? await sb
          .from("client_projects")
          .select("id, client_id, surecontact_deal_id, clients(business_name, contact_name)")
          .in("surecontact_deal_id", dealUuids)
      : { data: [] as never[], error: null };
    if (linkErr) throw new Error(`client_projects lookup failed: ${linkErr.message}`);
    const projectByDeal = new Map(
      (linkedProjects ?? []).map((p: Record<string, unknown>) => [p.surecontact_deal_id as string, p]),
    );

    const cards: BoardCard[] = [];
    let unmatchedCount = 0;

    for (const deal of deals) {
      const stage = deal.stageUuid ? stageByUuid.get(deal.stageUuid) : undefined;
      if (!stage) {
        unmatchedCount++;
        continue;
      }
      const column: BoardColumnKey | null = stage.isWon ? "won" : stage.isLost ? "lost" : columnForPosition(stage.position);
      if (!column) {
        unmatchedCount++;
        continue;
      }
      const project = projectByDeal.get(deal.uuid) as
        | { id: string; client_id: string; clients?: { business_name?: string | null; contact_name?: string | null } }
        | undefined;
      const company =
        deal.companyName ??
        project?.clients?.business_name ??
        project?.clients?.contact_name ??
        deal.contactName ??
        "—";
      cards.push({
        dealUuid: deal.uuid,
        name: deal.name,
        company,
        amountCents: deal.amountCents,
        column,
        stageName: stage.name,
        revised: column === "proposalSent" && isRevisedFlag(stage.position),
        daysInStage: daysSince(deal.stageUpdatedAt ?? deal.createdAt),
        clientId: project?.client_id ?? null,
        clientProjectId: project?.id ?? null,
      });
    }

    const columns = VISIBLE_BOARD_COLUMNS.map((c) => {
      const inColumn = cards.filter((card) => card.column === c.key);
      return {
        key: c.key,
        label: c.label,
        count: inColumn.length,
        totalCents: inColumn.reduce((sum, card) => sum + (card.amountCents ?? 0), 0),
        deals: inColumn,
      };
    });
    const lostCards = cards.filter((c) => c.column === "lost");

    return json({
      pipelineUuid: CRE8_PROSPECT_PIPELINE_UUID,
      syncedAt: new Date().toISOString(),
      columns,
      lost: {
        count: lostCards.length,
        totalCents: lostCards.reduce((sum, c) => sum + (c.amountCents ?? 0), 0),
        deals: lostCards,
      },
      unmatchedCount,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[pipeline-board] failed:", detail);
    return json({ error: detail }, 502);
  }
});
