import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabasePortal } from "@/integrations/supabase/portalClient";
import { toast } from "sonner";

/**
 * Lands both the first-time invite link and the forgot-password reset
 * link (same mechanic as /admin/reset-password: Supabase puts the
 * recovery/invite tokens in the URL hash and the SDK's detectSessionInUrl
 * turns that into a session on its own — no manual token handling here).
 * On success it marks client_portal_users active (so admin's status
 * column flips from "invited" to "active") and sends the client into
 * their own portal, resolved from the session rather than from a link.
 */
export default function PortalSetPassword() {
  const navigate = useNavigate();
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabasePortal.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
      setChecking(false);
    });
    supabasePortal.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const { error } = await supabasePortal.auth.updateUser({ password });
      if (error) throw error;

      // Best-effort: mark the invite activated. Never blocks landing in
      // the portal if it fails — the set-portal-password function also
      // activates on its own next call as a fallback.
      try {
        await supabasePortal.functions.invoke("portal-invite", { body: { action: "activate" } });
      } catch {
        /* non-fatal */
      }

      const { data: whoami } = await supabasePortal.rpc("portal_whoami");
      const firstClientId = Array.isArray(whoami) && whoami[0]?.client_id;

      toast.success("Password set. Taking you to your portal…");
      navigate(firstClientId ? `/portal/${firstClientId}` : "/portal/login", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to set password");
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
              fontSize: 17,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              color: "hsl(30 10% 78%)",
              marginBottom: 16,
            }}
          >
            Cre8 Visions
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
            Set your <em style={{ color: "hsl(30 25% 44%)" }}>password</em>.
          </h1>
          <hr style={{ width: 48, height: 1, background: "hsl(30 25% 44%)", border: 0, margin: "0 0 24px 0" }} />
          <p style={{ color: "hsl(30 8% 62%)", fontSize: 19, marginBottom: 28 }}>
            {checking
              ? "Verifying your link…"
              : hasSession
                ? "Choose a password for your portal."
                : "This link isn't active. Open it fresh from the invite or reset email — it must be used in the same browser it was opened in."}
          </p>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label className="crm-label">Password</label>
              <input
                className="crm-input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={!hasSession}
              />
            </div>
            <div>
              <label className="crm-label">Confirm password</label>
              <input
                className="crm-input"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={!hasSession}
              />
            </div>
            <button
              type="submit"
              className="crm-btn crm-btn--primary"
              disabled={busy || checking || !hasSession}
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              {busy ? "…" : "Set password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
