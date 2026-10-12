import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AccountAccessSection, { type AccountAccessState } from "@/components/portal/AccountAccessSection";
import AuditsSection from "@/components/portal/AuditsSection";
import ContractSection from "@/components/portal/ContractSection";
import FilesSection from "@/components/portal/FilesSection";
import PortalLoginsSection from "@/components/portal/PortalLoginsSection";
import PortalShell, { type PortalView } from "@/components/portal/PortalShell";
import SubscriptionSection, { type SubscriptionState } from "@/components/portal/SubscriptionSection";
import WebDevDiscoveryChat from "@/components/portal/WebDevDiscoveryChat";
import { projectTypeStyle } from "@/lib/projectType";
import { phaseLadder, phaseSummary, PHASE_WORD, type PhaseNode } from "@/lib/journeyPhases";

/** The tabs on one project, as board 16 lays them out. */
type ProjectTab = "overview" | "audits" | "files" | "logins" | "brand";


type ProjectRow = { id: string; type: string; name: string; status: string; updated_at: string };

type Msg = { role: "user" | "assistant"; content: string };
type ActiveNode = {
  id: string;
  key: string;
  label: string;
  order_index: number;
  status: string;
};
type PortalClient = {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  tier: string;
  brand_kit_intake_submitted_at: string | null;
  build_start_date: string | null;
  delivery_date: string | null;
  delivery_video_url: string | null;
  active_node: ActiveNode | null;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const cleanContent = (text: string) =>
  text
    .replace(/\[\[STAGE:\d+\]\]/g, "")
    .replace(/\[\[BRAND_KIT_COMPLETE\]\]/g, "")
    .trim();

export default function PortalProject() {
  const { clientId, projectId } = useParams<{ clientId: string; projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  // How many pages the client has approved, for the "Page reviews" bar.
  // Read here rather than reported up by a preview panel, because that
  // panel is gone: the feedback board owns pages, comments and approvals
  // now, and a second surface doing the same job from the same tables is
  // how the portal ended up showing two of everything.
  const [previewProgress, setPreviewProgress] = useState({ approved: 0, total: 0 });

  // Admin impersonation flag — persists across in-portal navigation via sessionStorage.
  // Does NOT touch the Supabase auth session; admin remains signed in on the admin tab.
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
    // Soft reload so the banner disappears immediately and any cached preview state clears.
    window.location.reload();
  };

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [client, setClient] = useState<PortalClient | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [accountAccess, setAccountAccess] = useState<AccountAccessState>({});
  const [onboardingInvite, setOnboardingInvite] = useState<{ token: string; completed: boolean } | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    id: null,
    status: null,
    canceled_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
  });
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [contractSigned, setContractSigned] = useState(false);
  const [tab, setTab] = useState<ProjectTab>("overview");
  const [phases, setPhases] = useState<PhaseNode[]>([]);
  const navigate = useNavigate();

  /** The portal home, on a given view, keeping whatever is in the URL. */
  const portalHref = (v: PortalView) => {
    const next = new URLSearchParams(searchParams);
    if (v === "home") next.delete("v"); else next.set("v", v);
    const q = next.toString();
    return `/portal/${clientId}${q ? `?${q}` : ""}`;
  };

  /** The side nav's four destinations all live on the portal home, so
   *  clicking one from a project page goes there and says which. */
  const goToPortal = (v: PortalView) => navigate(portalHref(v));

  /** Jump to a section further down the Overview tab. */
  const scrollToSection = (id: string) => {
    setTab("overview");
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };


  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [stage, setStage] = useState(1);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Brand Kit routing: "yes" → Fast Submit form, "no" → conversational chat,
  // null → show the routing question. Persisted in localStorage so a refresh
  // keeps the client on whichever path they chose.
  const bkPathKey = clientId ? `cre8-portal-bk-path-${clientId}` : "";
  const [bkPath, setBkPathState] = useState<"yes" | "no" | null>(null);
  useEffect(() => {
    if (!bkPathKey) return;
    try {
      const v = localStorage.getItem(bkPathKey);
      if (v === "yes" || v === "no") setBkPathState(v);
    } catch { /* ignore */ }
  }, [bkPathKey]);
  const setBkPath = (v: "yes" | "no" | null) => {
    setBkPathState(v);
    if (!bkPathKey) return;
    try {
      if (v) localStorage.setItem(bkPathKey, v);
      else localStorage.removeItem(bkPathKey);
    } catch { /* ignore */ }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const lsKey = clientId ? `cre8-portal-${clientId}` : "";

  // Deep-link focus: ?focus=contract | brand-kit
  const focus = searchParams.get("focus");

  // ----- Load -----
  const resolve = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PUB_KEY}`,
        },
        body: JSON.stringify({ clientId, action: "resolve", asAdmin: adminPreview }),
      });
      if (resp.status === 404) {
        setNotFound(true);
        return;
      }
      if (!resp.ok) throw new Error("Could not load portal");
      const data = await resp.json();
      setClient(data.client);
      setSubmittedAt(data.submittedAt);
      setContactEmail(data.contactEmail);
      setAccountAccess(data.accountAccess ?? {});
      setOnboardingInvite(data.onboardingInvite ?? null);
      if (data.subscription) {
        setSubscription({
          id: data.subscription.id ?? null,
          status: data.subscription.status ?? null,
          canceled_at: data.subscription.canceled_at ?? null,
          current_period_end: data.subscription.current_period_end ?? null,
          cancel_at_period_end: !!data.subscription.cancel_at_period_end,
        });
      }
      setProjects(Array.isArray(data.projects) ? data.projects : []);

      // Rehydrate transcript: prefer localStorage if it has more turns
      const cached = lsKey ? localStorage.getItem(lsKey) : null;
      const cachedMsgs: Msg[] = cached ? JSON.parse(cached).messages || [] : [];
      const remoteMsgs: Msg[] = Array.isArray(data.conversation) ? data.conversation : [];
      const hydrated = cachedMsgs.length > remoteMsgs.length ? cachedMsgs : remoteMsgs;
      setMessages(hydrated);
    } catch (e) {
      console.error(e);
      toast.error("Could not load portal");
    } finally {
      setLoading(false);
    }
  }, [clientId, lsKey, adminPreview]);

  useEffect(() => { resolve(); }, [resolve]);

  // The phase ladder and the page-review count, both per project.
  useEffect(() => {
    if (!projectId) { setPhases([]); setPreviewProgress({ approved: 0, total: 0 }); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("portal_project_phases", { _client_project_id: projectId });
      if (!cancelled) setPhases((data ?? []) as PhaseNode[]);

      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/preview-approvals`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
          body: JSON.stringify({ action: "list", client_project_id: projectId }),
        });
        if (!r.ok) throw new Error("no preview");
        const out = await r.json() as { pages?: Array<{ approval?: unknown }> };
        const pages = out.pages ?? [];
        if (!cancelled) {
          setPreviewProgress({
            approved: pages.filter((p) => !!p.approval).length,
            total: pages.length,
          });
        }
      } catch {
        // No preview on this project is the ordinary case, not a fault.
        if (!cancelled) setPreviewProgress({ approved: 0, total: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Check whether the contract for the current web-dev project has been signed.
  // This gates the discovery questionnaire chat.
  useEffect(() => {
    if (!projectId) { setContractSigned(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("client_contracts")
          .select("id, client_signed_at")
          .eq("client_project_id", projectId)
          .not("client_signed_at", "is", null)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setContractSigned(!!data?.client_signed_at);
      } catch {
        if (!cancelled) setContractSigned(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);


  // Persist transcript locally
  useEffect(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({ messages, stage }));
  }, [messages, stage, lsKey]);

  // Auto scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  // Greet on first load if no transcript yet
  useEffect(() => {
    if (loading || notFound || !client) return;
    if (submittedAt) return;
    if (bkPath !== "no") return; // Only greet once the client has chosen the chat path.
    if (messages.length === 0 && !isStreaming) {
      streamReply([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, notFound, client, submittedAt, bkPath]);

  // Deep-link: open the right TAB, then scroll to the section in it.
  //
  // Scrolling alone was enough while every section was stacked on one
  // page. Under tabs, #portal-brand-kit is not in the document until the
  // Brand tab is showing, so a ?focus= link that only scrolled landed on
  // Overview and did nothing — and the email that sent it looks broken.
  useEffect(() => {
    if (loading || notFound || !client || !focus) return;
    const target = focus === "contract" ? { tab: "overview" as const, id: "portal-contract" }
      : focus === "brand-kit" ? { tab: "brand" as const, id: "portal-brand-kit" }
        : null;
    if (!target) return;
    setTab(target.tab);
    const t = window.setTimeout(() => {
      document.getElementById(target.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(t);
  }, [loading, notFound, client, focus]);

  // ----- Streaming chat -----
  const streamReply = async (history: Msg[]) => {
    if (!clientId) return;
    setIsStreaming(true);
    let assistantText = "";
    let detectedComplete = false;

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PUB_KEY}`,
        },
        body: JSON.stringify({ clientId, action: "chat", messages: history }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error("AI is busy — please wait a moment.");
        else toast.error("Could not reach the assistant.");
        setMessages((prev) => prev.slice(0, -1));
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantText += delta;
              const stageMatch = assistantText.match(/\[\[STAGE:(\d+)\]\]/);
              if (stageMatch) setStage(Math.min(8, parseInt(stageMatch[1], 10)));
              if (assistantText.includes("[[BRAND_KIT_COMPLETE]]")) detectedComplete = true;
              const display = cleanContent(assistantText);
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: display };
                return copy;
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Connection error.");
    }

    setIsStreaming(false);
    if (detectedComplete) setReadyToSubmit(true);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    await streamReply(next);
  };

  const submit = async () => {
    if (!clientId) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PUB_KEY}`,
        },
        body: JSON.stringify({ clientId, action: "complete", messages }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || "Submit failed");
      setSubmittedAt(data.submittedAt);
      if (lsKey) localStorage.removeItem(lsKey);
      toast.success("Brand Kit intake submitted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ----- Render -----
  //
  // Board 16 of the Admin Journeys canvas: the project under a tab row,
  // with Overview carrying what the client has to do and where things
  // stand, and the other tabs carrying the things that are about this
  // project rather than things to do today.
  //
  // Everything that used to be stacked down this page is still here —
  // the contract, the discovery chat, account access, the brand kit and
  // brand voice, the preview, the proposals and the invoices. They moved
  // under a tab; none of them was dropped.
  const currentProject = projects.find((p) => p.id === projectId) ?? null;
  const isAutomation = currentProject?.type === "automation_build";
  const isWebDev = currentProject?.type === "web_development";
  const isPreviewable = currentProject?.type === "app_development"
    || currentProject?.type === "web_development"
    || currentProject?.type === "marketing";
  const visibleProjects = projects.filter((p) => p.type !== "site_preview");
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const node = client?.active_node ?? null;
  const businessName = client?.business_name || "Your Brand";
  const tierLabel = client?.tier === "growth" ? "Growth" : "Launch";
  const isBrandKitDone = !!submittedAt;

  if (loading) {
    return (
      <PortalShell
        clientId={clientId!} clientName={client?.contact_name || businessName}
        businessName={client?.business_name ?? null}
        adminPreview={adminPreview} onExitPreview={adminPreview ? exitPreview : undefined}
        view={null} onView={goToPortal}
      >
        <p className="cv-page-sub">Loading…</p>
      </PortalShell>
    );
  }

  if (notFound || !client) {
    return (
      <div className="cv-admin cv-portal">
        <div className="cv-portal__body">
          <section className="cv-card cv-card-pad" style={{ margin: "0 auto", maxWidth: 520 }}>
            <h1 className="cv-page-title">This link isn't working</h1>
            <p className="cv-page-sub">
              We couldn't find a client for this portal link. Check the URL, or
              reply to our last email and we'll send a fresh one.
            </p>
          </section>
        </div>
      </div>
    );
  }

  const t = projectTypeStyle(currentProject?.type ?? "");
  const heroTitle = currentProject?.name || businessName;

  // --- the to-do list, from what is actually outstanding ----------------
  //
  // Computed, not written down: a numbered list that says "sign the
  // contract" to someone who signed it last month is the fastest way to
  // teach a client that this page is decoration.
  const todo: Array<{
    key: string; label: string; sub: string;
    state: "done" | "now" | "later"; href?: string; cta?: string; onClick?: () => void;
  }> = [];
  if (isAutomation || isWebDev) {
    todo.push({
      key: "contract",
      label: "Sign the contract",
      sub: contractSigned ? "Signed. Thank you!" : "It takes a minute, and nothing starts until it's done.",
      state: contractSigned ? "done" : "now",
      onClick: () => scrollToSection("portal-contract"),
      cta: contractSigned ? "View" : "Open the contract",
    });
  }
  if (isWebDev) {
    todo.push({
      key: "discovery",
      label: "Answer the discovery questions",
      sub: contractSigned
        ? "A short guided chat about your goals, pages and content. About 10 minutes, and you can stop and come back."
        : "Opens once the contract is signed.",
      state: contractSigned ? "now" : "later",
      onClick: contractSigned ? () => scrollToSection("portal-discovery") : undefined,
      cta: "Start the chat",
    });
  }
  if (isPreviewable && previewProgress.total > 0) {
    const left = previewProgress.total - previewProgress.approved;
    todo.push({
      key: "review",
      label: left ? `Review ${left} page${left === 1 ? "" : "s"}` : "Pages reviewed",
      sub: left
        ? "Click anywhere on a page to leave a comment, then approve it when it's right."
        : `All ${previewProgress.total} approved. Thank you!`,
      state: left ? "now" : "done",
      href: `/portal/${clientId}/projects/${projectId}/feedback${qs}`,
      cta: "Open feedback board",
    });
  }
  if (isAutomation) {
    todo.push({
      key: "brand",
      label: "Finish your brand kit",
      sub: isBrandKitDone ? "Submitted. Thank you!" : "Your logo, colours and type — or a link we can pull them from.",
      state: isBrandKitDone ? "done" : "now",
      onClick: () => setTab("brand"),
      cta: "Open Brand",
    });
    todo.push({
      key: "access",
      label: "Share account access",
      sub: "The tools your automations run through — SureContact, CoPost and your site.",
      state: "now",
      onClick: () => scrollToSection("portal-account-access"),
      cta: "Open it",
    });
  }
  const openTodo = todo.filter((x) => x.state !== "done").length;

  const ladder = phaseLadder(phases);
  const ladderLine = phaseSummary(ladder);

  const tabs: Array<{ key: ProjectTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "audits", label: "Audits" },
    { key: "files", label: "Files" },
    { key: "logins", label: "Logins" },
    { key: "brand", label: "Brand" },
  ];

  const overview = (
    <div className="cv-pg">
      {todo.length > 0 && (
        <section className="cv-card cv-card-pad" style={{ background: "var(--cv-ink)", color: "#fff" }}>
          <div className="cv-card-head">
            <h2 className="cv-card-title" style={{ color: "#fff" }}>Your to-do</h2>
            <span className="cv-chip" style={{ background: openTodo ? "#E8590C" : "#1E8E4E", color: "#fff" }}>
              {openTodo ? `${openTodo} open` : "All done"}
            </span>
          </div>
          {todo.map((x, i) => (
            <div key={x.key} className="cv-it cv-it--onink">
              <span className={`cv-num ${x.state === "done" ? "cv-num--done" : x.state === "now" ? "cv-num--on" : "cv-num--off"}`}>
                {x.state === "done" ? "✓" : i + 1}
              </span>
              <span className="cv-it__what"><b>{x.label}</b><small>{x.sub}</small></span>
              {x.state === "later" ? (
                <span className="cv-chip" style={{ background: "#262B36", color: "#C9CFDB" }}>Not yet</span>
              ) : x.href ? (
                <Link className="cv-open cv-open--white" style={{ padding: "0 16px" }} to={x.href}>{x.cta}</Link>
              ) : x.onClick ? (
                <button type="button" className="cv-open cv-open--white" style={{ padding: "0 16px" }}
                  onClick={x.onClick}>{x.cta}</button>
              ) : null}
            </div>
          ))}
        </section>
      )}

      {(ladder.length > 0 || client.build_start_date || client.delivery_date) && (
        <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="cv-card-head" style={{ margin: 0 }}>
            <h2 className="cv-card-title">Where things stand</h2>
            <span style={{ flex: 1 }} />
            {client.delivery_date && (
              <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>
                Estimated delivery {new Date(`${client.delivery_date}T12:00:00`)
                  .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>

          {/* The whole ladder, not just the step in flight. "Now: Design"
              on its own is a status; what a client wants to know is what
              is behind them and what is still to come. */}
          {ladder.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ladder.map((p) => (
                <div key={p.id}
                  className={`cv-ph ${p.state === "done" ? "cv-ph--done" : p.state === "now" ? "cv-ph--now" : ""}`}>
                  <small>{PHASE_WORD[p.state]}</small>{p.label}
                </div>
              ))}
            </div>
          ) : node ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <div className="cv-ph cv-ph--now"><small>Now</small>{node.label}</div>
            </div>
          ) : null}

          {ladderLine && (
            <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>{ladderLine}</p>
          )}
          {client.build_start_date && (
            <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
              Build started {new Date(`${client.build_start_date}T12:00:00`)
                .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
            </p>
          )}
        </section>
      )}

      {isPreviewable && (
        <section className="cv-card cv-card-pad"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          <div style={{ flex: "2 1 280px", minWidth: 0 }}>
            <h2 className="cv-card-title">Page reviews</h2>
            <p style={{ margin: "2px 0 10px", fontSize: 14, color: "var(--cv-muted)" }}>
              {previewProgress.total
                ? `${previewProgress.approved} of ${previewProgress.total} pages approved`
                : "Nothing to review yet — we'll email you when there is."}
            </p>
            <span className="cv-bar">
              <i style={{
                width: previewProgress.total
                  ? `${Math.round((previewProgress.approved / previewProgress.total) * 100)}%`
                  : "0%",
              }} />
            </span>
          </div>
          <Link className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
            to={`/portal/${clientId}/projects/${projectId}/feedback${qs}`}>
            Open feedback board
          </Link>
        </section>
      )}

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head"><h2 className="cv-card-title">For this project</h2></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          {/* Built off the live search params, so admin preview survives
              the hop — an admin who clicks through to Payments and loses
              ?as=admin is suddenly looking at a 404. */}
          <Link className="cv-lk" to={portalHref("proposals")}>
            Proposals<small>Read, sign or download</small>
          </Link>
          <Link className="cv-lk" to={portalHref("payments")}>
            Payments<small>What's due and what's paid</small>
          </Link>
        </div>
      </section>

      {/* The delivery walkthrough. A card either way: "after launch" is
          an answer, and silence here reads as something missing. */}
      <section className="cv-card cv-card-pad"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h2 className="cv-card-title">Delivery walkthrough</h2>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--cv-muted)" }}>
            {client.delivery_video_url
              ? "Your walkthrough is ready."
              : "When your project launches, a video walking you through it shows up here."}
          </p>
        </div>
        {client.delivery_video_url ? (
          <a className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
            href={client.delivery_video_url} target="_blank" rel="noreferrer">
            Watch the walkthrough
          </a>
        ) : (
          <span className="cv-chip cv-chip--gray">After launch</span>
        )}
      </section>

      {/* The working surfaces, under the list that points at them. These
          are the same components as before — the contract you sign, the
          discovery chat, the preview — not links to somewhere else. */}
      {(isAutomation || isWebDev) && (
        <div id="portal-contract" style={{ scrollMarginTop: 24 }}>
          <ContractSection
            clientId={clientId!} projectId={currentProject!.id}
            contactName={client.contact_name}
            eyebrow={isWebDev ? null : "Node 01 · Intake"}
          />
        </div>
      )}

      {isWebDev && (
        <div id="portal-discovery" style={{ scrollMarginTop: 24 }}>
          <WebDevDiscoveryChat
            clientId={clientId!} projectId={currentProject!.id}
            contactName={client.contact_name} contractSigned={contractSigned}
          />
        </div>
      )}

      {/* Account access is a client TASK, so it sits under the to-do
          list that points at it rather than on a tab of its own. The
          Logins tab is the other half: named accounts the client hands
          over, one row each. */}
      {isAutomation && (
        <div id="portal-account-access" style={{ scrollMarginTop: 24 }}>
          <AccountAccessSection clientId={clientId!} tier={client.tier} initial={accountAccess} />
        </div>
      )}

      {/* The old Preview panel used to render here. It is gone: it listed
          the same pages, counted the same approvals and collected the
          same comments as the feedback board, from the same tables, in a
          different design — so a client approving a page in one place
          watched the other disagree with them. */}
    </div>
  );

  const brand = (
    <div className="cv-pg">
      <div>
        <h2 className="cv-card-title" style={{ fontSize: 22 }}>Brand</h2>
        <p className="cv-page-sub">
          Your brand kit and your brand voice — the look and the words everything
          Cre8 Visions builds for you is made from.
        </p>
      </div>
      <div id="portal-brand-kit" style={{ scrollMarginTop: 24 }}>
        {isBrandKitDone ? (
          <ConfirmationCard businessName={businessName} submittedAt={submittedAt!} />
        ) : bkPath === null ? (
          <BrandKitRouter onChoose={setBkPath} />
        ) : bkPath === "yes" ? (
          <BrandKitFastSubmit
            clientId={clientId!} submitting={submitting} setSubmitting={setSubmitting}
            onSwitchToChat={() => setBkPath("no")}
            onSubmitted={(at) => {
              setSubmittedAt(at); setBkPath(null);
              if (lsKey) localStorage.removeItem(lsKey);
            }}
          />
        ) : (
          <BrandKitChatLauncher
            clientId={clientId!} hasConversation={messages.length > 0}
            onSwitchToFast={() => setBkPath("yes")}
          />
        )}
      </div>
      {onboardingInvite ? (
        <BrandVoiceAccordion token={onboardingInvite.token} completed={onboardingInvite.completed} />
      ) : (
        <section className="cv-card cv-card-pad">
          <div className="cv-card-head"><h2 className="cv-card-title">Brand voice</h2></div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
            A short guided conversation that captures how you sound. Cre8 Visions
            will open it for you when it's time.
          </p>
        </section>
      )}
    </div>
  );

  const money = isAutomation ? (
    <div id="portal-subscription" style={{ scrollMarginTop: 24 }}>
      <SubscriptionSection clientId={clientId!} tier={client.tier} initial={subscription} />
    </div>
  ) : null;

  return (
    <PortalShell
      clientId={clientId!}
      clientName={client.contact_name || businessName}
      businessName={client.business_name ?? null}
      adminPreview={adminPreview}
      onExitPreview={adminPreview ? exitPreview : undefined}
      view="projects"
      onView={goToPortal}
    >
      <div className="cv-pg">
        <div>
          {visibleProjects.length > 1 && (
            <Link to={`/portal/${clientId}${qs}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14,
                color: "var(--cv-muted)", padding: "10px 0", textDecoration: "none" }}>
              <ArrowLeft size={14} /> All projects
            </Link>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <h1 className="cv-page-title">{heroTitle}</h1>
            <span className="cv-chip" style={{ background: t.bg, color: t.fg }}>
              {isAutomation ? `${tierLabel} Journey` : t.label}
            </span>
            {openTodo > 0 && <span className="cv-chip cv-chip--amber">Waiting on you</span>}
          </div>
          <p className="cv-page-sub">
            Welcome{client.contact_name ? `, ${client.contact_name}` : ""}.
            {contactEmail ? ` We'll keep you posted at ${contactEmail}.` : ""}
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {tabs.map((x) => (
            <button key={x.key} type="button"
              className={`cv-tabpill ${tab === x.key ? "cv-tabpill--on" : ""}`}
              onClick={() => setTab(x.key)}>
              {x.label}
            </button>
          ))}
        </div>

        {!currentProject ? (
          <section className="cv-card cv-card-pad">
            <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
              We couldn't find that project. Go back to all projects and pick one.
            </p>
          </section>
        ) : tab === "audits" ? (
          <AuditsSection clientProjectId={currentProject.id} />
        ) : tab === "files" ? (
          <FilesSection
            clientId={clientId!}
            clientProjectId={currentProject.id}
            clientName={client.contact_name}
          />
        ) : tab === "logins" ? (
          <PortalLoginsSection clientId={clientId!} clientProjectId={currentProject.id} />
        ) : tab === "brand" ? brand
          : <>{overview}{money}</>}
      </div>
    </PortalShell>
  );
}

// ---------- Sub-components ----------

function BrandVoiceAccordion({ token, completed }: { token: string; completed: boolean }) {
  const [open, setOpen] = useState(!completed);
  return (
    <section
      id="portal-onboarding-chat"
      className={`portal-access ${open ? "is-open" : "is-closed"}`}
      style={{ scrollMarginTop: 24 }}
    >
      <button
        type="button"
        className="portal-access__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="portal-access__toggle-left">
          <div className="portal-access__eyebrow">Node 01 · Intake</div>
          <h2 className="portal-access__title">
            Brand <em>Voice</em> Chat.
          </h2>
        </div>
        <div className="portal-access__toggle-right">
          <span className={`portal-access__status ${completed ? "is-done" : ""}`}>
            {completed ? "Completed" : "Action required"}
          </span>
          <span className={`portal-access__chev ${open ? "is-open" : ""}`}>›</span>
        </div>
      </button>

      {open && (
        <div className="portal-access__body">
          <p className="portal-access__intro">
            A short, guided conversation that captures your voice, audience, and goals. This is
            the foundation for everything we build — please complete it before your build kicks off.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
            {completed && (
              <span className="portal-access__badge">✓ Submitted to your CRE8 team</span>
            )}
            <a
              href={`/onboarding?invite=${token}`}
              target="_blank"
              rel="noreferrer"
              className="crm-btn crm-btn--bronze crm-btn--sm"
            >
              {completed ? "Reopen Brand Voice chat →" : "Open Brand Voice chat →"}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

function BrandKitChatLauncher({
  clientId,
  hasConversation,
  onSwitchToFast,
}: {
  clientId: string;
  hasConversation: boolean;
  onSwitchToFast: () => void;
}) {
  return (
    <section className="portal-node-card">
      <div className="portal-node-card__head">
        <h2 className="portal-node-card__title">
          Brand <em>Kit</em> Chat.
        </h2>
        <p className="portal-node-card__desc">
          A short, considered conversation to capture the visual foundation of your brand —
          logo direction, color, type, and reference points. Opens in a focused window.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
          <a
            href={`/portal/${clientId}/brand-kit`}
            target="_blank"
            rel="noreferrer"
            className="crm-btn crm-btn--bronze crm-btn--sm"
          >
            {hasConversation ? "Resume Brand Kit chat →" : "Open Brand Kit chat →"}
          </a>
          <button
            type="button"
            onClick={onSwitchToFast}
            className="crm-btn crm-btn--ghost crm-btn--sm"
          >
            ← I already have brand assets
          </button>
        </div>
      </div>
    </section>
  );
}


function ConfirmationCard({ businessName, submittedAt }: { businessName: string; submittedAt: string }) {
  const dt = new Date(submittedAt);
  return (
    <section className="portal-confirm">
      <div className="portal-confirm__eyebrow">Submitted</div>
      <h2 className="portal-confirm__title">
        Thank <em>you</em>.
      </h2>
      <hr className="portal-confirm__rule" />
      <p className="portal-confirm__sub">
        Your Brand Kit intake is in our hands. The CRE8 team has been notified and will be in
        touch as the next deliverable for {businessName} comes together.
      </p>
      <p className="portal-confirm__meta">
        Submitted {dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        {" · "}
        {dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </p>
    </section>
  );
}

function PlaceholderCard({ node }: { node: ActiveNode | null }) {
  if (!node) {
    return (
      <section className="portal-confirm">
        <div className="portal-confirm__eyebrow">All clear</div>
        <h2 className="portal-confirm__title">
          Nothing pending <em>right now</em>.
        </h2>
        <hr className="portal-confirm__rule" />
        <p className="portal-confirm__sub">
          Your team is moving things forward. We'll email you when the next step is ready for
          your input.
        </p>
      </section>
    );
  }
  return (
    <section className="portal-node-card">
      <div className="portal-node-card__head">
        <h2 className="portal-node-card__title">{node.label}.</h2>
        <p className="portal-node-card__desc">
          Your team is working on this step. We'll email you when it's ready for your input
          here in the portal.
        </p>
      </div>
    </section>
  );
}

// ---------- Brand Kit routing question (shown before any intake input) ----------
function BrandKitRouter({ onChoose }: { onChoose: (v: "yes" | "no") => void }) {
  return (
    <section className="portal-node-card">
      <div className="portal-node-card__head">
        <h2 className="portal-node-card__title">
          Brand <em>Kit</em>.
        </h2>
        <p className="portal-node-card__desc">
          Do you already have brand assets like a logo, colors, or fonts?
        </p>
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          padding: "0 24px 24px",
        }}
      >
        <button
          type="button"
          className="crm-btn crm-btn--bronze"
          onClick={() => onChoose("yes")}
        >
          Yes, I have them →
        </button>
        <button
          type="button"
          className="crm-btn crm-btn--ghost"
          onClick={() => onChoose("no")}
        >
          No, build it for me →
        </button>
      </div>
    </section>
  );
}

// ---------- Brand Kit Fast Submit form ----------
// Uploads logo + optional guidelines PDF directly to Supabase storage
// (bucket: client-assets, folder: brand-kit/), then calls the edge function's
// fast-complete action to persist intake and notify the team.
function BrandKitFastSubmit({
  clientId, submitting, setSubmitting, onSwitchToChat, onSubmitted,
}: {
  clientId: string;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onSwitchToChat: () => void;
  onSubmitted: (submittedAt: string) => void;
}) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [colors, setColors] = useState("");
  const [fonts, setFonts] = useState("");
  const [guidelinesFile, setGuidelinesFile] = useState<File | null>(null);

  const uploadOne = async (file: File): Promise<{ path: string; name: string; size: number; mime: string }> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `brand-kit/${clientId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("client-assets").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);
    return { path, name: file.name, size: file.size, mime: file.type || "" };
  };

  const handleSubmit = async () => {
    const trimmedUrl = websiteUrl.trim();
    if (!logoFile && !trimmedUrl) {
      toast.error("Please upload a logo or paste your website link.");
      return;
    }
    if (logoFile && logoFile.size > 15 * 1024 * 1024) {
      toast.error("Logo file must be under 15MB.");
      return;
    }
    if (guidelinesFile && guidelinesFile.size > 15 * 1024 * 1024) {
      toast.error("Guidelines PDF must be under 15MB.");
      return;
    }

    setSubmitting(true);
    try {
      const logoMeta = logoFile ? await uploadOne(logoFile) : null;
      const guidelinesMeta = guidelinesFile ? await uploadOne(guidelinesFile) : null;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PUB_KEY}`,
        },
        body: JSON.stringify({
          clientId,
          action: "fast-complete",
          intake: {
            logo_file: logoMeta,
            guidelines_file: guidelinesMeta,
            website_url: trimmedUrl,
            colors: colors.trim(),
            typography: fonts.trim(),
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || "Submit failed");

      toast.success("Brand Kit submitted");
      onSubmitted(data.submittedAt);
    } catch (e) {
      console.error("[brand-kit fast submit]", e);
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 14,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    marginBottom: 8,
    color: "var(--portal-text-muted, #6b6358)",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--portal-border, rgba(0,0,0,0.12))",
    borderRadius: 6,
    fontSize: 17,
    background: "transparent",
    color: "inherit",
  };

  return (
    <section className="portal-node-card">
      <div className="portal-node-card__head">
        <h2 className="portal-node-card__title">
          Brand <em>Kit</em>.
        </h2>
        <p className="portal-node-card__desc">
          Just your logo or website link is all we need to start — everything else is optional.
        </p>
        <button
          type="button"
          onClick={onSwitchToChat}
          className="crm-btn crm-btn--ghost crm-btn--sm"
          style={{ marginTop: 12, alignSelf: "flex-start" }}
          disabled={submitting}
        >
          ← I don't have assets — build it for me
        </button>
      </div>

      <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Logo (required) */}
        <div>
          <label style={fieldLabelStyle}>Logo (required)</label>
          <input
            type="file"
            accept="image/*,.svg,.pdf,.ai,.eps"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
            style={{ display: "block", marginBottom: 12 }}
          />
          <div style={{ fontSize: 15, color: "var(--portal-text-muted, #6b6358)", marginBottom: 8 }}>
            …or paste a link to a site we can pull your logo from:
          </div>
          <input
            type="url"
            inputMode="url"
            placeholder="https://yourbrand.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={submitting}
            maxLength={500}
            style={inputStyle}
          />
        </div>

        <hr style={{ border: 0, borderTop: "1px solid var(--portal-border, rgba(0,0,0,0.12))", margin: 0 }} />

        <div style={{ fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--portal-text-muted, #6b6358)" }}>
          Optional — add if you have them
        </div>

        <div>
          <label style={fieldLabelStyle}>Hex color codes</label>
          <input
            type="text"
            placeholder="#0F172A, #D4A373, #FAF8F5"
            value={colors}
            onChange={(e) => setColors(e.target.value)}
            disabled={submitting}
            maxLength={500}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Font names</label>
          <input
            type="text"
            placeholder="Cormorant Garamond, Karla"
            value={fonts}
            onChange={(e) => setFonts(e.target.value)}
            disabled={submitting}
            maxLength={500}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Brand guidelines PDF</label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setGuidelinesFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="crm-btn crm-btn--bronze"
            onClick={handleSubmit}
            disabled={submitting || (!logoFile && !websiteUrl.trim())}
          >
            {submitting ? "Submitting…" : "Submit →"}
          </button>
        </div>
      </div>
    </section>
  );
}
