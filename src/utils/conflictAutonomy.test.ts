import { describe, expect, it } from "vitest";
import { DEFAULT_CONFLICT_AUTONOMY, normalizeConflictAutonomy } from "./conflictAutonomy";

describe("normalizeConflictAutonomy", () => {
  it("preserves both known policies unchanged", () => {
    expect(normalizeConflictAutonomy("autonomous")).toBe("autonomous");
    expect(normalizeConflictAutonomy("playerDirected")).toBe("playerDirected");
  });

  it("falls back to DEFAULT_CONFLICT_AUTONOMY for missing or invalid input", () => {
    expect(normalizeConflictAutonomy(undefined)).toBe(DEFAULT_CONFLICT_AUTONOMY);
    expect(normalizeConflictAutonomy("unexpected")).toBe(DEFAULT_CONFLICT_AUTONOMY);
    expect(normalizeConflictAutonomy(null)).toBe(DEFAULT_CONFLICT_AUTONOMY);
  });
});
