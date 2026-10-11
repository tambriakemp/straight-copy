// The Clients list's three filters and its card headings are judgement
// calls that look identical on screen whichever way they went: what
// "Active" excludes, what "Needs you" means, which of a client's two names
// is the heading, and whether searching finds a project the card does not
// show.
import { describe, it, expect } from "vitest";
import {
  buildClientRows, applyFilter, matchesSearch, headingFor,
  type ClientCardRow,
} from "@/lib/clientRows";
import { countByProject, type TaskRow } from "@/lib/taskCounts";
import type { DirectoryClient, DirectoryProject } from "@/lib/useClientDirectory";

function client(over: Partial<DirectoryClient> & { id: string }): DirectoryClient {
  return {
    business_name: `Biz ${over.id}`, contact_name: `Person ${over.id}`, contact_email: null,
    archived: false, internal: false, created_at: "2026-05-12T00:00:00Z", tier: "Launch",
    ...over,
  };
}
function project(id: string, client_id: string, over: Partial<DirectoryProject> = {}): DirectoryProject {
  return { id, client_id, name: `Project ${id}`, type: "web_development", status: "active", ...over };
}

const tasks: TaskRow[] = [
  { client_project_id: "p1", status: "complete" },
  { client_project_id: "p1", status: "needs_review" },
  { client_project_id: "p2", status: "backlog" },
  { client_project_id: "p3", status: "blocked" },
];

function rows(
  clients: DirectoryClient[],
  projects: DirectoryProject[],
  taskRows: TaskRow[] = tasks,
): ClientCardRow[] {
  const byClient = new Map<string, DirectoryProject[]>();
  for (const p of projects) byClient.set(p.client_id, [...(byClient.get(p.client_id) ?? []), p]);
  return buildClientRows(clients, byClient, countByProject(taskRows));
}

describe("headingFor", () => {
  it("leads with the person, not the business", () => {
    // Bree's call: the client is a person and the roster is of people.
    // Both are printed either way; this only picks the heading.
    expect(headingFor({ business_name: "Menovia", contact_name: "Dr. Khadra Kahin" })).toBe("Dr. Khadra Kahin");
  });

  it("falls back to the business when there is no person", () => {
    expect(headingFor({ business_name: "Menovia", contact_name: null })).toBe("Menovia");
    expect(headingFor({ business_name: "Menovia", contact_name: "  " })).toBe("Menovia");
  });

  it("says Untitled rather than printing nothing", () => {
    expect(headingFor({ business_name: null, contact_name: null })).toBe("Untitled");
  });
});

describe("buildClientRows", () => {
  it("puts the business and the start date under the heading", () => {
    const [r] = rows([client({ id: "c1", business_name: "Menovia", contact_name: "Dr. Khadra Kahin" })], []);
    expect(r.name).toBe("Dr. Khadra Kahin");
    expect(r.who).toContain("Menovia");
    expect(r.who).toContain("since May");
  });

  it("does not repeat the business when it is the heading", () => {
    const [r] = rows([client({ id: "c1", business_name: "Menovia", contact_name: null })], []);
    expect(r.name).toBe("Menovia");
    expect(r.who).not.toContain("Menovia");
    expect(r.who).toContain("since");
  });

  it("takes the avatar from the business, so the square stays the brand", () => {
    // It sits next to the person's name but is there to be recognised,
    // and it is the same mark the client page shows.
    const [r] = rows([client({ id: "c1", business_name: "Menovia", contact_name: "Dr. Khadra Kahin" })], []);
    expect(r.avatar.initials).toBe("Me");
  });

  it("falls back to the person's initials when there is no business", () => {
    const [r] = rows([client({ id: "c1", business_name: null, contact_name: "Mary Sims" })], []);
    expect(r.avatar.initials).toBe("Ma");
  });

  it("shows three projects and counts the rest", () => {
    const five = Array.from({ length: 5 }, (_, i) => project(`p${i}`, "c1"));
    const [r] = rows([client({ id: "c1" })], five);
    expect(r.projects).toHaveLength(3);
    expect(r.extraProjects).toBe(2);
  });

  it("counts no extras when there are three or fewer", () => {
    const [r] = rows([client({ id: "c1" })], [project("p1", "c1"), project("p2", "c1")]);
    expect(r.extraProjects).toBe(0);
  });

  it("totals the tasks across every project, not only the shown three", () => {
    const four = ["p1", "p2", "p3", "p4"].map((id) => project(id, "c1"));
    const [r] = rows([client({ id: "c1" })], four);
    expect(r.projects).toHaveLength(3);
    expect(r.totals.total).toBe(4); // 2 on p1, 1 on p2, 1 on p3, none on p4
    expect(r.totals.done).toBe(1);
  });

  it("marks our own books Internal, not Active", () => {
    const [r] = rows([client({ id: "c1", internal: true })], []);
    expect(r.status.label).toBe("Internal");
    expect(r.avatar.bg).toBe("#0E1116");
  });

  it("marks an archived client Archived even when it is internal", () => {
    const [r] = rows([client({ id: "c1", internal: true, archived: true })], []);
    expect(r.status.label).toBe("Archived");
  });
});

describe("needsYou", () => {
  it("is true for a task in review", () => {
    const [r] = rows([client({ id: "c1" })], [project("p1", "c1")]);
    expect(r.needsYou).toBe(true);
  });

  it("is true for a blocked task", () => {
    const [r] = rows([client({ id: "c1" })], [project("p3", "c1")]);
    expect(r.needsYou).toBe(true);
  });

  it("is false merely for having open work", () => {
    // Otherwise the filter matches every client with any work at all,
    // which is the same list as Active and so is no filter.
    const [r] = rows([client({ id: "c1" })], [project("p2", "c1")]);
    expect(r.totals.open).toBe(1);
    expect(r.needsYou).toBe(false);
  });
});

describe("applyFilter", () => {
  const all = rows(
    [
      client({ id: "c1" }),                                   // needs you (p1)
      client({ id: "c2" }),                                   // open only  (p2)
      client({ id: "c3", archived: true }),                   // archived
      client({ id: "c4", internal: true }),                   // internal, live
    ],
    [project("p1", "c1"), project("p2", "c2"), project("p3", "c3")],
  );

  it("leaves archived clients out of Active", () => {
    expect(applyFilter(all, "active").map((r) => r.id)).toEqual(["c1", "c2", "c4"]);
  });

  it("keeps internal clients in Active — they are still live work", () => {
    expect(applyFilter(all, "active").some((r) => r.id === "c4")).toBe(true);
  });

  it("narrows Needs you to the ones that have stopped", () => {
    expect(applyFilter(all, "needs_you").map((r) => r.id)).toEqual(["c1"]);
  });

  it("leaves an archived client out of Needs you even when it is blocked", () => {
    // c3's only project has a blocked task, but the client is archived:
    // it is not work that is waiting on anyone.
    expect(applyFilter(all, "needs_you").some((r) => r.id === "c3")).toBe(false);
  });

  it("shows only archived clients under Archived", () => {
    expect(applyFilter(all, "archived").map((r) => r.id)).toEqual(["c3"]);
  });
});

describe("matchesSearch", () => {
  const [row] = rows(
    [client({ id: "c1", business_name: "Menovia", contact_name: "Dr. Khadra Kahin" })],
    [project("p1", "c1", { name: "Menovia.ai" })],
  );

  it("matches nothing in particular when the box is empty", () => {
    expect(matchesSearch(row, "", [])).toBe(true);
    expect(matchesSearch(row, "   ", [])).toBe(true);
  });

  it("ignores case", () => {
    expect(matchesSearch(row, "MENOVIA", [])).toBe(true);
  });

  it("matches the business as well as the person", () => {
    expect(matchesSearch(row, "khadra", [])).toBe(true);
    expect(matchesSearch(row, "menovia", [])).toBe(true);
  });

  it("finds a project the card does not show", () => {
    // The card lists three; searching for the seventh must still find the
    // client, or the search box lies about what is on the page.
    expect(matchesSearch(row, "aviya", ["Menovia.ai", "Aviya Telemed"])).toBe(true);
  });

  it("says no when nothing matches", () => {
    expect(matchesSearch(row, "zzz", ["Menovia.ai"])).toBe(false);
  });
});
