// Middle pane: talking to the agent.
//
// A turn that produces work writes agent_actions exactly as a scheduled run
// does, so proposals surface inline here and still go through the same approval
// screen. Chat is another way to reach the agent, not a second system.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentQuestions, { type AgentQuestion } from "@/components/admin/agent/AgentQuestions";
import AgentActionCards from "@/components/admin/agent/AgentActionCards";
import AgentSteps from "@/components/admin/agent/AgentSteps";
import { useAgentSteps } from "@/components/admin/agent/useAgentSteps";
import { supabase } from "@/integrations/supabase/client";
import AgentAvatar from "@/components/admin/AgentAvatar";
import {
  sendAgentMessage, errMsg,
  type Agent, type AgentAction, type AgentMessage,
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

  // Actions referenced by messages in this thread, keyed by id. Loaded
  // alongside the messages so a proposal is decidable where it was made rather
  // than behind a link to the run page.
  const [actions, setActions] = useState<Record<string, AgentAction>>({});

  const loadMessages = useCallback(async (convId: string) => {
    const { data } = await supabase.from("agent_messages")
      .select("*").eq("conversation_id", convId).order("created_at");
    const rows = (data ?? []) as unknown as AgentMessage[];
    setMessages(rows);

    const ids = [...new Set(rows.flatMap((m) => m.action_ids ?? []))];
    if (!ids.length) return setActions({});
    const { data: acts } = await supabase.from("agent_actions")
      .select("*").in("id", ids);
    setActions(Object.fromEntries(
      ((acts ?? []) as unknown as AgentAction[]).map((a) => [a.id, a]),
    ));
  }, []);

  // Resume the most recent thread rather than opening a blank one every visit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: conv } = await supabase.from("agent_conversations")
        .select("id").eq("agent_id", agent.id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled || !conv) return;
      setConversationId(conv.id);
      await loadMessages(conv.id);
    })();
    return () => { cancelled = true; };
  }, [agent.id, reloadNonce, loadMessages]);

  const awaitingReply = messages.some((m) => m.status === "pending");
  // Steps for assistant turns that produced any — the live ones so progress
  // shows, the finished ones so the record of what was read survives.
  const stepsByMessage = useAgentSteps(
    messages.filter((m) => m.role === "assistant" && !m.id.startsWith("local-")).map((m) => m.id),
  );

  /**
   * Watch the conversation rather than the request.
   *
   * The reply is written by a background task after the send call has already
   * returned, so this is what actually surfaces it — and it is why leaving the
   * page or refreshing no longer loses the answer.
   */
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`agent-chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => { void loadMessages(conversationId); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, loadMessages]);

  /**
   * Poll while a reply is outstanding.
   *
   * Realtime is the fast path, not a guarantee — a dropped socket would leave
   * the reply written and the page never told. Only runs while something is
   * actually pending, so it costs nothing the rest of the time.
   */
  useEffect(() => {
    if (!conversationId || !awaitingReply) return;
    const t = setInterval(() => { void loadMessages(conversationId); }, 4000);
    return () => clearInterval(t);
  }, [conversationId, awaitingReply, loadMessages]);

  // A pending row this old is not coming back — the runtime dropped it.
  const STALE_AFTER_MS = 6 * 60 * 1000;
  const isStale = (m: AgentMessage) =>
    m.status === "pending" && Date.now() - new Date(m.created_at).getTime() > STALE_AFTER_MS;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || sending) return;

    // Show it immediately; the real rows arrive on the next load.
    const optimistic: AgentMessage = {
      id: `local-${Date.now()}`, conversation_id: conversationId ?? "",
      role: "user", content: text, run_id: null, action_ids: [],
      questions: null, status: "complete", error: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    if (!override) setDraft("");
    setSending(true);

    try {
      const ack = await sendAgentMessage({
        agentId: agent.id, conversationId, message: text,
      });
      setConversationId(ack.conversation_id);
      await loadMessages(ack.conversation_id);
      onActivity();
    } catch (e) {
      // Roll back the optimistic message so the box does not lie about what sent.
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      if (!override) setDraft(text);
      toast.error(errMsg(e) || "Could not reach the agent");
    } finally {
      setSending(false);
      boxRef.current?.focus();
    }
  };

  /**
   * Resend the message a dead turn was answering.
   *
   * The failed assistant row is deleted rather than left in place — a thread
   * with a stale error above the real answer reads as though it failed twice.
   */
  const retry = async (dead: AgentMessage) => {
    const idx = messages.findIndex((m) => m.id === dead.id);
    const prompt = [...messages.slice(0, idx)].reverse()
      .find((m) => m.role === "user" && m.content.trim());
    if (!prompt) return toast.error("Nothing to resend");
    await supabase.from("agent_messages").delete().eq("id", dead.id);
    if (conversationId) await loadMessages(conversationId);
    await send(prompt.content);
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
                {m.status === "pending" ? (
                  isStale(m) ? (
                    <div className="ws__msg-bubble ws__msg-failed">
                      <p>This one never came back. Nothing was lost — send it again.</p>
                      <button className="ws__msg-retry" onClick={() => void retry(m)}>
                        Try again
                      </button>
                    </div>
                  ) : (
                    <>
                      {stepsByMessage[m.id]?.length
                        ? <AgentSteps steps={stepsByMessage[m.id]} live />
                        : (
                          <div className="ws__msg-bubble ws__msg-bubble--thinking">
                            {agent.name} is working on it…
                          </div>
                        )}
                    </>
                  )
                ) : m.status === "failed" ? (
                  <div className="ws__msg-bubble ws__msg-failed">
                    <p>{m.error || "That turn did not finish."}</p>
                    <button className="ws__msg-retry" onClick={() => void retry(m)}>
                      Try again
                    </button>
                  </div>
                ) : (
                <div className="ws__msg-bubble">
                  {m.role === "assistant"
                    ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // A proposal's investment table is wider than the
                          // column; give it its own scroller rather than
                          // letting it stretch the whole conversation.
                          table: ({ node: _node, ...props }) => (
                            <div className="ws__msg-table"><table {...props} /></div>
                          ),
                          a: ({ node: _node, ...props }) => (
                            <a {...props} target="_blank" rel="noreferrer noopener" />
                          ),
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    )
                    : m.content}
                </div>
                )}
                {m.role === "assistant" && m.status === "complete" && !!stepsByMessage[m.id]?.length && (
                  <AgentSteps steps={stepsByMessage[m.id]} live={false} />
                )}
                {m.role === "assistant" && !!(m.questions as AgentQuestion[] | null)?.length && (
                  <AgentQuestions
                    questions={m.questions as AgentQuestion[]}
                    disabled={sending}
                    onAnswer={(text) => void send(text)}
                  />
                )}
                {!!m.action_ids?.length && (
                  <>
                    <AgentActionCards
                      actions={m.action_ids.map((id) => actions[id]).filter(Boolean)}
                      onSettled={() => { if (conversationId) void loadMessages(conversationId); onActivity(); }}
                    />
                    {m.run_id && (
                      <button className="ws__msg-actions"
                        onClick={() => navigate(`/admin/agents/runs/${m.run_id}`)}>
                        Open the full run →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
        {sending && !awaitingReply && (
          <div className="ws__msg ws__msg--assistant">
            <AgentAvatar name={agent.name} url={agent.avatar_url}
              accent={agent.accent_color} size={26} />
            <div className="ws__msg-body">
              <div className="ws__msg-bubble ws__msg-bubble--thinking">Sending…</div>
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
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <button className="ws__composer-send" onClick={() => void send()} disabled={sending || !draft.trim()}
          aria-label="Send">↑</button>
      </div>
    </section>
  );
}

