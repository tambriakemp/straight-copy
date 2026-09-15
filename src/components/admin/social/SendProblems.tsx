// What went wrong, and what just went out.
//
// Replaces the old ScheduledPosts calendar. CoPost queues posts and its queue
// owns the schedule — you cannot send a date in the trigger payload — so a
// date grid here duplicated something CoPost already does. What it did NOT
// duplicate is the failures: social_schedule is the only place a dead send is
// recorded, and a failure nobody can see is one nobody fixes.
//
// So: problems first and loud, recent sends underneath as reassurance, and
// nothing that pretends to be a calendar.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Row {
  id: string;
  scheduled_at: string;
  status: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  social_post_id: string | null;
  social_image_id: string | null;
}

/** Sends this old still count as "just went out". */
const RECENT_MS = 48 * 60 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  pending: "Booked",
  sending: "Sending",
  sent: "Posted",
  failed: "Failed",
  cancelled: "Called off",
};

export default function SendProblems({ clientProjectId }: { clientProjectId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("social_schedule")
      .select("id, scheduled_at, status, attempts, last_error, sent_at, social_post_id, social_image_id")
      .eq("client_project_id", clientProjectId)
      .order("scheduled_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [clientProjectId]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Every other panel in this folder subscribes; this one never did, so a
    // failure that happened while you were looking at the page stayed invisible
    // until a manual refresh.
    const ch = supabase
      .channel(`social_schedule_${clientProjectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "social_schedule", filter: `client_project_id=eq.${clientProjectId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clientProjectId, load]);

  const cancel = async (id: string) => {
    setBusy(id);
    // Filtered on status here as well as in the UI: a stale page must not be
    // able to call off something already in flight.
    const { data, error } = await supabase
      .from("social_schedule")
      .update({ status: "cancelled", last_error: "Called off by hand." })
      .eq("id", id).eq("status", "pending")
      .select("id");
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("Too late — that post is already on its way"); void load(); return; }
    toast.success("Called off");
    void load();
  };

  if (loading) return null;

  const cutoff = Date.now() - RECENT_MS;
  const problems = rows.filter((r) => r.status === "failed" || r.status === "sending");
  const recent = rows.filter(
    (r) => r.status === "sent" && r.sent_at && new Date(r.sent_at).getTime() >= cutoff,
  );
  const booked = rows.filter((r) => r.status === "pending");

  if (!problems.length && !recent.length && !booked.length) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 500, color: "var(--crm-warm-white)", marginBottom: 4 }}>
          Recent sends &amp; problems
        </h3>
        <p style={{ fontSize: 15, color: "var(--crm-taupe)" }}>
          CoPost holds the schedule. This is what failed, what is on its way, and what went out in the last two days.
        </p>
      </div>

      {problems.map((r) => (
        <div
          key={r.id}
          style={{
            display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12,
            padding: "12px 14px", borderRadius: 8,
            border: "1px solid hsl(0 45% 45% / 0.45)",
            background: "hsl(0 45% 45% / 0.08)",
          }}
        >
          <span style={{
            fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
            color: r.status === "failed" ? "hsl(0 70% 75%)" : "hsl(210 60% 78%)",
          }}>
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
          <span style={{ fontSize: 15, color: "var(--crm-warm-white)" }}>
            {r.social_image_id ? "Photo" : "Post"}
          </span>
          {r.last_error && (
            <span style={{ fontSize: 14, color: "hsl(0 70% 78%)", flex: 1, minWidth: 200 }}>
              {r.last_error}
              {r.attempts > 1 ? ` (${r.attempts} attempts)` : ""}
            </span>
          )}
        </div>
      ))}

      {(booked.length > 0 || recent.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[...booked, ...recent].map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex", alignItems: "baseline", gap: 12,
                padding: "9px 0", borderBottom: "1px solid var(--crm-border-dark)",
              }}
            >
              <span style={{ fontSize: 14, color: "var(--crm-taupe)", minWidth: 170 }}>
                {new Date(r.sent_at ?? r.scheduled_at).toLocaleString()}
              </span>
              <span style={{
                fontSize: 14, minWidth: 70,
                color: r.status === "sent" ? "hsl(140 40% 72%)" : "var(--crm-taupe)",
              }}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
              <span style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
                {r.social_image_id ? "photo" : "post"}
              </span>
              <span style={{ flex: 1 }} />
              {r.status === "pending" && (
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => void cancel(r.id)}
                  style={{
                    fontSize: 14, color: "hsl(0 70% 78%)", background: "none",
                    border: "none", cursor: busy === r.id ? "default" : "pointer", padding: 0,
                  }}
                >
                  Call off
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
