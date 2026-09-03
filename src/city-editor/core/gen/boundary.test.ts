import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Phase G0 (docs/city-editor/実装計画.md): City Editor owns its generation code
// under ./ (vendored from the now-frozen src/city-generator/). Nothing under
// src/city-editor/ may pull the standalone module back in, so it can eventually
// be deleted without touching the editor.

// vitest runs with the repo root as cwd (matches src/generators/*.test.ts).
const cityEditorRoot = resolve(process.cwd(), "src/city-editor");
const selfPath = resolve(cityEditorRoot, "core/gen/boundary.test.ts");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// An `import`/`export … from "…"` or `import("…")` whose module path mentions the
// standalone generator dir. Doc-comment mentions of docs/city-generator/* do not
// match (no quote immediately after `from`).
const pullsInStandaloneGenerator = /\b(?:from|import)\s*\(?\s*["'][^"']*\/city-generator\//;

describe("City Editor ↔ City Generator module boundary", () => {
  it("no file under src/city-editor/ imports from src/city-generator/", () => {
    const offenders = tsFiles(cityEditorRoot)
      .filter(file => file !== selfPath)
      .filter(file => pullsInStandaloneGenerator.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
