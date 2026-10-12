import { describe, expect, it } from "vitest";
import {
  capScopedCount,
  densityCellsForPoints,
  gridDensityCells,
  ISLET_SCOPE_CELLS,
  normalizeMapScope,
  resolveGridMapScope,
  scopedMapSize,
  scopedStatesNumber
} from "./mapScope";

describe("resolveGridMapScope", () => {
  it("keeps the world scope on the legacy path", () => {
    expect(resolveGridMapScope("world", 500, 10000, 1920, 1080)).toBeNull();
  });

  it("shrinks the canvas so the cell spacing equals the full map's", () => {
    const resolved = resolveGridMapScope("province", 500, 10000, 1920, 1080)!;
    expect(resolved.cellsDesired).toBe(500);
    const fullSpacing = Math.sqrt((1920 * 1080) / 10000);
    const scopedSpacing = Math.sqrt((resolved.width * resolved.height) / resolved.cellsDesired);
    expect(scopedSpacing).toBeCloseTo(fullSpacing, 0);
    expect(resolved.scope).toMatchObject({ kind: "province", densityCells: 10000, canvasWidth: 1920 });
  });

  it("clamps province cells and uses a fixed islet size", () => {
    expect(resolveGridMapScope("province", 5, 10000, 960, 540)!.cellsDesired).toBe(100);
    expect(resolveGridMapScope("islet", 9999, 10000, 960, 540)!.cellsDesired).toBe(ISLET_SCOPE_CELLS);
  });

  it("does not grow a canvas whose density is already below the target", () => {
    expect(resolveGridMapScope("province", 2500, densityCellsForPoints(1), 960, 540)).toBeNull();
  });
});

describe("scope-dependent counts", () => {
  const scope = resolveGridMapScope("province", 500, 10000, 960, 540)!.scope;
  const islet = resolveGridMapScope("islet", 0, 10000, 960, 540)!.scope;

  it("leaves world maps untouched", () => {
    expect(capScopedCount(undefined, "states", 18, 0)).toBe(18);
    expect(scopedStatesNumber({}, 18)).toBe(18);
  });

  it("caps counts and keeps one where any land is livable", () => {
    expect(capScopedCount(scope, "states", 18, 300)).toBe(2);
    expect(capScopedCount(islet, "cultures", 12, 1)).toBe(1);
    expect(capScopedCount(islet, "cultures", 12, 0)).toBe(0);
    expect(capScopedCount(scope, "states", 0, 50)).toBe(1);
    expect(capScopedCount(scope, "religions", 0)).toBe(0);
  });

  it("measures towns against full-map density, not the few scoped points", () => {
    expect(gridDensityCells({ points: new Array(500), scope })).toBe(10000);
    expect(gridDensityCells({ points: new Array(9975) })).toBe(9975);
  });

  it("scales the globe share with the canvas", () => {
    expect(scopedMapSize(12.9, undefined)).toBe(12.9);
    expect(scopedMapSize(12.9, scope)).toBeCloseTo(12.9 * scope.factor);
  });

  it("normalizes unknown scopes to world", () => {
    expect(normalizeMapScope("islet")).toBe("islet");
    expect(normalizeMapScope("galaxy")).toBe("world");
  });
});
