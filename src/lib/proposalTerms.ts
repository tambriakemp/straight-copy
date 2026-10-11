// Reading a proposal's payment_terms into the lines the proposal pages
// print, on both sides of the portal.
//
// Pure, because `payment_terms` is a jsonb column written by the upload
// form and by agents, so it arrives as whatever was put in it — and
// because a percentage shown against the wrong total is money, stated
// wrongly, to a client who is about to sign it.

export interface PaymentTermLike {
  label?: unknown;
  trigger?: unknown;
  amountType?: unknown;
  amountValue?: unknown;
  dueDate?: unknown;
}

export interface TermRow {
  label: string;
  /** "50%" or "$2,500" — what was written, before any total is applied. */
  share: string;
  /** The term in money, when it can be worked out. */
  amountCents: number | null;
  trigger: "on_signature" | "on_completion" | "date" | "unknown";
  dueDate: string | null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // Written by hand into the form, so "50" and "50%" both arrive.
  if (typeof v === "string") {
    const n = Number(v.replace(/[%$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * The terms on a proposal, as rows.
 *
 * Anything that is not a usable term is dropped rather than rendered as
 * a blank line: a payment schedule with an empty row in it reads as a
 * payment nobody has named yet, which is a different and more alarming
 * thing than a row that was never valid.
 */
export function termRows(raw: unknown, totalCents: number | null | undefined): TermRow[] {
  if (!Array.isArray(raw)) return [];
  const out: TermRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as PaymentTermLike;
    const label = asString(t.label);
    const value = asNumber(t.amountValue);
    if (!label || value == null) continue;

    const percent = asString(t.amountType) !== "fixed";
    const triggerRaw = asString(t.trigger);
    const trigger = triggerRaw === "on_signature" || triggerRaw === "on_completion" || triggerRaw === "date"
      ? triggerRaw : "unknown";

    out.push({
      label,
      share: percent ? `${value}%` : usdish(Math.round(value * 100)),
      // A percentage needs a total to become money. Without one it stays
      // a percentage rather than silently becoming $0.
      amountCents: percent
        ? (totalCents ? Math.round((totalCents * value) / 100) : null)
        : Math.round(value * 100),
      trigger,
      dueDate: asString(t.dueDate) || null,
    });
  }
  return out;
}

function usdish(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** The line under a term's label: when it bills. */
export function describeTerm(t: TermRow, forClient = false): string {
  const when = t.trigger === "on_signature"
    ? (forClient ? "Due when you sign" : "On signature")
    : t.trigger === "on_completion"
      ? (forClient ? "Due when the work is complete" : "On completion")
      : t.trigger === "date" && t.dueDate
        ? `On ${t.dueDate}`
        : "No trigger set";
  // The share is printed beside the money, so it only belongs here when
  // the two would otherwise say the same thing.
  return t.amountCents == null ? `${when} · ${t.share}` : when;
}

/** Do the terms add up to the total? Shown as a warning on the upload form. */
export function termsCoverTotal(rows: TermRow[], totalCents: number | null | undefined): boolean | null {
  if (!rows.length || !totalCents) return null;
  if (rows.some((r) => r.amountCents == null)) return null;
  const sum = rows.reduce((s, r) => s + (r.amountCents ?? 0), 0);
  // A dollar of rounding across several percentage terms is not a problem
  // worth shouting about; a missing instalment is.
  return Math.abs(sum - totalCents) <= rows.length;
}
