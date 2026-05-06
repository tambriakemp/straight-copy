import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type Automation = { uuid: string | null; name: string; status: string | null };

export default function Profile() {
  const { user } = useAdminAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [loadingAutos, setLoadingAutos] = useState(false);

  const loadAutomations = async () => {
    setLoadingAutos(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "list-surecontact-automations",
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAutomations((data as any).automations || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load automations");
    } finally {
      setLoadingAutos(false);
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
      </div>
    </AdminLayout>
  );
}
