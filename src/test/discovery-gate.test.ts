import { describe, expect, it } from "vitest";
import {
  GATE_QUESTIONS,
  missingGateTopics,
} from "../../supabase/functions/_shared/discovery-gate.ts";

describe("missingGateTopics", () => {
  it("returns all three topics when nothing was asked", () => {
    expect(missingGateTopics({})).toEqual(["social", "contact", "wording"]);
  });

  it("returns nothing once all three were explicitly asked", () => {
    expect(
      missingGateTopics({
        social_links_asked: true,
        site_contact_asked: true,
        wording_asked: true,
      }),
    ).toEqual([]);
  });

  it("flags only the topics not marked true, in a fixed order", () => {
    expect(
      missingGateTopics({
        social_links_asked: true,
        site_contact_asked: false,
        wording_asked: true,
      }),
    ).toEqual(["contact"]);
  });

  it("does not accept a truthy non-boolean as having been asked", () => {
    // Extraction is model output — guard against "yes"/1 slipping through
    // instead of a real boolean.
    expect(
      missingGateTopics({
        social_links_asked: "yes" as unknown,
        site_contact_asked: 1 as unknown,
        wording_asked: true,
      }),
    ).toEqual(["social", "contact"]);
  });

  it("has a canned question for every topic it can return", () => {
    for (const topic of missingGateTopics({})) {
      expect(GATE_QUESTIONS[topic]).toBeTruthy();
    }
  });
});
