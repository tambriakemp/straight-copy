// Folding a flat list of proposal rows into what the page shows: one line
// per proposal, with its earlier versions tucked underneath it.
//
// Pure, and the reason is the bug it exists to stop. Three rows of
// "Menovia Phase 2" were sitting under "Waiting on the client" as though
// the client owed three answers — v1 and v2 were superseded, and nothing
// in their timestamps says so. A superseded version keeps its sent_at
// forever; it is only the later row's existence that makes it history.

import { proposalGroup, type ProposalGroup, type ProposalLike } from "@/lib/proposalStatus";

export interface VersionedProposal extends ProposalLike {
  id: string;
  version: number;
  version_group_id?: string | null;
}

export interface ProposalFamily<T extends VersionedProposal> {
  /** The one that counts: the live version. */
  current: T;
  /** Replaced versions, newest first. Rendered small, under `current`. */
  earlier: T[];
  group: ProposalGroup;
}

/** Rows sharing this are versions of one proposal. */
function familyKey(p: VersionedProposal): string {
  return p.version_group_id ?? p.id;
}

/**
 * One family per proposal, filed under the group its CURRENT version is
 * in.
 *
 * Which version is current is decided by status, not by version number:
 * a v3 that was voided leaves v2 as the live one, and picking the highest
 * number would put a dead proposal at the head of the family with the
 * real one hidden underneath it.
 */
export function buildFamilies<T extends VersionedProposal>(rows: T[]): ProposalFamily<T>[] {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const k = familyKey(r);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }

  const out: ProposalFamily<T>[] = [];
  for (const members of byKey.values()) {
    const sorted = [...members].sort((a, b) => b.version - a.version);
    const live = sorted.filter((m) => proposalGroup(m) !== "superseded");
    // Every version superseded or voided: the family is history, and the
    // newest of them stands for it rather than the family vanishing.
    const current = live[0] ?? sorted[0];
    out.push({
      current,
      earlier: sorted.filter((m) => m.id !== current.id),
      group: proposalGroup(current),
    });
  }
  return out;
}

/** Families keyed by the group their current version belongs to. */
export function groupFamilies<T extends VersionedProposal>(
  rows: T[],
): Map<ProposalGroup, ProposalFamily<T>[]> {
  const out = new Map<ProposalGroup, ProposalFamily<T>[]>();
  for (const f of buildFamilies(rows)) {
    out.set(f.group, [...(out.get(f.group) ?? []), f]);
  }
  return out;
}

/** "Version 3 (2 earlier versions)". */
export function versionLine(f: ProposalFamily<VersionedProposal>): string {
  const n = f.earlier.length;
  return `Version ${f.current.version}${n ? ` (${n} earlier version${n === 1 ? "" : "s"})` : ""}`;
}
