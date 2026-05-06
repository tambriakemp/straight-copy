import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type Template = { uuid: string | null; name: string; subject: string | null; type: string | null };

export default function Profile() {
  const { user } = useAdminAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(false);

  const loadTemplates = async () => {
    setLoadingTpl(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "list-surecontact-templates",
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setTemplates((data as any).templates || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load templates");
    } finally {
      setLoadingTpl(false);
    }
  };

  const copyUuid = async (uuid: string | null) => {
    if (!uuid) return;
    try {
      await navigator.clipboard.writeText(uuid);
      toast.success("UUID copied");
    } catch {
      toast.error("Copy failed");
    }
  };


  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 560, padding: "32px 0" }}>
        <div
          style={{
            fontSize: 13,
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "hsl(30 10% 78%)",
            marginBottom: 12,
          }}
        >
          Account
        </div>
        <h1
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontWeight: 300,
            fontSize: 44,
            lineHeight: 1,
            color: "hsl(40 20% 97%)",
            margin: "0 0 12px 0",
            letterSpacing: "-0.01em",
          }}
        >
          Profile.
        </h1>
        <hr
          style={{
            width: 48,
            height: 1,
            background: "hsl(30 25% 44%)",
            border: 0,
            margin: "0 0 28px 0",
          }}
        />

        <div
          style={{
            background: "hsl(36 5% 16%)",
            border: "1px solid hsl(40 20% 97% / 0.08)",
            padding: "32px 36px",
            marginBottom: 24,
          }}
        >
          <div className="crm-label">Signed in as</div>
          <div style={{ color: "hsl(40 20% 97%)", fontSize: 16 }}>
            {user?.email ?? "—"}
          </div>
        </div>

        <div
          style={{
            background: "hsl(36 5% 16%)",
            border: "1px solid hsl(40 20% 97% / 0.08)",
            padding: "32px 36px",
          }}
        >
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontWeight: 300,
              fontSize: 28,
              color: "hsl(40 20% 97%)",
              margin: "0 0 20px 0",
            }}
          >
            Change <em style={{ color: "hsl(30 25% 44%)" }}>password</em>
          </h2>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label className="crm-label">New password</label>
              <input
                className="crm-input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="crm-label">Confirm new password</label>
              <input
                className="crm-input"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              className="crm-btn crm-btn--primary"
              disabled={busy}
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              {busy ? "…" : "Update password"}
            </button>
          </form>
        </div>

        <div
          style={{
            background: "hsl(36 5% 16%)",
            border: "1px solid hsl(40 20% 97% / 0.08)",
            padding: "32px 36px",
            marginTop: 24,
          }}
        >
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontWeight: 300,
              fontSize: 28,
              color: "hsl(40 20% 97%)",
              margin: "0 0 8px 0",
            }}
          >
            SureContact <em style={{ color: "hsl(30 25% 44%)" }}>automations</em>
          </h2>
          <p style={{ color: "hsl(30 10% 70%)", fontSize: 14, margin: "0 0 18px 0" }}>
            List your SureContact automations and copy their UUIDs (used for API-triggered emails).
          </p>
          <button
            type="button"
            className="crm-btn crm-btn--primary"
            onClick={loadAutomations}
            disabled={loadingAutos}
          >
            {loadingAutos ? "Loading…" : automations ? "Refresh" : "Load automations"}
          </button>

          {automations && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              {automations.length === 0 && (
                <div style={{ color: "hsl(30 10% 70%)", fontSize: 14 }}>No automations found.</div>
              )}
              {automations.map((a) => (
                <div
                  key={a.uuid ?? a.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    background: "hsl(36 5% 12%)",
                    border: "1px solid hsl(40 20% 97% / 0.06)",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: "hsl(40 20% 97%)", fontSize: 15, marginBottom: 4 }}>
                      {a.name}{" "}
                      {a.status && (
                        <span
                          style={{
                            fontSize: 11,
                            letterSpacing: "0.2em",
                            textTransform: "uppercase",
                            color:
                              a.status === "active"
                                ? "hsl(140 40% 60%)"
                                : "hsl(30 10% 60%)",
                            marginLeft: 8,
                          }}
                        >
                          {a.status}
                        </span>
                      )}
                    </div>
                    <code
                      style={{
                        fontSize: 12,
                        color: "hsl(30 10% 70%)",
                        wordBreak: "break-all",
                      }}
                    >
                      {a.uuid ?? "(no uuid)"}
                    </code>
                  </div>
                  <button
                    type="button"
                    className="crm-btn"
                    onClick={() => copyUuid(a.uuid)}
                    disabled={!a.uuid}
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
