import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // When user clicks the recovery link, Supabase sets a recovery session
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. Signing you in…");
      navigate("/admin", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="crm-shell">
      <div className="crm-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "hsl(36 5% 16%)",
            border: "1px solid hsl(40 20% 97% / 0.08)",
            padding: "48px 40px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              color: "hsl(30 10% 78%)",
              marginBottom: 16,
            }}
          >
            Cre8 · CRM
          </div>
          <h1
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontWeight: 300,
              fontSize: 40,
              lineHeight: 1,
              color: "hsl(40 20% 97%)",
              margin: "0 0 12px 0",
              letterSpacing: "-0.01em",
            }}
          >
            Reset <em style={{ color: "hsl(30 25% 44%)" }}>password</em>.
          </h1>
          <hr style={{ width: 48, height: 1, background: "hsl(30 25% 44%)", border: 0, margin: "0 0 24px 0" }} />
          <p style={{ color: "hsl(30 8% 62%)", fontSize: 13, marginBottom: 28 }}>
            {ready
              ? "Choose a new password for your account."
              : "Waiting for recovery link… open this page from the email we sent you."}
          </p>

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
                disabled={!ready}
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
                disabled={!ready}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              className="crm-btn crm-btn--primary"
              disabled={busy || !ready}
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              {busy ? "…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
