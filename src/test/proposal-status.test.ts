// `status` on the row is one word and the page asks four questions of it.
// Every one of these renders plausibly when wrong — a signed proposal
// filed under "waiting on the client" looks exactly like a real one, and
// you find out by chasing a client who already signed.
import { describe, it, expect } from "vitest";
import {
  proposalGroup, trailFor, daysOut, clientStatusLabel, GROUP_ORDER, GROUP_LABEL,
  clientGroup, CLIENT_GROUP_LABEL, CLIENT_GROUP_ORDER,
  type ProposalLike,
} from "@/lib/proposalStatus";

const p = (over: Partial<ProposalLike> = {}): ProposalLike => ({ status: "sent", ...over });

describe("proposalGroup", () => {
  it("files a draft that was never sent under Drafts", () => {
    expect(proposalGroup(p({ status: "draft", sent_at: null }))).toBe("draft");
  });

  it("files a sent, unsigned one under waiting on the client", () => {
    expect(proposalGroup(p({ sent_at: "2026-08-21T00:00:00Z" }))).toBe("awaiting");
  });

  it("files a client-signed one under needs your countersignature", () => {
    // This is the whole reason that section exists: it is waiting on us,
    // not on them, and it reads as done if you only look at `status`.
    expect(proposalGroup(p({
      sent_at: "2026-10-06T00:00:00Z", client_signed_at: "2026-10-06T10:00:00Z",
    }))).toBe("countersign");
  });

  it("files a fully signed one under Signed", () => {
    expect(proposalGroup(p({
      sent_at: "2026-10-06T00:00:00Z",
      client_signed_at: "2026-10-06T10:00:00Z",
      agency_countersigned_at: "2026-10-06T11:00:00Z",
    }))).toBe("signed");
  });

  it("files a decline under Declined whatever else happened", () => {
    expect(proposalGroup(p({
      sent_at: "2026-08-21T00:00:00Z", declined_at: "2026-08-22T00:00:00Z",
    }))).toBe("declined");
  });

  it("trusts the timestamps over a stale status word", () => {
    // Several writers maintain `status` — the portal, the countersign
    // action, the send function — so a row that is signed while its
    // status still says "sent" is a real state, not a corruption.
    expect(proposalGroup(p({ status: "sent", client_signed_at: "2026-10-06T00:00:00Z" }))).toBe("countersign");
    expect(proposalGroup(p({ status: "signed", sent_at: null }))).toBe("draft");
  });

  it("has a label and a place in the order for every group", () => {
    for (const g of GROUP_ORDER) expect(GROUP_LABEL[g], g).toBeTruthy();
    expect(new Set(GROUP_ORDER).size).toBe(GROUP_ORDER.length);
  });

  it("puts what is waiting on you first", () => {
    expect(GROUP_ORDER[0]).toBe("countersign");
  });
});

describe("trailFor", () => {
  it("fills the steps that happened and hollows the rest", () => {
    // Noon UTC on purpose: these are instants, printed in the reader's
    // own zone, so a midnight-UTC fixture lands on the day before for
    // anyone west of Greenwich and the test would fail on the date
    // rather than on the thing it is checking.
    const t = trailFor(p({ sent_at: "2026-08-21T16:00:00Z", first_viewed_at: "2026-08-21T18:00:00Z" }));
    expect(t.map((s) => s.done)).toEqual([true, true, false, false]);
    expect(t[0].label).toContain("Aug 21");
  });

  it("prints a timestamp in the reader's own zone, not UTC", () => {
    // A proposal sent at 8pm Central on the 21st is stored as 01:00Z on
    // the 22nd. Printing the UTC date would tell Bree she sent it a day
    // after she did.
    const t = trailFor(p({ sent_at: "2026-08-22T01:00:00Z" }));
    const expected = new Date("2026-08-22T01:00:00Z")
      .toLocaleDateString(undefined, { month: "short", day: "numeric" });
    expect(t[0].label).toBe(`Sent ${expected}`);
  });

  it("replaces the unreached steps with the decline, in red", () => {
    // "Signed ○ Countersigned ○" under a decline reads as still in flight.
    const t = trailFor(p({
      sent_at: "2026-08-21T16:00:00Z", first_viewed_at: "2026-08-21T18:00:00Z",
      declined_at: "2026-08-22T16:00:00Z",
    }));
    expect(t).toHaveLength(3);
    expect(t[2].bad).toBe(true);
    expect(t[2].label).toContain("no reason given");
  });

  it("uses the decline reason when there is one", () => {
    const t = trailFor(p({ declined_at: "2026-08-22T00:00:00Z", decline_reason: "Budget pulled" }));
    expect(t[2].label).toContain("Budget pulled");
  });

  it("still labels a step that has no date", () => {
    const t = trailFor(p({ sent_at: null }));
    expect(t[0].label).toBe("Sent");
    expect(t[0].done).toBe(false);
  });
});

describe("daysOut", () => {
  const now = new Date("2026-10-11T12:00:00Z");

  it("counts from when it was sent", () => {
    expect(daysOut(p({ sent_at: "2026-08-21T12:00:00Z" }), now)).toBe(51);
  });

  it("stops counting once it is signed or declined", () => {
    // "Out for 51 days" on a deal that closed in a week is the kind of
    // number that makes a whole page untrustworthy.
    expect(daysOut(p({ sent_at: "2026-08-21T12:00:00Z", client_signed_at: "2026-08-28T00:00:00Z" }), now)).toBeNull();
    expect(daysOut(p({ sent_at: "2026-08-21T12:00:00Z", declined_at: "2026-08-22T00:00:00Z" }), now)).toBeNull();
  });

  it("says nothing for one that was never sent", () => {
    expect(daysOut(p({ sent_at: null }), now)).toBeNull();
  });

  it("never goes negative on a future date", () => {
    expect(daysOut(p({ sent_at: "2026-12-01T00:00:00Z" }), now)).toBe(0);
  });
});

describe("clientStatusLabel", () => {
  it("tells the client what is being asked of them", () => {
    expect(clientStatusLabel(p({ sent_at: "2026-10-06T00:00:00Z" })))
      .toEqual({ label: "Waiting for your signature", tone: "amber" });
  });

  it("says who it is waiting on once they have signed", () => {
    // From the client's side, "Signed" alone would read as finished.
    expect(clientStatusLabel(p({ client_signed_at: "2026-10-06T00:00:00Z" })).label)
      .toBe("Signed — waiting on Cre8 Visions");
  });

  it("says Signed once both have", () => {
    expect(clientStatusLabel(p({
      client_signed_at: "2026-10-06T00:00:00Z", agency_countersigned_at: "2026-10-06T01:00:00Z",
    }))).toEqual({ label: "Signed", tone: "green" });
  });

  it("says Declined", () => {
    expect(clientStatusLabel(p({ declined_at: "2026-08-22T00:00:00Z" })).tone).toBe("red");
  });
});

describe("clientGroup", () => {
  const cp = (o: Partial<ProposalLike>): ProposalLike => ({ status: "sent", ...o });

  it("puts everything the client has signed under Signed, countersigned or not", () => {
    // "Needs your countersignature" is OUR step. To the client who signed
    // it, the proposal is signed — a heading saying otherwise asks them to
    // chase something they cannot do.
    expect(clientGroup(cp({ sent_at: "2026-09-01", client_signed_at: "2026-09-02" }))).toBe("signed");
    expect(clientGroup(cp({
      sent_at: "2026-09-01", client_signed_at: "2026-09-02", agency_countersigned_at: "2026-09-03",
    }))).toBe("signed");
  });

  it("asks for a signature only on one that is out and undecided", () => {
    expect(clientGroup(cp({ sent_at: "2026-09-01" }))).toBe("to_sign");
  });

  it("keeps a declined one, because the decision is a fact they may want to see", () => {
    expect(clientGroup(cp({ sent_at: "2026-09-01", declined_at: "2026-09-05" }))).toBe("declined");
  });

  it("shows the client nothing for a draft or a replaced version", () => {
    expect(clientGroup(cp({ status: "draft", sent_at: null }))).toBeNull();
    expect(clientGroup(cp({ status: "superseded", sent_at: "2026-08-01" }))).toBeNull();
    expect(clientGroup(cp({ status: "voided", sent_at: "2026-08-01" }))).toBeNull();
  });

  it("covers every section it names", () => {
    for (const g of CLIENT_GROUP_ORDER) expect(CLIENT_GROUP_LABEL[g]).toBeTruthy();
  });
});
