/**
 * The QA harness: that it works, and that it cannot reach a client.
 *
 * Two jobs, and the second is the one that matters.
 *
 * **It must answer.** CRE-789 could not review a single pixel of the four
 * client screens because they sit behind a real Supabase session. The
 * harness exists so QA can, so the fixtures have to cover the states a
 * reviewer needs to see -- every payment state, every waiting icon, a
 * proposal built here and one uploaded as a PDF -- and the write actions
 * have to behave like the server, refusals included. A harness that only
 * does the happy path teaches QA the happy path.
 *
 * **It must not ship.** Three independent things keep it out of production
 * (build flag, reserved client id, no network) and each is pinned here,
 * because "it's behind a flag" is the sentence people say about the feature
 * that turned out not to be. The one most likely to fail quietly is the
 * build flag, since `.env` is committed in this repo and feeds the
 * production build -- so one line added there would ship the harness to
 * every client, with nothing to notice it. That is a test, below.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DEMO_CLIENT_ID, isDemoClient } from "@/lib/portalDemo";
import { demoCall } from "@/lib/portalDemoData";
import { PortalRequestError } from "@/lib/clientPortalApi";
import type {
  AgreementsView,
  HomeView,
  LoginsView,
  PaymentState,
  PaymentsView,
  SignResult,
  WaitingIcon,
} from "@/lib/clientPortalWire";

const ROOT = path.resolve(__dirname, "../..");

/* -------------------------------------------------------------------------- */
/* The gate                                                                    */
/* -------------------------------------------------------------------------- */

describe("the harness is off unless it is deliberately switched on", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off when the flag is unset, for the demo id too", () => {
    expect(isDemoClient(DEMO_CLIENT_ID)).toBe(false);
  });

  it("is off for any other id even when the flag is set", () => {
    vi.stubEnv("VITE_PORTAL_DEMO", "1");
    // A real client id is a UUID. None of these may be served fixtures --
    // and more importantly, none of them may skip the auth gate.
    expect(isDemoClient("3f1e374d-7b0b-4a1e-9c2a-000000000000")).toBe(false);
    expect(isDemoClient(undefined)).toBe(false);
    expect(isDemoClient(null)).toBe(false);
    expect(isDemoClient("")).toBe(false);
    expect(isDemoClient(DEMO_CLIENT_ID)).toBe(true);
  });

  it("is off for any flag value other than 1", () => {
    for (const value of ["0", "", "true", "yes", "demo"]) {
      vi.stubEnv("VITE_PORTAL_DEMO", value);
      expect(isDemoClient(DEMO_CLIENT_ID)).toBe(false);
    }
  });

  it("reserves an id that cannot collide with a real client", () => {
    // Real ids are UUIDs everywhere in this codebase. If this ever became
    // one, the harness would be one typo away from shadowing a real client.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuid.test(DEMO_CLIENT_ID)).toBe(false);
  });
});

describe("the harness cannot be switched on by the production build", () => {
  it("is not enabled in the committed .env", () => {
    // `.env` is tracked in this repo and is what the Lovable build reads.
    // A line here would ship the harness to clients, which is why the flag
    // belongs on the command line: VITE_PORTAL_DEMO=1 npm run dev
    const env = readFileSync(path.join(ROOT, ".env"), "utf8");
    expect(env).not.toMatch(/VITE_PORTAL_DEMO/);
  });

  it("is never statically imported by a production module", () => {
    // This is the invariant that lets the bundler drop the fixtures. The
    // only reference to `portalDemoData` outside tests must be the dynamic
    // `import()` inside a branch guarded by the build flag -- a static
    // import would pull the fixtures into the production bundle whatever
    // the flag said, and nothing else would complain.
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      if (file.includes(`${path.sep}test${path.sep}`)) continue;
      if (file.endsWith(`${path.sep}portalDemoData.ts`)) continue;
      const text = readFileSync(file, "utf8");
      // A static import is `import ... from "..."`; the dynamic one is
      // `import(...)`. Only the first is a problem.
      if (/^\s*import\s[^(]*from\s+["'][^"']*portalDemoData["']/m.test(text)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("guards every reference to the harness with the build flag", () => {
    // Each use site re-reads `import.meta.env` rather than a re-exported
    // boolean, so the branch is provably dead at that site. If someone
    // drops the guard and relies on `isDemoClient` alone, elimination
    // starts depending on cross-module constant folding instead of on
    // something we can point at.
    for (const relative of [
      "src/lib/clientPortalApi.ts",
      "src/components/portal/RequirePortalAuth.tsx",
    ]) {
      const text = readFileSync(path.join(ROOT, relative), "utf8");
      const uses = text.match(/isDemoClient\(/g) ?? [];
      const guards = text.match(/import\.meta\.env\.VITE_PORTAL_DEMO === "1"/g) ?? [];
      expect(uses.length, `${relative} should call isDemoClient`).toBeGreaterThan(0);
      expect(guards.length, `${relative} guards every isDemoClient call`).toBe(uses.length);
    }
  });

  it("keeps the auth bypass to the six screens it has fixtures for", () => {
    // `demoable` is opt-in per route. The rest of /portal/:clientId/* reads
    // Supabase through the browser client, so a blanket bypass would be a
    // real gate removed. This pins the list to the CP-5 four plus Project
    // and Files (CRE-819).
    const app = readFileSync(path.join(ROOT, "src/App.tsx"), "utf8");
    const demoable = [...app.matchAll(/path="([^"]+)"[^>]*element=\{<RequirePortalAuth demoable>/g)]
      .map((match) => match[1]);
    expect(demoable.sort()).toEqual(
      [
        "/portal/:clientId",
        "/portal/:clientId/agreements",
        "/portal/:clientId/files",
        "/portal/:clientId/logins",
        "/portal/:clientId/payments",
        "/portal/:clientId/project",
      ].sort(),
    );
  });

  it("never reaches the network", () => {
    // The harness's strongest property: it has no route to a real client's
    // data because it has no route to anything. If `portalFetch` ever
    // appears in the fixtures, that stops being true.
    const source = readFileSync(path.join(ROOT, "src/lib/portalDemoData.ts"), "utf8");
    expect(source).not.toMatch(/portalFetch|fetch\(|supabase/i);
  });
});

/* -------------------------------------------------------------------------- */
/* The fixtures                                                                */
/* -------------------------------------------------------------------------- */

describe("the fixtures cover what a reviewer has to look at", () => {
  it("home carries every waiting icon, one primary, and a row with no button", () => {
    const home = demoCall<{ view: HomeView }>("home", {}).view;

    const icons = new Set(home.waitingOnYou.map((item) => item.icon).filter(Boolean));
    const every: WaitingIcon[] = ["sign", "upload", "review", "pay"];
    for (const icon of every) expect(icons).toContain(icon);

    expect(home.waitingOnYou.filter((item) => item.primary)).toHaveLength(1);
    // The informational row: no href, so no button. Reviewing that an
    // absent button is a decision needs an example of one.
    expect(home.waitingOnYou.some((item) => item.href === null)).toBe(true);

    // The ladder has exactly one "now", which is what "Step n of m" counts.
    expect(home.milestones.filter((one) => one.state === "now")).toHaveLength(1);
    expect(home.stepNumber).toBe(
      home.milestones.findIndex((one) => one.state === "now") + 1,
    );
    expect(home.stepCount).toBe(home.milestones.length);

    // Both tones, or half the updates list is never seen.
    expect(new Set(home.updates.map((one) => one.tone))).toEqual(new Set(["accent", "positive"]));
  });

  it("home carries a project with every field and one with none but a name", () => {
    const home = demoCall<{ view: HomeView }>("home", {}).view;
    const projects = home.projects ?? [];
    expect(projects.length).toBeGreaterThan(1);

    // The full row, and the row that is a name and nothing else -- which is
    // what a project the plugin can name and say nothing more about looks
    // like, and the only fixture that proves the meta line is omitted rather
    // than rendered as an empty gap.
    expect(projects.some((one) => one.kind !== null && one.statusLabel !== null)).toBe(true);
    expect(
      projects.some(
        (one) => one.kind === null && one.statusLabel === null && one.updatedAt === null,
      ),
    ).toBe(true);
    // A name long enough to need `.cp-projects__text`'s wrap rule at 375px,
    // which is where CRE-796's shape bites on two other screens.
    expect(Math.max(...projects.map((one) => one.name.length))).toBeGreaterThan(40);

    // One row with a link and one without, because that is the difference
    // the screen draws -- one Open button and rows without one. Both have to
    // appear in a screenshot or half of the decision goes unreviewed.
    expect(projects.some((one) => one.href !== null)).toBe(true);
    expect(projects.some((one) => one.href === null)).toBe(true);
  });

  it("payments carries every state, and a paid row both with and without a receipt", () => {
    const payments = demoCall<{ view: PaymentsView }>("payments", {}).view;
    const states = new Set(payments.rows.map((row) => row.state));
    const every: PaymentState[] = ["paid", "ready", "later", "overdue"];
    for (const state of every) expect(states).toContain(state);

    const paid = payments.rows.filter((row) => row.state === "paid");
    expect(paid.some((row) => row.receiptUrl !== null)).toBe(true);
    expect(paid.some((row) => row.receiptUrl === null)).toBe(true);

    // A milestone rule with no date -- the branch a date-only fixture
    // never reaches.
    expect(payments.rows.some((row) => row.dueOn === null && row.dueNote !== null)).toBe(true);

    expect(payments.paidCents).toBe(
      paid.reduce((sum, row) => sum + row.amountCents, 0),
    );
  });

  it("agreements carries a builder proposal, an uploaded PDF, and more than one style", () => {
    const view = demoCall<{ view: AgreementsView }>("agreements", {}).view;

    expect(view.agreements.some((one) => one.lineItems.length > 0 && one.scopeBody !== null)).toBe(true);
    // The upload path stays alongside the builder, so half of real
    // proposals have no scope and no line items at all.
    expect(
      view.agreements.some((one) => one.hasSourcePdf && one.lineItems.length === 0),
    ).toBe(true);
    // The style radiogroup only renders when there is a choice.
    expect(view.signing.styles.length).toBeGreaterThan(1);
    expect(view.signing.hosted).toBe(false);
  });

  it("logins carries a row that will overflow a narrow column, and both kinds of request", () => {
    const view = demoCall<{ view: LoginsView }>("logins", {}).view;
    // 375px is where a long label either wraps or pushes the row off the
    // screen. Quinn could not get to that column; this makes sure there is
    // something in it to see when she does.
    expect(view.logins.some((one) => one.label.length > 30)).toBe(true);
    expect(view.logins.some((one) => (one.username ?? "").length > 30)).toBe(true);
    // Optional fields absent, which the row still has to draw.
    expect(view.logins.some((one) => one.username === null && one.url === null)).toBe(true);

    expect(view.requests.some((one) => one.askedByAgent)).toBe(true);
    expect(view.requests.some((one) => !one.askedByAgent)).toBe(true);
  });

  it("puts no real agency, client or person on a screen", () => {
    // A licensee runs this harness too. A demo that greets their QA as us
    // is a demo they have to fork before they can use it, and the wire
    // contract is explicit that branding is read and never hardcoded.
    //
    // Checked against what the views actually render, not against the file:
    // the prose above this test names Cre8 Visions to explain the rule, and
    // a test that read the comments would be enforcing silence about the
    // rule rather than the rule.
    const rendered = JSON.stringify([
      demoCall("home", {}),
      demoCall("agreements", {}),
      demoCall("payments", {}),
      demoCall("logins", {}),
    ]);
    for (const word of ["Cre8", "cre8visions", "Tambria", "Bree"]) {
      expect(rendered).not.toContain(word);
    }
    // Every address and link is in a reserved TLD, so nothing a reviewer
    // clicks can reach a real host.
    for (const url of rendered.match(/https?:\/\/[^"\\]+/g) ?? []) {
      expect(url).toMatch(/\.(invalid|example|test|localhost)(\/|$|:)/);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The writes                                                                  */
/* -------------------------------------------------------------------------- */
//
// Re-imported per test so each one starts from the same board: the state is
// module-scoped on purpose (a signature has to stick while QA reads the
// screen), which means tests would otherwise see each other's writes.

async function freshDemo() {
  vi.resetModules();
  return (await import("@/lib/portalDemoData")).demoCall;
}

describe("the write actions behave like the server", () => {
  beforeEach(() => vi.resetModules());

  it("signs, and the signature sticks", async () => {
    const call = await freshDemo();
    const before = call<{ view: AgreementsView }>("agreements", {}).view.agreements[0]!;
    expect(before.status).toBe("sent");

    const result = call<{ result: SignResult }>("sign", {
      proposalId: before.id,
      signerName: "Maya Calder",
      signatureStyle: "script",
      consentGranted: true,
    }).result;
    expect(result.signedAt).toBeTruthy();

    const after = call<{ view: AgreementsView }>("agreements", {}).view.agreements[0]!;
    expect(after.status).toBe("signed");
    expect(after.signerName).toBe("Maya Calder");
    expect(after.hasSignedDocument).toBe(true);
  });

  it("refuses a signature without consent, and without a name", async () => {
    const call = await freshDemo();
    const id = call<{ view: AgreementsView }>("agreements", {}).view.agreements[0]!.id;

    // Consent is the field an e-signature is worthless without. A harness
    // that accepted this would teach QA a screen behaviour that is wrong.
    //
    // Asserted on the message rather than `toThrow(PortalRequestError)`:
    // `vi.resetModules()` above re-evaluates the module graph, so the class
    // the fixtures throw is a different identity from the one imported at
    // the top of this file and an `instanceof` check would pass or fail for
    // reasons that have nothing to do with the code under test.
    expect(() =>
      call("sign", { proposalId: id, signerName: "Maya Calder", signatureStyle: null, consentGranted: false }),
    ).toThrow(/tick the box/i);
    expect(() =>
      call("sign", { proposalId: id, signerName: "   ", signatureStyle: null, consentGranted: true }),
    ).toThrow(/type your name/i);

    expect(call<{ view: AgreementsView }>("agreements", {}).view.agreements[0]!.status).toBe("sent");
  });

  it("refuses to sign something already closed", async () => {
    const call = await freshDemo();
    const closed = call<{ view: AgreementsView }>("agreements", {}).view.agreements.find(
      (one) => one.status === "signed",
    )!;
    expect(() =>
      call("sign", {
        proposalId: closed.id,
        signerName: "Maya Calder",
        signatureStyle: null,
        consentGranted: true,
      }),
    ).toThrow(/already closed/i);
  });

  it("shares a login, clears the request it answered, and never echoes the secret", async () => {
    const call = await freshDemo();
    const request = call<{ view: LoginsView }>("logins", {}).view.requests[0]!;

    const secret = "correct-horse-battery-staple";
    const answer = call<Record<string, unknown>>("share-login", {
      requestId: request.id,
      secret,
      username: "maya@glowskin.example",
    });
    expect(JSON.stringify(answer)).not.toContain(secret);

    const after = call<{ view: LoginsView }>("logins", {}).view;
    expect(after.requests.some((one) => one.id === request.id)).toBe(false);
    expect(after.logins[0]!.label).toBe(request.label);
    // Write-only is the whole reason a vault can sit behind a portal
    // session. No shape returned by the harness may carry the secret.
    expect(JSON.stringify(after)).not.toContain(secret);
    expect(after.logins[0]).not.toHaveProperty("secret");
  });

  it("removes a login", async () => {
    const call = await freshDemo();
    const first = call<{ view: LoginsView }>("logins", {}).view.logins[0]!;
    call("remove-login", { id: first.id });
    expect(
      call<{ view: LoginsView }>("logins", {}).view.logins.some((one) => one.id === first.id),
    ).toBe(false);
  });

  it("says so loudly when asked for an action it does not know", async () => {
    const call = await freshDemo();
    // A new action nobody taught the harness is a harness reviewing less
    // than it looks like it is. Better a 501 on the screen than a silent
    // empty state that reads as the real thing.
    expect(() => call("some-new-action", {})).toThrow(/demo harness has no answer/i);
  });
});

/* -------------------------------------------------------------------------- */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}
