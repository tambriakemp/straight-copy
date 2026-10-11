// The Logins tab's own rules, kept out of the component so they can be
// tested — because what they get wrong is a credential shown to the wrong
// person, or a password silently wiped, and neither looks wrong on screen.

export interface ClientLoginRow {
  id: string;
  label: string;
  url: string | null;
  username: string | null;
  note: string | null;
  has_password: boolean;
}

/** The dots the row shows in place of a password. */
export const MASK = "••••••••••••";

/**
 * The second line of a login row: where you sign in and as whom.
 *
 * The host rather than the whole URL — a sign-in link is routinely 120
 * characters of query string, and the row has to fit a username after it.
 * Falls back to the raw text for anything that will not parse, because a
 * link someone typed by hand is still the link they meant.
 */
export function signInLabel(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.host + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return raw;
  }
}

/** "login.example.com · bree@cre8visions.com", skipping whichever is absent. */
export function subtitleFor(row: Pick<ClientLoginRow, "url" | "username">): string {
  return [signInLabel(row.url), (row.username ?? "").trim()].filter(Boolean).join(" · ");
}

/** The href for the row's sign-in link, or null when there is nothing to open. */
export function hrefFor(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  // A link saved as "admin.example.com" is still meant to be clickable;
  // without a scheme the browser resolves it against /admin/clients/....
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * What to send when an edit form is submitted.
 *
 * A blank password field on an EDIT means "leave the stored one alone" —
 * the form never shows the current password, so treating blank as "clear
 * it" would wipe a credential every time someone fixed a typo in the
 * label. On a NEW login a blank password is simply a login with no
 * password recorded yet, which is allowed.
 */
export function passwordToSend(password: string, isEdit: boolean): string {
  const v = password;
  if (isEdit && v.trim() === "") return "";
  return v;
}

/**
 * The body of the "Send all to client" message.
 *
 * Deliberately without the passwords. Email is stored forever, forwarded,
 * and synced to half a dozen devices; sending a client's whole credential
 * set through it is the kind of thing that is fine until the once it is
 * not. The links and usernames are the useful half, and the note says
 * plainly that the passwords are coming another way.
 */
export function shareBody(clientName: string, rows: ClientLoginRow[]): string {
  const lines = rows.map((r) => {
    const parts = [`• ${r.label}`];
    if (r.url) parts.push(`  Sign in: ${hrefFor(r.url)}`);
    if (r.username) parts.push(`  Username: ${r.username}`);
    return parts.join("\n");
  });
  return [
    `Hi ${clientName},`,
    "",
    "Here are the accounts we have set up for you:",
    "",
    ...lines,
    "",
    "Passwords are not in this email — I'll send those separately.",
  ].join("\n");
}
