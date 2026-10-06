import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const SUPABASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

function tokenKey(slug: string) {
  return `audit-token-${slug}`;
}

// Password-gated viewer for a client's audit report (CRE-225). Same
// iframe-isolation pattern as PreviewViewer, plus a password step in front
// of it — audit-serve issues a short-lived token on a correct password,
// held in sessionStorage so a refresh mid-session doesn't re-prompt.
export default function AuditReport() {
  const { slug } = useParams();
  const [token, setToken] = useState<string | null>(() => (slug ? sessionStorage.getItem(tokenKey(slug)) : null));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Audit report";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    if (!slug || !token) return;
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch(`${FN_BASE}/audit-serve?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`);
        if (res.status === 401) {
          if (!cancelled) {
            sessionStorage.removeItem(tokenKey(slug));
            setToken(null);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) setHtml(text);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Failed to load report");
      }
    })();
    return () => { cancelled = true; };
  }, [slug, token]);

  if (!slug) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Missing report link.</div>;

  if (!token) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setLoginError(null);
      try {
        const res = await fetch(`${FN_BASE}/audit-serve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        sessionStorage.setItem(tokenKey(slug), data.token);
        setToken(data.token);
      } catch (e: any) {
        setLoginError(e?.message || "Could not check password");
      } finally {
        setBusy(false);
      }
    };

    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "system-ui, sans-serif", background: "#f8fafc", padding: 24,
      }}>
        <form onSubmit={submit} style={{
          background: "#fff", borderRadius: 12, padding: 32, width: "min(380px, 100%)",
          boxShadow: "0 10px 40px rgba(0,0,0,.08)",
        }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22, color: "#0F172A" }}>Audit report</h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b" }}>
            Enter the password you were given to view this report.
          </p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={{
              width: "100%", boxSizing: "border-box", padding: "11px 13px", fontSize: 15,
              border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 12,
            }}
          />
          {loginError && <div style={{ color: "#b91c1c", fontSize: 14, marginBottom: 12 }}>{loginError}</div>}
          <button type="submit" disabled={busy || !password} style={{
            width: "100%", padding: "11px 13px", fontSize: 15, fontWeight: 600,
            background: "#0F172A", color: "#fff", border: 0, borderRadius: 8,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
          }}>
            {busy ? "Checking…" : "View report"}
          </button>
        </form>
      </div>
    );
  }

  if (loadError) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Could not load report: {loadError}</div>;
  if (html === null) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Loading report…</div>;

  return (
    <iframe
      srcDoc={html}
      title="Audit report"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: 0 }}
      sandbox="allow-same-origin allow-popups"
    />
  );
}
