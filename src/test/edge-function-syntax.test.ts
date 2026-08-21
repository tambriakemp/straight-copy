import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

/**
 * Every edge function parses.
 *
 * Nothing else checks this. `tsc -p tsconfig.app.json` only sees the handful of
 * shared modules the app imports, and the rest of `supabase/functions/` is
 * checked for the first time by Deno, at deploy, on a database we cannot deploy
 * to ourselves — so a syntax error ships, the function fails to boot, and it
 * looks like a frontend bug.
 *
 * The specific way it happened: agent missions are template literals full of
 * `code spans`, and one unescaped backtick ends the string early. Prose about
 * tools is exactly where that keeps happening.
 *
 * Parse only — no type checking, no module resolution. `npm:` and `jsr:`
 * specifiers are meaningless to tsc and are not the point.
 */
const ROOT = join(__dirname, "../../supabase/functions");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith(".ts") && !e.name.endsWith(".d.ts") ? [full] : [];
  });
}

const files = walk(ROOT).sort();

describe("edge functions parse", () => {
  it("finds them at all, so a bad path cannot pass vacuously", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f] as const))(
    "%s",
    (_name, path) => {
      const src = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.ES2022,
        false,
        ts.ScriptKind.TS,
      );
      // Not public API, but it is the only way to get syntax diagnostics
      // without asking tsc to resolve Deno's module specifiers.
      const diagnostics =
        (src as unknown as { parseDiagnostics?: ts.DiagnosticWithLocation[] })
          .parseDiagnostics ?? [];
      const messages = diagnostics.map((d) => {
        const { line, character } = src.getLineAndCharacterOfPosition(d.start);
        return `${line + 1}:${character + 1} ${
          ts.flattenDiagnosticMessageText(d.messageText, " ")
        }`;
      });
      expect(messages).toEqual([]);
    },
  );
});
