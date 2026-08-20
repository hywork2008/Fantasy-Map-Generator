import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getLeveeSites, initEconomyContext } from "../economyContext";
import { LeveeSites } from "./leveeSites";

// A 5-cell river: cells 0-3 sit at the minimum land-river height (20) with above-mean discharge —
// hazard ~0.4649, above LEVEE_RISK_THRESHOLD(0.45)... actually above LEVEE_CONTINUE_THRESHOLD too,
// so all four chain together. Cell 4 is high, dry ground (hazard ~0.1849, below the continue bar)
// that ends the reach without disqualifying itself as a land river cell.
function makeFloodplainReachPack(): PackedGraph {
  return {
    cells: {
      i: [0, 1, 2, 3, 4],
      h: [20, 20, 20, 20, 50],
      r: [1, 1, 1, 1, 1],
      fl: [50, 50, 50, 50, 50],
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0],
        [40, 0]
      ],
      pop: [0, 0, 0, 0, 0]
    },
    rivers: [{ i: 1, cells: [0, 1, 2, 3, 4] }]
  } as unknown as PackedGraph;
}

describe("LeveeSitesModule.generate", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    // cells.prec defaults to 45 inside computeNaturalFloodRisk() when gridPrec is undefined — an
    // empty `cells` object here still exercises that default rather than `.grid.cells` itself
    // being undefined (which real WorldContexts never are).
    worldContext.grid = { spacing: 10, cells: {} } as typeof worldContext.grid;
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("chains hazard-qualifying land river cells into a single reach and stops at the dry cell", () => {
    worldContext.pack = makeFloodplainReachPack();
    LeveeSites.generate();

    const sites = getLeveeSites();
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      riverId: 1,
      cells: [0, 1, 2, 3],
      x: 15,
      y: 0,
      meanFloodHazard: 0.4649,
      qualityScore: 0.279
    });
  });

  it("excludes cells below the risk threshold entirely", () => {
    worldContext.pack = {
      cells: {
        i: [0, 1],
        h: [50, 50], // high, dry ground: hazard well under LEVEE_RISK_THRESHOLD
        r: [1, 1],
        fl: [5, 5],
        p: [
          [0, 0],
          [10, 0]
        ]
      },
      rivers: [{ i: 1, cells: [0, 1] }]
    } as unknown as PackedGraph;

    LeveeSites.generate();
    expect(getLeveeSites()).toHaveLength(0);
  });

  it("caps a single reach at MAX_LEVEE_REACH_CELLS and starts a new site with the leftover cells", () => {
    const count = 12;
    worldContext.pack = {
      cells: {
        i: Array.from({ length: count }, (_, i) => i),
        h: Array(count).fill(20),
        r: Array(count).fill(1),
        fl: Array(count).fill(50),
        p: Array.from({ length: count }, (_, i) => [i * 10, 0])
      },
      rivers: [{ i: 1, cells: Array.from({ length: count }, (_, i) => i) }]
    } as unknown as PackedGraph;

    LeveeSites.generate();
    const sites = getLeveeSites();
    expect(sites).toHaveLength(2);
    expect(sites[0].cells).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sites[1].cells).toEqual([10, 11]);
  });

  it("keeps reaches on different rivers independent even when hazard-adjacent", () => {
    worldContext.pack = {
      cells: {
        i: [0, 1, 2, 3],
        h: [20, 20, 20, 20],
        r: [1, 1, 2, 2],
        fl: [50, 50, 50, 50],
        p: [
          [0, 0],
          [10, 0],
          [1000, 0],
          [1010, 0]
        ]
      },
      rivers: [
        { i: 1, cells: [0, 1] },
        { i: 2, cells: [2, 3] }
      ]
    } as unknown as PackedGraph;

    LeveeSites.generate();
    const sites = getLeveeSites();
    expect(sites).toHaveLength(2);
    expect(sites.map(site => site.riverId).sort()).toEqual([1, 2]);
    expect(sites.every(site => site.cells.length === 2)).toBe(true);
  });

  it("weighs protected population into qualityScore, ranking the higher-population reach first", () => {
    worldContext.pack = {
      cells: {
        i: [0, 1, 2, 3],
        h: [20, 20, 20, 20],
        r: [1, 1, 2, 2],
        fl: [50, 50, 50, 50], // identical hazard on both reaches
        p: [
          [0, 0],
          [10, 0],
          [1000, 0],
          [1010, 0]
        ],
        pop: [0, 0, 500, 500] // river 2's reach protects far more people
      },
      rivers: [
        { i: 1, cells: [0, 1] },
        { i: 2, cells: [2, 3] }
      ]
    } as unknown as PackedGraph;

    LeveeSites.generate();
    const sites = getLeveeSites();
    expect(sites).toHaveLength(2);
    expect(sites[0].riverId).toBe(2);
    expect(sites[0].qualityScore).toBeGreaterThan(sites[1].qualityScore);
  });

  it("thins a lower-quality candidate that falls within the minimum spacing of a better one", () => {
    worldContext.pack = {
      cells: {
        i: [0, 1],
        h: [20, 20],
        r: [1, 2],
        fl: [80, 50], // cell 0's river has higher discharge, so higher hazard/quality
        p: [
          [0, 0],
          [5, 0] // 5 units away, well inside the 30-unit spacing floor (grid.spacing 10 x 3)
        ]
      },
      rivers: [
        { i: 1, cells: [0] },
        { i: 2, cells: [1] }
      ]
    } as unknown as PackedGraph;

    LeveeSites.generate();
    const sites = getLeveeSites();
    expect(sites).toHaveLength(1);
    expect(sites[0].riverId).toBe(1);
  });

  it("is deterministic across repeated calls", () => {
    worldContext.pack = makeFloodplainReachPack();
    LeveeSites.generate();
    const first = structuredClone(getLeveeSites());
    LeveeSites.generate();
    expect(getLeveeSites()).toEqual(first);
  });

  it("clear() empties the site list", () => {
    worldContext.pack = makeFloodplainReachPack();
    LeveeSites.generate();
    expect(getLeveeSites().length).toBeGreaterThan(0);

    LeveeSites.clear();
    expect(getLeveeSites()).toHaveLength(0);
  });
});
