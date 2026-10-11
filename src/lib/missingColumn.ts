// Recognising "the database does not have that column yet".
//
// This repo and Lovable's agent both write migrations, and only Lovable
// applies them — so between a push and that deploy, the app is running
// against a schema one column behind the code. A select naming a column
// that does not exist is rejected whole, which turns a missing pill into
// an empty page.
//
// So a query for a newly added column is written to fall back to one
// without it. That is self-healing in both directions: it works before the
// migration lands and stops costing anything after, with no second deploy
// to remember.

export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

/** 42703 is undefined_column. The message is checked too because the code
 *  does not survive every path PostgREST can take to report it. */
export function isMissingColumn(error: PostgrestLikeError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

/**
 * The same gap, a whole table or view wide: 42P01 is undefined_table, and
 * PostgREST answers PGRST205 for a relation missing from its schema cache.
 *
 * A tab whose table has not been created yet should read empty, not throw
 * a toast on every page load — the page around it works perfectly well.
 */
export function isMissingRelation(error: PostgrestLikeError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /(relation|table) .* does not exist/i.test(error.message ?? "")
    || /could not find the (table|relation)/i.test(error.message ?? "");
}
