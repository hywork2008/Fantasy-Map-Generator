import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import inventory from "../../../docs/plan/data/ce-meshless-m0-inventory.json";
import coverage from "../../../docs/plan/data/ce-meshless-m9-coverage.json";
import { VECTOR_RELEASE_CHANNEL } from "./vectorRelease";

describe("M9 release decision evidence", () => {
  it("covers every original feature and retains preview status while parity limits remain", () => {
    expect(coverage.features.map(f => f.id).sort()).toEqual(inventory.features.map(f => f.id).sort());
    expect(coverage.releaseChannel).toBe(VECTOR_RELEASE_CHANNEL);
    expect(coverage.automaticMigration).toBe(false);
    expect(coverage.features.some(f => f.status === "limited")).toBe(true);
    for (const f of coverage.features) {
      expect(f.evidence.length).toBeGreaterThan(30);
      expect(f.tests.length).toBeGreaterThan(0);
      for (const path of f.tests)
        expect(readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8")).toContain("it(");
    }
  });
});
