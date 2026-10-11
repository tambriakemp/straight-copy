// Three rows of "Menovia Phase 2" were sitting under "Waiting on the
// client" as though the client owed three answers. v1 and v2 were
// superseded, and nothing in their timestamps says so — a superseded
// version keeps its sent_at forever.
import { describe, it, expect } from "vitest";
import { buildFamilies, groupFamilies, versionLine, type VersionedProposal } from "@/lib/proposalGroups";
import { proposalGroup } from "@/lib/proposalStatus";

const v = (over: Partial<VersionedProposal> & { id: string; version: number }): VersionedProposal => ({
  status: "sent", sent_at: "2026-09-23T16:00:00Z", version_group_id: "fam", ...over,
});

describe("buildFamilies", () => {
  it("puts earlier versions under the current one instead of beside it", () => {
    const fams = buildFamilies([
      v({ id: "v1", version: 1, status: "superseded" }),
      v({ id: "v2", version: 2, status: "superseded" }),
      v({ id: "v3", version: 3, status: "sent" }),
    ]);
    expect(fams).toHaveLength(1);
    expect(fams[0].current.id).toBe("v3");
    expect(fams[0].earlier.map((e) => e.id)).toEqual(["v2", "v1"]);
    expect(fams[0].group).toBe("awaiting");
  });

  it("picks the live version, not the highest number", () => {
    // A voided v3 leaves v2 as the real one. Taking the highest number
    // heads the family with a dead proposal and hides the live one.
    const fams = buildFamilies([
      v({ id: "v2", version: 2, status: "sent" }),
      v({ id: "v3", version: 3, status: "voided" }),
    ]);
    expect(fams[0].current.id).toBe("v2");
    expect(fams[0].earlier.map((e) => e.id)).toEqual(["v3"]);
  });

  it("keeps a wholly dead family visible, headed by its newest", () => {
    const fams = buildFamilies([
      v({ id: "v1", version: 1, status: "superseded" }),
      v({ id: "v2", version: 2, status: "voided" }),
    ]);
    expect(fams).toHaveLength(1);
    expect(fams[0].current.id).toBe("v2");
    expect(fams[0].group).toBe("superseded");
  });

  it("treats a proposal with no version group as its own family", () => {
    const fams = buildFamilies([
      v({ id: "solo", version: 1, version_group_id: null }),
      v({ id: "other", version: 1, version_group_id: null }),
    ]);
    expect(fams).toHaveLength(2);
    expect(fams.every((f) => f.earlier.length === 0)).toBe(true);
  });

  it("keeps separate families separate", () => {
    const fams = buildFamilies([
      v({ id: "a1", version: 1, version_group_id: "a" }),
      v({ id: "b1", version: 1, version_group_id: "b" }),
    ]);
    expect(fams).toHaveLength(2);
  });

  it("is empty for nothing", () => {
    expect(buildFamilies([])).toEqual([]);
  });
});

describe("proposalGroup, on a replaced version", () => {
  it("reads superseded and voided off the status, not the dates", () => {
    // These happened TO a proposal rather than being steps it took, so
    // no timestamp expresses them.
    expect(proposalGroup({ status: "superseded", sent_at: "2026-09-23T16:00:00Z" })).toBe("superseded");
    expect(proposalGroup({ status: "voided", sent_at: "2026-09-23T16:00:00Z" })).toBe("superseded");
    expect(proposalGroup({ status: "Superseded" })).toBe("superseded");
  });

  it("still trusts the dates for everything else", () => {
    expect(proposalGroup({ status: "sent", client_signed_at: "2026-10-06T16:00:00Z" })).toBe("countersign");
  });
});

describe("groupFamilies", () => {
  it("files a family under the group its current version is in", () => {
    const g = groupFamilies([
      v({ id: "v1", version: 1, status: "superseded" }),
      v({ id: "v2", version: 2, status: "sent", client_signed_at: "2026-10-06T16:00:00Z", agency_countersigned_at: "2026-10-06T17:00:00Z" }),
    ]);
    expect([...g.keys()]).toEqual(["signed"]);
    expect(g.get("signed")![0].earlier).toHaveLength(1);
  });
});

describe("versionLine", () => {
  it("counts the earlier versions", () => {
    const [f] = buildFamilies([
      v({ id: "v1", version: 1, status: "superseded" }),
      v({ id: "v2", version: 2, status: "superseded" }),
      v({ id: "v3", version: 3 }),
    ]);
    expect(versionLine(f)).toBe("Version 3 (2 earlier versions)");
  });

  it("says nothing extra for a single version, and singularises one", () => {
    const [solo] = buildFamilies([v({ id: "a", version: 1, version_group_id: null })]);
    expect(versionLine(solo)).toBe("Version 1");
    const [pair] = buildFamilies([v({ id: "v1", version: 1, status: "superseded" }), v({ id: "v2", version: 2 })]);
    expect(versionLine(pair)).toBe("Version 2 (1 earlier version)");
  });
});
