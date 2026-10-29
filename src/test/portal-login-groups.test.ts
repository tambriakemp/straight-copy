import { describe, expect, it } from "vitest";
import { groupLoginsByProject } from "@/lib/portalLoginGroups";
import type { SharedLogin } from "@/lib/clientPortalWire";

function login(over: Partial<SharedLogin> & Pick<SharedLogin, "id" | "label">): SharedLogin {
  return {
    username: null,
    url: null,
    sharedAt: "2026-10-01T00:00:00.000Z",
    masked: "••••••••••",
    ...over,
  };
}

describe("groupLoginsByProject", () => {
  it("leaves a list with no projects as one unlabeled group", () => {
    const groups = groupLoginsByProject([
      login({ id: "a", label: "Host" }),
      login({ id: "b", label: "Mail", projectId: null, projectName: null }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.projectName).toBeNull();
    expect(groups[0]!.logins.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("heads a project at the first login that names it, and keeps the rest unlabeled", () => {
    const groups = groupLoginsByProject([
      login({ id: "wide", label: "Mail" }),
      login({ id: "site", label: "Host", projectId: "p1", projectName: "Website" }),
      login({ id: "dns", label: "DNS", projectId: "p1", projectName: "Website" }),
      login({ id: "ads", label: "Ads", projectId: "p2", projectName: "Spring campaign" }),
    ]);
    expect(groups.map((group) => group.projectName)).toEqual([null, "Website", "Spring campaign"]);
    expect(groups[0]!.logins.map((row) => row.id)).toEqual(["wide"]);
    expect(groups[1]!.logins.map((row) => row.id)).toEqual(["site", "dns"]);
    expect(groups[2]!.projectId).toBe("p2");
  });

  it("still labels a project whose name did not come back", () => {
    const groups = groupLoginsByProject([
      login({ id: "a", label: "Host", projectId: "gone", projectName: null }),
    ]);
    expect(groups[0]!.projectName).toBe("A project");
    expect(groups[0]!.projectId).toBe("gone");
  });
});
