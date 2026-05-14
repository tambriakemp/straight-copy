import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Workflow, FileSignature, Globe, Megaphone, ArrowRight } from "lucide-react";

type Project = { id: string; type: string; name: string; status: string; updated_at: string };
type PortalClient = {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  tier: string;
  build_start_date: string | null;
  delivery_date: string | null;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const TYPE_LABEL: Record<string, string> = {
  automation_build: "Automation Build",
  app_development: "App Development",
  web_development: "Web Development",
  marketing: "Marketing",
  site_preview: "Site Preview",
};

const TYPE_ICON: Record<string, typeof Workflow> = {
  automation_build: Workflow,
  app_development: FileSignature,
  web_development: Globe,
  marketing: Megaphone,
};

export default function Portal() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const impersonationKey = clientId ? `cre8-portal-as-admin-${clientId}` : "";
  const adminPreview = useMemo(() => {
    if (!clientId) return false;
    if (searchParams.get("as") === "admin") {
      try { sessionStorage.setItem(impersonationKey, "1"); } catch { /* ignore */ }
      return true;
    }
    try { return sessionStorage.getItem(impersonationKey) === "1"; } catch { return false; }
  }, [clientId, searchParams, impersonationKey]);

  const exitPreview = () => {
    try { sessionStorage.removeItem(impersonationKey); } catch { /* ignore */ }
    if (searchParams.has("as")) {
      const next = new URLSearchParams(searchParams);
      next.delete("as");
      setSearchParams(next, { replace: true });
    }
    window.location.reload();
  };

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [client, setClient] = useState<PortalClient | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
          body: JSON.stringify({ clientId, action: "resolve", asAdmin: adminPreview }),
        });
        if (resp.status === 404) { if (!cancelled) setNotFound(true); return; }
        if (!resp.ok) throw new Error("portal load failed");
        const data = await resp.json();
        if (cancelled) return;
        setClient(data.client);
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, adminPreview]);

  const adminBanner = adminPreview ? (
    <div className="portal-admin-banner" role="status" aria-live="polite">
      <div className="portal-admin-banner__inner">
        <span className="portal-admin-banner__badge">Admin preview</span>
        <span className="portal-admin-banner__text">
          You're viewing this portal as the client. Your admin session is unchanged.
        </span>
        <div className="portal-admin-banner__actions">
          <a className="portal-admin-banner__btn" href="/admin" target="_blank" rel="noreferrer">
            ← Back to admin
          </a>
          <button
            type="button"
            className="portal-admin-banner__btn portal-admin-banner__btn--ghost"
            onClick={exitPreview}
          >
            Exit preview
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="crm-shell">
        {adminBanner}
        <div className="portal-shell">
          <div className="portal-loading">Loading…</div>
        </div>
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="crm-shell">
        {adminBanner}
        <div className="portal-shell">
          <div className="portal-empty">
            <div className="portal-empty__eyebrow">Portal</div>
            <h1 className="portal-empty__title">Link <em>invalid</em>.</h1>
            <p className="portal-empty__sub">
              We couldn't find a client matching this portal link. Please double-check the URL or
              reach out to your CRE8 contact.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const visible = projects.filter((p) => p.type !== "site_preview");

  // Single project → land directly on it (preserves the original 1-click experience).
  if (visible.length === 1) {
    const qs = searchParams.toString();
    return <Navigate to={`/portal/${clientId}/projects/${visible[0].id}${qs ? `?${qs}` : ""}`} replace />;
  }

  const businessName = client.business_name || "Your Brand";

  if (visible.length === 0) {
    return (
      <div className="crm-shell">
        {adminBanner}
        <div className="portal-shell">
          <div className="portal-empty">
            <div className="portal-empty__eyebrow">Portal</div>
            <h1 className="portal-empty__title">Nothing here <em>yet</em>.</h1>
            <p className="portal-empty__sub">
              Your CRE8 team is setting up your first project. We'll email you the moment it's ready.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-shell">
      {adminBanner}
      <div className="portal-shell">
        <header className="portal-header">
          <div className="portal-header__left">
            <div className="portal-header__wordmark">Cre8<span className="dot">·</span>Portal</div>
          </div>
        </header>

        <main className="portal-main">
          <section className="portal-hero">
            <div className="portal-hero__eyebrow">Your Projects</div>
            <h1 className="portal-hero__title">
              {businessName.split(" ").slice(0, -1).join(" ") || businessName}{" "}
              {businessName.split(" ").length > 1 && (
                <em>{businessName.split(" ").slice(-1)[0]}</em>
              )}
              {businessName.split(" ").length === 1 && <em>.</em>}
            </h1>
            <hr className="portal-hero__rule" />
            <p className="portal-hero__sub">
              Welcome{client.contact_name ? `, ${client.contact_name}` : ""}. Choose a project to continue.
            </p>
          </section>

          <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", marginTop: 24 }}>
            {visible.map((p) => {
              const Icon = TYPE_ICON[p.type] ?? Workflow;
              const qs = searchParams.toString();
              const href = `/portal/${clientId}/projects/${p.id}${qs ? `?${qs}` : ""}`;
              return (
                <Link
                  key={p.id}
                  to={href}
                  className="portal-access is-open"
                  style={{ textDecoration: "none", display: "block", scrollMarginTop: 24 }}
                >
                  <div className="portal-access__toggle" style={{ cursor: "pointer" }}>
                    <div className="portal-access__toggle-left">
                      <div className="portal-access__eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Icon size={12} /> {TYPE_LABEL[p.type] ?? p.type}
                      </div>
                      <h2 className="portal-access__title">{p.name}</h2>
                    </div>
                    <div className="portal-access__toggle-right">
                      <span className="portal-access__status">Open <ArrowRight size={12} style={{ display: "inline", marginLeft: 4 }} /></span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
