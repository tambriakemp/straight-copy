// Middle pane: talking to the agent.
//
// A turn that produces work writes agent_actions exactly as a scheduled run
// does, so proposals surface inline here and still go through the same approval
// screen. Chat is another way to reach the agent, not a second system.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import AgentAvatar from "@/components/admin/AgentAvatar";
import {
  sendAgentMessage, errMsg,
  type Agent, type AgentMessage,
} from "@/lib/agentsApi";

export default function AgentChatPanel({ agent, onActivity, reloadNonce = 0 }: {
  agent: Agent;
  /** Called after a turn that may have produced a run, so activity can refresh. */
  onActivity: () => void;
  /** Bumped by the parent when something outside chat added a message. */
  reloadNonce?: number;
}) {
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Resume the most recent thread rather than opening a blank one every visit.
  useEffect(() => {
    (async () => {
      const { data: conv } = await supabase.from("agent_conversations")
        .select("id").eq("agent_id", agent.id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (!conv) return;
      setConversationId(conv.id);
      const { data: msgs } = await supabase.from("agent_messages")
        .select("*").eq("conversation_id", conv.id).order("created_at");
      setMessages((msgs ?? []) as AgentMessage[]);
    })();
  }, [agent.id, reloadNonce]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    // Show it immediately; the id is replaced when the real row comes back.
    const optimistic: AgentMessage = {
      id: `local-${Date.now()}`, conversation_id: conversationId ?? "",
      role: "user", content: text, run_id: null, action_ids: [],
      error: null, created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setDraft("");
    setSending(true);

    try {
      const reply = await sendAgentMessage({
        agentId: agent.id, conversationId, message: text,
      });
      setConversationId(reply.conversation_id);

      const { data: msgs } = await supabase.from("agent_messages")
        .select("*").eq("conversation_id", reply.conversation_id).order("created_at");
      setMessages((msgs ?? []) as AgentMessage[]);

      if (reply.actions.length) {
        const pending = reply.actions.filter((a) => a.status === "proposed").length;
        toast.success(pending
          ? `${pending} action${pending === 1 ? "" : "s"} waiting for your approval`
          : `${reply.actions.length} action${reply.actions.length === 1 ? "" : "s"} done`);
      }
      onActivity();
    } catch (e) {
      // Roll back the optimistic message so the box does not lie about what sent.
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setDraft(text);
      toast.error(errMsg(e) || "Could not reach the agent");
    } finally {
      setSending(false);
      boxRef.current?.focus();
    }
  };

  return (
    <section className="ws__chat">
      <div className="ws__chat-scroll">
        {!messages.length && !sending ? (
          <div className="ws__chat-empty">
            <AgentAvatar name={agent.name} url={agent.avatar_url}
              accent={agent.accent_color} size={56} />
            <p className="ws__chat-empty-title">No messages yet. Send the first one.</p>
            <p className="ws__chat-empty-sub">
              {agent.name} can see everything it uses for its scheduled runs — ask about it,
              or hand it something to do.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`ws__msg ws__msg--${m.role}`}>
              {m.role === "assistant" && (
                <AgentAvatar name={agent.name} url={agent.avatar_url}
                  accent={agent.accent_color} size={26} />
              )}
              <div className="ws__msg-body">
                <div className="ws__msg-bubble">
                  {m.role === "assistant"
                    ? <ReactMarkdown>{m.content}</ReactMarkdown>
                    : m.content}
                </div>
                {!!m.action_ids?.length && (
                  <button className="ws__msg-actions"
                    onClick={() => m.run_id && navigate(`/admin/agents/runs/${m.run_id}`)}>
                    {m.action_ids.length} action{m.action_ids.length === 1 ? "" : "s"} — review →
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="ws__msg ws__msg--assistant">
            <AgentAvatar name={agent.name} url={agent.avatar_url}
              accent={agent.accent_color} size={26} />
            <div className="ws__msg-body">
              <div className="ws__msg-bubble ws__msg-bubble--thinking">Thinking…</div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="ws__composer">
        <textarea
          ref={boxRef}
          className="ws__composer-input"
          rows={1}
          value={draft}
          placeholder={`Message ${agent.name}…`}
          disabled={sending}
          onChange={(e) => {
            setDraft(e.target.value);
            // Grow with the message, up to a point.
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline.
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button className="ws__composer-send" onClick={send} disabled={sending || !draft.trim()}
          aria-label="Send">↑</button>
      </div>
    </section>
  );
}

