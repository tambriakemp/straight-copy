import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AccountAccessSection, { type AccountAccessState } from "@/components/portal/AccountAccessSection";
import ContractSection from "@/components/portal/ContractSection";
import SubscriptionSection, { type SubscriptionState } from "@/components/portal/SubscriptionSection";

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

const STAGE_LABELS = [
  "Welcome",
  "Logo",
  "Colors",
  "Typography",
  "References",
  "Visual Rules",
  "File Formats",
  "Scope",
  "Review",
];

export default function Portal() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

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
  const [subscription, setSubscription] = useState<SubscriptionState>({
    id: null,
    status: null,
    canceled_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
  });

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [stage, setStage] = useState(1);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      if (data.subscription) {
        setSubscription({
          id: data.subscription.id ?? null,
          status: data.subscription.status ?? null,
          canceled_at: data.subscription.canceled_at ?? null,
          current_period_end: data.subscription.current_period_end ?? null,
          cancel_at_period_end: !!data.subscription.cancel_at_period_end,
        });
      }

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
  }, [clientId, lsKey]);

  useEffect(() => { resolve(); }, [resolve]);

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
    if (client.active_node?.key !== "brand_kit") return;
    if (messages.length === 0 && !isStreaming) {
      streamReply([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, notFound, client, submittedAt]);

  // Deep-link: scroll to focused section after load
  useEffect(() => {
    if (loading || notFound || !client || !focus) return;
    const targetId = focus === "contract" ? "portal-contract" : focus === "brand-kit" ? "portal-brand-kit" : null;
    if (!targetId) return;
    // Small delay so layout settles after sections mount
    const t = window.setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
            title="Exit admin preview on this tab"
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

  const node = client.active_node;
  const businessName = client.business_name || "Your Brand";
  const tierLabel = client.tier === "growth" ? "Growth" : "Launch";
  const isBrandKitDone = !!submittedAt;
  const isBrandKitActive = node?.key === "brand_kit" && !isBrandKitDone;

  return (
    <div className="crm-shell">
      {adminBanner}
      <div className="portal-shell">
        {/* Header */}
        <header className="portal-header">
          <div className="portal-header__left">
            <div className="portal-header__wordmark">Cre8<span className="dot">·</span>Portal</div>
          </div>
          <div className="portal-header__right">
            {node && (
              <span className="portal-chip">
                Step {String(node.order_index).padStart(2, "0")} of 10 · {node.label}
              </span>
            )}
          </div>
        </header>

        <main className="portal-main">
          {/* Hero */}
          <section className="portal-hero">
            <div className="portal-hero__eyebrow">{tierLabel} Journey</div>
            <h1 className="portal-hero__title">
              {businessName.split(" ").slice(0, -1).join(" ") || businessName}{" "}
              {businessName.split(" ").length > 1 && (
                <em>{businessName.split(" ").slice(-1)[0]}</em>
              )}
              {businessName.split(" ").length === 1 && <em>.</em>}
            </h1>
            <hr className="portal-hero__rule" />
            <p className="portal-hero__sub">
              Welcome{client.contact_name ? `, ${client.contact_name}` : ""}.
              {contactEmail ? ` We'll keep you posted at ${contactEmail}.` : ""}
            </p>
            {(client.build_start_date || client.delivery_date) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 24,
                  marginTop: 18,
                  fontSize: 13,
                  letterSpacing: "0.04em",
                  color: "hsl(30 8% 62%)",
                }}
              >
                {client.build_start_date && (
                  <span>
                    <strong style={{ color: "hsl(40 20% 97%)", fontWeight: 500 }}>Build starts</strong>{" "}
                    {new Date(client.build_start_date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                {client.delivery_date && (
                  <span>
                    <strong style={{ color: "hsl(40 20% 97%)", fontWeight: 500 }}>Delivery</strong>{" "}
                    {new Date(client.delivery_date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Delivery video — shown once admin pastes a link */}
          {client.delivery_video_url && (
            <section className="portal-confirm" id="portal-delivery-video" style={{ scrollMarginTop: 24 }}>
              <div className="portal-confirm__eyebrow">Your Delivery</div>
              <h2 className="portal-confirm__title">
                Walk<em>through</em>.
              </h2>
              <hr className="portal-confirm__rule" />
              <p className="portal-confirm__sub">
                Your delivery video is ready. Watch the walkthrough below.
              </p>
              <a
                href={client.delivery_video_url}
                target="_blank"
                rel="noreferrer"
                className="crm-btn crm-btn--bronze crm-btn--sm"
                style={{ display: "inline-block", marginTop: 16 }}
              >
                Watch delivery video →
              </a>
            </section>
          )}

          {/* Contract — sign your service agreement */}
          <div id="portal-contract" style={{ scrollMarginTop: 24 }}>
            <ContractSection
              clientId={clientId!}
              contactName={client.contact_name}
            />
          </div>

          {/* Account Access — always available, collapsible */}
          <AccountAccessSection
            clientId={clientId!}
            tier={client.tier}
            initial={accountAccess}
          />

          {/* Subscription — manage plan / cancel / resume */}
          <div id="portal-subscription" style={{ scrollMarginTop: 24 }}>
            <SubscriptionSection
              clientId={clientId!}
              tier={client.tier}
              initial={subscription}
            />
          </div>

          {/* Body */}
          <div id="portal-brand-kit" style={{ scrollMarginTop: 24 }}>
            {isBrandKitDone ? (
              <ConfirmationCard businessName={businessName} submittedAt={submittedAt!} />
            ) : isBrandKitActive ? (
              <BrandKitChat
                node={node!}
                stage={stage}
                messages={messages}
                input={input}
                setInput={setInput}
                isStreaming={isStreaming}
                readyToSubmit={readyToSubmit}
                submitting={submitting}
                onSend={send}
                onSubmit={submit}
                scrollRef={scrollRef}
              />
            ) : (
              <PlaceholderCard node={node} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function BrandKitChat({
  node, stage, messages, input, setInput, isStreaming, readyToSubmit, submitting,
  onSend, onSubmit, scrollRef,
}: {
  node: ActiveNode;
  stage: number;
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  isStreaming: boolean;
  readyToSubmit: boolean;
  submitting: boolean;
  onSend: () => void;
  onSubmit: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <section className="portal-node-card">
      <div className="portal-node-card__head">
        <div className="portal-node-card__num">
          Stage <em>{String(node.order_index).padStart(2, "0")}</em>
        </div>
        <h2 className="portal-node-card__title">
          Brand <em>Kit</em>.
        </h2>
        <p className="portal-node-card__desc">
          A short, considered conversation to capture the visual foundation of your brand —
          logo direction, color, type, and reference points.
        </p>
        <div className="portal-stage-indicator">
          <span className="portal-stage-indicator__lbl">{STAGE_LABELS[Math.min(stage, STAGE_LABELS.length - 1)]}</span>
          <span className="portal-stage-indicator__count">Stage {stage} of 8</span>
        </div>
      </div>

      <div className="portal-chat" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`portal-bubble portal-bubble--${m.role}`}>
            {m.content || (m.role === "assistant" && isStreaming && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="portal-bubble portal-bubble--assistant">…</div>
        )}
      </div>

      <div className="portal-composer">
        <textarea
          className="portal-composer__input"
          placeholder={readyToSubmit ? "Anything to add before you submit?" : "Type your answer…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          disabled={isStreaming || submitting}
          rows={2}
        />
        <div className="portal-composer__actions">
          <button
            className="crm-btn crm-btn--ghost crm-btn--sm"
            onClick={onSend}
            disabled={isStreaming || submitting || !input.trim()}
          >
            Send →
          </button>
          {readyToSubmit && (
            <button
              className="crm-btn crm-btn--bronze crm-btn--sm"
              onClick={onSubmit}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Review & Submit"}
            </button>
          )}
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
        <div className="portal-node-card__num">
          Stage <em>{String(node.order_index).padStart(2, "0")}</em>
        </div>
        <h2 className="portal-node-card__title">{node.label}.</h2>
        <p className="portal-node-card__desc">
          Your team is working on this step. We'll email you when it's ready for your input
          here in the portal.
        </p>
      </div>
    </section>
  );
}
