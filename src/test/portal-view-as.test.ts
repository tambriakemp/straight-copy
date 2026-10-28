/**
 * Admin view-as-client: the token, the allowlist, and the transport (CRE-811).
 *
 * This is the one feature in the portal where a bug hands one person's data to
 * another, or lets an agency sign a contract in a client's name, so the things
 * pinned below are the ones whose failure is not visible on a screen:
 *
 *  * **A token signed with the wrong key is refused**, and so is one whose
 *    payload was edited after signing. Nothing downstream re-checks either.
 *  * **The allowlist fails closed.** A function with no entry, or an action
 *    not in its entry, gets nothing. `sign`, `decline` and `checkout` are
 *    named explicitly in a test, because the day one of them is accidentally
 *    added to `VIEW_AS_READS` is the day this test has to be the thing that
 *    notices.
 *  * **The header name matches on both sides.** Two copies of the string, one
 *    in `src` and one in `supabase/functions`, because the Deno half is not in
 *    the app's typecheck -- the same arrangement as `clientPortalWire.ts`. A
 *    drift is every portal request 401ing with nothing in the console.
 *  * **The token leaves the URL.** It arrives in the fragment and must not
 *    stay in the address bar, because the address bar is history, screenshots
 *    and whatever the client's browser syncs to their other devices.
 *
 * The codec imports straight out of `supabase/functions/_shared`, which
 * `tsconfig.app.json` does not include -- the arrangement
 * `client-portal-source.test.ts` already uses. That module is deliberately
 * free of `Deno` and of `npm:` specifiers so this is possible.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  VIEW_AS_HEADER as CANONICAL_HEADER,
  VIEW_AS_TTL_SECONDS,
  functionNameFromUrl,
  mintViewAsToken,
  verifyViewAsToken,
  viewAsMayRead,
} from "../../supabase/functions/_shared/portal-view-as";
import {
  VIEW_AS_HEADER,
  adoptViewAsFromUrl,
  clearViewAs,
  hasViewAs,
  viewAsActor,
  viewAsTokenFor,
} from "@/lib/portalViewAs";

const ADMIN_KEY = "a-long-enough-admin-signing-key-for-a-test";
const PLUGIN_KEY = "a-different-key-held-by-the-plugin-only";
const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT = "22222222-2222-4222-8222-222222222222";

const claims = (over: Record<string, unknown> = {}) => ({
  iss: "admin" as const,
  cid: CLIENT,
  sub: "99999999-9999-4999-8999-999999999999",
  act: "bree@cre8visions.com",
  jti: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ...over,
});

describe("the view-as token", () => {
  it("round-trips the claims it was given", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    const result = await verifyViewAsToken(token, { admin: ADMIN_KEY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.cid).toBe(CLIENT);
    expect(result.claims.act).toBe("bree@cre8visions.com");
    expect(result.claims.exp - result.claims.iat).toBe(VIEW_AS_TTL_SECONDS);
  });

  it("is URL-fragment safe, because that is how it travels", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    expect(token).toMatch(/^cv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("refuses a token signed with the wrong key", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    const result = await verifyViewAsToken(token, { admin: PLUGIN_KEY });
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a payload edited after signing", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    const [prefix, payload, signature] = token.split(".");
    const edited = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    edited.cid = OTHER_CLIENT;
    const forged = Buffer.from(JSON.stringify(edited), "utf8").toString("base64url");
    const result = await verifyViewAsToken(`${prefix}.${forged}.${signature}`, {
      admin: ADMIN_KEY,
    });
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("keeps the two issuers apart: the plugin's key cannot sign an admin token", async () => {
    const { token } = await mintViewAsToken(claims({ iss: "plugin" }), PLUGIN_KEY);
    // Verified with the plugin key, which is the key its `iss` selects.
    expect((await verifyViewAsToken(token, { plugin: PLUGIN_KEY })).ok).toBe(true);
    // And rejected when only the admin key is configured, because `iss` names
    // a key that is not there -- not because the signature happens to differ.
    expect(await verifyViewAsToken(token, { admin: PLUGIN_KEY })).toEqual({
      ok: false,
      reason: "no_key",
    });
  });

  it("refuses an issuer it does not know", async () => {
    // Hand-built: `mintViewAsToken` cannot be asked for an issuer the type
    // does not have, and the thing under test is what a verifier does with
    // one anyway.
    const payload = Buffer.from(
      JSON.stringify({ ...claims(), iss: "someone-else", iat: 0, exp: 9e9 }),
      "utf8",
    ).toString("base64url");
    const result = await verifyViewAsToken(`cv1.${payload}.not-a-signature`, {
      admin: ADMIN_KEY,
    });
    expect(result).toEqual({ ok: false, reason: "unknown_issuer" });
  });

  it("refuses an expired token, and says so", async () => {
    const minted = new Date("2026-10-28T12:00:00Z");
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY, minted);
    const later = new Date(minted.getTime() + (VIEW_AS_TTL_SECONDS + 1) * 1000);
    expect(await verifyViewAsToken(token, { admin: ADMIN_KEY }, later)).toEqual({
      ok: false,
      reason: "expired",
    });
    // One second before the deadline it is still good, so the boundary is not
    // quietly a minute either way.
    const justBefore = new Date(minted.getTime() + (VIEW_AS_TTL_SECONDS - 1) * 1000);
    expect((await verifyViewAsToken(token, { admin: ADMIN_KEY }, justBefore)).ok).toBe(true);
  });

  it("refuses rubbish without throwing", async () => {
    for (const bad of ["", "cv1", "cv1.a", "cv2.a.b", "a.b.c", "cv1..", "cv1.!!!.!!!"]) {
      const result = await verifyViewAsToken(bad, { admin: ADMIN_KEY });
      expect(result.ok, bad).toBe(false);
    }
  });

  it("will not sign with an empty key", async () => {
    await expect(mintViewAsToken(claims(), "")).rejects.toThrow(/empty key/);
  });

  it("refuses every issuer when no key is configured", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    expect(await verifyViewAsToken(token, {})).toEqual({ ok: false, reason: "no_key" });
    expect(await verifyViewAsToken(token, { admin: "" })).toEqual({
      ok: false,
      reason: "no_key",
    });
  });
});

describe("the read allowlist", () => {
  it("lets the four client screens and the contract through", () => {
    for (const action of ["home", "agreements", "payments", "logins", "document"]) {
      expect(viewAsMayRead("client-portal", action), action).toBe(true);
    }
    expect(viewAsMayRead("proposal-sign", "download")).toBe(true);
  });

  it("refuses every write on the portal, which is the point of it", () => {
    for (const action of [
      "sign",
      "decline",
      "checkout",
      "share-login",
      "update-login",
      "remove-login",
    ]) {
      expect(viewAsMayRead("client-portal", action), action).toBe(false);
    }
    for (const action of ["sign", "decline", "void", "delete", "create", "notify"]) {
      expect(viewAsMayRead("proposal-sign", action), action).toBe(false);
    }
  });

  it("fails closed for a function nobody has thought about", () => {
    expect(viewAsMayRead("client-files", "list")).toBe(false);
    expect(viewAsMayRead("portal-invite", "invite")).toBe(false);
    expect(viewAsMayRead("contract-sign", "get")).toBe(false);
    expect(viewAsMayRead("", "")).toBe(false);
  });

  it("names the function from its own request URL", () => {
    expect(
      functionNameFromUrl("https://x.supabase.co/functions/v1/client-portal"),
    ).toBe("client-portal");
    expect(
      functionNameFromUrl("https://x.supabase.co/functions/v1/proposal-sign?a=b"),
    ).toBe("proposal-sign");
    expect(functionNameFromUrl("not a url")).toBe("");
  });
});

describe("the header name, on both sides of the wire", () => {
  it("is the same string in src and in supabase/functions", () => {
    expect(VIEW_AS_HEADER).toBe(CANONICAL_HEADER);
  });

  it("is the string the browser-facing CORS allowlist names", () => {
    // A header a function does not advertise is a header the browser drops at
    // preflight, and the symptom is a portal that works in curl and 401s in
    // Chrome.
    const index = readFileSync(
      join(__dirname, "../../supabase/functions/client-portal/index.ts"),
      "utf8",
    );
    const allowHeaders = /Access-Control-Allow-Headers":\s*([\s\S]*?),?\n\s*"Access-Control-Allow-Methods/
      .exec(index)?.[1] ?? "";
    expect(allowHeaders).toContain(VIEW_AS_HEADER);
  });
});

describe("the browser's half: adopting a grant", () => {
  const put = (hash: string) => {
    window.history.replaceState(null, "", `/portal/${CLIENT}${hash}`);
  };

  beforeEach(() => {
    clearViewAs();
    sessionStorage.clear();
    put("");
  });

  it("takes the token out of the fragment and out of the address bar", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    put(`#view-as=${token}`);

    expect(adoptViewAsFromUrl(CLIENT)).toBe(true);
    expect(viewAsTokenFor(CLIENT)).toBe(token);
    expect(viewAsActor()).toBe("bree@cre8visions.com");
    // The reason the fragment is used at all is that it never reaches a
    // server; the reason it is removed is that it would otherwise be in
    // history and in any screenshot of the URL.
    expect(window.location.hash).toBe("");
  });

  it("will not serve a token for a client it was not issued for", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    put(`#view-as=${token}`);
    adoptViewAsFromUrl(CLIENT);

    expect(hasViewAs(CLIENT)).toBe(true);
    expect(hasViewAs(OTHER_CLIENT)).toBe(false);
    expect(viewAsTokenFor(OTHER_CLIENT)).toBeNull();
  });

  it("ignores a token minted for someone else, and still clears the URL", async () => {
    const { token } = await mintViewAsToken(claims({ cid: OTHER_CLIENT }), ADMIN_KEY);
    put(`#view-as=${token}`);

    expect(adoptViewAsFromUrl(CLIENT)).toBe(false);
    expect(viewAsTokenFor(CLIENT)).toBeNull();
    expect(window.location.hash).toBe("");
  });

  it("leaves a plain #anchor alone, because portal links carry those", () => {
    put("#portal-discovery");
    expect(adoptViewAsFromUrl(CLIENT)).toBe(false);
    expect(window.location.hash).toBe("#portal-discovery");
  });

  it("drops an expired token rather than sending it", async () => {
    const minted = new Date(Date.now() - (VIEW_AS_TTL_SECONDS + 60) * 1000);
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY, minted);
    put(`#view-as=${token}`);
    adoptViewAsFromUrl(CLIENT);

    expect(viewAsTokenFor(CLIENT)).toBeNull();
    expect(sessionStorage.getItem("cre8-portal-view-as")).toBeNull();
  });

  it("keeps the grant in sessionStorage, so it dies with the tab", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    put(`#view-as=${token}`);
    adoptViewAsFromUrl(CLIENT);

    expect(sessionStorage.getItem("cre8-portal-view-as")).toContain(token);
    expect(localStorage.getItem("cre8-portal-view-as")).toBeNull();
  });

  it("hands the grant back when asked", async () => {
    const { token } = await mintViewAsToken(claims(), ADMIN_KEY);
    put(`#view-as=${token}`);
    adoptViewAsFromUrl(CLIENT);
    clearViewAs();
    expect(viewAsTokenFor(CLIENT)).toBeNull();
  });
});

describe("proposal-sign's own admin check, against a view-as session", () => {
  // A view-as session sends the anon key in Authorization and its real
  // credential in x-portal-view-as. If proposal-sign read that bearer as an
  // admin, `sign` and `decline` would skip the allowlist gate entirely -- so
  // the anon key has to be refused before auth.getUser() is consulted, not
  // because GoTrue happens to find no user behind a sub-less JWT (CRE-813 #2).
  // The function imports Deno globals and cannot be imported here, so the
  // guard is pinned by reading its source, as the CORS check above does.
  const source = readFileSync(
    join(__dirname, "../../supabase/functions/proposal-sign/index.ts"),
    "utf8",
  );
  const isCallerAdmin = /async function isCallerAdmin[\s\S]*?\n}/.exec(source)?.[0] ?? "";

  it("has a body to check at all", () => {
    expect(isCallerAdmin).toContain("admin_users");
  });

  it("refuses the anon key explicitly", () => {
    expect(isCallerAdmin).toContain("SUPABASE_ANON_KEY");
    expect(isCallerAdmin).toMatch(/token === anonKey\) return false/);
  });

  it("refuses it before asking GoTrue who the bearer is", () => {
    // The call, not the word -- the comment above the guard names
    // auth.getUser() too, and matching that would pass for the wrong reason.
    expect(isCallerAdmin.indexOf("anonKey")).toBeLessThan(
      isCallerAdmin.indexOf("supabase.auth.getUser("),
    );
  });
});
