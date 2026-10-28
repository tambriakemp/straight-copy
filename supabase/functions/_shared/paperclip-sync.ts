// Best-effort push of a single step's completion into the matching Paperclip
// project, so a Paperclip Blueprint step can block on it. Separate from
// sync-paperclip-project-tasks (which only mirrors per-project *counts* back
// into this CRM) — this is the one direction that writes to Paperclip.
//
// There is no stored mapping from a CRM milestone to a specific Paperclip
// issue id, so this matches by title within the client's own Paperclip
// project (client_projects.paperclip_project_id) and only acts when exactly
// one candidate matches — zero or multiple matches is a silent, logged
// no-op rather than a guess. Same API base/credential pattern as
// sync-paperclip-project-tasks: paperclip_board_api_key from app_secrets.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

const PAPERCLIP_BASE = "https://paperclip.cre8visions.com";
const COMPANY_ID = "62e315f3-8d2c-49c9-8a67-00f151290b5c";

interface CompactIssue {
  id?: string;
  status?: string | null;
  title?: string | null;
}

export interface PaperclipSyncResult {
  ok: boolean;
  skipped?: string;
  error?: string;
}

async function getSecret(sb: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await sb.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

/**
 * Marks the one open Paperclip issue whose title matches `titlePattern`
 * (case-insensitive substring) as done, inside the Paperclip project mirrored
 * from `clientProjectId`. Never throws — always resolves to a result the
 * caller can fold into its own warnings[].
 */
export async function completePaperclipBlueprintStep(
  sb: SupabaseClient,
  clientProjectId: string,
  titlePattern: string,
  note: string,
): Promise<PaperclipSyncResult> {
  try {
    const { data: project } = await sb
      .from("client_projects")
      .select("paperclip_project_id")
      .eq("id", clientProjectId)
      .maybeSingle();
    const paperclipProjectId = (project as { paperclip_project_id?: string | null } | null)
      ?.paperclip_project_id;
    if (!paperclipProjectId) return { ok: true, skipped: "no_paperclip_project" };

    const apiKey = await getSecret(sb, "paperclip_board_api_key");
    if (!apiKey) return { ok: false, error: "paperclip_board_api_key not configured" };

    const res = await fetch(
      `${PAPERCLIP_BASE}/api/companies/${COMPANY_ID}/issues?projectId=${encodeURIComponent(paperclipProjectId)}&view=compact`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
    );
    if (!res.ok) return { ok: false, error: `issues ${res.status}: ${await res.text().catch(() => "")}` };
    const body = await res.json();
    const issues: CompactIssue[] = Array.isArray(body) ? body : body?.items ?? body?.data ?? [];

    const needle = titlePattern.toLowerCase();
    const candidates = issues.filter((i) => {
      const title = (i.title ?? "").toLowerCase();
      const status = (i.status ?? "").toLowerCase();
      return title.includes(needle) && status !== "done" && status !== "cancelled";
    });

    if (candidates.length === 0) return { ok: true, skipped: "no_matching_issue" };
    if (candidates.length > 1) return { ok: true, skipped: "ambiguous_match" };

    const issueId = candidates[0].id;
    if (!issueId) return { ok: true, skipped: "no_matching_issue" };

    const patchRes = await fetch(`${PAPERCLIP_BASE}/api/issues/${issueId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "done" }),
    });
    if (!patchRes.ok) {
      return { ok: false, error: `PATCH issue ${patchRes.status}: ${await patchRes.text().catch(() => "")}` };
    }

    // Best-effort comment; a failure here doesn't undo the status flip.
    try {
      await fetch(`${PAPERCLIP_BASE}/api/issues/${issueId}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: note }),
      });
    } catch {
      // non-fatal
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
