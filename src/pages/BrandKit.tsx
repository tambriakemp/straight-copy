import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Send, Upload, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface LogoFileMeta {
  path: string;
  name: string;
  size: number;
  mime: string;
  signedUrl?: string;
}

const STAGES = [
  { name: "Welcome", desc: "Get oriented" },
  { name: "Logo", desc: "Direction & feel" },
  { name: "Colors", desc: "Palette & mood" },
  { name: "Typography", desc: "Type personality" },
  { name: "References", desc: "Inspiration" },
  { name: "Visual Rules", desc: "Do's & don'ts" },
  { name: "File Formats", desc: "Deliverables" },
  { name: "Scope", desc: "What we'll build" },
  { name: "Review", desc: "Confirm & submit" },
];

type View = "welcome" | "chat" | "done";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const cleanContent = (text: string) =>
  text
    .replace(/\[\[STAGE:\d+\]\]/g, "")
    .replace(/\[\[BRAND_KIT_COMPLETE\]\]/g, "")
    .replace(/\[\[REQUEST_LOGO_UPLOAD\]\]/g, "")
    // Strip markdown emphasis (*word*, **word**, _word_) — chat renders plain text.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?;:])/g, "$1$2")
    .trim();

// Extract up to N dominant colors from an image file using a downscaled canvas.
// Quantizes RGB into 32-step buckets and returns the top buckets by frequency.
async function extractDominantColors(file: File, count = 5): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const max = 80;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d ctx");
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue; // ignore transparent
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // Skip near-white/near-black backgrounds
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 245 || lum < 12) continue;
          const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
          const cur = buckets.get(key);
          if (cur) {
            cur.count++; cur.r += r; cur.g += g; cur.b += b;
          } else {
            buckets.set(key, { count: 1, r, g, b });
          }
        }
        const sorted = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, count);
        const hexes = sorted.map((c) => {
          const r = Math.round(c.r / c.count), g = Math.round(c.g / c.count), bb = Math.round(c.b / c.count);
          return "#" + [r, g, bb].map((v) => v.toString(16).padStart(2, "0")).join("");
        });
        URL.revokeObjectURL(url);
        resolve(hexes);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export default function BrandKit() {
  const { clientId } = useParams<{ clientId: string }>();
  const [view, setView] = useState<View>("welcome");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [stage, setStage] = useState(1);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [contact, setContact] = useState<{ contact_name: string | null; business_name: string | null } | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  // Logo upload flow state
  const [awaitingLogoUpload, setAwaitingLogoUpload] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<LogoFileMeta | null>(null);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [colorsApprovalPending, setColorsApprovalPending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hydratedFromServer = useRef(false);
  const autoStartedRef = useRef(false);
  const lsKey = clientId ? `cre8-portal-${clientId}` : "";


  useEffect(() => {
    document.title = "Brand Kit · CRE8 Visions";
  }, []);

  // Resolve client + conversation
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
          body: JSON.stringify({ clientId, action: "resolve" }),
        });
        if (!resp.ok) throw new Error("resolve failed");
        const data = await resp.json();
        setContact({
          contact_name: data.client?.contact_name ?? null,
          business_name: data.client?.business_name ?? null,
        });
        if (data.submittedAt) {
          setSubmittedAt(data.submittedAt);
          setView("done");
        } else {
          // Prefer local cache if it has more turns
          let cachedMsgs: Msg[] = [];
          try {
            const raw = lsKey ? localStorage.getItem(lsKey) : null;
            if (raw) cachedMsgs = JSON.parse(raw).messages || [];
          } catch { /* ignore */ }
          const remote: Msg[] = Array.isArray(data.conversation) ? data.conversation : [];
          const hydrated = cachedMsgs.length > remote.length ? cachedMsgs : remote;
          if (hydrated.length > 0) {
            setMessages(hydrated);
            hydratedFromServer.current = true;
            setView("chat");
          } else if (!autoStartedRef.current) {
            // Auto-start: skip the welcome screen and have the assistant greet immediately.
            autoStartedRef.current = true;
            setView("chat");
            // Kick off streaming after state has flushed.
            setTimeout(() => streamReply([]), 0);
          }
        }
      } catch (e) {
        console.error("brand-kit resolve failed:", e);
      } finally {
        setHydrating(false);
      }
    })();
  }, [clientId, lsKey]);

  // Persist transcript locally
  useEffect(() => {
    if (!lsKey) return;
    try {
      localStorage.setItem(lsKey, JSON.stringify({ messages, stage }));
    } catch { /* ignore */ }
  }, [messages, stage, lsKey]);

  useEffect(() => {
    if (hydratedFromServer.current) {
      hydratedFromServer.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const streamReply = async (history: Msg[]) => {
    if (!clientId) return;
    setIsStreaming(true);
    let assistantText = "";
    let detectedComplete = false;

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
        body: JSON.stringify({ clientId, action: "chat", messages: history }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          toast({ title: "Slow down", description: "AI rate limit reached. Please wait a moment.", variant: "destructive" });
        } else {
          toast({ title: "Connection error", description: "Could not reach the assistant. Please retry.", variant: "destructive" });
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
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantText += delta;
              const stageMatch = assistantText.match(/\[\[STAGE:(\d+)\]\]/);
              if (stageMatch) setStage(Math.min(STAGES.length, parseInt(stageMatch[1], 10)));
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
      toast({ title: "Connection error", description: "Please try again.", variant: "destructive" });
    }

    setIsStreaming(false);
    if (detectedComplete) setReadyToSubmit(true);
    // Detect logo-upload request marker AFTER stream completes so the upload UI
    // appears once the assistant has finished its prompt.
    if (assistantText.includes("[[REQUEST_LOGO_UPLOAD]]") && !logoFile) {
      setAwaitingLogoUpload(true);
    }
  };

  const start = () => {
    setView("chat");
    streamReply([]);
  };

  // Upload the chosen logo to storage, extract dominant colors, and surface
  // them to the client for approval. After approval, a synthetic user message
  // is injected so the AI can acknowledge and continue the conversation.
  const handleLogoFile = async (file: File) => {
    if (!clientId || !file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image required", description: "Please upload a PNG, JPG, or SVG of your logo.", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Too large", description: "Logo must be 8MB or smaller.", variant: "destructive" });
      return;
    }
    setLogoUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const path = `brand-kit/${clientId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("client-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw new Error(error.message);
      const { data: signed } = await supabase.storage.from("client-assets").createSignedUrl(path, 60 * 60 * 24 * 7);
      const meta: LogoFileMeta = {
        path,
        name: file.name,
        size: file.size,
        mime: file.type || "",
        signedUrl: signed?.signedUrl,
      };
      setLogoFile(meta);
      // Only attempt color extraction for raster images (SVGs can't be drawn without parsing).
      if (file.type !== "image/svg+xml") {
        try {
          const colors = await extractDominantColors(file, 5);
          setExtractedColors(colors);
          setColorsApprovalPending(colors.length > 0);
        } catch (e) {
          console.warn("color extraction failed:", e);
        }
      }
      setAwaitingLogoUpload(false);
      // If no colors were extracted, send the file confirmation immediately.
      if (file.type === "image/svg+xml") {
        sendLogoConfirmation(meta, [], "pending");
      }
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLogoUploading(false);
    }
  };

  const sendLogoConfirmation = (meta: LogoFileMeta, colors: string[], approval: "approved" | "rejected" | "pending") => {
    const parts: string[] = [];
    parts.push(`I uploaded my logo (${meta.name}).`);
    if (colors.length > 0) {
      parts.push(`The dominant colors detected are: ${colors.join(", ")}.`);
      if (approval === "approved") parts.push("Yes — these are my brand colors.");
      else if (approval === "rejected") parts.push("Those aren't quite my brand colors. I'll describe what they should be.");
    } else {
      parts.push("Please continue with the rest of the brand kit questions.");
    }
    const text = parts.join(" ");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setColorsApprovalPending(false);
    streamReply(next);
  };

  const send = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    streamReply(next);
  };


  const submit = async () => {
    if (!clientId) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
        body: JSON.stringify({ clientId, action: "complete", messages }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || "Submit failed");
      setSubmittedAt(data.submittedAt);
      if (lsKey) localStorage.removeItem(lsKey);
      setView("done");
    } catch (e) {
      toast({
        title: "Couldn't submit",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const progressPct = Math.min(100, Math.round(((stage - 1) / (STAGES.length - 1)) * 100));

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
          style={{ background: "#111009", borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(to right, #8B7355, transparent)" }} />
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 16, fontWeight: 300, letterSpacing: "0.25em",
              textTransform: "uppercase", marginBottom: 48,
            }}
          >
            Cre8 <span style={{ color: "#8B7355", fontStyle: "italic" }}>Visions</span>
          </div>

          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, lineHeight: 1.2, marginBottom: 12 }}>
            Your Brand<br /><em style={{ color: "#C8C0B4" }}>Kit</em>.
          </h2>
          <p style={{ fontSize: 12, color: "#A89F94", lineHeight: 1.8, marginBottom: 48 }}>
            A short, considered conversation to capture the visual foundation of your brand.
          </p>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "#A89F94", marginBottom: 20 }}>
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
                      borderLeft: `1px solid ${isActive ? "#8B7355" : isDone ? "rgba(139,115,85,0.3)" : "rgba(255,255,255,0.06)"}`,
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
                      <div style={{ fontSize: 12, letterSpacing: "0.05em", color: isActive ? "#F5F2EE" : isDone ? "rgba(200,192,180,0.4)" : "#A89F94", transition: "color 0.3s" }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 300, marginTop: 2, color: isActive ? "#A89F94" : "rgba(168,159,148,0.5)" }}>
                        {s.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 11, color: "#A89F94", lineHeight: 1.7 }}>
            Your answers shape what your CRE8 team will design. Everything stays private.
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex flex-col h-screen relative" style={{ background: "#1A1916" }}>
          {view === "welcome" && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 md:px-16 py-16">
              <p
                className="ob-fade"
                style={{ fontSize: 10, letterSpacing: "0.35em", textTransform: "uppercase", color: "#8B7355", marginBottom: 24 }}
              >
                Brand Kit · Cre8 Visions
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
                {contact?.contact_name ? (
                  <>
                    Welcome, {contact.contact_name.split(" ")[0]}.<br />
                    <em style={{ color: "#C8C0B4" }}>Let's shape your look.</em>
                  </>
                ) : (
                  <>
                    Let's shape your<br />
                    <em style={{ color: "#C8C0B4" }}>visual identity.</em>
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
                This isn't a form. It's a conversation. We'll walk through logo direction, color,
                typography, and references — gathering everything your CRE8 team needs to design
                a brand kit that feels unmistakably yours.
              </p>
              <button
                onClick={start}
                disabled={hydrating}
                className="ob-fade"
                style={{
                  fontFamily: "'Karla', sans-serif",
                  fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "#F5F2EE", background: "#8B7355",
                  border: "none", padding: "18px 52px",
                  cursor: hydrating ? "not-allowed" : "pointer",
                  opacity: hydrating ? 0.5 : 1,
                  transition: "background 0.3s, transform 0.3s",
                  animationDelay: "0.45s",
                }}
                onMouseEnter={(e) => {
                  if (hydrating) return;
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
                style={{ marginTop: 20, fontSize: 11, color: "#A89F94", animationDelay: "0.6s", opacity: 0 }}
              >
                Takes about 8–12 minutes · No design knowledge needed
              </p>
            </div>
          )}

          {view === "chat" && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 md:px-10 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
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
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#F5F2EE" }}>Cre8 Visions AI</div>
                    <div style={{ fontSize: 11, color: "#A89F94", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7BC47F", animation: "ob-pulse 2s infinite" }} />
                      Brand Kit
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, maxWidth: 200, margin: "0 24px" }}>
                  <div style={{ fontSize: 10, color: "#A89F94", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6, textAlign: "right" }}>
                    {progressPct}% complete
                  </div>
                  <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                    <div style={{ height: 2, background: "#8B7355", width: `${progressPct}%`, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="ob-scroll flex-1 overflow-y-auto px-6 md:px-10 py-8 flex flex-col gap-6">
                {messages.map((m, i) => (
                  <div key={i} className="ob-msg flex gap-3.5 items-start" style={{ flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        ...(m.role === "assistant"
                          ? { background: "linear-gradient(135deg, #8B7355, #2A2825)", color: "#F5F2EE", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: 13 }
                          : { background: "rgba(255,255,255,0.08)", color: "#C8C0B4", fontSize: 11, fontWeight: 500, letterSpacing: "0.05em" }),
                      }}
                    >
                      {m.role === "assistant" ? "CV" : "YOU"}
                    </div>
                    <div style={{ maxWidth: "68%", display: "flex", flexDirection: "column", gap: 6, alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                      <div
                        style={{
                          padding: "16px 20px", fontSize: 14, fontWeight: 300,
                          lineHeight: 1.75, borderRadius: 2, whiteSpace: "pre-wrap",
                          ...(m.role === "assistant"
                            ? { background: "rgba(255,255,255,0.04)", color: "#F5F2EE", borderLeft: "2px solid #8B7355" }
                            : { background: "#8B7355", color: "#F5F2EE" }),
                        }}
                      >
                        {m.content}
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
              <div className="px-6 md:px-10 py-5 pb-7" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                {submitting && (
                  <div style={{ fontSize: 11, color: "#8B7355", marginBottom: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
                    Submitting your brand kit…
                  </div>
                )}
                <div
                  className="flex gap-3 items-end"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "14px 20px" }}
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
                    placeholder={readyToSubmit ? "Anything to add before you submit?" : "Type your answer…"}
                    disabled={isStreaming || submitting}
                    rows={1}
                    style={{
                      flex: 1, background: "none", border: "none", outline: "none",
                      fontFamily: "'Karla', sans-serif", fontSize: 14, fontWeight: 300,
                      color: "#F5F2EE", resize: "none", maxHeight: 120, lineHeight: 1.6,
                    }}
                  />
                  <button
                    onClick={send}
                    disabled={isStreaming || !input.trim() || submitting}
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

                {readyToSubmit && (
                  <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={submit}
                      disabled={isStreaming || submitting}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(139,115,85,0.5)",
                        color: "#C8C0B4",
                        fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase",
                        padding: "10px 18px",
                        cursor: isStreaming || submitting ? "not-allowed" : "pointer",
                        opacity: isStreaming || submitting ? 0.4 : 1,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        if (isStreaming || submitting) return;
                        e.currentTarget.style.background = "rgba(139,115,85,0.12)";
                        e.currentTarget.style.color = "#F5F2EE";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#C8C0B4";
                      }}
                    >
                      {submitting ? "Submitting…" : "Review & submit my brand kit"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "done" && (
            <div className="ob-scroll overflow-y-auto h-full px-8 md:px-20 py-16">
              <p style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: "#8B7355", marginBottom: 16 }}>
                Brand Kit Submitted
              </p>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 48, fontWeight: 300, lineHeight: 1, marginBottom: 8 }}>
                Thank <em style={{ color: "#C8C0B4" }}>you</em>.
              </h1>
              <p style={{ fontSize: 14, color: "#A89F94", lineHeight: 1.8, marginBottom: 48, marginTop: 16, maxWidth: 560 }}>
                Your brand kit intake is in our hands
                {contact?.business_name ? <> for <em>{contact.business_name}</em></> : null}. The
                CRE8 team has been notified and will be in touch as your kit comes together.
                {submittedAt && (
                  <>
                    {" "}Submitted {new Date(submittedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
                  </>
                )}
              </p>
              {clientId && (
                <Link
                  to={`/portal/${clientId}`}
                  style={{
                    display: "inline-block",
                    fontFamily: "'Karla', sans-serif",
                    fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
                    color: "#F5F2EE", background: "#8B7355",
                    padding: "16px 40px", textDecoration: "none",
                  }}
                >
                  ← Back to portal
                </Link>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
