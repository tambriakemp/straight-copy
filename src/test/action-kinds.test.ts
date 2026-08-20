// The one property that carries real risk: whether an action can execute
// without a person looking at it. Anything that reaches a client must be
// outward, and an unknown kind must fail closed.
import { describe, it, expect } from "vitest";
import {
  ACTION_KINDS, isOutward, kindEnumFor, kindDocFor,
} from "../../supabase/functions/_shared/agents/action-kinds";
import { canAutoExecute } from "../../supabase/functions/_shared/agents/types";

describe("outward classification", () => {
  it("marks everything that reaches a client as outward", () => {
    expect(isOutward("draft_email")).toBe(true);
    expect(isOutward("send_proposal")).toBe(true);
  });

  it("marks in-app work as not outward", () => {
    for (const k of ["create_task", "flag_risk", "draft_proposal", "create_client_project", "sync_client_to_surecontact", "schedule_followup"]) {
      expect(isOutward(k), k).toBe(false);
    }
  });

  it("fails closed on an unknown kind", () => {
    // A kind we don't recognise must never auto-execute.
    expect(isOutward("wire_money_somewhere")).toBe(true);
    expect(canAutoExecute("act_in_app", isOutward("wire_money_somewhere"))).toBe(false);
  });
});

describe("autonomy gating", () => {
  it("never lets act_in_app send a proposal without approval", () => {
    expect(canAutoExecute("act_in_app", isOutward("send_proposal"))).toBe(false);
  });

  it("lets act_in_app draft one", () => {
    expect(canAutoExecute("act_in_app", isOutward("draft_proposal"))).toBe(true);
  });

  it("gates everything under propose", () => {
    for (const k of Object.keys(ACTION_KINDS)) {
      expect(canAutoExecute("propose", isOutward(k)), k).toBe(false);
    }
  });
});

describe("tool schema generation", () => {
  it("drops kinds that have no executor", () => {
    expect(kindEnumFor(["create_task", "not_a_real_kind"])).toEqual(["create_task"]);
  });

  it("documents the payload of every kind it offers", () => {
    const doc = kindDocFor(["draft_proposal", "send_proposal"]);
    expect(doc).toContain("draft_proposal");
    expect(doc).toContain("proposal_id");
  });

  it("gives every kind a purpose and a payload", () => {
    for (const [key, a] of Object.entries(ACTION_KINDS)) {
      expect(a.kind, key).toBe(key);
      expect(a.purpose.length, key).toBeGreaterThan(10);
      expect(a.payload.length, key).toBeGreaterThan(2);
    }
  });
});
