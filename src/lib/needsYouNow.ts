import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/adminOperations";

// `paperclip_pending_items`, `prospect_approvals` and `journey_nodes.checklist`
// aren't fully typed for this shape yet — same cast as Briefs.tsx / CLAUDE.md.
const db = supabase as unknown as { from: (table: string) => any };

export type NeedsYouBucket = "agents" | "clients" | "money";

export interface NeedsYouItem {
  id: string;
  kind: string;
  bucket: NeedsYouBucket;
  title: string;
  issue_identifier: string | null;
  issue_url: string | null;
}

interface PendingItem {
  id: string; kind: string; title: string; issue_identifier: string | null; issue_url: string | null;
}
interface ProspectBatchPending { batch: string; count: number }
interface DraftProposal { id: string; client_id: string; title: string }
interface OverdueInvoice { id: string; client_id: string; label: string; amount_cents: number; currency: string; due_date: string }
interface ProfileToReview { client_id: string }

/**
 * "Needs you now" — one list across Paperclip holds/questions/approvals,
 * proposal drafts, client profiles ready for review, pending prospect
 * batches and overdue invoices. Built for the Today page (CRE-332 Phase 2);
 * Briefs.tsx's own "Needs you now" panel reuses this instead of keeping a
 * second copy of the Paperclip-items-plus-prospect-batches logic.
 */
export function useNeedsYouNow() {
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [prospectBatches, setProspectBatches] = useState<ProspectBatchPending[] | null>(null);
  const [drafts, setDrafts] = useState<DraftProposal[] | null>(null);
  const [overdue, setOverdue] = useState<OverdueInvoice[] | null>(null);
  const [profiles, setProfiles] = useState<ProfileToReview[] | null>(null);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    db.from("paperclip_pending_items").select("*").order("synced_at", { ascending: false })
      .then(({ data, error }: { data: PendingItem[] | null; error: { message: string } | null }) => {
        if (error) { toast.error(error.message); return; }
        setPending(data ?? []);
      });

    db.from("prospect_approvals").select("batch").eq("status", "pending")
      .then(({ data, error }: { data: { batch: string }[] | null; error: { message: string } | null }) => {
        if (error) { toast.error(error.message); return; }
        const counts = new Map<string, number>();
        for (const row of data ?? []) counts.set(row.batch, (counts.get(row.batch) ?? 0) + 1);
        setProspectBatches(Array.from(counts, ([batch, count]) => ({ batch, count })).sort((a, b) => b.batch.localeCompare(a.batch)));
      });

    supabase.from("client_proposals").select("id, client_id, title").eq("status", "draft")
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        setDrafts((data ?? []) as DraftProposal[]);
      });

    const today = new Date().toISOString().slice(0, 10);
    supabase.from("project_invoices")
      .select("id, client_id, label, amount_cents, currency, due_date")
      .eq("status", "sent").lt("due_date", today)
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        setOverdue((data ?? []) as OverdueInvoice[]);
      });

    db.from("journey_nodes").select("client_id, checklist").eq("key", "intake")
      .then(({ data, error }: { data: { client_id: string; checklist: unknown }[] | null; error: { message: string } | null }) => {
        if (error) { toast.error(error.message); return; }
        const ready = (data ?? []).filter((node) => {
          const items = Array.isArray(node.checklist) ? node.checklist as { key: string; done: boolean }[] : [];
          const onboarded = items.find((it) => it.key === "intake.onboarding_completed");
          const reviewed = items.find((it) => it.key === "intake.summary_reviewed");
          return Boolean(onboarded?.done) && reviewed && !reviewed.done;
        });
        setProfiles(ready.map((node) => ({ client_id: node.client_id })));
      });

    supabase.from("clients").select("id, business_name, contact_name")
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        setClientNames(Object.fromEntries((data ?? []).map((c) => [c.id, c.contact_name || c.business_name || "Untitled client"])));
      });
  }, [reloadKey]);

  const loading = pending === null || prospectBatches === null || drafts === null || overdue === null || profiles === null;

  const items = useMemo<NeedsYouItem[] | null>(() => {
    if (loading) return null;
    const fromAgents: NeedsYouItem[] = (pending ?? []).map((p) => ({ ...p, bucket: "agents" as const }));
    const fromProspects: NeedsYouItem[] = (prospectBatches ?? []).map((b) => ({
      id: `prospect-${b.batch}`,
      kind: "prospect approvals",
      bucket: "clients",
      title: `${b.count} prospect${b.count === 1 ? "" : "s"} pending review — batch ${b.batch}`,
      issue_identifier: null,
      issue_url: "/admin/approvals",
    }));
    const fromDrafts: NeedsYouItem[] = (drafts ?? []).map((d) => ({
      id: `draft-${d.id}`,
      kind: "proposal draft",
      bucket: "clients",
      title: `Draft proposal "${d.title}" for ${clientNames[d.client_id] ?? "a client"} not yet sent`,
      issue_identifier: null,
      issue_url: "/admin/proposals",
    }));
    const fromProfiles: NeedsYouItem[] = (profiles ?? []).map((p) => ({
      id: `profile-${p.client_id}`,
      kind: "client profile",
      bucket: "clients",
      title: `${clientNames[p.client_id] ?? "A client"}'s intake summary is ready for your review`,
      issue_identifier: null,
      issue_url: `/admin/clients/${p.client_id}`,
    }));
    const fromOverdue: NeedsYouItem[] = (overdue ?? []).map((inv) => ({
      id: `invoice-${inv.id}`,
      kind: "overdue invoice",
      bucket: "money",
      title: `${clientNames[inv.client_id] ?? "A client"} · ${inv.label} · ${formatMoney(inv.amount_cents, inv.currency)} overdue since ${new Date(`${inv.due_date}T12:00:00`).toLocaleDateString()}`,
      issue_identifier: null,
      issue_url: "/admin/payments",
    }));
    return [...fromAgents, ...fromDrafts, ...fromProfiles, ...fromProspects, ...fromOverdue];
  }, [loading, pending, prospectBatches, drafts, overdue, profiles, clientNames]);

  return { items, reload: () => setReloadKey((k) => k + 1) };
}
