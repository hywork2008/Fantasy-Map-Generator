import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getRailwayLinks, initEconomyContext, setMarkets } from "../economyContext";
import { SteamIndustry } from "./steamIndustry";

describe("SteamIndustryModule railways (docs/plan/steam-industrial-implementation.md §7)", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1880 } as typeof worldContext.options;
    // Three-cell chain (same shape as routes-generator.test.ts's connectRailway fixture):
    // burg 1 at cell 0, burg 2 at cell 2, both owned by State 1.
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Test", removed: false, treasury: 100 }],
      burgs: [
        { i: 0 },
        { i: 1, cell: 0, x: 0, y: 0, state: 1, market: 1, removed: false },
        { i: 2, cell: 2, x: 20, y: 0, state: 1, market: 2, removed: false }
      ],
      cells: {
        c: [[1], [0, 2], [1]],
        h: [25, 25, 25],
        biomeCode: [1, 1, 1],
        p: [
          [0, 0],
          [10, 0],
          [20, 0]
        ],
        burg: [1, 0, 2],
        f: [1, 1, 1],
        state: [1, 1, 1],
        routes: {}
      },
      routes: []
    } as unknown as PackedGraph;
    worldContext.biomesData = { habitability: [0, 100] } as unknown as typeof worldContext.biomesData;
    setMarkets([
      { i: 1, centerBurgId: 1, color: "#111", goods: {} },
      { i: 2, centerBurgId: 2, color: "#222", goods: {} }
    ]);
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("lays railway track and marks the link materialized once railwayOperations is demonstrated", () => {
    setTechnologyProgressForTests([
      { technologyId: "railwayOperations", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    const networkChanged = SteamIndustry.settleAnnual();

    expect(networkChanged).toBe(true);
    const links = getRailwayLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ stateId: 1, fromMarketId: 1, toMarketId: 2, materialized: true });

    const railway = worldContext.pack.routes.find(route => route.group === "railways");
    expect(railway?.cells).toEqual([0, 1, 2]);
    expect(worldContext.pack.cells.routes[0]).toEqual({ 1: railway?.i });
  });

  it("does not create a link or lay track before railwayOperations reaches demonstrated", () => {
    setTechnologyProgressForTests([
      { technologyId: "railwayOperations", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(SteamIndustry.settleAnnual()).toBe(false);
    expect(getRailwayLinks()).toHaveLength(0);
    expect(worldContext.pack.routes).toHaveLength(0);
  });

  it("does not re-run connectRailway once a link is already materialized", () => {
    setTechnologyProgressForTests([
      { technologyId: "railwayOperations", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    expect(SteamIndustry.settleAnnual()).toBe(true);
    expect(worldContext.pack.routes.filter(route => route.group === "railways")).toHaveLength(1);

    worldContext.options = { year: 1881 } as typeof worldContext.options;
    expect(SteamIndustry.settleAnnual()).toBe(false);
    expect(worldContext.pack.routes.filter(route => route.group === "railways")).toHaveLength(1);
  });
});
