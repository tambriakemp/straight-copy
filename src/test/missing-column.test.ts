// This repo and Lovable's agent both write migrations, and only Lovable
// applies them — so the app routinely runs against a schema one column
// behind the code. PostgREST rejects a select naming a column that does
// not exist, whole, which turned a missing pill into an empty Clients
// page. This is how that case is recognised.
import { describe, it, expect } from "vitest";
import { isMissingColumn, isMissingRelation } from "@/lib/missingColumn";

describe("isMissingColumn", () => {
  it("recognises the Postgres code", () => {
    expect(isMissingColumn({ code: "42703", message: "whatever" })).toBe(true);
  });

  it("recognises the message when the code did not survive", () => {
    // The real one, as PostgREST sent it.
    expect(isMissingColumn({ message: "column clients.internal does not exist" })).toBe(true);
    expect(isMissingColumn({ code: null, message: 'column "internal" does not exist' })).toBe(true);
  });

  it("says no to every other failure", () => {
    // A fallback that fires on any error would silently drop a column the
    // database does have, the first time the network blipped.
    expect(isMissingColumn({ code: "42501", message: "permission denied for table clients" })).toBe(false);
    expect(isMissingColumn({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(isMissingColumn({ message: "Failed to fetch" })).toBe(false);
  });

  it("says no when there is no error at all", () => {
    expect(isMissingColumn(null)).toBe(false);
    expect(isMissingColumn(undefined)).toBe(false);
    expect(isMissingColumn({})).toBe(false);
  });
});

describe("isMissingRelation", () => {
  it("recognises a table or view that does not exist yet", () => {
    expect(isMissingRelation({ code: "42P01", message: 'relation "public.client_notes" does not exist' })).toBe(true);
    expect(isMissingRelation({ code: "PGRST205", message: "Could not find the table 'public.client_logins_list'" })).toBe(true);
  });

  it("recognises it from the message alone", () => {
    expect(isMissingRelation({ message: 'relation "client_logins_list" does not exist' })).toBe(true);
  });

  it("says no to every other failure", () => {
    // A tab that swallowed any error would read "no logins saved" for a
    // client whose logins failed to load, which is a worse lie than a toast.
    expect(isMissingRelation({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRelation({ message: "Failed to fetch" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });

  it("does not confuse a missing column for a missing table", () => {
    expect(isMissingRelation({ code: "42703", message: "column clients.internal does not exist" })).toBe(false);
    expect(isMissingColumn({ code: "42P01", message: "relation x does not exist" })).toBe(false);
  });
});
