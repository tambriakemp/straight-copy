// The client portal's server. Mockups 13-16 are drawn from what this returns.
//
// ONE FUNCTION, ONE RULE: THE BROWSER NEVER HOLDS A CREDENTIAL THAT CAN READ
// MORE THAN ITS OWN CLIENT.
//
// The Client Portal plugin authenticates a Paperclip board session or an
// agent API key. The key this project holds is an agent key scoped to the
// whole company, so one copy of it in a client's browser is a copy of every
// client's proposals, invoices and saved logins. It therefore lives in this
// function's environment, is read by `_shared/client-portal-plugin.ts`, and
// appears in no response, no error and no log line. There is no `VITE_`
// variable anywhere in this feature, which is the mechanical version of the
// same statement: a `VITE_` name is compiled into the bundle.
//
// WHAT THE BROWSER SENDS, AND WHAT IT PROVES
//
// The caller's own Supabase session, which `resolvePortalCaller` resolves to
// an ACTIVE `client_portal_users` row for the client id in the request -- or
// to an admin, for the existing `?as=admin` preview. CRE-536 is the reason
// that check is not optional: before it, "a link that names a real client id"
// was the only thing any portal endpoint checked, which made a forwarded link
// a permanent grant to anyone who kept it.
//
// Having resolved the caller to one client, every downstream call carries
// that client id as a scope, and the plugin independently refuses any id
// belonging to someone else. Two checks, because the cost of one bug here is
// one client reading another's contracts.
//
// WHY THERE IS NO `markPaid` ACTION
//
// Money is only ever marked received by a verified provider webhook, which
// goes to the plugin, not here. `checkout` returns a URL and nothing else. A
// portal that could mark its own invoices paid would be a portal in which a
// client could.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolvePortalCaller, type PortalCaller } from "../_shared/webhook-auth.ts";
import {
  PluginApiError,
  PluginClient,
  describeConfig,
  readPluginConfig,
} from "../_shared/client-portal-plugin.ts";
import {
  PORTAL_WIRE_VERSION,
  type PortalBranding,
} from "../_shared/client-portal-wire.ts";
import { resolveBranding, settingsFrom } from "../_shared/client-portal-branding.ts";
import { VIEW_AS_HEADER } from "../_shared/portal-view-as.ts";
import { LegacySource, type Db } from "./legacy-source.ts";
import { PluginSource } from "./plugin-source.ts";
import {
  PortalError,
  type LoginRevealActor,
  type PortalCallerContext,
  type PortalSource,
} from "./source.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // `x-portal-view-as` is a non-simple header, so a browser will preflight it
  // and drop the request if it is not named here. CRE-811.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-view-as",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENC_KEY = Deno.env.get("PROJECT_SECRETS_KEY") ?? "";

function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * The agency, as the client sees it.
 *
 * Resolved by `_shared/client-portal-branding.ts`, which is the only module
 * in this feature that knows whose install this is -- including the monogram
 * in the top bar, which was two characters written into the component until
 * CRE-797. The resolution lives there rather than here because it is pure and
 * this file is not: a module that reads `Deno.env` cannot be imported by the
 * frontend test suite, and the branch that matters most is the one that only
 * a licensee's install ever takes.
 */
function branding(): PortalBranding {
  return resolveBranding(settingsFrom(Deno.env));
}

/**
 * Which source answers this install.
 *
 * The plugin when it is configured, the `/admin` tables otherwise. Not a
 * fallback and not a retry: it is decided once per request from the presence
 * of configuration, so an install can never be reading half its data from one
 * and half from the other. A plugin that is configured and unreachable is an
 * error the client sees, not a silent slide back to stale rows.
 */
function sourceFor(req: Request, admin: Db): PortalSource {
  const config = readPluginConfig();
  if (config) return new PluginSource(new PluginClient(config));

  const auth = req.headers.get("Authorization") ?? "";
  // CRE-811: a view-as session has no Supabase bearer at all -- the token IS
  // the credential -- so it has to travel with the forwarded call or the
  // bridge's composed answer comes back three-quarters empty. Carried rather
  // than exchanged for the service key, so the function on the other end
  // still re-checks it against its own entry in the read allowlist.
  const viewAs = req.headers.get(VIEW_AS_HEADER);
  return new LegacySource(
    admin,
    async (fn, body) => {
      // Forwarding the caller's own token rather than the service key: the
      // function on the other end re-checks who is asking, which is a second
      // opinion rather than this one repeated.
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          ...(viewAs ? { [VIEW_AS_HEADER]: viewAs } : {}),
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      return { status: response.status, body: parsed };
    },
    ENC_KEY,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const action = String(payload.action ?? "").trim();
  const clientId = String(payload.clientId ?? "").trim();

  // A configuration report, for a deploy check. Booleans and a source name;
  // no values, because a diagnostic that prints the first characters of a key
  // is a diagnostic somebody pastes into a ticket.
  if (action === "health") {
    const config = describeConfig();
    return json({
      ok: true,
      source: config.configured ? "plugin" : "admin-tables",
      plugin: config,
      // Which revision of the wire contract this deploy speaks. The frontend
      // is published separately from this function and after it, so a field
      // the browser reads can be one the server does not send yet; this is
      // how somebody checks rather than assumes. Not a secret: it is a
      // version number, like the one in the plugin's own URL path.
      wire: PORTAL_WIRE_VERSION,
      // Whether a monogram will be drawn, and never which one -- the value is
      // branding the licensee owns and a health check is not a place to read
      // it back. False here with a name set is the CRE-797 failure mode
      // inverted: an install that has not chosen a mark and whose name
      // yields no initials.
      monogram: typeof branding().monogram === "string",
    });
  }

  if (!clientId) return json({ error: "clientId required" }, 400);

  // `action` is passed so that a CRE-811 view-as token can be checked against
  // the read allowlist in `_shared/portal-view-as.ts`. Without it a view-as
  // caller is refused, which is the right default and not what we want here.
  const caller = await resolvePortalCaller(req, clientId, action);
  if (caller.kind === "unauthorized") return json({ error: "Unauthorized" }, 401);

  // Narrowed to the `Db` slice rather than kept as the full client: this
  // function holds the service role, and a narrower handle is a smaller set
  // of things a mistake downstream could reach with it.
  //
  // The cast is the one place the two type systems meet. Supabase's builder
  // is generated from a schema and `Db` is written by hand against the half
  // dozen calls `legacy-source.ts` makes; they are structurally the same and
  // nominally different, and asserting that once here beats loosening the
  // hand-written half to `any` and losing the checking everywhere it is used.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY) as unknown as Db;
  const source = sourceFor(req, admin);
  const ctx: PortalCallerContext = {
    clientId,
    preview: caller.kind === "admin",
    branding: branding(),
    now: new Date(),
  };

  try {
    switch (action) {
      case "home":
        return json({ ok: true, view: await source.home(ctx) });
      case "agreements":
        return json({ ok: true, view: await source.agreements(ctx) });
      case "payments":
        return json({ ok: true, view: await source.payments(ctx) });
      case "logins":
        return json({ ok: true, view: await source.logins(ctx) });

      case "sign": {
        // An admin previewing a client's portal must not be able to sign
        // their contract. The preview exists so Bree can see what the client
        // sees, and signing is not seeing -- a signature attributed to a
        // client and made by the agency is a false statement in an audit
        // trail, whatever the intent behind it.
        refusePreviewWrites(ctx, "sign this");
        return json({
          ok: true,
          result: await source.sign(ctx, {
            proposalId: requireId(payload, "proposalId"),
            signerName: String(payload.signerName ?? ""),
            signatureStyle: optionalText(payload.signatureStyle),
            consentGranted: payload.consentGranted === true,
          }),
        });
      }

      case "decline": {
        refusePreviewWrites(ctx, "decline this");
        await source.decline(
          ctx,
          requireId(payload, "proposalId"),
          optionalText(payload.reason),
        );
        return json({ ok: true });
      }

      case "checkout": {
        refusePreviewWrites(ctx, "pay this");
        return json({ ok: true, ...(await source.checkout(ctx, requireId(payload, "invoiceId"))) });
      }

      case "document": {
        // A read, so the preview may do it: seeing what the client sees is
        // the whole point of the preview, and a contract is a thing to see.
        const kind = payload.kind === "source" ? "source" : "signed";
        return json({
          ok: true,
          document: await source.document(ctx, kind, requireId(payload, "proposalId")),
        });
      }

      case "share-login": {
        refusePreviewWrites(ctx, "share a login");
        await source.shareLogin(ctx, {
          requestId: optionalText(payload.requestId),
          label: optionalText(payload.label),
          url: optionalText(payload.url),
          username: optionalText(payload.username),
          secret: String(payload.secret ?? ""),
        });
        return json({ ok: true });
      }

      case "update-login": {
        refusePreviewWrites(ctx, "change a login");
        await source.updateLogin(ctx, {
          id: requireId(payload, "id"),
          ...(payload.label !== undefined ? { label: String(payload.label) } : {}),
          ...(payload.url !== undefined ? { url: optionalText(payload.url) } : {}),
          ...(payload.username !== undefined
            ? { username: optionalText(payload.username) }
            : {}),
          // An absent `secret` leaves the stored one alone. An empty string
          // is treated the same way rather than as "clear it", because the
          // form never shows the current password and submitting it
          // unchanged must not wipe what is there.
          ...(typeof payload.secret === "string" && payload.secret.length > 0
            ? { secret: payload.secret }
            : {}),
        });
        return json({ ok: true });
      }

      case "remove-login": {
        refusePreviewWrites(ctx, "remove a login");
        await source.removeLogin(ctx, requireId(payload, "id"));
        return json({ ok: true });
      }

      case "create-shared-drive-link": {
        refusePreviewWrites(ctx, "add a shared-drive link");
        const url = optionalText(payload.url);
        if (!url) return json({ error: "url is required" }, 400);
        const sharedDriveLink = await source.createSharedDriveLink(ctx, {
          clientProjectId: requireId(payload, "clientProjectId"),
          url,
        });
        return json({ ok: true, sharedDriveLink });
      }

      case "remove-shared-drive-link": {
        refusePreviewWrites(ctx, "remove a shared-drive link");
        await source.removeSharedDriveLink(ctx, requireId(payload, "id"));
        return json({ ok: true });
      }

      case "account-access":
        return json({ ok: true, view: await source.accountAccess(ctx) });

      case "save-account-access": {
        refusePreviewWrites(ctx, "change account access");
        const input: { checks?: Record<string, boolean>; fields?: Record<string, string>; notes?: string } = {};
        if (payload.checks !== undefined) input.checks = payload.checks as Record<string, boolean>;
        if (payload.fields !== undefined) input.fields = payload.fields as Record<string, string>;
        // Checked for presence, not truthiness: an admin preview must not be
        // able to reach this at all (refused above), and a genuine caller
        // who omitted `notes` entirely must leave the note untouched rather
        // than have `undefined` read as `""` and withdraw it.
        if (typeof payload.notes === "string") input.notes = payload.notes;
        return json({ ok: true, view: await source.saveAccountAccess(ctx, input) });
      }

      case "reveal-login": {
        // A read of one password, not a write: view-as may do it, and an
        // admin preview may do it. The list action above never includes the
        // password. This response is uncacheable and carries that one value.
        const password = await source.revealLogin(
          ctx,
          requireId(payload, "id"),
          revealActor(caller),
        );
        return json({ ok: true, password }, 200, { "Cache-Control": "no-store" });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (caught) {
    if (caught instanceof PortalError) {
      return json({ error: caught.message, code: caught.code }, caught.status);
    }
    if (caught instanceof PluginApiError) {
      // A refusal from the plugin keeps its status, so "that is not yours"
      // stays a 404 in the portal instead of reading as an outage. The
      // message is the plugin's own, written for a person.
      const status = caught.status >= 400 && caught.status < 500 ? caught.status : 502;
      return json({ error: caught.message, code: caught.code }, status);
    }
    // Anything else is ours and is not described to the client. The detail
    // goes to the function log; a stack or a SQL fragment in a portal
    // response is a map of the schema.
    console.error("[client-portal]", action, caught);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

function revealActor(caller: Exclude<PortalCaller, { kind: "unauthorized" }>): LoginRevealActor {
  if (caller.kind === "portal") {
    return { userId: caller.userId, via: "portal", actorLabel: null };
  }
  return {
    userId: caller.userId,
    via: caller.viewAs ? "view_as" : "admin",
    actorLabel: caller.viewAs?.act ?? null,
  };
}

function refusePreviewWrites(ctx: PortalCallerContext, what: string): void {
  if (!ctx.preview) return;
  throw new PortalError(
    403,
    "preview_is_read_only",
    `You are previewing this portal as the client, so you cannot ${what}.`,
  );
}

function requireId(payload: Record<string, unknown>, field: string): string {
  const value = String(payload[field] ?? "").trim();
  if (!value) throw new PortalError(400, "field_required", `${field} is required.`);
  return value;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
