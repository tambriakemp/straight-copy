// Mockup 17's "Discovery chat" panel, on the dark client surface.
//
// Same conversation as the old project page's bespoke dark card -- same
// hook, same edge function, same `web_dev_discovery` row -- drawn in the
// `.cp-chat` markup Camille added for this card instead of that card's own
// inline styles. See `useWebDevDiscoveryChat.ts` for why there is one
// source of truth for what the chat does and two for how it looks.

import { useEffect, useRef } from "react";
import { useWebDevDiscoveryChat } from "@/components/portal/useWebDevDiscoveryChat";

export default function ClientDiscoveryChat({
  clientId,
  projectId,
  contactName,
  contractSigned,
  adminPreview,
}: {
  clientId: string;
  projectId: string;
  contactName: string | null;
  contractSigned: boolean;
  adminPreview: boolean;
}) {
  const { loading, messages, sending, completed, input, setInput, send } = useWebDevDiscoveryChat({
    clientId,
    projectId,
    contactName,
    contractSigned,
    adminPreview,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  if (!contractSigned) {
    return (
      <section className="cp-panel">
        <h2 className="cp-panel__title">Discovery chat</h2>
        <p className="cp-panel__body">
          Opens the moment your Web Development Services Agreement is signed.
        </p>
      </section>
    );
  }

  return (
    <section className="cp-panel">
      <h2 className="cp-panel__title">Discovery chat</h2>
      <div ref={scrollRef} className="cp-chat">
        {loading && messages.length === 0 ? (
          <p className="cp-card__calm">Loading your conversation…</p>
        ) : messages.length === 0 && !sending ? (
          <p className="cp-card__calm">Opening the conversation…</p>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`cp-chat__row cp-chat__row--${message.role === "user" ? "me" : "them"}`}
            >
              <span className="cp-chat__bubble">{message.content}</span>
            </div>
          ))
        )}
        {sending && (
          <div className="cp-chat__row cp-chat__row--them">
            <span className="cp-chat__bubble">Typing…</span>
          </div>
        )}
      </div>
      {completed ? (
        <p className="cp-panel__hint">Your questionnaire is complete. Thank you.</p>
      ) : (
        <div className="cp-chat__input">
          <input
            type="text"
            placeholder="Type your answer…"
            value={input}
            disabled={sending}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className="cp__btn cp__btn--primary"
            disabled={sending || !input.trim()}
            onClick={() => void send()}
          >
            Send
          </button>
        </div>
      )}
    </section>
  );
}
