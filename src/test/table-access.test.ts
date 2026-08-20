// This is the security boundary. Agent tools run with the service role, which
// bypasses RLS, so nothing below this file stops an agent reading a table —
// the allowlist IS the access control. It gets tested accordingly.
import { describe, it, expect } from "vitest";
import {
  READABLE, NEVER_READABLE, FORBIDDEN_COLUMN,
  isReadable, projectionFor, isFilterable, clampLimit,
  tableForEntity, searchableEntities,
} from "../../supabase/functions/_shared/agents/table-access";

describe("fail closed", () => {
  it("refuses a table that is not listed", () => {
    expect(isReadable("some_new_table")).toBe(false);
    expect(projectionFor("some_new_table")).toEqual([]);
  });

  it("refuses every auth, credential and blob table", () => {
    for (const table of NEVER_READABLE) {
      expect(isReadable(table), table).toBe(false);
      expect(projectionFor(table), table).toEqual([]);
      expect(isFilterable(table, "id"), table).toBe(false);
    }
  });

  it("refuses the tables an agent could use to read other conversations", () => {
    // A privacy surprise and a context bomb, so excluded deliberately.
    expect(isReadable("agent_conversations")).toBe(false);
    expect(isReadable("agent_messages")).toBe(false);
  });
});

describe("column redaction", () => {
  it("never returns a credential-shaped column, even if a table lists one", () => {
    for (const [table, access] of Object.entries(READABLE)) {
      for (const column of projectionFor(table)) {
        expect(FORBIDDEN_COLUMN.test(column), `${table}.${column}`).toBe(false);
      }
      // And the source list itself should be clean.
      expect(access.columns.length).toBeGreaterThan(0);
    }
  });

  it("catches the shapes that matter", () => {
    for (const column of [
      "token", "public_ingest_key", "password", "api_key", "token_hash",
      "pin", "client_signature_data", "SECRET",
    ]) {
      expect(FORBIDDEN_COLUMN.test(column), column).toBe(true);
    }
  });

  it("does not block key-shaped columns that are ordinary data", () => {
    // `_key` wholesale would take out metric_key and agents.key, which agents
    // genuinely need — so the credential patterns are enumerated instead.
    for (const column of ["metric_key", "event_key", "key", "slug"]) {
      expect(FORBIDDEN_COLUMN.test(column), column).toBe(false);
    }
  });

  it("does not withhold ordinary columns", () => {
    for (const column of ["id", "business_name", "amount_cents", "status", "content"]) {
      expect(FORBIDDEN_COLUMN.test(column), column).toBe(false);
    }
  });

  it("ignores a requested column that is not on the table", () => {
    const cols = projectionFor("clients", ["business_name", "project_secrets", "nonsense"]);
    expect(cols).toEqual(["business_name"]);
  });

  it("falls back to id when every requested column was denied", () => {
    // Returning the full projection here would hand over exactly what the
    // request was refused.
    expect(projectionFor("clients", ["client_account_access", "made_up"])).toEqual(["id"]);
  });

  it("never lets a forbidden column be filtered on", () => {
    expect(isFilterable("clients", "business_name")).toBe(true);
    expect(isFilterable("clients", "token_hash")).toBe(false);
    expect(isFilterable("clients", "not_a_column")).toBe(false);
  });
});

describe("limits", () => {
  it("clamps to the table's ceiling however large the ask", () => {
    expect(clampLimit("client_proposals", 10_000)).toBe(READABLE.client_proposals.maxLimit);
    expect(clampLimit("clients", 999)).toBe(READABLE.clients.maxLimit);
  });

  it("handles absent, zero and negative requests", () => {
    for (const bad of [undefined, 0, -5, Number.NaN]) {
      const n = clampLimit("clients", bad as number);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(READABLE.clients.maxLimit);
    }
  });

  it("gives an unknown table a small default rather than throwing", () => {
    expect(clampLimit("nope", 100)).toBe(20);
  });
});

describe("entities", () => {
  it("resolves the friendly names an agent will reach for", () => {
    expect(tableForEntity("client")).toBe("clients");
    expect(tableForEntity("proposal")).toBe("client_proposals");
    expect(tableForEntity("invoice")).toBe("project_invoices");
    expect(tableForEntity("task")).toBe("project_tasks");
  });

  it("returns null for an unknown entity", () => {
    expect(tableForEntity("unicorn")).toBeNull();
  });

  it("only offers entities whose table has searchable columns", () => {
    for (const entity of searchableEntities()) {
      const table = tableForEntity(entity)!;
      expect(READABLE[table].searchable?.length, entity).toBeGreaterThan(0);
    }
  });

  it("gives every searchable column a home in its own projection", () => {
    for (const [table, access] of Object.entries(READABLE)) {
      for (const column of access.searchable ?? []) {
        expect(access.columns, `${table}.${column}`).toContain(column);
      }
      for (const column of access.long ?? []) {
        expect(access.columns, `${table}.${column}`).toContain(column);
      }
    }
  });
});
