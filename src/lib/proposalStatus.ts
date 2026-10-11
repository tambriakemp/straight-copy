// Where a proposal has got to, as the Proposals pages read it.
//
// Pure, because `status` on the row is one word and the page asks four
// different questions of it — which section does this belong under, what
// has actually happened to it, how long has it been out, and is it
// waiting on the client or on us. Every one of those renders plausibly
// when it is wrong: a signed proposal filed under "waiting on the client"
// looks exactly like a real one, and the only way you find out is by
// chasing a client who already signed.

export interface ProposalLike {
  status: string;
  sent_at?: string | null;
  first_viewed_at?: string | null;
  client_signed_at?: string | null;
  agency_countersigned_at?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
  total_cents?: number | null;
}

/** Which section of the Proposals list it belongs under. */
export type ProposalGroup = "countersign" | "awaiting" | "signed" | "declined" | "draft";

export const GROUP_LABEL: Record<ProposalGroup, string> = {
  countersign: "Needs your countersignature",
  awaiting: "Waiting on the client",
  signed: "Signed",
  declined: "Declined",
  draft: "Drafts",
};

/** The order the canvas stacks them in: what is waiting on you, first. */
export const GROUP_ORDER: ProposalGroup[] = ["countersign", "awaiting", "signed", "declined", "draft"];

/**
 * Read from the timestamps rather than from `status`.
 *
 * `status` is maintained by several writers — the portal, the
 * countersign action, the edge function that sends the email — and a row
 * whose timestamps say signed while its status still says sent is a real
 * state this has to survive. The dates are the facts; status is a summary
 * of them that can lag.
 */
export function proposalGroup(p: ProposalLike): ProposalGroup {
  if (p.declined_at) return "declined";
  if (p.client_signed_at) return p.agency_countersigned_at ? "signed" : "countersign";
  if (p.sent_at) return "awaiting";
  return "draft";
}

export interface TrailStep {
  label: string;
  /** Filled dot. */
  done: boolean;
  /** Red dot — this is where it stopped. */
  bad?: boolean;
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Sent → viewed → signed → countersigned, as the row's dots.
 *
 * A declined proposal gets a decline step in red instead of the two it
 * never reached: showing "Signed ○ Countersigned ○" under a decline reads
 * as a proposal still in flight.
 */
export function trailFor(p: ProposalLike): TrailStep[] {
  const sent = shortDate(p.sent_at);
  const viewed = shortDate(p.first_viewed_at);
  if (p.declined_at) {
    return [
      { label: sent ? `Sent ${sent}` : "Sent", done: !!p.sent_at },
      { label: viewed ? `Viewed ${viewed}` : "Viewed", done: !!p.first_viewed_at },
      {
        label: `Declined ${shortDate(p.declined_at)}${p.decline_reason ? ` · ${p.decline_reason}` : " · no reason given"}`,
        done: true, bad: true,
      },
    ];
  }
  return [
    { label: sent ? `Sent ${sent}` : "Sent", done: !!p.sent_at },
    { label: viewed ? `Viewed ${viewed}` : "Viewed", done: !!p.first_viewed_at },
    { label: p.client_signed_at ? `Signed ${shortDate(p.client_signed_at)}` : "Signed", done: !!p.client_signed_at },
    {
      label: p.agency_countersigned_at ? `Countersigned ${shortDate(p.agency_countersigned_at)}` : "Countersigned",
      done: !!p.agency_countersigned_at,
    },
  ];
}

/**
 * How long an unsigned proposal has been out. Null once it is signed or
 * declined — "out for 51 days" on a deal that closed in a week is the
 * kind of number that makes a page untrustworthy.
 */
export function daysOut(p: ProposalLike, now = new Date()): number | null {
  if (!p.sent_at || p.client_signed_at || p.declined_at) return null;
  const sent = new Date(p.sent_at);
  if (Number.isNaN(sent.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - sent.getTime()) / 86_400_000));
}

/** Past this, the list says so in red. */
export const STALE_DAYS = 14;

/** The client-facing one-liner at the top of the portal's proposal page. */
export function clientStatusLabel(p: ProposalLike): { label: string; tone: "amber" | "green" | "red" | "gray" } {
  if (p.declined_at) return { label: "Declined", tone: "red" };
  if (p.client_signed_at && p.agency_countersigned_at) return { label: "Signed", tone: "green" };
  if (p.client_signed_at) return { label: "Signed — waiting on Cre8 Visions", tone: "green" };
  if (p.sent_at) return { label: "Waiting for your signature", tone: "amber" };
  // A client should never be looking at one of these, but if a link is
  // shared early, "Draft" is the honest word for it.
  return { label: "Draft", tone: "gray" };
}
