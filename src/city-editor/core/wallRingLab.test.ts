import { describe, expect, it } from "vitest";
import { runWallRingLab, type WallRingLabCase } from "./wallRingLab";

const base: WallRingLabCase = {
  grid: "voronoi",
  size: "large",
  seed: "lab-0",
  cityRadiusMeters: 561,
  ringShares: [0.2, 0.5, 1],
  castle: "standard",
  gates: 4,
  minGapCells: 2,
  minFreeCells: 7,
  minFreeAreaRatio: 3
};

describe("wall ring lab", () => {
  it("nests rings and routes every artery through each wall on a large Voronoi mesh", () => {
    const result = runWallRingLab(base);
    expect(result.rings.map(r => r.faces)).toEqual([...result.rings.map(r => r.faces)].sort((a, b) => a - b));
    expect(result.routesReached).toBe(result.routesPlanned);
    expect(result.rings[0].gates).toBeGreaterThanOrEqual(2);
    expect(result.rings.slice(0, -1).every(r => (r.gapCells ?? 0) >= 2)).toBe(true);
    expect(result.castleAreaM2).toBeGreaterThanOrEqual(result.castleTargetM2);
    expect(result.ok).toBe(true);
  });

  it("reports a micro castle that leaves the core without streets", () => {
    const result = runWallRingLab({ ...base, grid: "hex", size: "micro", cityRadiusMeters: 100, ringShares: [1] });
    expect(result.ok).toBe(false);
    expect(result.failures.some(f => f.startsWith("free-cells"))).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const a = runWallRingLab(base);
    const b = runWallRingLab(base);
    expect(a.failures).toEqual(b.failures);
    expect(a.rings).toEqual(b.rings);
  });
});
