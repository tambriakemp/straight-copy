// What gets recorded alongside a typed signature.
//
// Lifted out of ProposalsSection so the proposal page and the portal's
// proposal card collect exactly the same thing. A typed signature's legal
// weight comes from the record around it — who, from where, on what, at
// what moment — and two collectors that drifted apart would mean two
// proposals signed in the same week had different evidence behind them.
//
// Everything is read defensively: this runs in whatever browser the
// client happens to open the email on, and a signature must not fail
// because an old Safari has no `userAgentData`.

export interface SigningAudit {
  userAgent: string;
  platform: string;
  language: string;
  languages: string[];
  timezone: string;
  timezoneOffset: string;
  screen: { width: number | null; height: number | null; pixelRatio: number | null; colorDepth: number | null };
  viewport: { width: number | null; height: number | null };
  referrer: string;
  pageUrl: string;
  signedAtLocal: string;
  signedAtIso: string;
}

export function collectSigningAudit(): SigningAudit {
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & {
    userAgentData?: { platform?: string };
  };
  const scr = (typeof screen !== "undefined" ? screen : {}) as Partial<Screen>;
  const win = (typeof window !== "undefined" ? window : {}) as Partial<Window>;

  let timezone = "";
  let timezoneOffset = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const off = new Date().getTimezoneOffset();
    // getTimezoneOffset is minutes BEHIND UTC, so the sign is inverted:
    // Chicago reads +360 and is UTC-06:00.
    const sign = off <= 0 ? "+" : "-";
    const abs = Math.abs(off);
    timezoneOffset = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  } catch {
    // An environment with no Intl still gets to sign.
  }

  const now = new Date();
  return {
    userAgent: nav.userAgent || "",
    platform: nav.userAgentData?.platform || (nav as Navigator & { platform?: string }).platform || "",
    language: nav.language || "",
    languages: Array.isArray(nav.languages) ? [...nav.languages].slice(0, 6) : [],
    timezone,
    timezoneOffset,
    screen: {
      width: scr.width ?? null, height: scr.height ?? null,
      pixelRatio: win.devicePixelRatio ?? null, colorDepth: scr.colorDepth ?? null,
    },
    viewport: { width: win.innerWidth ?? null, height: win.innerHeight ?? null },
    referrer: typeof document !== "undefined" ? document.referrer || "" : "",
    pageUrl: typeof location !== "undefined" ? location.href : "",
    signedAtLocal: now.toString(),
    signedAtIso: now.toISOString(),
  };
}
