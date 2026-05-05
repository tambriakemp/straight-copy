import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type Mode = "signin" | "signup" | "forgot";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAdminAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && isAdmin) navigate("/admin", { replace: true });
  }, [loading, user, isAdmin, navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then ask the owner to grant admin access.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/admin/reset-password`,
        });
        if (error) throw error;
        toast.success("If that email exists, a reset link is on its way.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signin" ? (
      <>Sign <em style={{ color: "hsl(30 25% 44%)" }}>in</em>.</>
    ) : mode === "signup" ? (
      <>Create <em style={{ color: "hsl(30 25% 44%)" }}>account</em>.</>
    ) : (
      <>Forgot <em style={{ color: "hsl(30 25% 44%)" }}>password</em>.</>
    );

  const subtitle =
    mode === "signin"
      ? "Admin access only."
      : mode === "signup"
        ? "Sign up, then ask the owner for admin access."
        : "Enter your email and we'll send a recovery link.";

  const cta = mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <div className="crm-shell">
      <div className="crm-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <div
          style={{
            width: "100%", maxWidth: 420,
            background: "hsl(36 5% 16%)",
            border: "1px solid hsl(40 20% 97% / 0.08)",
            padding: "48px 40px",
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: "0.35em", textTransform: "uppercase", color: "hsl(30 10% 78%)", marginBottom: 16 }}>
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
            {title}
          </h1>
          <hr style={{ width: 48, height: 1, background: "hsl(30 25% 44%)", border: 0, margin: "0 0 24px 0" }} />
          <p style={{ color: "hsl(30 8% 62%)", fontSize: 15, marginBottom: 28 }}>{subtitle}</p>

          <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label className="crm-label">Email</label>
              <input
                className="crm-input"
                type="email" required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <label className="crm-label">Password</label>
                <input
                  className="crm-input"
                  type="password" required minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            )}
            {mode === "signin" && (
              <button
                type="button"
                onClick={() => setMode("forgot")}
                style={{
                  alignSelf: "flex-start",
                  background: "transparent", border: 0, padding: 0,
                  color: "hsl(30 10% 78%)",
                  fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
                  cursor: "pointer",
                  fontFamily: "Karla, sans-serif",
                  marginTop: -4,
                }}
              >
                Forgot password?
              </button>
            )}
            <button
              type="submit"
              className="crm-btn crm-btn--primary"
              disabled={busy}
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              {busy ? "…" : cta}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              if (mode === "forgot") setMode("signin");
              else setMode(mode === "signin" ? "signup" : "signin");
            }}
            style={{
              marginTop: 20,
              background: "transparent", border: 0,
              color: "hsl(30 10% 78%)",
              fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "Karla, sans-serif",
            }}
          >
            {mode === "forgot"
              ? "Back to sign in"
              : mode === "signin"
                ? "Need an account? Sign up"
                : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
