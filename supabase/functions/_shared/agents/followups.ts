// Which proposals are outstanding, and what each one needs.
//
// The detection has always been here — `engagementContext` computed six buckets
// from `client_proposals` and `proposal_events`. What it did not do is decide.
// A proposal that was sent, never opened and has gone quiet landed in three
// buckets at once, so a run report built from them said "3 need follow-up, 2
// never opened, 4 read but unsigned" about the same four documents. That reads
// as a lot of work and names none of it.
//
// So this module assigns each proposal EXACTLY ONE bucket, in a fixed order of
// precedence, and says what to do about it. One proposal, one line in the
// report, one drafted email.
//
// No `npm:` specifiers: the frontend test suite imports this directly and a
// Deno specifier does not resolve under the app's tsconfig.

/** Milliseconds in a day, used for every elapsed calculation here. */
const DAY_MS = 86_400_000;

/**
 * What a proposal needs, in the order the decision is made.
 *
 * `closed` and `capped` are outcomes rather than work: a signed or declined
 * proposal is finished, and one already chased to the ceiling needs a person,
 * not a fourth email.
 */
export type FollowupBucket =
  | "closed"
  | "capped"
  | "never_opened"
  | "read_unsigned"
  | "stale"
  | "not_sent"
  | "waiting";

/** The slice of a proposal this module needs. Timestamps, not day counts. */
export interface ProposalSignal {
  id: string;
  title: string;
  status: string;
  client: string | null;
  client_id: string;
  client_email: string | null;
  project: string | null;
  sent_at: string | null;
  last_activity_at: string | null;
  first_opened_at: string | null;
  first_viewed_at: string | null;
  client_signed_at: string | null;
  declined_at: string | null;
  followups_sent: number;
}

export interface FollowupThresholds {
  /** How long a proposal may sit untouched before it is worth chasing. */
  followupAfterDays: number;
  /** The ceiling. Past this, a human decides — never another email. */
  maxFollowups: number;
  /** Silence long enough that the nudge changes character. */
  staleAfterDays: number;
  /** From `proposal_meeting_link` in the agent's config. Never invented. */
  meetingLink?: string | null;
}

export const DEFAULT_THRESHOLDS: FollowupThresholds = {
  // Bree asked for 48 hours. Overridable per agent through `agents.config`.
  followupAfterDays: 2,
  maxFollowups: 3,
  staleAfterDays: 21,
  meetingLink: null,
};

export interface Outstanding {
  proposal_id: string;
  title: string;
  client: string | null;
  client_id: string;
  client_email: string | null;
  project: string | null;
  bucket: FollowupBucket;
  /** Days since anything at all happened — the number that goes in the report. */
  days_quiet: number | null;
  days_since_sent: number | null;
  followups_sent: number;
  /** One sentence naming the client and the wait. The report line. */
  headline: string;
  /**
   * What the drafted email has to do — or null when no email should be written.
   * The difference between the buckets IS the value; a single generic nudge
   * would be worse than none, because it asks a client who never received the
   * proposal to make a decision about it.
   */
  nudge: string | null;
  /** True when this needs Bree rather than another message to the client. */
  needs_human: boolean;
}

function elapsedDays(from: string | null, now: number): number | null {
  if (!from) return null;
  const t = new Date(from).getTime();
  if (!Number.isFinite(t)) return null;
  // Floor, not round. At a two-day threshold a rounded 1.6 days would report a
  // proposal as 48 hours outstanding nine hours early, and the whole feature is
  // a promise about a specific number of hours.
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** Report order: real work first, longest silence first, outcomes last. */
const BUCKET_RANK: Record<FollowupBucket, number> = {
  never_opened: 0,
  read_unsigned: 1,
  stale: 2,
  not_sent: 3,
  capped: 4,
  waiting: 5,
  closed: 6,
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Classify one proposal and say what it needs.
 *
 * Order of precedence is the whole design. Finished beats everything; the cap
 * beats every reason to send, so a proposal cannot be chased past the ceiling
 * by qualifying under a different heading; and never-opened beats
 * read-but-unsigned, because the two call for opposite emails and a proposal
 * that was opened once and then went quiet for a month is still, first and
 * foremost, a document someone read.
 */
export function classifyProposal(
  p: ProposalSignal,
  t: FollowupThresholds = DEFAULT_THRESHOLDS,
  now: number = Date.now(),
): Outstanding {
  const quiet = elapsedDays(p.last_activity_at ?? p.sent_at, now);
  const sentAgo = elapsedDays(p.sent_at, now);
  const who = p.client ?? p.title;
  const base = {
    proposal_id: p.id,
    title: p.title,
    client: p.client,
    client_id: p.client_id,
    client_email: p.client_email,
    project: p.project,
    days_quiet: quiet,
    days_since_sent: sentAgo,
    followups_sent: p.followups_sent ?? 0,
  };

  // 1. Finished, either way. A declined proposal is as closed as a signed one,
  //    which is the entire reason the client needs a way to decline: without
  //    it, "no" and "silence" are the same row and we keep chasing a decision
  //    that has already been made.
  if (p.client_signed_at || p.status === "signed") {
    return {
      ...base, bucket: "closed", needs_human: false, nudge: null,
      headline: `${who} signed. Nothing outstanding.`,
    };
  }
  if (p.declined_at || p.status === "declined") {
    return {
      ...base, bucket: "closed", needs_human: false, nudge: null,
      headline: `${who} declined${quiet !== null ? ` ${plural(quiet, "day")} ago` : ""}. Not a follow-up.`,
    };
  }
  if (p.status === "voided") {
    return {
      ...base, bucket: "closed", needs_human: false, nudge: null,
      headline: `${who} — withdrawn.`,
    };
  }

  // 2. Written but never sent. Not a client problem at all.
  if (p.status === "draft" || !p.sent_at) {
    return {
      ...base, bucket: "not_sent", needs_human: true, nudge: null,
      headline: `${who} — drafted${
        quiet !== null ? ` ${plural(quiet, "day")} ago` : ""
      } and never sent.`,
    };
  }

  // 3. The ceiling, checked before any reason to send. Three follow-ups on one
  //    proposal is enough; a fourth email is not the problem it looks like.
  if ((p.followups_sent ?? 0) >= t.maxFollowups) {
    return {
      ...base, bucket: "capped", needs_human: true, nudge: null,
      headline: `${who} — chased ${plural(p.followups_sent ?? 0, "time")} with no reply${
        quiet !== null ? `, quiet ${plural(quiet, "day")}` : ""
      }. Worth a call or closing it out, not another email.`,
    };
  }

  // 4. Still inside the window. Named so the report can say "nothing yet"
  //    rather than silently omitting a proposal that was sent this morning.
  if (quiet === null || quiet < t.followupAfterDays) {
    return {
      ...base, bucket: "waiting", needs_human: false, nudge: null,
      headline: `${who} — sent${
        sentAgo !== null ? ` ${plural(sentAgo, "day")} ago` : ""
      }, still inside the ${plural(t.followupAfterDays, "day")} window.`,
    };
  }

  const opened = !!p.first_opened_at || !!p.first_viewed_at;

  // 5. Long silence changes the message before it changes the bucket, so this
  //    is checked ahead of the engagement split: after three weeks the right
  //    email is a light one with an easy way to say no, whether or not they
  //    once opened it.
  if (quiet >= t.staleAfterDays) {
    return {
      ...base, bucket: "stale", needs_human: false,
      headline: `${who} — no movement for ${plural(quiet, "day")}${
        opened ? ", after reading it" : ", never opened"
      }.`,
      nudge:
        "Long silence. Keep it short and low-pressure: the proposal is still " +
        "open if they want it, and it is completely fine if the timing or the " +
        "priorities have changed. Give them an easy way to say no. Do not ask " +
        "for a decision by any date, and do not recap the proposal.",
    };
  }

  // 6. Sent and never opened. They have not read it, so asking them to decide
  //    is asking about something they have not seen. The question is whether
  //    it arrived.
  if (!opened) {
    return {
      ...base, bucket: "never_opened", needs_human: false,
      headline: `${who} — sent ${plural(sentAgo ?? quiet, "day")} ago and never opened.`,
      nudge:
        "They have not read it. Ask whether it reached them — spam, a wrong " +
        "address, a busy week are all likelier than a decision — and offer to " +
        "resend it or send the link again. Do not ask what they thought, and " +
        "do not ask for a decision on a document they have not seen.",
    };
  }

  // 7. Read and stopped. That is an unasked question.
  return {
    ...base, bucket: "read_unsigned", needs_human: false,
    headline: `${who} — read it${
      p.first_viewed_at ? " in the portal" : ""
    }, then quiet for ${plural(quiet, "day")}.`,
    nudge:
      "They read it and stopped, which usually means a question they have not " +
      "asked. Invite the question directly and specifically — scope, price or " +
      "timing — rather than asking if they had a chance to review it." +
      (t.meetingLink
        ? ` Offer the proposal discussion link: ${t.meetingLink}`
        : " No booking link is configured, so invite the question without one — never invent a URL."),
  };
}

/**
 * The whole agenda, ranked.
 *
 * Everything is returned, including what is finished and what is still inside
 * the window, because "Menovia signed on Tuesday" is a useful line in a run
 * report and an omission is indistinguishable from a miss. Callers that only
 * want work filter on `nudge` or `needs_human`.
 */
export function buildFollowupAgenda(
  proposals: ProposalSignal[],
  t: FollowupThresholds = DEFAULT_THRESHOLDS,
  now: number = Date.now(),
): Outstanding[] {
  return proposals
    .map((p) => classifyProposal(p, t, now))
    .sort((a, b) =>
      BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] ||
      (b.days_quiet ?? -1) - (a.days_quiet ?? -1) ||
      (a.client ?? "").localeCompare(b.client ?? "")
    );
}

/** The ones an email should be drafted for — one `draft_email` each. */
export function needingNudge(agenda: Outstanding[]): Outstanding[] {
  return agenda.filter((o) => o.nudge !== null);
}

/** The ones that need Bree rather than a message to the client. */
export function needingHuman(agenda: Outstanding[]): Outstanding[] {
  return agenda.filter((o) => o.needs_human);
}

/**
 * The agenda as a sentence, for the top of a run report.
 *
 * Written here rather than left to the model so that a run with nothing
 * outstanding says so in one line instead of padding.
 */
export function summariseAgenda(agenda: Outstanding[]): string {
  const nudges = needingNudge(agenda).length;
  const human = needingHuman(agenda).length;
  if (!nudges && !human) return "Nothing outstanding — no proposal is past its follow-up window.";
  const parts: string[] = [];
  if (nudges) parts.push(`${plural(nudges, "proposal")} past the follow-up window`);
  if (human) parts.push(`${human} needing a decision from you`);
  return `${parts.join(", and ")}.`;
}
