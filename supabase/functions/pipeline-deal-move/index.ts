// Pipeline board write path (CRE-332 Phase 6.2). Moves a real SureContact
// deal when a card is dragged on the admin Pipeline board — SureContact
// stays the source of truth, this never writes anywhere but the live deal
// (plus, best-effort, the client_projects mirror column CRE-286 already
// keeps). The board itself has no cache to invalidate: pipeline-board reads
// live on every load, so the caller just re-fetches it after a successful
// move.
//
// Column -> SureContact action:
//   lead / intake / proposalSent / signed  -> moveDealStage (or reopenDeal,
//     when the deal is coming back out of Lost — the one backward move
//     SureContact's API allows).
//   won   -> markDealWon. There is no "un-win" endpoint, so a card already
//     in Won is not draggable on the board (enforced client-side).
//   lost  -> markDealLost, with the reason the board prompted for.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  markDealLost,
  markDealWon,
  moveDealStage,
  reopenDeal,
  addDealNote,
  type StageKey,
} from "../_shared/surecontact-deals.ts";
import { type BoardColumnKey, columnLabel } from "../_shared/pipeline-stage-map.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

// Only the active-stage columns resolve to a plain stage move. Won/Lost go
// through their own endpoints and are handled separately below.
const ACTIVE_COLUMN_STAGE: Partial<Record<BoardColumnKey, StageKey>> = {
  lead: "new",
  intake: "qualifying",
  proposalSent: "proposalSent",
  signed: "signed",
};

const nowCT = () => new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CT";

interface MoveRequest {
  dealUuid: string;
  toColumn: BoardColumnKey;
  reopen?: boolean;
  lossReason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  let body: MoveRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { dealUuid, toColumn, reopen, lossReason } = body;
  if (!dealUuid || typeof dealUuid !== "string") return json({ error: "dealUuid is required" }, 400);

  try {
    if (toColumn === "won") {
      await markDealWon(dealUuid);
      await addDealNote(dealUuid, `Marked Won on the admin Pipeline board — ${nowCT()}.`);
    } else if (toColumn === "lost") {
      const reason = (lossReason ?? "").trim() || "Moved to Lost on the admin Pipeline board";
      await markDealLost(dealUuid, reason);
      // markDealLost already writes the loss reason on the deal; no separate
      // note needed, unlike Won which has nowhere else to record the "how".
    } else {
      const stageKey = ACTIVE_COLUMN_STAGE[toColumn];
      if (!stageKey) return json({ error: `Unknown or unsupported column: ${toColumn}` }, 400);
      if (reopen) {
        await reopenDeal(dealUuid, stageKey);
      } else {
        await moveDealStage(dealUuid, stageKey);
      }
      await addDealNote(
        dealUuid,
        `${reopen ? "Reopened to" : "Moved to"} ${columnLabel(toColumn)} on the admin Pipeline board — ${nowCT()}.`,
      );
    }

    // Best-effort mirror update, same column client_projects already tracks
    // for CRE-286's forward-only guard — a failure here never fails the
    // move itself, since SureContact (not this column) is the source of
    // truth and pipeline-board reads SureContact live anyway.
    try {
      const sb = serviceClient();
      const stageKeyForMirror = toColumn === "won" || toColumn === "lost" ? toColumn : ACTIVE_COLUMN_STAGE[toColumn];
      if (stageKeyForMirror) {
        await sb.from("client_projects")
          .update({ surecontact_deal_stage: stageKeyForMirror })
          .eq("surecontact_deal_id", dealUuid);
      }
    } catch (mirrorErr) {
      console.warn("[pipeline-deal-move] client_projects mirror update failed:", mirrorErr);
    }

    return json({ success: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[pipeline-deal-move] failed:", detail);
    return json({ error: detail }, 502);
  }
});
