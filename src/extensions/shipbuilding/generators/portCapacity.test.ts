import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCoastalHabitatCode } from "../../../data/coastalHabitatCatalog";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearShipbuildingContext, initShipbuildingContext } from "../shipbuildingContext";
import { computePortCapacity } from "./portCapacity";
import type { ShipyardCandidate } from "./shipyardCandidates";

describe("computePortCapacity", () => {
  beforeEach(() => {
    initShipbuildingContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.pack = {
      burgs: [],
      cells: {
        harbor: new Uint8Array(10),
        // Cell 1 is the burg cell at sea-level elevation (h=20 -> ~3.5m, Elevation "ideal" tier,
        // elevationFactor=1 -> no capacity penalty). Cell 2 is its haven, deep enough (h=5 ->
        // ~150m depth) that the large-ship depth tier is always unlocked (depthMultiplier=1) —
        // this keeps pre-existing capacity numbers unaffected by the Elevation/Depth siting
        // conditions (docs/plan/harbor-siting.md), which are exercised by dedicated tests below.
        h: Uint8Array.from([0, 20, 5, 0, 0, 0, 0, 0, 0, 0]),
        haven: Uint8Array.from([0, 2, 0, 0, 0, 0, 0, 0, 0, 0]),
        c: Array.from({ length: 10 }, () => [] as number[])
      }
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearShipbuildingContext();
  });

  function setup(burgOverride: Partial<Burg>, harbor: number): ShipyardCandidate[] {
    const burgs: Burg[] = [{} as Burg, { i: 1, x: 0, y: 0, cell: 1, ...burgOverride } as Burg];
    worldContext.pack.burgs = burgs;
    (worldContext.pack.cells.harbor as Uint8Array)[1] = harbor;
    return [{ burgId: 1, forestRatio: 0.5 }];
  }

  it("gives a small fishing village a couple of small berths and nothing bigger", () => {
    const candidates = setup({ population: 1 }, 2);
    const capacity = computePortCapacity(candidates)?.get(1);
    expect(capacity).toEqual({ small: 2, medium: 0, large: 0 });
  });

  it("unlocks medium berths once a town clears the medium threshold", () => {
    const candidates = setup({ population: 5 }, 3);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 4, medium: 1, large: 0 });
  });

  it("keeps large berths locked below the large threshold even with a decent harbor", () => {
    const candidates = setup({ population: 15 }, 4);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 7, medium: 2, large: 0 });
  });

  it("unlocks a large berth once total score and harbor quality both clear their thresholds", () => {
    const candidates = setup({ population: 30 }, 5);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 10, medium: 3, large: 1 });
  });

  it("applies the capital bonus multiplicatively", () => {
    const candidates = setup({ population: 30, capital: 1 }, 5);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 15, medium: 5, large: 1 });
  });

  it("stacks capital and citadel bonuses with a maxed-out harbor", () => {
    const candidates = setup({ population: 30, capital: 1, citadel: 1 }, 6);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 20, medium: 7, large: 2 });
  });

  it("guarantees at least one small berth even for a tiny population", () => {
    const candidates = setup({ population: 0.001 }, 1);
    expect(computePortCapacity(candidates).get(1)?.small).toBe(1);
  });

  it("skips removed burgs", () => {
    const candidates = setup({ population: 30, removed: true }, 5);
    expect(computePortCapacity(candidates).has(1)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Elevation (docs/plan/harbor-siting.md §4.1): Marginal-tier elevation degrades total
  // capacity via elevationFactor instead of gating the candidate — small/medium/large all
  // shrink together (the multiplier applies to `total` before any tier split), but never to
  // zero for the small tier (Math.max(1, ...) floor is unaffected by elevationFactor alone).
  it("shrinks capacity via elevationFactor at Marginal elevation (h=25, ~33m)", () => {
    (worldContext.pack.cells.h as Uint8Array)[1] = 25;
    const candidates = setup({ population: 30 }, 5);
    // Baseline at ideal elevation (h=20) for the same population/harbor is {small:10, medium:3, large:1}.
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 9, medium: 3, large: 1 });
  });

  it("shrinks capacity further as elevation climbs toward the Unsuitable boundary (h=30, ~88m)", () => {
    (worldContext.pack.cells.h as Uint8Array)[1] = 30;
    const candidates = setup({ population: 30 }, 5);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 5, medium: 1, large: 0 });
  });

  // ---------------------------------------------------------------------------
  // Depth (docs/plan/harbor-siting.md §4.2): only the large tier is depth-gated; small/medium
  // stay identical across all three haven depths, matching the "never drop to zero" policy.
  it("closes the large tier when nearby water is shallower than the marginal floor (haven h=19, ~2.6m)", () => {
    (worldContext.pack.cells.h as Uint8Array)[2] = 19;
    const candidates = setup({ population: 30, capital: 1, citadel: 1 }, 6);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 20, medium: 7, large: 0 });
  });

  it("halves the large tier in the 4-6m dredging-maintenance band (haven h=18, ~5.6m)", () => {
    (worldContext.pack.cells.h as Uint8Array)[2] = 18;
    const candidates = setup({ population: 30, capital: 1, citadel: 1 }, 6);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 20, medium: 7, large: 1 });
  });

  it("opens the large tier fully once nearby water reaches 6m (haven h=17, ~8.8m)", () => {
    (worldContext.pack.cells.h as Uint8Array)[2] = 17;
    const candidates = setup({ population: 30, capital: 1, citadel: 1 }, 6);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 20, medium: 7, large: 2 });
  });

  // ---------------------------------------------------------------------------
  // Coastal Habitat substrate (docs/plan/harbor-siting.md §4.3/§4.4): sandyBeach/coastalDune/
  // tidalFlat degrade total capacity via coastalHabitatFactor instead of gating the candidate —
  // no substrate excludes a burg from `computePortCapacity()`'s result set at all.
  it("applies no penalty on rockyIntertidal (ideal substrate)", () => {
    (worldContext.pack.cells.coastalHabitat as Uint8Array) = Uint8Array.from([
      0,
      getCoastalHabitatCode("rockyIntertidal"),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    const candidates = setup({ population: 30 }, 5);
    // Baseline with no coastalHabitat column at all (undefined -> "none" -> ideal) is
    // {small:10, medium:3, large:1}; rockyIntertidal must match it exactly.
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 10, medium: 3, large: 1 });
  });

  it("shrinks capacity via coastalHabitatFactor on a sandy beach", () => {
    (worldContext.pack.cells.coastalHabitat as Uint8Array) = Uint8Array.from([
      0,
      getCoastalHabitatCode("sandyBeach"),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    const candidates = setup({ population: 30 }, 5);
    // Baseline at ideal substrate for the same population/harbor is {small:10, medium:3, large:1}.
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 5, medium: 1, large: 0 });
  });

  it("shrinks capacity by the same factor on coastalDune as on sandyBeach", () => {
    (worldContext.pack.cells.coastalHabitat as Uint8Array) = Uint8Array.from([
      0,
      getCoastalHabitatCode("coastalDune"),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    const candidates = setup({ population: 30 }, 5);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 5, medium: 1, large: 0 });
  });

  it("shrinks capacity less severely on tidalFlat than on sandyBeach", () => {
    (worldContext.pack.cells.coastalHabitat as Uint8Array) = Uint8Array.from([
      0,
      getCoastalHabitatCode("tidalFlat"),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    const candidates = setup({ population: 30 }, 5);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 6, medium: 2, large: 0 });
  });
});
