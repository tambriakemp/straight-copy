import { useEffect, useRef } from "react";
import { useWebDevDiscoveryChat } from "@/components/portal/useWebDevDiscoveryChat";

type Props = {
  clientId: string;
  projectId: string;
  contactName: string | null;
  /** True once the client has signed (and the agency has counter-signed) the contract for this project. */
  contractSigned: boolean;
  adminPreview: boolean;
};

export default function WebDevDiscoveryChat({
  clientId,
  projectId,
  contactName,
  contractSigned,
  adminPreview,
}: Props) {
  const {
    loading, messages, sending, completed, submittedAt, input, setInput, send, firstName,
  } = useWebDevDiscoveryChat({ clientId, projectId, contactName, contractSigned, adminPreview });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ----- Render -----

  if (!contractSigned) {
    return (
      <section className="portal-node-card" style={cardStyle}>
        <div className="portal-node-card__head">
          <div style={eyebrowStyle}>Locked · Awaiting Contract</div>
          <h2 className="portal-node-card__title">
            Discovery <em>questionnaire</em>.
          </h2>
          <p className="portal-node-card__desc">
            Your discovery chat opens the moment your Web Development Services Agreement is
            signed. Once that's done, this is where we'll learn everything we need to design
            and build your site.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="portal-node-card" style={cardStyle}>
      <div style={{ padding: "24px 24px 0" }}>
        <div style={eyebrowStyle}>Node · Discovery</div>
        <h2 className="portal-node-card__title" style={{ margin: "4px 0 6px" }}>
          Tell us about your <em>vision</em>.
        </h2>
        <p style={subStyle}>
          {firstName}, this is a real conversation — answer in your own words. We'll work
          through everything we need to design your site, one question at a time.
        </p>
      </div>

      {completed && (
        <div role="status" aria-live="polite" style={completeBannerStyle}>
          Your questionnaire is complete. Bree has been notified — your next step is the Brand Kit, which just unlocked in your portal.
          {submittedAt && (
            <span style={{ display: "block", marginTop: 4, opacity: 0.7, fontSize: 13, letterSpacing: "0.06em" }}>
              Submitted {new Date(submittedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Conversation surface */}
      <div ref={scrollRef} style={scrollStyle} aria-live="polite">
        {loading && messages.length === 0 ? (
          <div style={loadingStyle}>Loading your conversation…</div>
        ) : null}

        {messages.length === 0 && !loading && !sending && (
          <div style={loadingStyle}>Opening the conversation…</div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} />
        ))}

        {sending && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 4 }}>
            <Avatar />
            <div style={{ ...bubbleBase, ...bubbleAssistant, opacity: 0.7 }}>
              <span className="portal-discovery__typing">Typing</span>
              <span className="portal-discovery__dots">…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={inputBarStyle}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={completed || sending}
          placeholder={
            completed
              ? "Conversation complete — thank you."
              : sending
                ? "Sending…"
                : "Type your answer and press Enter…"
          }
          style={textareaStyle}
        />
        <button
          type="button"
          onClick={send}
          disabled={completed || sending || !input.trim()}
          className="crm-btn crm-btn--bronze crm-btn--sm"
          style={{ alignSelf: "stretch" }}
        >
          Send
        </button>
      </div>
    </section>
  );
}

// ---------- Sub-components ----------

function Avatar() {
  return (
    <div
      aria-hidden
      style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "linear-gradient(135deg, hsl(35 60% 55%), hsl(35 40% 40%))",
        color: "hsl(40 25% 12%)",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 600,
        fontStyle: "italic",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16,
        flexShrink: 0,
        boxShadow: "0 0 0 1px hsl(35 30% 30% / 0.4)",
      }}
    >
      CV
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        gap: 10,
        alignItems: "flex-end",
      }}
    >
      {!isUser && <Avatar />}
      <div style={{ ...bubbleBase, ...(isUser ? bubbleUser : bubbleAssistant) }}>
        {content.split("\n").map((line, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0" }}>{line}</p>
        ))}
      </div>
    </div>
  );
}

// ---------- Styles ----------

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "hsl(30 8% 8%)",
  border: "1px solid hsl(30 8% 18%)",
  borderRadius: 6,
  overflow: "hidden",
  minHeight: 560,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 13,
  letterSpacing: "0.3em",
  textTransform: "uppercase",
  color: "hsl(35 40% 55%)",
  fontFamily: "'Karla', sans-serif",
};

const subStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.7,
  color: "hsl(30 8% 62%)",
  margin: "8px 0 20px",
  fontFamily: "'Karla', sans-serif",
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  minHeight: 320,
  maxHeight: 520,
  background: "hsl(30 8% 6%)",
  borderTop: "1px solid hsl(30 8% 16%)",
  borderBottom: "1px solid hsl(30 8% 16%)",
};

const loadingStyle: React.CSSProperties = {
  color: "hsl(30 8% 50%)",
  fontSize: 15,
  letterSpacing: "0.04em",
  fontFamily: "'Karla', sans-serif",
  textAlign: "center",
  padding: "32px 0",
};

const bubbleBase: React.CSSProperties = {
  maxWidth: "75%",
  padding: "12px 16px",
  borderRadius: 10,
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: "'Karla', sans-serif",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const bubbleAssistant: React.CSSProperties = {
  background: "hsl(30 8% 12%)",
  border: "1px solid hsl(30 8% 22%)",
  color: "hsl(40 20% 92%)",
  borderTopLeftRadius: 2,
};

const bubbleUser: React.CSSProperties = {
  background: "linear-gradient(135deg, hsl(35 50% 45%), hsl(35 40% 38%))",
  color: "hsl(40 30% 96%)",
  borderTopRightRadius: 2,
};

const inputBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: 16,
  background: "hsl(30 8% 8%)",
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: "none",
  background: "hsl(30 8% 12%)",
  border: "1px solid hsl(30 8% 22%)",
  borderRadius: 6,
  color: "hsl(40 20% 92%)",
  padding: "12px 14px",
  fontSize: 16,
  fontFamily: "'Karla', sans-serif",
  lineHeight: 1.5,
  outline: "none",
  minHeight: 48,
  maxHeight: 160,
};

const completeBannerStyle: React.CSSProperties = {
  margin: "16px 24px 0",
  padding: "14px 16px",
  background: "hsl(35 40% 15%)",
  border: "1px solid hsl(35 40% 30%)",
  borderRadius: 6,
  color: "hsl(35 60% 80%)",
  fontSize: 15,
  letterSpacing: "0.02em",
  lineHeight: 1.6,
  fontFamily: "'Karla', sans-serif",
};
