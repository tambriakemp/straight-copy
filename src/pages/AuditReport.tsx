import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const SUPABASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;
const FN_BASE = `${SUPABASE_URL}/functions/v1/audit-serve`;

function tokenKey(slug: string) {
  return `audit_token_${slug}`;
}

export default function AuditReport() {
  const params = useParams();
  const slug = params.slug || "";
  const [html, setHtml] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const fetchReport = async (token: string) => {
    try {
      const res = await fetch(`${FN_BASE}?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`);
      if (res.status === 401) {
        sessionStorage.removeItem(tokenKey(slug));
        setNeedsPassword(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || `HTTP ${res.status}`);
        return;
      }
      setHtml(await res.text());
    } catch (e: any) {
      setError(e?.message || "Failed to load report");
    }
  };

  useEffect(() => {
    if (!slug) return;
    const existing = sessionStorage.getItem(tokenKey(slug));
    if (existing) fetchReport(existing);
    else setNeedsPassword(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(FN_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setError("Too many attempts -- try again later.");
        return;
      }
      if (!res.ok) {
        setError(body?.error || "Incorrect password.");
        return;
      }
      sessionStorage.setItem(tokenKey(slug), body.token);
      setNeedsPassword(false);
      await fetchReport(body.token);
    } finally {
      setChecking(false);
    }
  };

  if (!slug) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Missing audit link.</div>;

  if (needsPassword) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", background: "#F6F4F1" }}>
        <form onSubmit={submitPassword} style={{ width: 320, padding: 32, border: "1px solid #ECE7E1", borderRadius: 12, background: "#FFFFFF" }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, marginBottom: 16, color: "#1D1B18" }}>Audit report</h1>
          <label style={{ display: "block", fontSize: 13, color: "#8B847A", marginBottom: 6 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #DDD5CB", marginBottom: 12, boxSizing: "border-box" }}
            autoFocus
          />
          {error && <div style={{ color: "#B91C1C", fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button
            type="submit"
            disabled={checking || !password}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: 0, background: "#8C7054", color: "#fff", fontWeight: 600, cursor: checking || !password ? "default" : "pointer" }}
          >
            {checking ? "Checking…" : "View report"}
          </button>
        </form>
      </div>
    );
  }

  if (error) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Could not load report: {error}</div>;
  if (html === null) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Loading…</div>;

  return (
    <iframe
      srcDoc={html}
      title="Audit report"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: 0 }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
}
