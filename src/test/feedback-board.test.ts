// What goes wrong on a feedback board is a comment filed against the
// wrong page, or quietly not shown — and a board missing a comment looks
// exactly like a board with nothing to say. A client who leaves feedback
// and watches it vanish stops leaving feedback.
import { describe, it, expect } from "vitest";
import {
  normaliseStatus, bucketByPage, filterComments, openCount, authorInitials,
  clickToPct, pageTitle, pageLabel, pageKind, groupOf, foldersOf, groupNames, statusArgs,
  sortPages, visibleTo, pageKey, NEXT_STATUS,
  approvalFor, pageVerdict, buildActivity,
  type BoardPage, type BoardComment, type ApprovalRow, type ApprovalEvent,
} from "@/lib/feedbackBoard";

const page = (o: Partial<BoardPage> & { previewId: string; path: string }): BoardPage => ({
  key: pageKey(o.previewId, o.path), previewName: "Desktop", label: "Home",
  group: null, external: false, visibleToClient: true, order: 0, ...o,
  // key must follow the final ids
  ...(o.key ? {} : { key: pageKey(o.previewId, o.path) }),
});
const cmt = (o: Partial<BoardComment> & { id: string; project_id: string; page_path: string }): BoardComment => ({
  pin_number: 1, x_pct: 50, y_pct: 50, author_name: "Dr. Khadra Kahin",
  body: "Can this headline be larger?", status: "open",
  created_at: "2026-10-11T16:00:00Z", ...o,
});

describe("normaliseStatus", () => {
  it("reads the three real states, however they were spelled", () => {
    expect(normaliseStatus("open")).toBe("open");
    expect(normaliseStatus("In Progress")).toBe("in_progress");
    expect(normaliseStatus("in-progress")).toBe("in_progress");
    expect(normaliseStatus("Resolved")).toBe("resolved");
    expect(normaliseStatus("done")).toBe("resolved");
  });

  it("treats anything it does not know as open", () => {
    // Open is the state that keeps a comment visible. Defaulting the
    // other way hides real feedback behind the resolved filter.
    for (const s of ["", null, undefined, "whatever", "pending"]) {
      expect(normaliseStatus(s), String(s)).toBe("open");
    }
  });

  it("cycles through all three and back", () => {
    expect(NEXT_STATUS.open).toBe("in_progress");
    expect(NEXT_STATUS.in_progress).toBe("resolved");
    expect(NEXT_STATUS.resolved).toBe("open");
  });
});

describe("bucketByPage", () => {
  const pages = [
    page({ previewId: "desk", path: "index.html", group: "Desktop", label: "Home", order: 0 }),
    page({ previewId: "mob", path: "index.html", group: "Mobile", label: "Home", order: 0 }),
  ];

  it("matches on preview AND path, not path alone", () => {
    // Two preview projects under one client project routinely both have
    // an index.html. Matching the path alone shows the desktop comments
    // on the mobile page and doubles the count on both.
    const out = bucketByPage(pages, [
      cmt({ id: "a", project_id: "desk", page_path: "index.html" }),
      cmt({ id: "b", project_id: "mob", page_path: "index.html", pin_number: 1 }),
    ]);
    expect(out.find((b) => b.page.previewId === "desk")!.comments.map((c) => c.id)).toEqual(["a"]);
    expect(out.find((b) => b.page.previewId === "mob")!.comments.map((c) => c.id)).toEqual(["b"]);
  });

  it("keeps a page with no comments", () => {
    // "0 comments" on a page is information, and the canvas prints it.
    const out = bucketByPage(pages, []);
    expect(out).toHaveLength(2);
    expect(out.every((b) => b.comments.length === 0)).toBe(true);
  });

  it("drops a comment whose page is gone rather than inventing one", () => {
    const out = bucketByPage(pages, [cmt({ id: "orphan", project_id: "desk", page_path: "deleted.html" })]);
    expect(out.flatMap((b) => b.comments)).toHaveLength(0);
  });

  it("orders comments by pin number, not by when they were written", () => {
    const out = bucketByPage([pages[0]], [
      cmt({ id: "late", project_id: "desk", page_path: "index.html", pin_number: 3, created_at: "2026-01-01T00:00:00Z" }),
      cmt({ id: "early", project_id: "desk", page_path: "index.html", pin_number: 1 }),
    ]);
    expect(out[0].comments.map((c) => c.id)).toEqual(["early", "late"]);
  });
});

describe("sortPages and visibleTo", () => {
  it("groups, then respects the order someone set", () => {
    const sorted = sortPages([
      page({ previewId: "p", path: "c", group: "Mobile", label: "C", order: 0 }),
      page({ previewId: "p", path: "b", group: "Desktop", label: "B", order: 1 }),
      page({ previewId: "p", path: "a", group: "Desktop", label: "A", order: 0 }),
    ]);
    expect(sorted.map((p) => p.label)).toEqual(["A", "B", "C"]);
  });

  it("hides client-hidden pages only when viewing as the client", () => {
    const pages = [
      page({ previewId: "p", path: "a", visibleToClient: true }),
      page({ previewId: "p", path: "b", visibleToClient: false }),
    ];
    expect(visibleTo(pages, false)).toHaveLength(2);
    expect(visibleTo(pages, true).map((p) => p.path)).toEqual(["a"]);
  });
});

describe("filterComments", () => {
  const list = [
    cmt({ id: "o", project_id: "p", page_path: "i", status: "open", body: "Headline too small" }),
    cmt({ id: "p", project_id: "p", page_path: "i", status: "in_progress", body: "Swap the image" }),
    cmt({ id: "r", project_id: "p", page_path: "i", status: "resolved", body: "Make this required" }),
  ];

  it("hides resolved by default", () => {
    // A board that keeps everything ever settled stops being a list of
    // what is left, which is the only reason to open it.
    expect(filterComments(list).map((c) => c.id)).toEqual(["o", "p"]);
  });

  it("shows them when asked", () => {
    expect(filterComments(list, { showResolved: true })).toHaveLength(3);
  });

  it("returns them when Resolved is the chosen filter", () => {
    // Otherwise picking Resolved from the filter returns an empty list,
    // which reads as "none" rather than "hidden".
    expect(filterComments(list, { status: "resolved" }).map((c) => c.id)).toEqual(["r"]);
  });

  it("searches the body, the author and the pin number", () => {
    expect(filterComments(list, { query: "image" }).map((c) => c.id)).toEqual(["p"]);
    expect(filterComments(list, { query: "khadra" })).toHaveLength(2);
    expect(filterComments([cmt({ id: "x", project_id: "p", page_path: "i", pin_number: 7 })], { query: "7" })).toHaveLength(1);
  });

  it("ignores case and surrounding space", () => {
    expect(filterComments(list, { query: "  HEADLINE " }).map((c) => c.id)).toEqual(["o"]);
  });
});

describe("openCount", () => {
  it("counts everything not resolved", () => {
    expect(openCount([
      cmt({ id: "a", project_id: "p", page_path: "i", status: "open" }),
      cmt({ id: "b", project_id: "p", page_path: "i", status: "in_progress" }),
      cmt({ id: "c", project_id: "p", page_path: "i", status: "resolved" }),
    ])).toBe(2);
  });
});

describe("authorInitials", () => {
  it("takes one letter per name", () => {
    expect(authorInitials("Dr. Khadra Kahin")).toBe("DK");
    expect(authorInitials("Guest")).toBe("GU");
  });

  it("gives a dash rather than an empty circle", () => {
    expect(authorInitials(null)).toBe("—");
    expect(authorInitials("   ")).toBe("—");
  });
});

describe("clickToPct", () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 };

  it("converts a click to a percentage of the page", () => {
    // Percentages, not pixels: the page renders at whatever width the
    // window gives it, and a pin stored in pixels drifts off the thing
    // it was pointing at.
    expect(clickToPct(500, 350, rect)).toEqual({ x_pct: 50, y_pct: 50 });
  });

  it("clamps a click that lands outside", () => {
    expect(clickToPct(0, 0, rect)).toEqual({ x_pct: 0, y_pct: 0 });
    expect(clickToPct(9999, 9999, rect)).toEqual({ x_pct: 100, y_pct: 100 });
  });

  it("survives a zero-sized frame instead of returning NaN", () => {
    const out = clickToPct(10, 10, { left: 0, top: 0, width: 0, height: 0 });
    expect(Number.isNaN(out.x_pct)).toBe(false);
    expect(Number.isNaN(out.y_pct)).toBe(false);
  });
});

describe("pageTitle", () => {
  it("reads group then page, as the canvas heads each block", () => {
    expect(pageTitle(page({ previewId: "p", path: "i", group: "Desktop", label: "Home" }))).toBe("Desktop / Home");
  });

  it("falls back to the preview's name when there is no group", () => {
    expect(pageTitle(page({ previewId: "p", path: "i", group: null, previewName: "Launch site", label: "Home" })))
      .toBe("Launch site / Home");
  });

  it("falls back to the path when a page has no label", () => {
    expect(pageTitle(page({ previewId: "p", path: "about.html", group: "Desktop", label: "" })))
      .toBe("Desktop / about.html");
  });
});

describe("pageLabel", () => {
  it("drops the extension and the folder, because the rail prints a hundred of these", () => {
    expect(pageLabel(page({ previewId: "p", path: "x", label: "Magna Tax Relief About Us.html" })))
      .toBe("Magna Tax Relief About Us");
    expect(pageLabel(page({ previewId: "p", path: "concepts/home.png", label: "" })))
      .toBe("home");
  });

  it("never returns nothing — a page with only an extension keeps its file name", () => {
    expect(pageLabel(page({ previewId: "p", path: ".html", label: "" }))).toBe(".html");
  });

  it("leaves a name that is not a file name alone", () => {
    expect(pageLabel(page({ previewId: "p", path: "x", label: "Pricing" }))).toBe("Pricing");
  });
});

describe("groupOf", () => {
  it("is the group, the preview's name, or 'Ungrouped' — never blank", () => {
    expect(groupOf(page({ previewId: "p", path: "x", group: "Desktop" }))).toBe("Desktop");
    expect(groupOf(page({ previewId: "p", path: "x", group: "  " , previewName: "Launch site" })))
      .toBe("Launch site");
    expect(groupOf(page({ previewId: "p", path: "x", group: null, previewName: "" }))).toBe("Ungrouped");
  });
});

describe("pageKind", () => {
  it("says what the file is, which is the second line of a page row", () => {
    expect(pageKind(page({ previewId: "p", path: "home.png" }))).toBe("Image");
    expect(pageKind(page({ previewId: "p", path: "home.JPG" }))).toBe("Image");
    expect(pageKind(page({ previewId: "p", path: "home.html" }))).toBe("HTML page");
    expect(pageKind(page({ previewId: "p", path: "/pricing", external: true }))).toBe("Linked page");
  });
});

describe("foldersOf", () => {
  const pages = [
    page({ previewId: "d", path: "a.html", group: "Desktop", label: "Home", order: 0 }),
    page({ previewId: "d", path: "b.html", group: "Desktop", label: "Onboarding", order: 1 }),
    page({ previewId: "m", path: "a.html", group: "Mobile", label: "Home", order: 0 }),
  ];

  it("heads each group once instead of prefixing every page with it", () => {
    const out = foldersOf(pages);
    expect(out.map((f) => f.name)).toEqual(["Desktop", "Mobile"]);
    expect(out[0].pages.map((p) => p.label)).toEqual(["Home", "Onboarding"]);
  });

  it("keeps sortPages' order rather than a map's insertion order", () => {
    const out = foldersOf([pages[2], pages[1], pages[0]]);
    expect(out.map((f) => f.name)).toEqual(["Desktop", "Mobile"]);
  });

  it("files an ungrouped page under a folder of its own, not into nothing", () => {
    const out = foldersOf([page({ previewId: "p", path: "x.html", group: null, previewName: "Launch site" })]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Launch site");
  });
});

describe("groupNames", () => {
  it("lists the groups in use, once each, for the 'Add to group' picker", () => {
    expect(groupNames([
      page({ previewId: "p", path: "a", group: "Mobile" }),
      page({ previewId: "p", path: "b", group: "Desktop" }),
      page({ previewId: "p", path: "c", group: "Desktop" }),
      page({ previewId: "p", path: "d", group: null }),
      page({ previewId: "p", path: "e", group: "   " }),
    ])).toEqual(["Desktop", "Mobile"]);
  });
});

describe("approvalFor", () => {
  const A = (o: Partial<ApprovalRow> = {}) =>
    new Map([["p:i", { path: "i", project_id: "p", approved_at: "2026-10-11T16:00:00Z", ...o }]]);
  const E = (action: string, note: string | null = null) =>
    new Map([["p:i", {
      id: "e1", project_id: "p", path: "i", action, note,
      approver_name: "Dr. Khadra Kahin", created_at: "2026-10-11T16:00:00Z",
    }]]);

  it("reads approved off the row, which is the fact", () => {
    expect(approvalFor("p:i", A(), new Map()).state).toBe("approved");
  });

  it("stays approved even when an older event says otherwise", () => {
    // A page can be approved, sent back and approved again. Only the row
    // says where it stands now, which is why this does not read the
    // state out of the last event.
    expect(approvalFor("p:i", A(), E("changes_requested", "nope")).state).toBe("approved");
  });

  it("distinguishes sent-back from never-looked-at", () => {
    // Without this a rejected page looks identical to one nobody opened.
    const sent = approvalFor("p:i", new Map(), E("changes_requested", "Logo is wrong"));
    expect(sent.state).toBe("changes_requested");
    expect(sent.note).toBe("Logo is wrong");
    expect(approvalFor("p:i", new Map(), new Map()).state).toBe("pending");
  });

  it("does not call a plain unapprove a rejection", () => {
    // Withdrawing an approval is not the same as asking for something.
    expect(approvalFor("p:i", new Map(), E("unapprove")).state).toBe("pending");
  });
});

describe("buildActivity", () => {
  const title = () => "Desktop / Home";
  const ev = (o: Partial<ApprovalEvent> & { id: string; action: string }): ApprovalEvent => ({
    project_id: "p", path: "i", note: null, approver_name: "Dr. Khadra Kahin",
    created_at: "2026-10-11T16:00:00Z", ...o,
  });

  it("merges comments and approvals into one stream, newest first", () => {
    // Shown apart you cannot tell whether the client approved a page
    // before or after the comment that contradicts it.
    const feed = buildActivity(
      [ev({ id: "a", action: "approve", created_at: "2026-10-11T18:00:00Z" })],
      [cmt({ id: "c", project_id: "p", page_path: "i", created_at: "2026-10-11T17:00:00Z" })],
      title,
    );
    expect(feed.map((f) => f.id)).toEqual(["e:a", "c:c"]);
  });

  it("says what happened in words, not action codes", () => {
    const [a] = buildActivity([ev({ id: "a", action: "approve" })], [], title);
    expect(a.what).toBe("approved this page");
    const [b] = buildActivity([ev({ id: "b", action: "changes_requested", note: "Logo" })], [], title);
    expect(b.what).toBe("asked for changes");
    expect(b.detail).toBe("Logo");
    const [c] = buildActivity([ev({ id: "c", action: "unapprove" })], [], title);
    expect(c.what).toBe("withdrew their approval");
  });

  it("prints an unknown action rather than dropping the entry", () => {
    const [x] = buildActivity([ev({ id: "x", action: "something_new" })], [], title);
    expect(x.what).toBe("something_new");
  });

  it("names an anonymous actor rather than leaving a blank", () => {
    const [x] = buildActivity([ev({ id: "x", action: "approve", approver_name: null })], [], title);
    expect(x.who).toBe("Someone");
  });

  it("is empty for nothing", () => {
    expect(buildActivity([], [], title)).toEqual([]);
  });
});

describe("statusArgs", () => {
  const cs = [
    cmt({ id: "o", project_id: "p", page_path: "x", status: "open" }),
    cmt({ id: "i", project_id: "p", page_path: "x", status: "in_progress" }),
    cmt({ id: "r", project_id: "p", page_path: "x", status: "resolved" }),
  ];

  it("means what the dropdown says — 'all' really is all", () => {
    // The trap: showResolved defaults false, so passing the filter
    // straight through would make "Status: all" mean "all except
    // resolved" — a filter that lies about its own name.
    expect(filterComments(cs, statusArgs("all")).map((c) => c.id)).toEqual(["o", "i", "r"]);
  });

  it("narrows to one state when one is picked", () => {
    expect(filterComments(cs, statusArgs("open")).map((c) => c.id)).toEqual(["o"]);
    expect(filterComments(cs, statusArgs("in_progress")).map((c) => c.id)).toEqual(["i"]);
    expect(filterComments(cs, statusArgs("resolved")).map((c) => c.id)).toEqual(["r"]);
  });

  it("still honours the search box alongside the status", () => {
    const out = filterComments(cs, { query: "headline", ...statusArgs("all") });
    expect(out).toHaveLength(3); // every fixture shares the same body
    expect(filterComments(cs, { query: "nothing like this", ...statusArgs("all") })).toHaveLength(0);
  });
});

describe("pageVerdict", () => {
  it("stops calling a page approved once there are open comments on it", () => {
    // The failure, which has happened: a client approves on Monday, asks
    // for a change on Tuesday, the row stays green because the approval
    // row is still there, and the change ships unbuilt.
    expect(pageVerdict("approved", 2)).toBe("changes_requested");
  });

  it("leaves an approved page with nothing open alone", () => {
    expect(pageVerdict("approved", 0)).toBe("approved");
  });

  it("does not promote anything — only ever demotes", () => {
    expect(pageVerdict("pending", 0)).toBe("pending");
    expect(pageVerdict("pending", 3)).toBe("pending");
    expect(pageVerdict("changes_requested", 0)).toBe("changes_requested");
  });
});
