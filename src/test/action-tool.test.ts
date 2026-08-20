// Actions used to be executed after the model had already stopped, so it never
// saw whether its own work succeeded — which is how a turn described a proposal
// it had never actually created. These pin the behaviour that fixes that.
import { describe, it, expect, vi } from "vitest";
import {
  actionToolDefinition, executeActionTool, type ActionToolContext,
} from "../../supabase/functions/_shared/agents/action-tool";

const rows: Record<string, unknown>[] = [];

function stubDb() {
  return {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        const stored = { id: `id-${rows.length}`, ...row };
        rows.push(stored);
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: stored, error: null }) }) };
      },
    }),
  };
}

const ctx = (over: Partial<ActionToolContext> = {}): ActionToolContext => ({
  sb: stubDb(),
  agentId: "agent-1",
  agentName: "Bria",
  autonomy: "act_in_app",
  allowedActions: ["create_task", "draft_proposal", "draft_email", "delete_record", "create_client_project"],
  runId: "run-1",
  conversationId: "conv-1",
  actionIds: [],
  taken: new Map(),
  count: { n: 0 },
  ...over,
});

describe("executeActionTool", () => {
  it("runs a safe action and hands back the real result", async () => {
    // The whole unlock: the id comes back so the next call can use it.
    const execute = vi.fn().mockResolvedValue({
      ok: true, result: { client_project_id: "proj-9", type: "marketing" },
    });
    const out = await executeActionTool(ctx(), {
      kind: "create_client_project", title: "Create Menovia Social Media",
      payload: { client_id: "c1", name: "Menovia Social Media", type: "marketing" },
    }, execute);

    expect(execute).toHaveBeenCalled();
    const body = JSON.parse(out.content);
    expect(body.status).toBe("done");
    expect(body.result.client_project_id).toBe("proj-9");
  });

  it("queues an outward action and says plainly that nothing happened", async () => {
    const execute = vi.fn();
    const out = await executeActionTool(ctx(), {
      kind: "draft_email", title: "Email the client", payload: { to: "a@b.com" },
    }, execute);

    expect(execute).not.toHaveBeenCalled();
    const body = JSON.parse(out.content);
    expect(body.status).toBe("awaiting_approval");
    expect(body.note).toContain("NOTHING HAS HAPPENED YET");
  });

  it("queues a deletion even for a fully autonomous agent", async () => {
    const execute = vi.fn();
    const out = await executeActionTool(ctx({ autonomy: "autonomous" }), {
      kind: "delete_record", title: "Remove test invoice", payload: { table: "project_invoices", id: "x" },
    }, execute);
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(out.content).status).toBe("awaiting_approval");
  });

  it("refuses a kind the agent does not have, instead of dropping it", async () => {
    // Silently discarding one wasted the whole turn and left the model
    // believing it had acted.
    const out = await executeActionTool(ctx({ allowedActions: ["create_task"] }), {
      kind: "send_proposal", title: "Send it", payload: {},
    }, vi.fn());
    expect(out.ok).toBe(false);
    expect(out.content).toContain("create_task");
  });

  it("tells the model when its own action failed, rather than reporting success", async () => {
    const out = await executeActionTool(ctx(), {
      kind: "draft_proposal", title: "Draft it", payload: { client_id: "c1" },
    }, vi.fn().mockResolvedValue({ ok: false, error: "missing required sections: investment" }));
    expect(out.ok).toBe(false);
    const body = JSON.parse(out.content);
    expect(body.status).toBe("failed");
    expect(body.error).toContain("investment");
  });

  it("does not repeat an identical action within a turn", async () => {
    const c = ctx();
    const execute = vi.fn().mockResolvedValue({ ok: true, result: {} });
    const args = { kind: "create_task", title: "Do the thing", payload: { name: "x", client_project_id: "p" } };
    await executeActionTool(c, args, execute);
    const second = await executeActionTool(c, args, execute);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second.content).note).toContain("already");
  });

  it("stops after eight actions in one turn", async () => {
    const c = ctx();
    const execute = vi.fn().mockResolvedValue({ ok: true, result: {} });
    for (let i = 0; i < 8; i++) {
      await executeActionTool(c, {
        kind: "create_task", title: `Task ${i}`, payload: { n: i },
      }, execute);
    }
    const overflow = await executeActionTool(c, {
      kind: "create_task", title: "One too many", payload: { n: 99 },
    }, execute);
    expect(overflow.ok).toBe(false);
    expect(overflow.content).toContain("limit");
  });

  it("requires a title, so an approval card is never blank", async () => {
    const out = await executeActionTool(ctx(), { kind: "create_task", title: "  ", payload: {} }, vi.fn());
    expect(out.ok).toBe(false);
  });

  it("records every action id for the chat to render", async () => {
    const c = ctx();
    await executeActionTool(c, { kind: "create_task", title: "A", payload: { a: 1 } },
      vi.fn().mockResolvedValue({ ok: true }));
    await executeActionTool(c, { kind: "draft_email", title: "B", payload: { b: 2 } }, vi.fn());
    expect(c.actionIds).toHaveLength(2);
  });
});

describe("actionToolDefinition", () => {
  it("offers only the kinds this agent has", () => {
    const def = actionToolDefinition(["create_task", "flag_risk"]);
    const schema = def.input_schema as { properties: { kind: { enum: string[] } } };
    expect(schema.properties.kind.enum).toEqual(["create_task", "flag_risk"]);
  });

  it("tells the model not to claim work it did not confirm", () => {
    const def = actionToolDefinition(["create_task"]);
    expect(String(def.description)).toContain("Never describe work as done");
  });
});
