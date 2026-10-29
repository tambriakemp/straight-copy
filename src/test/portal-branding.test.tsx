/**
 * Whose agency the client portal says it is (CRE-797).
 *
 * The portal is licensed, and the four client screens are the surface a
 * licensee's own clients read. So every word of branding on them is resolved
 * from this install's settings and none of it is written into a component --
 * that is the standing rule, and the wire contract says it in its own words:
 * "The agency, as the client sees it. Never hardcoded: licensees are not us."
 *
 * It had already slipped once. The top bar read the agency name from
 * `branding.agencyName` and drew the monogram beside it as the two characters
 * `C8`, written into `ClientPortalShell`. Every screenshot taken before the
 * QA harness existed used this agency as the agency, where `C8` looks exactly
 * right -- so neither the author nor the audit on CRE-789 saw it, and what
 * found it was a harness with a made-up agency name in it.
 *
 * That is the whole reason this file exists rather than a line in a review
 * checklist: a hardcoded brand string is invisible in our own install by
 * construction, and visible only to a licensee, on a screen we will not be
 * looking at.
 *
 * Three independent checks, because each one misses what the others catch:
 *
 *   1. **The resolution.** What a licensee's install actually produces, for
 *      every combination of settings. This is the branch no screenshot of
 *      our own portal ever takes.
 *   2. **What renders.** The shell drawn with a licensee's branding, checked
 *      against the DOM -- which catches a string the resolver never sees.
 *   3. **The source, with comments stripped.** Catches a literal in a branch
 *      neither of the above reaches. Comments are stripped on purpose:
 *      `portal-demo.test.ts` makes the same point, and a test that read the
 *      comments would enforce silence about the rule rather than the rule.
 *      The prose above this line names the agency to explain it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import {
  BRANDING_SETTINGS,
  THIS_INSTALL,
  resolveBranding,
  settingsFrom,
  type ReadSetting,
} from "../../supabase/functions/_shared/client-portal-branding";
import { PORTAL_WIRE_VERSION } from "@/lib/clientPortalWire";
import type { PortalBranding, PortalMe } from "@/lib/clientPortalWire";
import ClientPortalShell from "@/components/portal/ClientPortalShell";

const ROOT = path.resolve(__dirname, "../..");

/** A reader over a literal, the way the edge function reads `Deno.env`. */
function settings(values: Record<string, string> = {}): ReadSetting {
  return settingsFrom({ get: (key) => values[key] });
}

/* -------------------------------------------------------------------------- */
/* 1. What an install resolves to                                              */
/* -------------------------------------------------------------------------- */

describe("the branding an install resolves to", () => {
  it("is this agency's own, unchanged, when nothing is configured", () => {
    // The install that exists today. Bree's clients must see exactly what
    // they saw before CRE-797 -- the mark included, which is why the field
    // defaults to the configured mark and not to the initials of the name.
    const branding = resolveBranding(settings());
    expect(branding.agencyName).toBe(THIS_INSTALL.agencyName);
    expect(branding.monogram).toBe(THIS_INSTALL.monogram);
    expect(branding.contactEmail).toBe(THIS_INSTALL.contactEmail);
  });

  it("is the same whether this agency's name is set explicitly or left unset", () => {
    // Unset and set-to-our-own-name are the same install. A rule that read
    // the variable's presence rather than its value would change what this
    // agency's clients see on the day somebody set it explicitly -- which is
    // a client-facing brand change nobody asked for, arriving through a
    // configuration edit.
    expect(resolveBranding(settings({ PORTAL_AGENCY_NAME: THIS_INSTALL.agencyName })))
      .toEqual(resolveBranding(settings()));
  });

  it("gives a licensee their own initials and not our mark", () => {
    const branding = resolveBranding(settings({ PORTAL_AGENCY_NAME: "Northhill Studio" }));
    expect(branding.agencyName).toBe("Northhill Studio");
    expect(branding.monogram).toBe("NS");
  });

  it("lets an install choose a mark that is not its initials", () => {
    // The reason the field is configurable at all: "C8" is not "CV", and a
    // licensee's mark is no more derivable from their name than ours is.
    expect(resolveBranding(settings({
      PORTAL_AGENCY_NAME: "Northhill Studio",
      PORTAL_MONOGRAM: "NH",
    })).monogram).toBe("NH");
    // Configuration wins for us too, so this agency's mark is changed by
    // changing a setting rather than by editing a component.
    expect(resolveBranding(settings({ PORTAL_MONOGRAM: "C8V" })).monogram).toBe("C8V");
  });

  it("draws no tile for an install that asks for none", () => {
    expect(resolveBranding(settings({
      PORTAL_AGENCY_NAME: "Northhill Studio",
      PORTAL_MONOGRAM: "none",
    })).monogram).toBeNull();
  });

  it("leaks nothing of ours into a licensee's install", () => {
    // The monogram was one string. The contact address was another, and a
    // worse one: an "Ask a question" button defaulted to our inbox sends a
    // licensee's client's question to a company they have never heard of,
    // and nothing tells anybody it went to the wrong place. Null hides the
    // button instead.
    const branding = resolveBranding(settings({ PORTAL_AGENCY_NAME: "Northhill Studio" }));
    expect(branding.contactEmail).toBeNull();
    expectNothingOfOurs(JSON.stringify(branding));
  });

  it("names this agency's own contact, and overrides them from a setting", () => {
    // Bree's decision of 28 Oct, and the reason it is a default rather than
    // an environment variable on the live project: a decision that exists
    // only as an unset variable takes effect when somebody remembers to set
    // it during a deploy, and silently does not when they do not. The
    // setting still wins, so changing the name is still one variable and no
    // deploy.
    expect(resolveBranding(settings()).contactName).toBe("Bree");
    expect(resolveBranding(settings({ PORTAL_CONTACT_NAME: "Rosa" })).contactName).toBe("Rosa");
  });

  it("says nothing about a contact person on a licensee's install", () => {
    // Where the original "no default at all" reasoning still holds, and
    // harder: for a licensee a name of ours is not a missing default but a
    // wrong one -- a client told to message a person at another company.
    // Unset, mockups 14 and 16 read "Message us" and "We asked for".
    expect(
      resolveBranding(settings({ PORTAL_AGENCY_NAME: "Northhill Studio" })).contactName,
    ).toBeNull();
    expect(
      resolveBranding(settings({
        PORTAL_AGENCY_NAME: "Northhill Studio",
        PORTAL_CONTACT_NAME: "Rosa",
      })).contactName,
    ).toBe("Rosa");
  });

  it("treats a setting somebody cleared as unset", () => {
    // A blank agency name renders as an empty top bar, and a blank monogram
    // as an empty violet square. Both are "unset" typed by hand.
    const blanked = Object.fromEntries(BRANDING_SETTINGS.map((key) => [key, "   "]));
    expect(resolveBranding(settings(blanked))).toEqual(resolveBranding(settings()));
  });

  it("always fills the monogram, so a screen never has to guess", () => {
    // The field is optional on the wire because a server older than 1.1.0
    // does not send it. It is never optional for a server that does: every
    // combination of settings resolves to a string or to an explicit null.
    for (const values of [
      {},
      { PORTAL_AGENCY_NAME: "Northhill Studio" },
      { PORTAL_AGENCY_NAME: "Northhill Studio", PORTAL_MONOGRAM: "NH" },
      { PORTAL_MONOGRAM: "none" },
    ]) {
      expect(resolveBranding(settings(values))).toHaveProperty("monogram");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. What the shell draws                                                     */
/* -------------------------------------------------------------------------- */

const ME: PortalMe = {
  clientId: "c1",
  displayName: "Maya Calder",
  businessName: "Glowskin Studio",
  initials: "MC",
};

function renderShell(branding: PortalBranding | null) {
  return render(
    <MemoryRouter initialEntries={["/portal/c1"]}>
      <ClientPortalShell clientId="c1" branding={branding} me={ME} tab="home" adminPreview={false}>
        <p>screen</p>
      </ClientPortalShell>
    </MemoryRouter>,
  );
}

describe("the portal shell, drawn for a licensee", () => {
  it("draws the monogram it was given, next to the name it was given", () => {
    const { container } = renderShell(
      resolveBranding(settings({ PORTAL_AGENCY_NAME: "Northhill Studio" })),
    );
    expect(container.querySelector(".cp__mark")).toHaveTextContent("NS");
    expect(screen.getByText("Northhill Studio")).toBeInTheDocument();
  });

  it("puts nothing of ours on a licensee's client's screen", () => {
    // The failure on CRE-797, read off the DOM rather than off the file:
    // with branding set to a made-up agency, the top bar still rendered a
    // violet tile with our mark in it, beside the licensee's name.
    const { container } = renderShell(
      resolveBranding(settings({ PORTAL_AGENCY_NAME: "Northhill Studio", PORTAL_CONTACT_NAME: "Rosa" })),
    );
    expectNothingOfOurs(container.innerHTML);
  });

  it("draws no tile at all when there is no monogram", () => {
    // Two installs land here: one that chose no tile, and one on a server
    // older than the field -- the function is deployed before the frontend
    // is published, so the second is a real state and not a hypothetical.
    for (const branding of [
      resolveBranding(settings({ PORTAL_AGENCY_NAME: "Northhill Studio", PORTAL_MONOGRAM: "none" })),
      { agencyName: "Northhill Studio", contactName: null, replyWindow: null, contactEmail: null },
    ] as PortalBranding[]) {
      const { container, unmount } = renderShell(branding);
      expect(container.querySelector(".cp__mark")).toBeNull();
      // The name is still there: an absent tile is a gap closing, not a
      // broken top bar.
      expect(container.querySelector(".cp__brandname")).toHaveTextContent("Northhill Studio");
      unmount();
    }
  });

  it("draws no tile before the view has loaded", () => {
    // Branding is null until the one request answers. A placeholder mark
    // would be asserting a brand we do not have yet.
    const { container } = renderShell(null);
    expect(container.querySelector(".cp__mark")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The source of the client-facing half                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every file that decides what a client reads on the four screens.
 *
 * Not `src/components/portal/*`, which is deliberately narrower than it
 * looks: that directory also holds the older light-framed portal
 * (`PortalShell`, `FilesSection`, `ContractSection`, `AccountAccessSection`,
 * `PortalLoginsSection`) and the login pages, all of which name this agency
 * in client-facing copy and predate the licensing rule. Those are a real gap
 * and they are not CRE-797's; widening this list is the way to close them,
 * one file at a time, with somebody deciding what each string should read
 * instead. A list that failed on all of them today would simply be deleted.
 */
const CLIENT_FACING = [
  "src/components/portal/ClientPortalShell.tsx",
  "src/components/portal/ProjectChooser.tsx",
  "src/components/portal/useClientPortal.ts",
  "src/pages/portal/ClientHome.tsx",
  "src/pages/portal/ClientAgreements.tsx",
  "src/pages/portal/ClientPayments.tsx",
  "src/pages/portal/ClientLogins.tsx",
  "src/lib/clientPortalApi.ts",
  "src/lib/clientPortalWire.ts",
  "src/lib/portalDemoData.ts",
];

/**
 * The server half, which composes those screens.
 *
 * `_shared/client-portal-branding.ts` is excluded because it is the one
 * module that is supposed to name us -- see the positive test below, which
 * fails if the identity stops living there. `_shared/client-portal-plugin.ts`
 * is excluded for its `PLUGIN_ID`: a reverse-DNS plugin identifier names the
 * plugin's vendor, which is us however many licensees install it, and it is
 * on no screen.
 */
const SERVER = [
  "supabase/functions/client-portal/index.ts",
  "supabase/functions/client-portal/source.ts",
  "supabase/functions/client-portal/plugin-source.ts",
  "supabase/functions/client-portal/legacy-source.ts",
  "supabase/functions/_shared/client-portal-shape.ts",
  "supabase/functions/_shared/client-portal-wire.ts",
];

describe("no file in the portal hardcodes this agency", () => {
  it.each([...CLIENT_FACING, ...SERVER])("%s", (relative) => {
    expectNothingOfOurs(withoutComments(readFileSync(path.join(ROOT, relative), "utf8")), relative);
  });

  it("keeps the identity in the one module that is allowed to hold it", () => {
    // The inverse of every test above, and the reason they cannot all be
    // satisfied by deleting the branding: somewhere has to say who this
    // install is, and "somewhere" is one file a licensee replaces.
    const identity = readFileSync(
      path.join(ROOT, "supabase/functions/_shared/client-portal-branding.ts"),
      "utf8",
    );
    expect(identity).toContain(THIS_INSTALL.agencyName);
    expect(identity).toContain(THIS_INSTALL.monogram);
    expect(identity).toContain(THIS_INSTALL.contactName);
    expect(identity).toContain(THIS_INSTALL.contactEmail);
  });
});

describe("the wire contract's revision", () => {
  it("is the one the canonical copy and the documentation both name", () => {
    // Reported by the `health` action, because the function is deployed
    // separately from the frontend and before it: a field the browser reads
    // can be one the server does not send yet, and this is how somebody
    // checks rather than assumes.
    expect(PORTAL_WIRE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const docs = readFileSync(path.join(ROOT, "docs/client-portal.md"), "utf8");
    expect(docs).toContain(PORTAL_WIRE_VERSION);
    const index = readFileSync(
      path.join(ROOT, "supabase/functions/client-portal/index.ts"),
      "utf8",
    );
    expect(index).toContain("PORTAL_WIRE_VERSION");
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Nothing in `text` names this agency, its mark or its addresses.
 *
 * Word boundaries rather than bare substrings, so a hex colour containing
 * `C8` is not reported as a monogram. `C8` is in the list by name because it
 * is the string this card is about, and a rule that only knew the full agency
 * name would have passed on the day CRE-797 shipped.
 */
function expectNothingOfOurs(text: string, where = "the rendered portal") {
  for (const term of [/\bCre8\b/, /\bC8\b/, /cre8visions/i, /\bTambria\b/i, /\bBree\b/i]) {
    expect(text, `${where} should not name this agency (${term})`).not.toMatch(term);
  }
}

/**
 * The same source with its comments removed.
 *
 * Only ever removes text, so it cannot manufacture a failure -- the worst it
 * can do is miss one, which is the right way round for a rule whose whole
 * point is that comments are allowed to explain it.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
