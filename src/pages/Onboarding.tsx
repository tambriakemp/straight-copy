import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STAGES = [
  { name: "Introduction", desc: "Who you are" },
  { name: "Your Brand", desc: "Voice & personality" },
  { name: "Your Customer", desc: "Who you serve" },
  { name: "Your Business", desc: "What you offer" },
  { name: "Your Challenges", desc: "What to automate" },
  { name: "Your Goals", desc: "Where you're headed" },
  { name: "Complete", desc: "Your summary" },
];

type View = "welcome" | "chat" | "summary";

const Onboarding = () => {
  const [view, setView] = useState<View>("welcome");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [stage, setStage] = useState(1);
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [savingFinal, setSavingFinal] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteContact, setInviteContact] = useState<{
    contact_name?: string | null;
    business_name?: string | null;
  } | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hydratedFromServer = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const latestSavePayload = useRef<{ conversation: Msg[]; stage: number } | null>(null);

  useEffect(() => {
    document.title = "Client Onboarding · CRE8 Visions";
  }, []);

  // Detect invite token in URL + hydrate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (!token) return;
    setInviteToken(token);

    // Instant hydrate from localStorage
    try {
      const cached = localStorage.getItem(`cre8-onboarding-${token}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          setMessages(parsed.messages);
          if (parsed.stage) setStage(parsed.stage);
          setView("chat");
        }
      }
    } catch {
      // ignore
    }

    // Resolve from server
    setHydrating(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("onboarding-session", {
          body: { action: "resolve", token },
        });
        if (error) throw error;
        if (data?.invite) setInviteContact(data.invite);
        if (Array.isArray(data?.conversation) && data.conversation.length > 0) {
          setMessages(data.conversation);
          if (data.stage) setStage(data.stage);
          hydratedFromServer.current = true;
          setView("chat");
        }
        if (data?.completed && data?.conversation?.length > 0) {
          // already done — show summary if we can
          const cachedSummary = localStorage.getItem(`cre8-onboarding-summary-${token}`);
          if (cachedSummary) {
            try {
              setSummary(JSON.parse(cachedSummary));
              setStage(7);
              setView("summary");
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        console.error("invite resolve failed:", e);
      } finally {
        setHydrating(false);
      }
    })();
  }, []);

  useEffect(() => {
    // Don't force-scroll on initial server hydration; let user land naturally.
    if (hydratedFromServer.current) {
      hydratedFromServer.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Debounced auto-save (1.5s) when invite is present
  const scheduleSave = (convo: Msg[], st: number) => {
    if (!inviteToken) return;
    latestSavePayload.current = { conversation: convo, stage: st };
    // Persist locally immediately
    try {
      localStorage.setItem(
        `cre8-onboarding-${inviteToken}`,
        JSON.stringify({ messages: convo, stage: st })
      );
    } catch { /* ignore */ }

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const payload = latestSavePayload.current;
      if (!payload) return;
      supabase.functions
        .invoke("onboarding-session", {
          body: { action: "save", token: inviteToken, ...payload },
        })
        .catch((e) => console.error("autosave failed:", e));
    }, 1500);
  };

  // Strip metadata tokens from displayed text
  const cleanContent = (text: string) =>
    text
      .replace(/\[\[STAGE:\d+\]\]/g, "")
      .replace(/\[\[ONBOARDING_COMPLETE\]\]/g, "")
      .trim();

  const streamReply = async (history: Msg[]) => {
    setIsStreaming(true);
    let assistantText = "";
    let detectedComplete = false;

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          toast({ title: "Slow down", description: "AI rate limit reached. Please wait a moment.", variant: "destructive" });
        } else if (resp.status === 402) {
          toast({ title: "AI unavailable", description: "Please try again later.", variant: "destructive" });
        } else {
          toast({ title: "Connection error", description: "Could not reach the AI. Please retry.", variant: "destructive" });
        }
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
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantText += delta;

              // Detect stage marker
              const stageMatch = assistantText.match(/\[\[STAGE:(\d+)\]\]/);
              if (stageMatch) setStage(parseInt(stageMatch[1], 10));

              if (assistantText.includes("[[ONBOARDING_COMPLETE]]")) {
                detectedComplete = true;
              }

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
      toast({ title: "Connection error", description: "Please try again.", variant: "destructive" });
    }

    setIsStreaming(false);

    // Persist progress after the assistant turn finishes
    const turnConvo: Msg[] = [...history, { role: "assistant", content: assistantText }];
    const stageMatchFinal = assistantText.match(/\[\[STAGE:(\d+)\]\]/);
    const stageNow = stageMatchFinal ? parseInt(stageMatchFinal[1], 10) : stage;
    scheduleSave(turnConvo, stageNow);

    if (detectedComplete) {
      finalize(turnConvo);
    }
  };

  const finalize = async (convo: Msg[]) => {
    setSavingFinal(true);
    // Flush any pending save
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      const fnName = inviteToken ? "onboarding-session" : "save-onboarding";
      const body = inviteToken
        ? { action: "complete", token: inviteToken, conversation: convo }
        : { conversation: convo };
      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      setSummary(data?.summary || null);
      if (inviteToken && data?.summary) {
        try {
          localStorage.setItem(
            `cre8-onboarding-summary-${inviteToken}`,
            JSON.stringify(data.summary)
          );
        } catch { /* ignore */ }
      }
      setStage(7);
      setTimeout(() => setView("summary"), 1200);
    } catch (e) {
      console.error(e);
      toast({
        title: "Saved locally",
        description: "We hit a snag saving your conversation, but your summary is shown below.",
      });
      setView("summary");
    } finally {
      setSavingFinal(false);
    }
  };

  const start = () => {
    setView("chat");
    streamReply([]);
  };

  const send = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const newHistory: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newHistory);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    scheduleSave(newHistory, stage);
    streamReply(newHistory);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const progressPct = Math.min(100, Math.round(((stage - 1) / 6) * 100));

  return (
    <div
      className="min-h-screen w-full grid"
      style={{
        gridTemplateColumns: "minmax(0, 1fr)",
        background: "#1A1916",
        color: "#F5F2EE",
        fontFamily: "'Karla', sans-serif",
      }}
    >
      <style>{`
        @keyframes ob-fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ob-typing { 0%,60%,100% { transform: translateY(0); opacity: 0.4 } 30% { transform: translateY(-4px); opacity: 1 } }
        @keyframes ob-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes ob-slideIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .ob-fade { animation: ob-fadeUp 0.8s ease forwards; }
        .ob-msg { animation: ob-slideIn 0.3s ease; }
        .ob-scroll::-webkit-scrollbar { width: 4px; }
        .ob-scroll::-webkit-scrollbar-thumb { background: rgba(139,115,85,0.3); border-radius: 2px; }
        @media (min-width: 900px) { .ob-app { grid-template-columns: 300px 1fr !important; } }
      `}</style>

      <div className="ob-app grid h-screen" style={{ gridTemplateColumns: "1fr" }}>
        {/* SIDEBAR */}
        <aside
          className="hidden md:flex flex-col p-10 relative overflow-hidden"
          style={{
            background: "#111009",
            borderRight: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, height: 3,
              background: "linear-gradient(to right, #8B7355, transparent)",
            }}
          />
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 16, fontWeight: 300, letterSpacing: "0.25em",
              textTransform: "uppercase", marginBottom: 48,
            }}
          >
            Cre8 <span style={{ color: "#8B7355", fontStyle: "italic" }}>Visions</span>
          </div>

          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 28, fontWeight: 300, lineHeight: 1.2, marginBottom: 12,
            }}
          >
            Your AI <em style={{ color: "#C8C0B4" }}>OS</em>
            <br />Begins<br />Here.
          </h2>
          <p style={{ fontSize: 12, color: "#A89F94", lineHeight: 1.8, marginBottom: 48 }}>
            A guided conversation that builds the foundation of your entire AI operating system.
          </p>

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase",
                color: "#A89F94", marginBottom: 20,
              }}
            >
              Your Journey
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {STAGES.map((s, i) => {
                const stepNum = i + 1;
                const isActive = stepNum === stage;
                const isDone = stepNum < stage;
                return (
                  <div
                    key={s.name}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 14,
                      padding: "14px 0", paddingLeft: 16,
                      borderLeft: `1px solid ${
                        isActive ? "#8B7355" : isDone ? "rgba(139,115,85,0.3)" : "rgba(255,255,255,0.06)"
                      }`,
                      transition: "all 0.3s",
                    }}
                  >
                    <div
                      style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: isActive ? "#8B7355" : isDone ? "rgba(139,115,85,0.4)" : "rgba(255,255,255,0.1)",
                        boxShadow: isActive ? "0 0 8px rgba(139,115,85,0.5)" : "none",
                        marginTop: 5, flexShrink: 0,
                        position: "relative", left: -20.5, marginRight: -8,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12, letterSpacing: "0.05em",
                          color: isActive ? "#F5F2EE" : isDone ? "rgba(200,192,180,0.4)" : "#A89F94",
                          transition: "color 0.3s",
                        }}
                      >
                        {s.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11, fontWeight: 300, marginTop: 2,
                          color: isActive ? "#A89F94" : "rgba(168,159,148,0.5)",
                        }}
                      >
                        {s.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              marginTop: 40, paddingTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              fontSize: 11, color: "#A89F94", lineHeight: 1.7,
            }}
          >
            Your answers are used only to build your AI system. Everything stays private.
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex flex-col h-screen relative" style={{ background: "#1A1916" }}>
          {view === "welcome" && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 md:px-16 py-16">
              <p
                className="ob-fade"
                style={{
                  fontSize: 10, letterSpacing: "0.35em", textTransform: "uppercase",
                  color: "#8B7355", marginBottom: 24,
                }}
              >
                Client Onboarding · Cre8 Visions
              </p>
              <h1
                className="ob-fade"
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "clamp(40px, 5vw, 68px)", fontWeight: 300,
                  lineHeight: 1.05, marginBottom: 24,
                  animationDelay: "0.15s", opacity: 0,
                }}
              >
                {inviteContact?.contact_name ? (
                  <>
                    Welcome, {inviteContact.contact_name.split(" ")[0]}.<br />
                    <em style={{ color: "#C8C0B4" }}>Ready when you are.</em>
                  </>
                ) : (
                  <>
                    Let's build your<br />
                    <em style={{ color: "#C8C0B4" }}>AI foundation.</em>
                  </>
                )}
              </h1>
              <p
                className="ob-fade"
                style={{
                  fontSize: 15, fontWeight: 300, lineHeight: 1.9,
                  color: "#A89F94", maxWidth: 480, marginBottom: 48,
                  animationDelay: "0.3s", opacity: 0,
                }}
              >
                This isn't a form. It's a conversation. Answer naturally — like you're talking to a
                person. There are no right or wrong answers. Everything you share gets used to build
                your brand voice, your automations, and your AI operating system.
              </p>
              <button
                onClick={start}
                className="ob-fade"
                style={{
                  fontFamily: "'Karla', sans-serif",
                  fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "#F5F2EE", background: "#8B7355",
                  border: "none", padding: "18px 52px", cursor: "pointer",
                  transition: "background 0.3s, transform 0.3s",
                  animationDelay: "0.45s", opacity: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#A08968";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#8B7355";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Begin the Conversation
              </button>
              <p
                className="ob-fade"
                style={{
                  marginTop: 20, fontSize: 11, color: "#A89F94",
                  animationDelay: "0.6s", opacity: 0,
                }}
              >
                Takes about 10–15 minutes · No tech knowledge needed
              </p>
            </div>
          )}

          {view === "chat" && (
            <>
              {/* Header */}
              <div
                className="flex items-center justify-between px-6 md:px-10 py-5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "linear-gradient(135deg, #8B7355, #2A2825)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 14, fontStyle: "italic", color: "#F5F2EE",
                    }}
                  >
                    CV
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#F5F2EE" }}>
                      Cre8 Visions AI
                    </div>
                    <div
                      style={{
                        fontSize: 11, color: "#A89F94",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: "#7BC47F", animation: "ob-pulse 2s infinite",
                        }}
                      />
                      Active
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, maxWidth: 200, margin: "0 24px" }}>
                  <div
                    style={{
                      fontSize: 10, color: "#A89F94", letterSpacing: "0.15em",
                      textTransform: "uppercase", marginBottom: 6, textAlign: "right",
                    }}
                  >
                    {progressPct}% complete
                  </div>
                  <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                    <div
                      style={{
                        height: 2, background: "#8B7355",
                        width: `${progressPct}%`, transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="ob-scroll flex-1 overflow-y-auto px-6 md:px-10 py-8 flex flex-col gap-6">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className="ob-msg flex gap-3.5 items-start"
                    style={{ flexDirection: m.role === "user" ? "row-reverse" : "row" }}
                  >
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        ...(m.role === "assistant"
                          ? {
                              background: "linear-gradient(135deg, #8B7355, #2A2825)",
                              color: "#F5F2EE",
                              fontFamily: "'Cormorant Garamond', serif",
                              fontStyle: "italic", fontSize: 13,
                            }
                          : {
                              background: "rgba(255,255,255,0.08)", color: "#C8C0B4",
                              fontSize: 11, fontWeight: 500, letterSpacing: "0.05em",
                            }),
                      }}
                    >
                      {m.role === "assistant" ? "CV" : "YOU"}
                    </div>
                    <div
                      style={{
                        maxWidth: "68%", display: "flex", flexDirection: "column", gap: 6,
                        alignItems: m.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          padding: "16px 20px", fontSize: 14, fontWeight: 300,
                          lineHeight: 1.75, borderRadius: 2, whiteSpace: "pre-wrap",
                          ...(m.role === "assistant"
                            ? {
                                background: "rgba(255,255,255,0.04)", color: "#F5F2EE",
                                borderLeft: "2px solid #8B7355",
                              }
                            : { background: "#8B7355", color: "#F5F2EE" }),
                        }}
                      >
                        {m.content || (isStreaming && i === messages.length - 1 ? "" : "")}
                        {isStreaming && i === messages.length - 1 && !m.content && (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            {[0, 0.2, 0.4].map((d, j) => (
                              <span
                                key={j}
                                style={{
                                  width: 6, height: 6, borderRadius: "50%",
                                  background: "#A89F94",
                                  animation: `ob-typing 1.4s infinite`,
                                  animationDelay: `${d}s`,
                                }}
                              />
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div
                className="px-6 md:px-10 py-5 pb-7"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
              >
                {savingFinal && (
                  <div
                    style={{
                      fontSize: 11, color: "#8B7355", marginBottom: 12,
                      letterSpacing: "0.2em", textTransform: "uppercase",
                    }}
                  >
                    Saving your foundation…
                  </div>
                )}
                <div
                  className="flex gap-3 items-end"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: "14px 20px",
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={onKey}
                    placeholder="Type your answer…"
                    disabled={isStreaming || savingFinal}
                    rows={1}
                    style={{
                      flex: 1, background: "none", border: "none", outline: "none",
                      fontFamily: "'Karla', sans-serif", fontSize: 14, fontWeight: 300,
                      color: "#F5F2EE", resize: "none", maxHeight: 120, lineHeight: 1.6,
                    }}
                  />
                  <button
                    onClick={send}
                    disabled={isStreaming || !input.trim() || savingFinal}
                    style={{
                      background: "#8B7355", border: "none", width: 36, height: 36,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
                      opacity: isStreaming || !input.trim() ? 0.5 : 1,
                      transition: "background 0.2s, transform 0.2s",
                    }}
                    aria-label="Send"
                  >
                    <Send size={14} color="#F5F2EE" />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "#A89F94", marginTop: 10 }}>
                  Press Enter to send · Shift+Enter for new line
                </p>
              </div>
            </>
          )}

          {view === "summary" && summary && (
            <div className="ob-scroll overflow-y-auto h-full px-8 md:px-20 py-16">
              <p
                style={{
                  fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase",
                  color: "#8B7355", marginBottom: 16,
                }}
              >
                Onboarding Complete
              </p>
              <h1
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 48, fontWeight: 300, lineHeight: 1, marginBottom: 8,
                }}
              >
                Your AI Foundation<br />
                <em style={{ color: "#C8C0B4" }}>is Ready.</em>
              </h1>
              <p
                style={{
                  fontSize: 14, color: "#A89F94", lineHeight: 1.8,
                  marginBottom: 48, marginTop: 16,
                }}
              >
                Here's a summary of everything we captured. Cre8 Visions will use this to build your
                brand voice document, your first automations, and your custom AI assistant.
              </p>

              {(() => {
                const fmt = (v: unknown): string => {
                  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
                  if (typeof v === "string") return v;
                  return "";
                };
                const rows: Array<[string, string]> = [
                  ["Contact", `${summary.contact_name || summary.name || "—"} · ${summary.contact_email || "—"}`],
                  ["Business", summary.business_name || summary.business || "—"],
                  ["What you do", fmt(summary.what_they_do)],
                  ["Primary offer", fmt(summary.primary_offer)],
                  ["Price point", fmt(summary.price_point)],
                  ["Brand voice", fmt(summary.brand_voice)],
                  ["Tone words", fmt(summary.tone_words)],
                  ["Phrases you use naturally", fmt(summary.natural_phrases)],
                  ["Words to avoid", fmt(summary.avoid_words)],
                  ["Ideal customer", fmt(summary.ideal_customer)],
                  ["What they struggle with", fmt(summary.customer_struggles)],
                  ["What they want", fmt(summary.customer_outcome)],
                  ["Platforms", fmt(summary.platforms)],
                  ["Tools you use", fmt(summary.tools)],
                  ["Where leads come from", fmt(summary.inquiry_channel)],
                  ["Biggest time drain", fmt(summary.biggest_time_drain)],
                  ["Most want automated", fmt(summary.wants_automated_first)],
                  ["90-day goal", fmt(summary["90_day_goal"]) || fmt(summary.goals_12_months)],
                  ["Success looks like", fmt(summary.success_looks_like)],
                  ["Tier", fmt(summary.tier)],
                ].filter(([, v]) => v && v.trim());
                return rows;
              })().map(([label, value]) => (
                <div
                  key={label as string}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderLeft: "3px solid #8B7355",
                    padding: "28px 32px", marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase",
                      color: "#8B7355", marginBottom: 10,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 300, color: "#F5F2EE", lineHeight: 1.8 }}>
                    {(value as string) || "Not specified"}
                  </div>
                </div>
              ))}

              <div
                style={{
                  marginTop: 40, padding: 32,
                  background: "rgba(139,115,85,0.1)",
                  border: "1px solid rgba(139,115,85,0.2)",
                }}
              >
                <h3
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 24, fontWeight: 300, marginBottom: 12,
                  }}
                >
                  What happens next
                </h3>
                <p
                  style={{
                    fontSize: 13, color: "#A89F94", lineHeight: 1.8, marginBottom: 24,
                  }}
                >
                  Your AI OS build begins within 5–7 business days. You'll receive your brand voice
                  document, your first 2 automations, and your custom AI assistant — all ready to use.
                  We'll reach out if we have any follow-up questions.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Onboarding;
