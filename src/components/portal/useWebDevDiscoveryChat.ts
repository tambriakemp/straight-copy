// The data and state behind the web-dev discovery questionnaire.
//
// Pulled out of `WebDevDiscoveryChat.tsx` so the dark client surface
// (`ClientDiscoveryChat.tsx`, mockup 17) can show the same conversation in
// its own markup without a second copy of the load effect, the auto-greet,
// and `callChat`. One source for what the chat IS; two components for how it
// looks, which already differ -- the old project page is its own bespoke
// dark panel, the new one is the `.cp` system mockups 13-16 shipped.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portalClient";
import { portalFetch } from "@/lib/portalFetch";

export type DiscoveryMsg = { role: "user" | "assistant"; content: string };

export interface UseWebDevDiscoveryChat {
  loading: boolean;
  messages: DiscoveryMsg[];
  sending: boolean;
  completed: boolean;
  submittedAt: string | null;
  input: string;
  setInput: (value: string) => void;
  send: () => Promise<void>;
  firstName: string;
}

export function useWebDevDiscoveryChat({
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
}): UseWebDevDiscoveryChat {
  const sb = adminPreview ? supabase : supabasePortal;
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<DiscoveryMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const greetedRef = useRef(false);

  const firstName = useMemo(
    () => contactName?.trim().split(/\s+/)[0] || "there",
    [contactName],
  );

  // ----- Initial load: pull any persisted conversation for this project -----
  useEffect(() => {
    if (!contractSigned) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await sb
          .from("web_dev_discovery")
          .select("conversation, completed, submitted_at")
          .eq("client_project_id", projectId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error("[discovery] load error:", error);
        }
        if (data) {
          const conv = Array.isArray(data.conversation) ? (data.conversation as DiscoveryMsg[]) : [];
          setMessages(conv);
          setCompleted(!!data.completed);
          setSubmittedAt((data.submitted_at as string | null) ?? null);
          // If there's already an opening message persisted, don't re-greet.
          if (conv.length > 0) greetedRef.current = true;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, projectId, contractSigned, sb]);

  const callChat = useCallback(
    async (message: string, history: DiscoveryMsg[]): Promise<void> => {
      setSending(true);
      try {
        const resp = await portalFetch(
          "web-dev-discovery-chat",
          { clientId, projectId, message, conversationHistory: history },
          adminPreview,
        );

        if (!resp.ok) {
          if (resp.status === 429) toast.error("AI is busy — please wait a moment.");
          else toast.error("Could not reach the assistant.");
          return;
        }

        const data = await resp.json();
        const newHistory: DiscoveryMsg[] = Array.isArray(data?.history)
          ? data.history
          : [
              ...history,
              ...(message ? [{ role: "user" as const, content: message }] : []),
              { role: "assistant" as const, content: data?.reply ?? "" },
            ];
        setMessages(newHistory);

        if (data?.completed) {
          setCompleted(true);
          setSubmittedAt(new Date().toISOString());
        }

        if (Array.isArray(data?.warnings)) {
          for (const w of data.warnings as string[]) toast.error(w);
        }
      } catch (e) {
        console.error(e);
        toast.error("Connection error.");
      } finally {
        setSending(false);
      }
    },
    [clientId, projectId, adminPreview],
  );

  // Auto-greet on first open if no conversation exists yet.
  useEffect(() => {
    if (loading || !contractSigned || completed) return;
    if (greetedRef.current) return;
    if (messages.length > 0) {
      greetedRef.current = true;
      return;
    }
    greetedRef.current = true;
    void callChat("", []);
  }, [loading, contractSigned, completed, messages.length, callChat]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || completed) return;
    setInput("");
    // Optimistically append the user message so it appears immediately.
    const next: DiscoveryMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    await callChat(text, messages);
  }, [input, sending, completed, messages, callChat]);

  return { loading, messages, sending, completed, submittedAt, input, setInput, send, firstName };
}
