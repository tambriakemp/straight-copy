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
    // `reveal-login` copies one password. It is a read the preview may make:
    // it does not change the row, and the server records the copy.
    for (const action of ["home", "agreements", "payments", "logins", "document", "reveal-login"]) {
      expect(viewAsMayRead("client-portal", action), action).toBe(true);
    }
    expect(viewAsMayRead("proposal-sign", "download")).toBe(true);
  });

  it("lets Project and Files through (CRE-818, plus download in CRE-822)", () => {
    expect(viewAsMayRead("brand-kit-intake", "resolve")).toBe(true);
    expect(viewAsMayRead("client-files", "list")).toBe(true);
    expect(viewAsMayRead("client-files", "download")).toBe(true);
  });

  it("lets the project's phase ladder through (CRE-822, G2)", () => {
    // Closed the third hole on the Project screen: before this, a view-as
    // caller never even asked `client-portal` for `project-phases`, so
    // "Where things stand" rendered empty rather than as a known gap.
    expect(viewAsMayRead("client-portal", "project-phases")).toBe(true);
  });

  it("lets the Audits tab through (CRE-822, G8)", () => {
    expect(viewAsMayRead("client-portal", "project-audits")).toBe(true);
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

  it("refuses the writes that sit beside the two CRE-818 reads", () => {
    // `brand-kit-intake` writes `complete` (advances the client's journey
    // node and emails the team), `fast-complete` (the same, without a
    // conversation), `chat` and `save-logo-progress`. Its `account-access-*`
    // actions moved to `client-portal` (CRE-822, G4) and are gone from here
    // entirely -- not refused by this allowlist but by the function no
    // longer answering to them at all.
    for (const action of ["chat", "complete", "fast-complete", "save-logo-progress"]) {
      expect(viewAsMayRead("brand-kit-intake", action), action).toBe(false);
    }
    // `remove` deletes the object out of storage as well as the row, so it is
    // the one here with no undo at all. `create`/`complete` replaced
    // `register` in CRE-822, when the plugin is the source.
    for (const action of ["register", "create", "complete", "remove", "set_visible"]) {
      expect(viewAsMayRead("client-files", action), action).toBe(false);
    }
  });

  it("fails closed for a function nobody has thought about", () => {
    // Both of these ARE reads a preview would like, and neither is on the
    // list: the Project screen says in words that it cannot show them rather
    // than drawing the empty answer they would give. CRE-818.
    expect(viewAsMayRead("preview-approvals", "list")).toBe(false);
    expect(viewAsMayRead("web-dev-discovery-chat", "chat")).toBe(false);
    expect(viewAsMayRead("portal-invite", "invite")).toBe(false);
    expect(viewAsMayRead("contract-sign", "get")).toBe(false);
    expect(viewAsMayRead("", "")).toBe(false);
  });

  it("names a function that is on the list by the key it is reached at", () => {
    // The allowlist key has to be the name `functionNameFromUrl` derives, or
    // the entry points at nothing and the symptom is a 401 that looks like a
    // bad token. Pinned for the two added in CRE-818, because both were
    // written from the card rather than from a URL.
    for (const fn of ["brand-kit-intake", "client-files"]) {
      expect(functionNameFromUrl(`https://x.supabase.co/functions/v1/${fn}`)).toBe(fn);
    }
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

  // Every function the BROWSER posts a view-as token to, which is not the
  // same set as `VIEW_AS_READS`: `proposal-sign` is on the allowlist but is
  // only ever reached server-to-server from `client-portal/legacy-source.ts`,
  // so no preflight happens and its CORS line is not this test's business.
  const browserFacing = ["client-portal", "brand-kit-intake", "client-files"];

  it.each(browserFacing)("is the string %s's CORS allowlist names", (fn) => {
    // A header a function does not advertise is a header the browser drops at
    // preflight, and the symptom is a portal that works in curl and 401s in
    // Chrome -- with no request reaching the function to log why.
    const index = readFileSync(
      join(__dirname, `../../supabase/functions/${fn}/index.ts`),
      "utf8",
    );
    const allowHeaders =
      /Access-Control-Allow-Headers":\s*([\s\S]*?),?\n\s*(?:"Access-Control-|\})/
        .exec(index)?.[1] ?? "";
    expect(allowHeaders, `${fn} has no Allow-Headers this test could read`).not.toBe("");
    expect(allowHeaders).toContain(VIEW_AS_HEADER);
  });
});

describe("the action reaches the allowlist (CRE-818)", () => {
  // `resolvePortalCaller(req, clientId)` with no third argument refuses EVERY
  // view-as token, by design -- the allowlist cannot answer "may this token
  // do this" without being told what "this" is. That default is right and it
  // is also exactly the bug this card fixed: two functions were on the
  // allowlist and still 401ing, because neither passed its action. A call
  // site that loses the argument again fails here rather than in a preview.
  const callers = ["brand-kit-intake", "client-files", "client-portal"];

  it.each(callers)("%s passes its parsed action through", (fn) => {
    const source = readFileSync(
      join(__dirname, `../../supabase/functions/${fn}/index.ts`),
      "utf8",
    );
    const calls = source.match(/resolvePortalCaller\([^)]*\)/g) ?? [];
    expect(calls.length, `${fn} does not call resolvePortalCaller`).toBeGreaterThan(0);
    for (const call of calls) {
      // Three arguments, not two. `req, clientId` alone is the closed default.
      expect(call.split(",").map((part) => part.trim()), call).toEqual([
        "resolvePortalCaller(req",
        "clientId",
        "action)",
      ]);
    }
  });
});

describe("brand-kit-intake's resolve does not write (CRE-818)", () => {
  // `resolve` is on the read allowlist, and it was never purely a read: it
  // flips the `intake.portal_accessed` checklist item. That was gated on
  // `body.asAdmin`, a flag the browser sets -- fine while every caller held a
  // session, and not fine for a token whose entire purpose is to look without
  // leaving a mark. The checklist does not record who ticked it, so a preview
  // that ticked it would be wrong in the one way nobody would ever notice.
  const source = readFileSync(
    join(__dirname, "../../supabase/functions/brand-kit-intake/index.ts"),
    "utf8",
  );

  it("gates the checklist flip on the resolved caller, not just the body flag", () => {
    const guard = /if \(!body\.asAdmin[^)]*\) \{\s*\n\s*try \{ await flipChecklistItem/
      .exec(source)?.[0] ?? "";
    expect(guard, "the flipChecklistItem guard moved or changed shape").not.toBe("");
    expect(guard).toContain('caller.kind !== "admin"');
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
