// Who the client thinks they are dealing with, resolved once per request.
//
// THIS IS THE ONE FILE IN THE CLIENT PORTAL THAT KNOWS WHOSE INSTALL IT IS.
// Every screen reads `PortalBranding`; nothing downstream of here names an
// agency, a mark or an inbox. That is the standing rule, and CRE-797 is what
// it costs when a single string escapes: the top bar read the agency name
// from this shape and drew the monogram `C8` beside it from the component, so
// a portal branded "Northhill Studio" showed our mark against their name, on
// the client-facing surface of something we license.
//
// WHY THE DEFAULTS ARE KEYED ON THE NAME AND NOT ON AN UNSET VARIABLE
//
// `PORTAL_AGENCY_NAME` unset and `PORTAL_AGENCY_NAME` set to our own name are
// the same install, and a rule that treated them differently would change
// what this agency's own clients see the day somebody set the variable
// explicitly. So the test is the name the install answers under. Answer under
// our name and the rest of our identity applies -- the monogram, the inbox.
// Answer under any other and NONE of it does, because every one of those
// defaults is a wrong answer for a licensee rather than a missing one: an
// `Ask a question` button that mails our inbox sends a licensee's client's
// question to a company they have never heard of, and nothing tells anybody
// it went to the wrong place.
//
// Pure, and in `_shared/` with no `Deno` and no `npm:` specifier, so
// `src/test/portal-branding.test.ts` can drive it directly. That matters more
// here than for most modules: the decisions in this file are only wrong for
// an install that does not exist yet, which is precisely the kind of wrong
// that no screenshot of our own portal would ever show.

import { monogramFor, type PortalBranding } from "./client-portal-wire.ts";

/**
 * How one setting is read. Null for unset, and for set-but-blank.
 *
 * A function rather than an object, so the caller decides where settings come
 * from -- `Deno.env` in the edge function, a literal in a test. Blank folding
 * to null is deliberate: a variable somebody cleared means "unset", and an
 * empty agency name would otherwise render as an empty top bar.
 */
export type ReadSetting = (key: string) => string | null;

/**
 * This install's own identity. The one block a licensee replaces.
 *
 * Here rather than scattered as `??` fallbacks through the request handler,
 * because "where do I change who this portal says it is" should have one
 * answer, and because a default that sits next to the code that uses it is a
 * default nobody finds until a client reads it on a screen.
 */
export const THIS_INSTALL = {
  agencyName: "Cre8 Visions",
  /** Not the initials of the name above: the mark this agency actually uses. */
  monogram: "C8",
  contactEmail: "info@cre8visions.com",
} as const;

/** The environment variables an install sets to answer as itself. */
export const BRANDING_SETTINGS = [
  "PORTAL_AGENCY_NAME",
  "PORTAL_MONOGRAM",
  "PORTAL_CONTACT_NAME",
  "PORTAL_REPLY_WINDOW",
  "PORTAL_CONTACT_EMAIL",
] as const;

/**
 * The branding every client screen renders, from this install's settings.
 *
 * `contactName` has NO default at all, on purpose and unlike the rest.
 * Mockups 14 and 16 put a person's first name in running text ("Message
 * Tambria", "TAMBRIA ASKED FOR"), and a name defaulted here keeps rendering
 * perfectly after that person leaves. Unset means the screens say "Message
 * us" and "We asked for", which stays true whoever is reading the mail that
 * week.
 */
export function resolveBranding(read: ReadSetting): PortalBranding {
  const configuredName = read("PORTAL_AGENCY_NAME");
  const agencyName = configuredName ?? THIS_INSTALL.agencyName;
  // See the header: ours by the name it answers under, not by a missing
  // variable. Everything below this line that is ours is gated on it.
  const ours = agencyName === THIS_INSTALL.agencyName;

  return {
    agencyName,
    // `monogramFor` turns "nothing configured" into the initials of whatever
    // name this install answers under, so a licensee gets their own mark or
    // no tile -- never this agency's two characters.
    monogram: monogramFor(
      read("PORTAL_MONOGRAM") ?? (ours ? THIS_INSTALL.monogram : null),
      agencyName,
    ),
    contactName: read("PORTAL_CONTACT_NAME"),
    replyWindow: read("PORTAL_REPLY_WINDOW"),
    // Null hides the "Ask a question" button rather than offering one that
    // mails somebody else's agency.
    contactEmail: read("PORTAL_CONTACT_EMAIL") ?? (ours ? THIS_INSTALL.contactEmail : null),
  };
}

/** A `ReadSetting` over a plain record. The shape `Deno.env` and a test share. */
export function settingsFrom(source: { get(key: string): string | undefined }): ReadSetting {
  return (key) => {
    const raw = (source.get(key) ?? "").trim();
    return raw.length > 0 ? raw : null;
  };
}
