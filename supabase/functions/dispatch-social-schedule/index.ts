// Cron target: send the social posts that have come due.
//
// Called by pg_cron every five minutes via pg_net, the same shape as
// dispatch-agent-runs. Five rather than fifteen because scheduling granularity
// is the whole product here — a post booked for 14:00 that goes out at 14:14
// is a worse product than one that goes out at 14:03.
//
// This function never consults autonomy. It drains rows that a gated action
// created, and that gate has already happened. Re-deciding here would split
// the decision across two places, and a bug in this one would post to clients.
//
// Authenticated with x-agent-secret. dispatch-web-dev-scheduled has no auth at
// all, which is a mistake worth not copying: this endpoint posts to the public
// internet on demand.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  copostPayload,
  isValidCopostEndpoint,
  withImageExtension,
} from "../_shared/social/copost.ts";
import {
  isAuthFailure,
  nextAttempt,
  sendability,
} from "../_shared/social/schedule-policy.ts";
import { sendPushToAll } from "../_shared/agents/push.ts";
import { executeAndRecord, type ActionRow } from "../_shared/agents/actions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SIGNED_URL_TTL = 60 * 60 * 24 * 30;
const BATCH = 25;

/**
 * Derived from a real call rather than written as ReturnType<typeof
 * createClient>, which resolves to the generic defaults and does not match what
 * an actual call produces.
 */
function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

type Sb = ReturnType<typeof serviceClient>;

interface ScheduleRow {
  id: string;
  client_project_id: string;
  social_post_id: string | null;
  social_image_id: string | null;
  attempts: number;
  max_attempts: number;
}

/** Give up on a send, and raise the alarm exactly once. */
async function giveUp(
  sb: Sb,
  row: ScheduleRow,
  message: string,
): Promise<void> {
  await sb.from("social_schedule").update({
    status: "failed",
    claimed_at: null,
    last_error: message.slice(0, 500),
  }).eq("id", row.id);

  // Mirror onto the content row, matching what both existing senders do, so
  // the Social tab shows the failure where someone is already looking.
  if (row.social_post_id) {
    await sb.from("social_posts")
      .update({ status: "error", error: message.slice(0, 500) })
      .eq("id", row.social_post_id);
  } else if (row.social_image_id) {
    await sb.from("social_images")
      .update({ copost_status: "error", copost_error: message.slice(0, 500) })
      .eq("id", row.social_image_id);
  }

  await raiseTheAlarm(sb, row, message);
}

/**
 * The four things that happen when a post is finally, definitely broken.
 *
 * Here rather than in an agent run because the failure happens hours after any
 * run, with no model in the loop. A post that dies on Saturday must not wait
 * until Monday for someone to notice.
 *
 * Best-effort throughout: a failure to record a failure must not throw and
 * strand the rest of the batch.
 */
async function raiseTheAlarm(
  sb: Sb,
  row: ScheduleRow,
  message: string,
): Promise<void> {
  try {
    const { data: agent } = await sb.from("agents")
      .select("id, name, delivery").eq("key", "social-media").maybeSingle();
    if (!agent) return;

    const { data: project } = await sb.from("client_projects")
      .select("id, name, client_id").eq("id", row.client_project_id).maybeSingle();
    const who = project?.name ?? row.client_project_id;

    // agent_actions.run_id is NOT NULL, so an event-triggered action needs a
    // run to hang off. Same reason action-tool.ts opens one lazily.
    const { data: run } = await sb.from("agent_runs").insert({
      agent_id: agent.id,
      status: "succeeded",
      trigger: "event",
      client_id: project?.client_id ?? null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      headline: `A post for ${who} failed and will not be retried`,
      summary: `The scheduled post could not be sent.\n\n${message}`,
    }).select("id").maybeSingle();
    if (!run) return;

    const clientMustFix = isAuthFailure(message);

    await sb.from("agent_actions").insert({
      run_id: run.id,
      agent_id: agent.id,
      kind: "flag_risk",
      outward: false,
      title: `Post to ${who} failed`,
      description: message.slice(0, 500),
      payload: {
        severity: "high",
        schedule_id: row.id,
        client_project_id: row.client_project_id,
        error: message.slice(0, 500),
        client_must_reconnect: clientMustFix,
      },
      status: "executed",
      executed_at: new Date().toISOString(),
      result: { acknowledged: true },
    });

    // An expired social login is the client's to fix, and no task on Bree's
    // board moves it. Iris emails them on her next run instead — the flag and
    // the context she reads are what tell her to.
    //
    // Routed through executeAndRecord rather than inserting into project_tasks
    // here, so there stays exactly one code path that changes the world on an
    // agent's behalf — and so the task gets the same enum coercion every other
    // agent-opened task does. Inserting directly is how a silently-failing
    // priority value shipped once already.
    if (!clientMustFix) {
      const { data: taskAction } = await sb.from("agent_actions").insert({
        run_id: run.id,
        agent_id: agent.id,
        kind: "create_task",
        outward: false,
        title: `Fix the failed social post for ${who}`,
        description: message.slice(0, 500),
        payload: {
          name: `Fix the failed social post for ${who}`,
          client_project_id: row.client_project_id,
          priority: "high",
          status: "backlog",
        },
        // create_task is not outward. A broken post should not wait in an
        // approval queue to be looked at.
        status: "approved",
      }).select("*").maybeSingle();

      if (taskAction) {
        await executeAndRecord(sb, taskAction as unknown as ActionRow, String(agent.name));
      }
    }

    // Push, because a post that will not go out is time-sensitive in a way a
    // brief nobody reads until Monday is not.
    const delivery = (agent.delivery ?? {}) as Record<string, boolean>;
    if (delivery.push) {
      // Payload-less web push — the notification says something needs you and
      // the brief is fetched over an authenticated session. See push.ts.
      await sendPushToAll(sb);
    }
  } catch (_) {
    // Recording the alarm is best-effort. The schedule row already carries the
    // error, which is the part that must not be lost.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("CLAUDE_WEBHOOK_SECRET");
  const supplied = req.headers.get("x-agent-secret") ??
    new URL(req.url).searchParams.get("secret");
  if (!secret || supplied !== secret) return json({ error: "Unauthorized" }, 401);

  const sb = serviceClient();
  const encKey = Deno.env.get("PROJECT_SECRETS_KEY");
  if (!encKey) return json({ error: "PROJECT_SECRETS_KEY is not configured" }, 500);

  // Claims atomically and burns an attempt, so an isolate that dies mid-send
  // cannot leave a post looping forever.
  const { data: due, error: claimErr } = await sb.rpc("claim_due_social_sends", {
    _limit: BATCH,
  });
  if (claimErr) return json({ error: claimErr.message }, 500);

  const results: Record<string, unknown>[] = [];

  for (const row of (due ?? []) as ScheduleRow[]) {
    try {
      const isImage = !!row.social_image_id;

      // Re-check what is actually being sent. A post can be sent by hand
      // through the Send button between being booked and coming due; without
      // this the button and the dispatcher both send it.
      let caption: string | null = null;
      let hashtags: string[] = [];
      let imagePaths: string[] = [];
      let bucket = "social-images";

      if (isImage) {
        const { data: img } = await sb.from("social_images")
          .select("id, caption, hashtags, copost_status, storage_path")
          .eq("id", row.social_image_id).maybeSingle();
        if (!img) throw new Error("The photo has been deleted");

        const verdict = sendability({
          kind: "image",
          copostStatus: img.copost_status,
          hasStoragePath: !!img.storage_path,
        });
        if (verdict !== "ok") {
          await sb.from("social_schedule").update({
            status: "cancelled", claimed_at: null, last_error: verdict,
          }).eq("id", row.id);
          results.push({ id: row.id, skipped: verdict });
          continue;
        }
        caption = img.caption;
        hashtags = (img.hashtags ?? []) as string[];
        imagePaths = [img.storage_path];
      } else {
        const { data: post } = await sb.from("social_posts")
          .select("id, caption, hashtags, status, slides")
          .eq("id", row.social_post_id).maybeSingle();
        if (!post) throw new Error("The post has been deleted");

        const slides = (post.slides ?? []) as { image_path?: string }[];
        const paths = slides.map((s) => s.image_path).filter(Boolean) as string[];

        const verdict = sendability({
          kind: "post",
          status: post.status,
          imageCount: paths.length,
        });
        if (verdict !== "ok") {
          await sb.from("social_schedule").update({
            status: "cancelled", claimed_at: null, last_error: verdict,
          }).eq("id", row.id);
          results.push({ id: row.id, skipped: verdict });
          continue;
        }
        caption = post.caption;
        hashtags = (post.hashtags ?? []) as string[];
        imagePaths = paths;
        bucket = "social-posts";
      }

      const { data: endpoint } = await sb.rpc("get_project_secret", {
        _client_project_id: row.client_project_id,
        _key: "copost_endpoint_url",
        _enc_key: encKey,
      });
      if (!endpoint) throw new Error("No CoPost endpoint is configured for this project");
      if (!isValidCopostEndpoint(String(endpoint))) {
        throw new Error("The stored CoPost URL is not a copost.io address");
      }

      // Fresh signed URLs every send: CoPost fetches the image itself, and a
      // URL signed when the post was booked may already have expired.
      const imageUrls: string[] = [];
      for (const path of imagePaths) {
        const { data: signed, error: sErr } = await sb.storage
          .from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
        if (sErr || !signed?.signedUrl) {
          throw new Error(`signed url failed: ${sErr?.message ?? "unknown"}`);
        }
        imageUrls.push(withImageExtension(signed.signedUrl));
      }
      if (!imageUrls.length) throw new Error("Nothing to send — no images");

      const res = await fetch(String(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copostPayload({ caption, hashtags, imageUrls })),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`CoPost ${res.status}: ${body.slice(0, 400)}`);

      const sentAt = new Date().toISOString();
      await sb.from("social_schedule").update({
        status: "sent", sent_at: sentAt, claimed_at: null, last_error: null,
      }).eq("id", row.id);

      if (isImage) {
        await sb.from("social_images").update({
          copost_status: "sent", copost_sent_at: sentAt, copost_error: null,
        }).eq("id", row.social_image_id);
      } else {
        await sb.from("social_posts").update({
          status: "published", published_at: sentAt, error: null,
        }).eq("id", row.social_post_id);
      }

      results.push({ id: row.id, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const decision = nextAttempt({
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        retryAfterMinutes: 5,
      }, new Date());

      if (decision.action === "retry") {
        // Quietly. Most failures here are a transient 502 or a signed URL that
        // expired a minute early, and opening a task for each one teaches
        // everybody to ignore the channel.
        await sb.from("social_schedule").update({
          status: "pending",
          claimed_at: null,
          scheduled_at: decision.scheduledAt.toISOString(),
          last_error: message.slice(0, 500),
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, retrying: true, error: message });
      } else {
        await giveUp(sb, row, message);
        results.push({ id: row.id, ok: false, gave_up: true, error: message });
      }
    }
  }

  return json({ ok: true, processed: results.length, results });
});
