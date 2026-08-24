// What we say to a new social client, and to one who has gone quiet.
//
// Import-free so the copy is testable. Rendering is deliberately plain: this
// goes through the same queue as every other client email, and
// process-email-queue routes it to SureContact because the recipient is a
// known client.

export interface WelcomeInput {
  contactName: string | null;
  businessName: string | null;
  portalUrl: string;
  /** Only the channels they said they have. Chasing a TikTok they never had is noise. */
  channels: string[];
}

const CHANNEL_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** "Facebook, Instagram and TikTok" — an Oxford-free list a person would say. */
export function channelList(channels: string[]): string {
  const names = channels.map((c) => CHANNEL_LABEL[c] ?? c).filter(Boolean);
  if (names.length === 0) return "your social accounts";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shell(body: string, cta: { url: string; label: string }): string {
  return `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#2b2b2b;max-width:560px">
${body}
<p style="margin:28px 0">
  <a href="${esc(cta.url)}" style="background:#8B7355;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${esc(cta.label)}</a>
</p>
<p style="color:#777;font-size:14px">Reply to this email if anything is unclear — it comes straight to us.</p>
</div>`;
}

export function welcomeSubject(businessName: string | null): string {
  return businessName
    ? `${businessName} — two things to set up`
    : "Two things to set up";
}

/**
 * The welcome.
 *
 * Names exactly two client actions and nothing else. The CoPost invite is
 * already waiting for them by the time this sends, so there is no "sign up
 * for" step — that is ours. Every extra instruction here is one more reason to
 * put the email down and do it later.
 */
export function welcomeHtml(input: WelcomeInput): string {
  const hello = input.contactName ? `Hi ${esc(input.contactName)},` : "Hi,";
  const body = `<p>${hello}</p>
<p>You're all set — we've created your posting workspace and sent you a CoPost
invite. Two things and we can start.</p>
<p><strong>1. Accept the CoPost invite</strong> — check your inbox for it, then
connect ${esc(channelList(input.channels))} under <strong>Socials</strong>. That
connection is yours to make; we can't do it for you.</p>
<p><strong>2. Add some photos</strong> to the CoPost media library. Twenty or
thirty to begin with is plenty — anything you'd be happy to see posted.</p>
<p>Once both are done, we write the captions and take it from there. You'll see
everything before it goes out until you tell us otherwise.</p>`;
  return shell(body, { url: input.portalUrl, label: "Open your portal" });
}

export interface ReminderInput extends WelcomeInput {
  /** What is still outstanding. */
  missing: { copost: boolean; photos: boolean };
  /** How many times we have asked already. Changes the tone, not the ask. */
  attempt: number;
}

export function reminderSubject(input: ReminderInput): string {
  if (input.missing.copost) return "Your posting workspace is waiting";
  return "We're ready — just need some photos";
}

/**
 * The nudge.
 *
 * One outstanding thing per email. A reminder listing everything left reads as
 * a chore and gets archived; a reminder naming one action gets done.
 */
export function reminderHtml(input: ReminderInput): string {
  const hello = input.contactName ? `Hi ${esc(input.contactName)},` : "Hi,";
  const body = input.missing.copost
    ? `<p>${hello}</p>
<p>Your CoPost invite is still sitting unaccepted, so nothing can go out yet.
It takes about two minutes: accept it, then connect
${esc(channelList(input.channels))} under <strong>Socials</strong>.</p>
<p>If the invite never arrived, or it went to a different address, reply and
we'll send it again.</p>`
    : `<p>${hello}</p>
<p>Everything is connected and we're ready to start posting — we just don't
have any photos yet.</p>
<p>Add a batch to your CoPost media library whenever you get a minute. Twenty or
thirty is plenty to begin with, and phone photos are completely fine.</p>`;
  return shell(body, { url: input.portalUrl, label: "Open your portal" });
}
