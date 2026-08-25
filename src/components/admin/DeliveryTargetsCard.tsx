// Where a project's code lives, and what the queue may do with it.
//
// These columns have existed since 20260821120000 and until now were settable
// only by hand-written SQL — no UI read them, and the MCP's update_client_project
// cannot write them either. That is why exactly one project was ever in the
// sweep: turning a board on meant opening a database console.
//
// Everything here writes straight to client_projects. Its RLS is already
// `FOR ALL TO authenticated USING (is_admin(...))`, so no edge function is
// needed — same as SocialAutonomyCard.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Targets {
  repo_url: string;
  repo_branch: string;
  toolchain: string;
  delivery_mode: string;
  build_notes: string;
  queue_enabled: boolean;
}

const EMPTY: Targets = {
  repo_url: "",
  repo_branch: "main",
  toolchain: "npm",
  delivery_mode: "pr",
  build_notes: "",
  queue_enabled: false,
};

const TOOLCHAINS = ["npm", "bun", "pnpm", "yarn"];

const MODES: { value: string; label: string; blurb: string }[] = [
  {
    value: "pr",
    label: "Open a pull request",
    blurb: "Work lands on a branch and waits for you. The right default for a client's repo.",
  },
  {
    value: "push",
    label: "Push to the branch",
    blurb: "Commits go straight to the branch below. Fast, and only sensible on a repo you own.",
  },
];

/**
 * Whether this looks like somewhere a queue run could actually clone from.
 *
 * Deliberately loose — a self-hosted Git remote is legitimate. It only rejects
 * what is definitely wrong, because the cost of a false rejection here is
 * someone unable to turn their own board on.
 */
function repoProblem(url: string): string | null {
  if (!url.trim()) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "That is not a URL. Paste the repository's web address.";
  }
  if (u.protocol !== "https:") return "Use an https:// URL so the routine can clone it.";
  if (!u.pathname.replace(/^\/|\/$/g, "").includes("/")) {
    return "That looks like a host, not a repository — it needs an owner and a name.";
  }
  return null;
}

export default function DeliveryTargetsCard({ clientProjectId }: { clientProjectId: string }) {
  const [form, setForm] = useState<Targets>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("client_projects")
        .select("repo_url, repo_branch, toolchain, delivery_mode, build_notes, queue_enabled")
        .eq("id", clientProjectId)
        .maybeSingle();
      if (cancelled) return;
      if (error) toast.error(error.message);
      if (data) {
        setForm({
          repo_url: data.repo_url ?? "",
          repo_branch: data.repo_branch ?? "main",
          toolchain: data.toolchain ?? "npm",
          delivery_mode: data.delivery_mode ?? "pr",
          build_notes: data.build_notes ?? "",
          queue_enabled: data.queue_enabled ?? false,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientProjectId]);

  const set = <K extends keyof Targets>(k: K, v: Targets[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const problem = repoProblem(form.repo_url);
  const hasRepo = !!form.repo_url.trim() && !problem;

  const save = async () => {
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    const { error } = await supabase
      .from("client_projects")
      .update({
        repo_url: form.repo_url.trim() || null,
        repo_branch: form.repo_branch.trim() || "main",
        toolchain: form.toolchain,
        delivery_mode: form.delivery_mode,
        build_notes: form.build_notes.trim() || null,
        // The database enforces this too — client_projects_queue_needs_repo_chk.
        // Belt and braces, so the user gets this sentence rather than a raw
        // constraint violation in a toast.
        queue_enabled: hasRepo ? form.queue_enabled : false,
      })
      .eq("id", clientProjectId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
  };

  if (loading) return null;

  return (
    <div style={cardStyle}>
      <div style={eyebrowStyle}>Delivery</div>
      <h3 style={titleStyle}>Where this project's code lives</h3>
      <p style={hintStyle}>
        Set this and the coding queue can pick up tasks for this board on its own.
        Without a repository there is nowhere for it to work.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 22 }}>
        <div>
          <label style={labelStyle} htmlFor="repo_url">Repository URL</label>
          <input
            id="repo_url" style={inputStyle} placeholder="https://github.com/owner/name"
            value={form.repo_url} onChange={(e) => set("repo_url", e.target.value)}
          />
          {problem && <div style={errorStyle}>{problem}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle} htmlFor="repo_branch">Branch</label>
            <input
              id="repo_branch" style={inputStyle}
              value={form.repo_branch} onChange={(e) => set("repo_branch", e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="toolchain">Toolchain</label>
            <select
              id="toolchain" style={inputStyle}
              value={form.toolchain} onChange={(e) => set("toolchain", e.target.value)}
            >
              {TOOLCHAINS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div style={labelStyle}>When work is finished</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {MODES.map((m) => (
              <button
                key={m.value} type="button"
                onClick={() => set("delivery_mode", m.value)}
                style={{
                  textAlign: "left", padding: "12px 14px", borderRadius: 6, cursor: "pointer",
                  background: "transparent",
                  border: form.delivery_mode === m.value
                    ? "1px solid var(--crm-accent)"
                    : "1px solid var(--crm-border-dark)",
                }}
              >
                <div style={{ color: "var(--crm-warm-white)", fontSize: 15 }}>{m.label}</div>
                <div style={{ color: "var(--crm-taupe)", fontSize: 14, marginTop: 2 }}>{m.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="build_notes">
            Build notes
          </label>
          <div style={hintStyle}>
            Anything a run needs to know that the repo does not say — which command
            verifies a change, what never to touch.
          </div>
          <textarea
            id="build_notes" style={{ ...inputStyle, minHeight: 80, marginTop: 8 }}
            value={form.build_notes} onChange={(e) => set("build_notes", e.target.value)}
          />
        </div>

        <label
          style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            cursor: hasRepo ? "pointer" : "not-allowed",
            opacity: hasRepo ? 1 : 0.5,
          }}
        >
          <input
            type="checkbox" disabled={!hasRepo} checked={form.queue_enabled}
            onChange={(e) => set("queue_enabled", e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span>
            <span style={{ color: "var(--crm-warm-white)", fontSize: 15 }}>
              Let the coding queue work this board
            </span>
            <span style={{ display: "block", color: "var(--crm-taupe)", fontSize: 14 }}>
              {hasRepo
                ? "Tasks moved to Ready for Claude will be picked up without anyone starting a chat."
                : "Add a repository URL first — there is nowhere to work without one."}
            </span>
          </span>
        </label>
      </div>

      <div style={{ marginTop: 24 }}>
        <button type="button" style={btnPrimary} onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--crm-border-dark)",
  borderRadius: 12,
  padding: 24,
  background: "hsl(40 20% 97% / 0.02)",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 13,
  letterSpacing: "0.3em",
  textTransform: "uppercase",
  color: "var(--crm-accent)",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--crm-font-serif)",
  fontSize: 26,
  color: "var(--crm-warm-white)",
  margin: "6px 0 0",
};

const hintStyle: React.CSSProperties = {
  color: "var(--crm-taupe)",
  fontSize: 15,
  marginTop: 8,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--crm-warm-white)",
  fontSize: 15,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 15,
  color: "var(--crm-warm-white)",
  background: "transparent",
  border: "1px solid var(--crm-border-dark)",
  borderRadius: 4,
};

const errorStyle: React.CSSProperties = {
  color: "hsl(0 55% 65%)",
  fontSize: 14,
  marginTop: 6,
};

const btnPrimary: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--crm-accent)",
  color: "var(--crm-warm-white)",
  padding: "10px 18px",
  fontSize: 15,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  cursor: "pointer",
  borderRadius: 4,
};
