/**
 * Journey checklist source of truth (admin UI mirror).
 *
 * Each item has a STABLE `key` that is its identity across migrations,
 * label changes, and re-orders. `label` is display-only and can be changed
 * freely without losing client progress. `auto_key` is the legacy field that
 * edge functions use to flip `done` when an automated event happens — keep it
 * in sync with the keys here.
 *
 * To add/rename/reorder items:
 *   1. Edit the array below.
 *   2. (Optional but recommended) update the same array in
 *      `supabase/functions/_shared/journey-checklists.ts` to keep edge
 *      functions in sync.
 *   3. Run `syncChecklist()` against any stored checklist to re-shape it
 *      while preserving `done` state.
 */

export type ChecklistOwner = "auto" | "client" | "agency";

export interface ChecklistItemTemplate {
  key: string;          // stable identity — never change once shipped
  label: string;        // display only — safe to edit anytime
  owner: ChecklistOwner;
  auto_key?: string;    // legacy automation hook (kept for backward compat)
}

export interface ChecklistItem extends ChecklistItemTemplate {
  done: boolean;
}

type Tier = "launch" | "growth";
type NodeKey = string;
type TemplateId = `${Tier}:${NodeKey}`;

/**
 * Authoritative templates. Stored in `journey_templates.checklist` as well,
 * but this is the canonical reference the UI/edge functions sync against.
 */
export const CHECKLIST_TEMPLATES: Record<TemplateId, ChecklistItemTemplate[]> = {
  "launch:intake": [
    { key: "intake.welcome_email_sent",        label: "Welcome email sent via SureContact",                                owner: "auto" },
    { key: "intake.contract_sent",             label: "Contract sent for signature",                                        owner: "auto" },
    { key: "intake.scope_summary_sent",        label: "Scope summary email sent to client",                                 owner: "auto" },
    { key: "intake.welcome_opened",            label: "Welcome email opened and portal accessed",                           owner: "client" },
    { key: "intake.contract_signed",           label: "Contract signed",                                                    owner: "client" },
    { key: "intake.onboarding_completed",      label: "Onboarding chat completed",                                          owner: "client", auto_key: "onboarding_completed" },
    { key: "intake.accounts_submitted",        label: "Required accounts created and access submitted via portal",         owner: "client", auto_key: "accounts_submitted" },
    { key: "intake.contract_countersigned",    label: "Contract countersigned",                                             owner: "agency" },
    { key: "intake.summary_reviewed",          label: "Intake summary reviewed and quality confirmed",                      owner: "agency" },
    { key: "intake.social_audit",              label: "Baseline social audit completed if client has existing accounts",   owner: "agency" },
    { key: "intake.kickoff_confirmation_sent", label: "Kickoff confirmation email sent via SureContact",                    owner: "auto" },
  ],
  "growth:intake": [
    { key: "intake.welcome_email_sent",        label: "Welcome email sent via SureContact",                                owner: "auto" },
    { key: "intake.contract_sent",             label: "Contract sent for signature",                                        owner: "auto" },
    { key: "intake.scope_summary_sent",        label: "Scope summary email sent to client",                                 owner: "auto" },
    { key: "intake.welcome_opened",            label: "Welcome email opened and portal accessed",                           owner: "client" },
    { key: "intake.contract_signed",           label: "Contract signed",                                                    owner: "client" },
    { key: "intake.onboarding_completed",      label: "Onboarding chat completed",                                          owner: "client", auto_key: "onboarding_completed" },
    { key: "intake.accounts_submitted",        label: "Required accounts created and access submitted via portal",         owner: "client", auto_key: "accounts_submitted" },
    { key: "intake.contract_countersigned",    label: "Contract countersigned",                                             owner: "agency" },
    { key: "intake.summary_reviewed",          label: "Intake summary reviewed and quality confirmed",                      owner: "agency" },
    { key: "intake.social_audit",              label: "Baseline social audit completed if client has existing accounts",   owner: "agency" },
    { key: "intake.kickoff_confirmation_sent", label: "Kickoff confirmation email sent via SureContact",                    owner: "auto" },
  ],
};

const norm = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");

/**
 * Re-shape a stored checklist against the latest template.
 *
 * Preserves `done` by matching, in order:
 *   1. Stable `key`
 *   2. Legacy `auto_key`
 *   3. Normalized `label`
 *
 * Items removed from the template are dropped. New items appear with
 * `done: false`. The returned array follows the template order.
 *
 * Returns the same reference shape (`ChecklistItem[]`) regardless of what was
 * stored — always safe to assign back to `journey_nodes.checklist`.
 */
export function syncChecklist(
  stored: unknown,
  templateId: TemplateId,
): ChecklistItem[] {
  const template = CHECKLIST_TEMPLATES[templateId];
  if (!template) return Array.isArray(stored) ? (stored as ChecklistItem[]) : [];

  const storedArr: any[] = Array.isArray(stored) ? stored : [];
  const byKey = new Map<string, any>();
  const byAutoKey = new Map<string, any>();
  const byLabel = new Map<string, any>();
  for (const item of storedArr) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.key === "string") byKey.set(item.key, item);
    if (typeof item.auto_key === "string") byAutoKey.set(item.auto_key, item);
    if (typeof item.label === "string") byLabel.set(norm(item.label), item);
  }

  return template.map((t) => {
    const match =
      byKey.get(t.key) ??
      (t.auto_key ? byAutoKey.get(t.auto_key) : undefined) ??
      byLabel.get(norm(t.label));
    return {
      key: t.key,
      label: t.label,
      owner: t.owner,
      ...(t.auto_key ? { auto_key: t.auto_key } : {}),
      done: match ? Boolean(match.done) : false,
    };
  });
}

/** Look up a template by tier + node key. */
export function getTemplate(tier: string, nodeKey: string): ChecklistItemTemplate[] | undefined {
  return CHECKLIST_TEMPLATES[`${tier}:${nodeKey}` as TemplateId];
}

/** Build a `<tier>:<nodeKey>` template id, returning `undefined` if unknown. */
export function templateIdFor(tier: string, nodeKey: string): TemplateId | undefined {
  const id = `${tier}:${nodeKey}` as TemplateId;
  return CHECKLIST_TEMPLATES[id] ? id : undefined;
}
