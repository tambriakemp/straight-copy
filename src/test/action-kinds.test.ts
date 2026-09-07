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
import {
  assigneeKind, taskPriority, taskStatus, taskSize, taskPlatform,
  TASK_SIZES, TASK_PLATFORMS,
} from "../../supabase/functions/_shared/agents/task-fields";
import {
  CLIENT_TIERS, PROJECT_STATUSES,
} from "../../supabase/functions/_shared/agents/client-fields";

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

describe("task field mapping", () => {
  // These used to be a copy of the mapping pasted into this file, which could
  // not fail when the real code changed. They now import the code that runs.
  const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
  const STATUSES = new Set([
    "backlog", "ready_for_claude", "in_progress", "needs_review", "blocked", "complete",
  ]);
  const KINDS = new Set(["unassigned", "admin", "claude", "auto", "client", "agency"]);

  it("maps medium onto normal instead of failing the insert", () => {
    // project_tasks.priority has no "medium" — the word a model reaches for
    // first, which failed the insert with a raw Postgres enum error.
    expect(taskPriority("medium")).toBe("normal");
  });

  it("passes real priority values through", () => {
    for (const p of PRIORITIES) expect(taskPriority(p)).toBe(p);
  });

  it("never returns a priority outside the enum", () => {
    for (const raw of [undefined, null, "", "MEDIUM", "critical", "nonsense", 7]) {
      expect(PRIORITIES.has(taskPriority(raw)), String(raw)).toBe(true);
    }
  });

  it("maps todo onto backlog", () => {
    for (const raw of ["todo", "to do", "To-Do", "open", "new", "pending"]) {
      expect(taskStatus(raw), raw).toBe("backlog");
    }
  });

  it("never returns a status outside the enum", () => {
    for (const raw of [undefined, null, "", "shipped", "nonsense", 7]) {
      expect(STATUSES.has(taskStatus(raw)), String(raw)).toBe(true);
    }
  });

  it("assigns queue-bound work to claude, so the queue can see it", () => {
    // The bug this exists to stop: assignee_kind was hardcoded to 'agency', so
    // trg_fire_queue_on_ready logged not_queue_work and an agent could never
    // put anything in the coding queue.
    expect(assigneeKind(undefined, "ready_for_claude")).toBe("claude");
    expect(assigneeKind(null, "ready_for_claude")).toBe("claude");
    expect(assigneeKind("", "ready_for_claude")).toBe("claude");
  });

  it("leaves work in every other column with the agency", () => {
    for (const status of ["backlog", "in_progress", "needs_review", "blocked", "complete"]) {
      expect(assigneeKind(undefined, status), status).toBe("agency");
    }
  });

  it("lets an explicit assignee win over the default", () => {
    expect(assigneeKind("admin", "ready_for_claude")).toBe("admin");
    expect(assigneeKind("claude", "backlog")).toBe("claude");
    expect(assigneeKind("CLIENT", "backlog")).toBe("client");
  });

  it("translates the words a model reaches for", () => {
    for (const raw of ["ai", "agent", "claude_code"]) {
      expect(assigneeKind(raw, "backlog"), raw).toBe("claude");
    }
  });

  it("never returns an assignee outside the enum", () => {
    for (const raw of [undefined, null, "", "robot", 7, {}]) {
      expect(KINDS.has(assigneeKind(raw, "backlog")), String(raw)).toBe(true);
      expect(KINDS.has(assigneeKind(raw, "ready_for_claude")), String(raw)).toBe(true);
    }
  });
});

describe("board actions", () => {
  const BOARD = [
    "create_task", "update_task", "move_task_status", "post_task_comment",
    "add_acceptance_criteria", "update_acceptance_criteria",
  ];
  const EVERY_AGENT = Object.keys(ALLOWED_ACTIONS);

  it("gives the developer agent the actions its mission describes", () => {
    // Without these it could judge a task's readiness and then do nothing
    // about it, which is what every developer run used to amount to.
    for (const kind of BOARD) expect(allowedFor("developer"), kind).toContain(kind);
  });

  it("gives every agent the whole board, not just the engineering one", () => {
    // The board is where all the agency's work lives. An agent that can see a
    // task is misfiled or finished, and can only open a SECOND task saying so,
    // fills the board with near-duplicates and gets the original actioned by
    // nobody.
    expect(EVERY_AGENT.length).toBe(6);
    for (const key of EVERY_AGENT) {
      for (const kind of BOARD) expect(allowedFor(key), `${key}/${kind}`).toContain(kind);
    }
  });

  it("does not hand out task deletion with the rest of CRUD", () => {
    // Delete is delete_record, which is destructive and therefore waits for a
    // person at every autonomy level. If it ever became a board kind, a fully
    // autonomous agent could clear a board unattended.
    expect(BOARD).not.toContain("delete_record");
    expect(isDestructive("delete_record")).toBe(true);
    expect(canAutoExecute("autonomous", false, isDestructive("delete_record"))).toBe(false);
  });

  it("keeps them internal and non-destructive, so they can run unattended", () => {
    for (const kind of BOARD) {
      expect(isOutward(kind), kind).toBe(false);
      expect(isDestructive(kind), kind).toBe(false);
      expect(alwaysApproves(kind), kind).toBe(false);
      expect(canAutoExecute("act_in_app", isOutward(kind), isDestructive(kind)), kind).toBe(true);
    }
  });

  it("still holds every board action behind propose-only autonomy", () => {
    for (const kind of BOARD) {
      expect(canAutoExecute("propose", isOutward(kind)), kind).toBe(false);
    }
  });

  it("tells the model that ready_for_claude starts a run", () => {
    // The whole risk of this action: the transition spends a coding session.
    // If the schema text stops saying so, the model stops knowing it.
    const doc = kindDocFor(allowedFor("developer"));
    expect(doc).toContain("move_task_status");
    expect(doc).toContain("ready_for_claude");
    expect(ACTION_KINDS.move_task_status.purpose).toMatch(/coding run/);
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

describe("onboarding a client", () => {
  const ONBOARD = ["create_client", "create_client_project"];

  it("gives both client-facing agents the ability to take someone on", () => {
    // The gap this closes: asked to add the client Bree just got off the phone
    // with, these could only open a task reminding a person to do it by hand.
    for (const key of ["client-triage", "client-engagement"]) {
      for (const kind of ONBOARD) expect(allowedFor(key), `${key}/${kind}`).toContain(kind);
    }
  });

  it("keeps onboarding internal, so it completes inside the conversation", () => {
    // Both write rows in our own database and contact nobody. If either were
    // ever marked outward, an act_in_app agent would stop being able to
    // finish the job and would go back to describing the form to go and fill.
    for (const kind of ONBOARD) {
      expect(isOutward(kind), kind).toBe(false);
      expect(isDestructive(kind), kind).toBe(false);
      expect(alwaysApproves(kind), kind).toBe(false);
      expect(canAutoExecute("act_in_app", isOutward(kind), isDestructive(kind)), kind).toBe(true);
    }
  });

  it("still holds them behind propose-only autonomy", () => {
    for (const kind of ONBOARD) {
      expect(canAutoExecute("propose", isOutward(kind)), kind).toBe(false);
    }
  });

  it("tells the model the client is the person, not the business", () => {
    // clients.business_name is deprecated and owned by the primary company's
    // trigger. A model that files the business under contact_name produces a
    // roster listing companies where people should be — which is the exact
    // confusion the company table was added to end.
    const doc = kindDocFor(allowedFor("client-triage"));
    expect(doc).toContain("create_client");
    expect(ACTION_KINDS.create_client.purpose).toMatch(/PERSON/);
    expect(ACTION_KINDS.create_client.payload).toContain("contact_name");
    expect(ACTION_KINDS.create_client.payload).toContain("company");
    // business_name must not be offered: writing it races the trigger.
    expect(ACTION_KINDS.create_client.payload).not.toContain("business_name");
  });

  it("does not let an agent invent a pipeline stage", () => {
    // The column has no CHECK, so an invented stage lands a client somewhere
    // no screen renders and no sweep looks. The default is the only safe start.
    expect(ACTION_KINDS.create_client.payload).not.toContain("pipeline_stage");
  });

  it("offers a project's real optional detail, and only valid values", () => {
    const p = ACTION_KINDS.create_client_project.payload;
    for (const field of ["status", "notes", "company_id", "timezone"]) {
      expect(p, field).toContain(field);
    }
    for (const status of PROJECT_STATUSES) expect(p, status).toContain(status);
    for (const tier of CLIENT_TIERS) {
      expect(ACTION_KINDS.create_client.payload, tier).toContain(tier);
    }
  });
});

describe("client field values", () => {
  it("matches the CHECK constraints the inserts have to satisfy", () => {
    // These are asserted against, not coerced — a tier nobody sells has no
    // obvious right answer, so the executor sends it back with the list.
    expect(CLIENT_TIERS).toEqual(["launch", "growth", "social"]);
    expect(PROJECT_STATUSES).toEqual(["active", "paused", "complete", "archived"]);
  });
});

describe("editing a task rather than replacing it", () => {
  it("lets update_task reach every field the board shows", () => {
    // Read/write asymmetry is the trap: a field an agent can write but not
    // read gets edited blind. These are the ones the task sheet exposes.
    const p = ACTION_KINDS.update_task.payload;
    for (const field of [
      "name", "description", "due_date", "priority", "status", "assignee_kind",
      "size", "platform", "epic_id", "tags", "url", "design_url", "blocked_by",
    ]) {
      expect(p, field).toContain(field);
    }
  });

  it("says that omitted fields are left alone and null clears", () => {
    // The whole risk of a partial update. A model that thinks it must send
    // every field will null a due date every time it fixes a typo in a name.
    const p = ACTION_KINDS.update_task.payload;
    expect(p).toMatch(/null to clear/);
    expect(ACTION_KINDS.update_task.purpose).toMatch(/omit/i);
  });

  it("warns that promoting a task spends a coding run", () => {
    // True of update_task now as well as move_task_status, since status is one
    // of the fields it can set — and six agents hold that lever, not one.
    expect(ACTION_KINDS.move_task_status.purpose).toMatch(/coding run/);
    const doc = kindDocFor(allowedFor("social-media"));
    expect(doc).toContain("ready_for_claude");
  });

  it("keeps the whole board internal and reversible", () => {
    for (const kind of [
      "create_task", "update_task", "move_task_status", "post_task_comment",
      "add_acceptance_criteria", "update_acceptance_criteria",
    ]) {
      expect(isOutward(kind), kind).toBe(false);
      expect(isDestructive(kind), kind).toBe(false);
      expect(alwaysApproves(kind), kind).toBe(false);
      expect(canAutoExecute("act_in_app", isOutward(kind), isDestructive(kind)), kind).toBe(true);
      expect(canAutoExecute("propose", isOutward(kind)), kind).toBe(false);
    }
  });

  it("separates appending criteria from ticking and removing them", () => {
    // Appending is safe; a tick is a claim something is done and a removal
    // takes away a line a person may have written by hand.
    expect(ACTION_KINDS.add_acceptance_criteria.payload).toContain("criteria");
    expect(ACTION_KINDS.update_acceptance_criteria.payload).toContain("remove");
    expect(ACTION_KINDS.update_acceptance_criteria.payload).toContain("done");
    expect(ACTION_KINDS.update_acceptance_criteria.purpose).toMatch(/check before you tick/i);
  });
});

describe("task size and platform", () => {
  it("reads the words people actually type", () => {
    expect(taskSize("small")).toBe("S");
    expect(taskSize("Medium")).toBe("M");
    expect(taskSize("l")).toBe("L");
    expect(taskPlatform("frontend")).toBe("web");
    expect(taskPlatform("iOS")).toBe("native");
    expect(taskPlatform("api")).toBe("backend");
  });

  it("returns null for anything else, rather than guessing", () => {
    // Distinct from coercion on purpose. On a partial update, "I did not
    // understand that" must not become "set this to nothing" — that silently
    // wipes a size someone chose.
    for (const raw of ["XL", "huge", "", null, undefined, 7]) {
      expect(taskSize(raw), String(raw)).toBe(null);
    }
    for (const raw of ["desktop", "watch", "", null]) {
      expect(taskPlatform(raw), String(raw)).toBe(null);
    }
  });

  it("matches the CHECK constraints on project_tasks", () => {
    expect(TASK_SIZES).toEqual(["S", "M", "L"]);
    expect(TASK_PLATFORMS).toEqual(["web", "native", "backend", "all"]);
  });
});
