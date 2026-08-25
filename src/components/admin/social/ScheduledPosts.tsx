// What is booked to go out, and what did not.
//
// Without this the calendar is invisible: social_schedule is the only record
// that a post is going out on Thursday, and a queue nobody can see is one
// nobody trusts.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAgentName } from "@/lib/useAgentName";

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

const STATUS_LABEL: Record<string, string> = {
  pending: "Booked",
  sending: "Sending",
  sent: "Posted",
  failed: "Failed",
  cancelled: "Called off",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "hsl(30 20% 40%)",
  sending: "hsl(210 40% 45%)",
  sent: "hsl(140 30% 35%)",
  failed: "hsl(0 45% 45%)",
  cancelled: "hsl(30 8% 55%)",
};

export default function ScheduledPosts({ clientProjectId }: { clientProjectId: string }) {
  const who = useAgentName("social-media", "your social media manager");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("social_schedule")
      .select("id, scheduled_at, status, attempts, last_error, sent_at, social_post_id, social_image_id")
      .eq("client_project_id", clientProjectId)
      .order("scheduled_at", { ascending: true })
      .limit(100);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [clientProjectId]);

  const cancel = async (id: string) => {
    setBusy(id);
    // Only a pending row can be called off. Filtering on status here as well as
    // in the UI means a stale page cannot cancel something already in flight.
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

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 500, color: "hsl(30 12% 20%)", marginBottom: 4 }}>
          The calendar
        </h3>
        <p style={{ fontSize: 16, color: "hsl(30 8% 50%)" }}>
          What {who} has booked with CoPost, soonest first.
        </p>
      </div>

      {!rows.length && (
        <p style={{ fontSize: 15, color: "hsl(30 8% 50%)" }}>
          Nothing is booked. {who} books on the next run, once photos have captions.
        </p>
      )}

      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            display: "flex", alignItems: "baseline", gap: 12,
            padding: "10px 0", borderBottom: "1px solid hsl(30 12% 92%)",
          }}
        >
          <span style={{ fontSize: 15, color: "hsl(30 12% 20%)", minWidth: 170 }}>
            {new Date(r.scheduled_at).toLocaleString()}
          </span>
          <span style={{ fontSize: 15, color: STATUS_COLOR[r.status] ?? "hsl(30 8% 50%)" }}>
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
          <span style={{ fontSize: 15, color: "hsl(30 8% 50%)" }}>
            {r.social_image_id ? "photo" : "carousel"}
          </span>
          {r.last_error && r.status !== "cancelled" && (
            <span style={{ fontSize: 14, color: "hsl(0 45% 45%)", flex: 1 }}>
              {r.last_error}
              {r.attempts > 1 ? ` (${r.attempts} attempts)` : ""}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {r.status === "pending" && (
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => void cancel(r.id)}
              style={{
                fontSize: 15, color: "hsl(0 45% 45%)",
                background: "none", border: "none",
                cursor: busy === r.id ? "default" : "pointer", padding: 0,
              }}
            >
              Call off
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
