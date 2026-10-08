import { describe, it, expect } from "vitest";
import { extractDealsPage, toLiveDeal } from "../../supabase/functions/_shared/surecontact-deals";

// Real deal object from the live "Cre8 Prospect" pipeline (Ara, Oct 7 2026,
// GET /deals?pipeline_uuid=... — see CRE-332's comment with the full
// envelope). Confirms the field names this parser must read: `amount` is a
// numeric string, the stage reference is nested at `stage.uuid` (no flat
// `stage_uuid`), and company/contact are plural arrays with no singular
// form.
const MENOVIA_DEAL = {
  uuid: "3c294784-d883-4535-9ef7-e2dbe9bac37b",
  name: "Menovia Phase 2",
  amount: "5000.00",
  status: "won",
  stage: {
    uuid: "f08f600b-e769-48aa-80bc-baabbda50e89",
    name: "Won",
    order: 6,
    is_won: true,
    is_lost: false,
  },
  contacts: [{ first_name: "Dr.", last_name: "Khadra Kahin", is_primary: false }],
  companies: [{ uuid: "04e5831c-5c50-4884-96b8-47feb23c9c48", name: "Menovia", is_primary: false }],
  created_at: "2026-10-06T06:01:54+00:00",
  updated_at: "2026-10-08T01:07:11+00:00",
};

describe("surecontact-deals: toLiveDeal", () => {
  it("resolves the real deal's stage uuid from the nested stage object", () => {
    const deal = toLiveDeal(MENOVIA_DEAL);
    expect(deal.stageUuid).toBe("f08f600b-e769-48aa-80bc-baabbda50e89");
  });

  it("parses a numeric-string amount into cents", () => {
    const deal = toLiveDeal(MENOVIA_DEAL);
    expect(deal.amountCents).toBe(500000);
  });

  it("falls back to the companies[]/contacts[] arrays when there is no singular company/contact", () => {
    const deal = toLiveDeal(MENOVIA_DEAL);
    expect(deal.companyName).toBe("Menovia");
    expect(deal.contactName).toBe("Dr. Khadra Kahin");
  });

  it("still resolves a flat stage_uuid if a future response ever sends one", () => {
    const deal = toLiveDeal({ uuid: "x", stage_uuid: "flat-uuid" });
    expect(deal.stageUuid).toBe("flat-uuid");
  });
});

describe("surecontact-deals: extractDealsPage", () => {
  it("reads the confirmed envelope shape ({ data: [...], meta })", () => {
    const envelope = {
      success: true,
      message: "",
      data: [MENOVIA_DEAL],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    };
    const { list, meta } = extractDealsPage(envelope);
    expect(list).toHaveLength(1);
    expect(list[0].uuid).toBe(MENOVIA_DEAL.uuid);
    expect(meta?.last_page).toBe(1);
  });

  it("reports last_page > 1 so the caller keeps paging", () => {
    const envelope = { data: [MENOVIA_DEAL], meta: { current_page: 1, last_page: 2 } };
    const { meta } = extractDealsPage(envelope);
    expect(meta?.last_page).toBe(2);
  });

  it("returns an empty list for an unrecognized shape instead of throwing", () => {
    expect(extractDealsPage(null).list).toEqual([]);
    expect(extractDealsPage({}).list).toEqual([]);
  });
});
