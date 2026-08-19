// Client for the agents-api edge function, plus the push-subscription flow.
import { supabase } from "@/integrations/supabase/client";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agents-api`;

export const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === "string" ? e : "";

export async function agentsApi<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload as T;
}

export type Autonomy = "propose" | "act_in_app" | "autonomous";

export interface Agent {
  id: string;
  key: string;
  name: string;
  role: string;
  description: string | null;
  enabled: boolean;
  autonomy: Autonomy;
  model: string;
  effort: string;
  system_prompt: string | null;
  schedule_cron: string | null;
  delivery: Record<string, boolean>;
  config: Record<string, unknown>;
  last_run_at: string | null;
  next_run_at: string | null;
  pending_actions?: number;
  last_run?: { id: string; status: string; headline: string | null; started_at: string } | null;
}

export interface AgentRun {
  id: string;
  agent_id: string;
  status: "running" | "succeeded" | "failed" | "skipped";
  trigger: string;
  headline: string | null;
  summary: string | null;
  detail: Record<string, unknown>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
}

export interface AgentAction {
  id: string;
  run_id: string;
  agent_id: string;
  kind: string;
  outward: boolean;
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
  status: "proposed" | "approved" | "executed" | "rejected" | "failed";
  executed_at: string | null;
  error: string | null;
  created_at: string;
}

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  propose: "Proposes only",
  act_in_app: "Acts in-app",
  autonomous: "Fully autonomous",
};

export const AUTONOMY_BLURB: Record<Autonomy, string> = {
  propose: "Writes findings and suggests actions. Nothing happens until you approve it.",
  act_in_app: "Reversible in-app work happens on its own. Anything reaching a person waits for you.",
  autonomous: "Everything runs without review, including emails to real people.",
};

export const ACTION_LABEL: Record<string, string> = {
  create_task: "Open a task",
  complete_checklist_item: "Tick a checklist item",
  draft_email: "Send an email",
  flag_risk: "Flag a risk",
};

/** Human description of a 5-field UTC cron, for the common shapes we generate. */
export function describeCron(cron: string | null): string {
  if (!cron) return "Manual only";
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = f;
  const time = /^\d+$/.test(hour) && /^\d+$/.test(min)
    ? `${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`
    : null;
  if (!time) return cron;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (dom === "*" && mon === "*") {
    if (dow === "*") return `Every day at ${time}`;
    if (dow === "1-5") return `Weekdays at ${time}`;
    if (/^\d$/.test(dow)) return `Every ${DAYS[Number(dow)]} at ${time}`;
  }
  return cron;
}

// ---------------------------------------------------------------- push

const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

export async function pushStatus(): Promise<"unsupported" | "denied" | "subscribed" | "available"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "subscribed" : "available";
}

/** Register the SW, ask permission, and store the subscription server-side. */
export async function subscribeToPush(): Promise<void> {
  if (!pushSupported()) throw new Error("This browser does not support push notifications");

  const { configured, public_key } = await agentsApi<{ configured: boolean; public_key: string | null }>(
    "/push/config",
  );
  if (!configured || !public_key) {
    throw new Error("Push is not configured on the server yet — VAPID keys are missing");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(public_key),
  });

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  await agentsApi("/push/subscribe", {
    method: "POST",
    body: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      user_agent: navigator.userAgent.slice(0, 400),
    },
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await agentsApi("/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } });
  await sub.unsubscribe();
}
