import { describe, expect, it } from "vitest";
import {
  buildDomainsFromVoid,
  CAVE_VOID_THRESHOLD,
  type CaveSystemCells,
  computeSubterraneanVoid,
  generateCaveSystems
} from "./caveSystems";

/** Builds a small grid of cells in a line (0 - 1 - 2 - ... - n-1), each a neighbor of its adjacent indices. */
function makeLineCells(heights: number[]): CaveSystemCells {
  const n = heights.length;
  const c: number[][] = heights.map((_, index) => {
    const neighbors: number[] = [];
    if (index > 0) neighbors.push(index - 1);
    if (index < n - 1) neighbors.push(index + 1);
    return neighbors;
  });
  return {
    i: heights.map((_, index) => index),
    c,
    h: heights,
    r: new Array(n).fill(0),
    area: new Array(n).fill(10)
  };
}

describe("computeSubterraneanVoid", () => {
  it("assigns zero void to sub-land cells", () => {
    const cells = makeLineCells([10, 60, 60]);
    const voidFraction = computeSubterraneanVoid("seed", cells, undefined);
    expect(voidFraction[0]).toBe(0);
  });

  it("is deterministic for the same seed", () => {
    const cells = makeLineCells([60, 60, 60]);
    const a = computeSubterraneanVoid("seed", cells, undefined);
    const b = computeSubterraneanVoid("seed", cells, undefined);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("keeps caves a minority of low-elevation (basin/carbonate) land, not a near-blanket coverage", () => {
    // Regression test for a real bug found via live Playwright verification: height < 38 with no
    // river always classifies as basin or carbonate (geologicalProvinces.ts's low-elevation
    // default), which is most ordinary farmland. Naive threshold-only gating made ~75% of basin
    // cells "cave" (its 0.25–0.45 void range mostly clears a 0.3 threshold), which — since basin
    // covers huge contiguous stretches of lowland — percolated into a single blob spanning nearly
    // the whole landmass instead of a rare, special feature.
    const n = 2000;
    const heights = new Array(n).fill(25); // low elevation ⇒ always basin or carbonate
    const cells = makeLineCells(heights);
    const voidFraction = computeSubterraneanVoid("coverage-seed", cells, undefined);
    const caveCount = Array.from(voidFraction).filter(v => v > 0).length;
    const caveShare = caveCount / n;
    expect(caveShare).toBeLessThan(0.2);
  });
});

describe("generateCaveSystems", () => {
  it("produces no domains when no cell clears the void threshold", () => {
    // Placer province (height 20-48 with a river) always has void 0 — guaranteed empty result.
    const cells = makeLineCells([30, 30, 30, 30]);
    cells.r = [1, 1, 1, 1];
    const domains = generateCaveSystems("seed", cells, undefined);
    expect(domains).toEqual([]);
    expect(Array.from(cells.subterraneanDomain!)).toEqual([0, 0, 0, 0]);
  });

  it("groups a long connected run of high-void cells into one domain, skipping small ones", () => {
    // High, non-river cells classify to granite/orogen — try enough distinct hash seeds to find
    // one that lands a long connected carbonate/volcanic-like high-void run deterministically is
    // brittle, so directly stub subterraneanVoid via a controlled cell set instead.
    const n = 6;
    const cells = makeLineCells(new Array(n).fill(80));
    const voidFraction = computeSubterraneanVoid("seed-a", cells, undefined);
    // Force a known high-void run for a stable assertion regardless of hash outcome.
    for (let i = 0; i < n; i++) voidFraction[i] = i < 4 ? 0.9 : 0;
    (cells as unknown as { subterraneanVoid: Float32Array }).subterraneanVoid = voidFraction;

    const domains = generateCaveSystemsFromVoid(cells, voidFraction);
    expect(domains.length).toBe(1);
    expect(domains[0]!.kind).toBe("wildCavern");
    expect(domains[0]!.cells.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(domains[0]!.entrances.length).toBeGreaterThan(0);
    expect(domains[0]!.voidVolume).toBeGreaterThan(0);
  });

  it("respects MIN_CAVE_DOMAIN_SIZE by discarding tiny components", () => {
    const cells = makeLineCells([80, 80, 20, 80, 80, 80, 80]);
    // cell 2 is low-height (h<20 excluded anyway); isolate cell 0-1 as a 2-cell island.
    const voidFraction = new Float32Array(7).fill(0);
    voidFraction[0] = 0.9;
    voidFraction[1] = 0.9;
    voidFraction[3] = 0.9;
    voidFraction[4] = 0.9;
    voidFraction[5] = 0.9;
    voidFraction[6] = 0.9;
    const domains = generateCaveSystemsFromVoid(cells, voidFraction);
    // The [0,1] island (size 2) is below MIN_CAVE_DOMAIN_SIZE=3 and dropped; [3,4,5,6] survives.
    expect(domains.length).toBe(1);
    expect(domains[0]!.cells.sort((a, b) => a - b)).toEqual([3, 4, 5, 6]);
  });
});

/** Test helper: run the connected-component grouping directly against a pre-set void array. */
function generateCaveSystemsFromVoid(cells: CaveSystemCells, voidFraction: Float32Array) {
  const reach = new Uint8Array(cells.i.length);
  const domainByCell = new Uint16Array(cells.i.length);
  return buildDomainsFromVoid(cells, voidFraction, reach, domainByCell);
}

describe("CAVE_VOID_THRESHOLD", () => {
  it("is a fraction between 0 and 1", () => {
    expect(CAVE_VOID_THRESHOLD).toBeGreaterThan(0);
    expect(CAVE_VOID_THRESHOLD).toBeLessThan(1);
  });
});
