import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getDamSites, initEconomyContext } from "../economyContext";
import { DamSites } from "./damSites";

// A 4-cell river, decreasing in height (head potential between each consecutive pair) and with
// discharge (fl) above the map mean at cells 1 and 2 only. cell 3 is the river's terminus
// (downstream -1) despite having a below-mean flux, exercising the "mouth" exclusion separately
// from the discharge gate in the dedicated mouth test below.
function makeRiverPack(pointOverrides?: Record<number, [number, number]>): PackedGraph {
  const points: [number, number][] = [
    [0, 0],
    [100, 0],
    [200, 0],
    [300, 0]
  ];
  if (pointOverrides) for (const [cell, point] of Object.entries(pointOverrides)) points[Number(cell)] = point;

  return {
    cells: {
      i: [0, 1, 2, 3],
      h: [40, 35, 25, 20],
      r: [1, 1, 1, 1],
      fl: [10, 80, 60, 5],
      p: points
    },
    rivers: [{ i: 1, cells: [0, 1, 2, 3] }]
  } as unknown as PackedGraph;
}

describe("DamSitesModule.generate", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.grid = { spacing: 10 } as typeof worldContext.grid;
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("places one site per land river cell above mean discharge with a downstream land-river neighbor", () => {
    worldContext.pack = makeRiverPack();
    DamSites.generate();

    const sites = getDamSites();
    expect(sites).toHaveLength(2);

    const [best, second] = sites;
    expect(best).toMatchObject({ cell: 1, riverId: 1, dischargePotential: 1, headPotential: 1, qualityScore: 1 });
    expect(best.downstreamCells).toEqual([2, 3]);

    expect(second).toMatchObject({ cell: 2, dischargePotential: 0.75, headPotential: 0.5, qualityScore: 0.625 });
    expect(second.downstreamCells).toEqual([3]);
  });

  it("excludes cells at or below the map's mean discharge", () => {
    worldContext.pack = makeRiverPack();
    DamSites.generate();

    const cells = getDamSites().map(site => site.cell);
    expect(cells).not.toContain(0); // fl 10, below mean 38.75
    expect(cells).not.toContain(3); // fl 5, below mean, also a mouth
  });

  it("excludes a river mouth even with above-mean discharge", () => {
    worldContext.pack = {
      cells: {
        i: [0, 1],
        h: [30, 25],
        r: [1, 1],
        fl: [10, 50],
        p: [
          [0, 0],
          [50, 0]
        ]
      },
      rivers: [{ i: 1, cells: [0, 1] }]
    } as unknown as PackedGraph;

    DamSites.generate();
    expect(getDamSites()).toHaveLength(0);
  });

  it("thins a lower-quality candidate that falls within the minimum spacing of a better one", () => {
    worldContext.pack = makeRiverPack({ 2: [105, 0] }); // 5 units from cell 1's [100, 0], spacing floor is 30
    DamSites.generate();

    const sites = getDamSites();
    expect(sites).toHaveLength(1);
    expect(sites[0].cell).toBe(1);
  });

  it("is deterministic across repeated calls", () => {
    worldContext.pack = makeRiverPack();
    DamSites.generate();
    const first = structuredClone(getDamSites());
    DamSites.generate();
    expect(getDamSites()).toEqual(first);
  });

  it("clear() empties the site list", () => {
    worldContext.pack = makeRiverPack();
    DamSites.generate();
    expect(getDamSites().length).toBeGreaterThan(0);

    DamSites.clear();
    expect(getDamSites()).toHaveLength(0);
  });
});
