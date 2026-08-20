// Multiple-choice answers, so a reply is a tap rather than a paragraph.
//
// The agent asks in options; this renders them and hands the chosen labels
// back as an ordinary user message. Nothing is stored beyond the message that
// asked — answering is just sending, so there is no half-answered state to
// keep, resume or clean up.
import { useState } from "react";

export type AgentQuestion = {
  id: string;
  question: string;
  multi?: boolean;
  options: Array<{ label: string; description?: string }>;
};

export default function AgentQuestions({ questions, disabled, onAnswer }: {
  questions: AgentQuestion[];
  disabled?: boolean;
  /** Receives the composed reply text, ready to send as a user message. */
  onAnswer: (text: string) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  const toggle = (q: AgentQuestion, label: string) => {
    setPicked((p) => {
      const current = p[q.id] ?? [];
      if (q.multi) {
        return {
          ...p,
          [q.id]: current.includes(label)
            ? current.filter((l) => l !== label)
            : [...current, label],
        };
      }
      // Single-choice re-tap clears, so a mis-tap is one tap to undo.
      return { ...p, [q.id]: current[0] === label ? [] : [label] };
    });
  };

  const answered = questions.filter((q) => (picked[q.id] ?? []).length > 0);
  // A single-question ask sends on tap; only a multi-part ask needs a button,
  // because there is nothing to confirm when there is one thing to choose.
  const needsButton = questions.length > 1 || questions.some((q) => q.multi);

  const compose = (state: Record<string, string[]>) =>
    questions
      .filter((q) => (state[q.id] ?? []).length > 0)
      .map((q) => `${q.question} ${(state[q.id] ?? []).join(", ")}`)
      .join("\n");

  const send = () => {
    const text = compose(picked);
    if (!text) return;
    setPicked({});
    onAnswer(text);
  };

  return (
    <div className="ws__ask">
      {questions.map((q) => {
        const chosen = picked[q.id] ?? [];
        return (
          <div key={q.id} className="ws__ask-block">
            <p className="ws__ask-q">{q.question}</p>
            {q.multi && <p className="ws__ask-hint">Pick as many as apply.</p>}
            <div className="ws__ask-options">
              {q.options.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  disabled={disabled}
                  className={`ws__ask-opt${chosen.includes(o.label) ? " ws__ask-opt--on" : ""}`}
                  onClick={() => {
                    if (needsButton) return toggle(q, o.label);
                    onAnswer(`${q.question} ${o.label}`);
                  }}
                >
                  <span>{o.label}</span>
                  {o.description && <span className="ws__ask-opt-desc">{o.description}</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {needsButton && (
        <button className="ws__ask-send" onClick={send}
          disabled={disabled || answered.length === 0}>
          Send {answered.length > 0 ? `${answered.length} answer${answered.length === 1 ? "" : "s"}` : "answers"}
        </button>
      )}
      <p className="ws__ask-hint">Or type your own answer below.</p>
    </div>
  );
}
