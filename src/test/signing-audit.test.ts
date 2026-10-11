// What gets recorded alongside a typed signature. A signature's legal
// weight comes from the record around it, so the two places that collect
// it now share one collector — and the offset sign is inverted from what
// getTimezoneOffset returns, which is the kind of thing that is wrong in
// a database for a year before anyone reads it back.
import { describe, it, expect, vi, afterEach } from "vitest";
import { collectSigningAudit } from "@/lib/signingAudit";

afterEach(() => { vi.restoreAllMocks(); });

describe("collectSigningAudit", () => {
  it("records the moment in both machine and human form", () => {
    const a = collectSigningAudit();
    expect(a.signedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(a.signedAtLocal.length).toBeGreaterThan(0);
    // The two must describe the same instant, not be collected a tick apart.
    expect(Math.abs(new Date(a.signedAtLocal).getTime() - new Date(a.signedAtIso).getTime())).toBeLessThan(1000);
  });

  it("inverts the sign on the timezone offset", () => {
    // getTimezoneOffset is minutes BEHIND UTC: Chicago reads +360 and is
    // UTC-06:00. Printing it through unchanged puts every US signature
    // six hours on the wrong side of the line.
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(360);
    expect(collectSigningAudit().timezoneOffset).toBe("UTC-06:00");
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-330);
    expect(collectSigningAudit().timezoneOffset).toBe("UTC+05:30");
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
    expect(collectSigningAudit().timezoneOffset).toBe("UTC+00:00");
  });

  it("caps the language list rather than recording a long one whole", () => {
    expect(collectSigningAudit().languages.length).toBeLessThanOrEqual(6);
  });

  it("still returns a record when the browser is missing pieces", () => {
    // This runs in whatever browser the client opened the email on. A
    // signature must not fail because an old Safari has no userAgentData.
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation((() => { throw new Error("no Intl"); }) as never);
    const a = collectSigningAudit();
    expect(a.timezone).toBe("");
    expect(a.timezoneOffset).toBe("");
    expect(a.signedAtIso).toMatch(/^\d{4}/);
  });

  it("has every field the audit column expects, even when empty", () => {
    const a = collectSigningAudit();
    for (const k of ["userAgent", "platform", "language", "languages", "timezone",
                     "timezoneOffset", "screen", "viewport", "referrer", "pageUrl",
                     "signedAtLocal", "signedAtIso"]) {
      expect(a, k).toHaveProperty(k);
    }
    expect(a.screen).toHaveProperty("pixelRatio");
    expect(a.viewport).toHaveProperty("width");
  });
});
