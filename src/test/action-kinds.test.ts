// The one property that carries real risk: whether an action can execute
// without a person looking at it. Anything that reaches a client must be
// outward, and an unknown kind must fail closed.
import { describe, it, expect } from "vitest";
import {
  ACTION_KINDS, alwaysApproves, isDestructive, isOutward, kindEnumFor, kindDocFor,
} from "../../supabase/functions/_shared/agents/action-kinds";
import {
  ALLOWED_ACTIONS, allowedFor,
} from "../../supabase/functions/_shared/agents/allowlists";
import { canAutoExecute } from "../../supabase/functions/_shared/agents/types";

describe("outward classification", () => {
  it("marks everything that reaches a client as outward", () => {
    expect(isOutward("draft_email")).toBe(true);
    expect(isOutward("send_proposal")).toBe(true);
  });

  it("marks in-app work as not outward", () => {
    for (const k of ["create_task", "flag_risk", "create_proposal_draft", "create_client_project", "sync_client_to_surecontact", "schedule_followup"]) {
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
    expect(canAutoExecute("act_in_app", isOutward("create_proposal_draft"))).toBe(true);
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
    const doc = kindDocFor(["create_proposal_draft", "send_proposal"]);
    expect(doc).toContain("create_proposal_draft");
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

describe("destructive actions", () => {
  it("never auto-executes, at any autonomy level", () => {
    // The whole point of the flag. An autonomous agent can send an email you
    // would not have sent and you can apologise; it cannot un-delete an invoice.
    for (const level of ["propose", "act_in_app", "autonomous"] as const) {
      expect(canAutoExecute(level, isOutward("delete_record"), isDestructive("delete_record")), level)
        .toBe(false);
    }
  });

  it("treats an unrecognised kind as destructive", () => {
    expect(isDestructive("drop_the_database")).toBe(true);
  });

  it("leaves non-destructive kinds alone", () => {
    expect(isDestructive("create_task")).toBe(false);
    expect(canAutoExecute("act_in_app", isOutward("create_task"), isDestructive("create_task")))
      .toBe(true);
  });
});

describe("agent allowlists", () => {
  it("gives every agent a non-empty list", () => {
    // An agent whose allowlist went missing used to make def.allowedActions
    // undefined, which took down every turn for that agent.
    for (const [key, kinds] of Object.entries(ALLOWED_ACTIONS)) {
      expect(Array.isArray(kinds), key).toBe(true);
      expect(kinds.length, key).toBeGreaterThan(0);
    }
  });

  it("only names kinds that have an executor", () => {
    for (const [key, kinds] of Object.entries(ALLOWED_ACTIONS)) {
      for (const kind of kinds) {
        expect(ACTION_KINDS[kind], `${key} → ${kind}`).toBeDefined();
      }
    }
  });

  it("lets every agent propose a deletion, since the gate is the confirmation", () => {
    for (const key of Object.keys(ALLOWED_ACTIONS)) {
      expect(allowedFor(key), key).toContain("delete_record");
    }
  });

  it("returns an empty list for an unknown agent rather than undefined", () => {
    expect(allowedFor("nobody")).toEqual([]);
  });
});

describe("task priority mapping", () => {
  // project_tasks.priority is an enum: low | normal | high | urgent. There is
  // no "medium" — which is the word a model reaches for first, and it failed
  // the insert with a raw Postgres enum error.
  const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
  const map = (raw: unknown): string => {
    const v = String(raw ?? "").toLowerCase();
    if (PRIORITIES.has(v)) return v;
    if (v === "medium" || v === "med" || v === "moderate") return "normal";
    if (v === "critical" || v === "highest" || v === "p0") return "urgent";
    return "normal";
  };

  it("maps medium onto normal instead of failing the insert", () => {
    expect(map("medium")).toBe("normal");
  });

  it("passes real enum values through", () => {
    for (const p of ["low", "normal", "high", "urgent"]) expect(map(p)).toBe(p);
  });

  it("never returns a value outside the enum", () => {
    for (const raw of [undefined, null, "", "MEDIUM", "critical", "nonsense", 7]) {
      expect(PRIORITIES.has(map(raw)), String(raw)).toBe(true);
    }
  });
});

describe("the social kinds", () => {
  it("classifies scheduling a post as outward", () => {
    // This single flag IS the approval gate for social posting. Marked false,
    // every act_in_app client would have posts booked to go public that nobody
    // had read — which is the exact failure the gate exists to stop.
    expect(isOutward("schedule_social_post")).toBe(true);
  });

  it("leaves writing and cancelling free", () => {
    // A caption nobody sends costs nothing, so she should write rather than
    // ask. And the brake must never wait for approval — a post you have
    // decided to stop is a post you want stopped now.
    expect(isOutward("write_social_caption")).toBe(false);
    expect(isOutward("cancel_social_post")).toBe(false);
  });

  it("marks only the sensitive client message as always-approve", () => {
    expect(alwaysApproves("draft_client_message")).toBe(true);
    expect(alwaysApproves("request_client_photos")).toBe(false);
    expect(alwaysApproves("schedule_social_post")).toBe(false);
    expect(alwaysApproves("write_social_caption")).toBe(false);
    expect(alwaysApproves("cancel_social_post")).toBe(false);
  });

  it("assumes an unclassified kind always needs approval", () => {
    expect(alwaysApproves("post_something_unknown")).toBe(true);
  });

  it("does not make any of them destructive", () => {
    // Cancelling un-commits a send; it destroys nothing. Marking it
    // destructive would put the brake behind an approval.
    for (const k of [
      "write_social_caption", "schedule_social_post", "cancel_social_post",
      "request_client_photos", "draft_client_message",
    ]) {
      expect(isDestructive(k), k).toBe(false);
    }
  });

  it("leaves the existing kinds' classification alone", () => {
    // Adding alwaysApprove must not have quietly made anything else wait.
    for (const k of [
      "create_task", "complete_checklist_item", "draft_email", "flag_risk",
      "send_proposal", "schedule_followup", "create_client_project",
    ]) {
      expect(alwaysApproves(k), k).toBe(false);
    }
  });
});
