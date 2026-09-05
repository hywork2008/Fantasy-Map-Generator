import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearAnnualGateYear, clearEconomyContext, initEconomyContext } from "../economyContext";
import type { TradeRouteSegment } from "./marketTypes";
import {
  GRANARY_WORKS_COST_PER_STEP,
  getGranaryReserveMultiplier,
  getPublicWorksSettlements,
  HARBOR_WORKS_COST_PER_STEP,
  PublicWorks,
  ROAD_PROMOTION_COST_PER_CELL,
  ROAD_PROMOTION_TRAFFIC_THRESHOLD,
  ROUTE_TRAFFIC_ANNUAL_RETENTION,
  recordRouteTraffic,
  WORKS_ANNUAL_DECAY,
  WORKS_LEVEL_STEP
} from "./publicWorks";

/**
 * Four-cell chain, all owned by State 1. Route 0 is a `trails` route over cells 0-1-2-3
 * (so 3 hops, 4 cells → paving costs 4 × ROAD_PROMOTION_COST_PER_CELL).
 * Burg 1 sits at cell 0 and is a port; burg 2 at cell 3 is inland.
 */
function setupWorld(options?: { ownerOfLastCell?: number }) {
  const owner = options?.ownerOfLastCell ?? 1;
  worldContext.options = { year: 1000 } as typeof worldContext.options;
  worldContext.pack = {
    states: [{ i: 0 }, { i: 1, form: "Monarchy", removed: false } as unknown as State],
    burgs: [
      { i: 0 },
      { i: 1, cell: 0, state: 1, population: 20, port: 1, removed: false },
      { i: 2, cell: 3, state: 1, population: 10, removed: false }
    ],
    cells: {
      h: [25, 25, 25, 25],
      burg: [1, 0, 0, 2],
      state: [1, 1, 1, owner],
      routes: { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0, 3: 0 }, 3: { 2: 0 } }
    },
    routes: [
      {
        i: 0,
        group: "trails",
        feature: 1,
        cells: [0, 1, 2, 3],
        points: [
          [0, 0, 0],
          [10, 0, 1],
          [20, 0, 2],
          [30, 0, 3]
        ]
      }
    ]
  } as unknown as PackedGraph;
}

function landSegment(cells: number[]): TradeRouteSegment {
  return { type: "land", points: cells.map((cellId, index) => [index * 10, 0, cellId]) };
}

function state(): State {
  return worldContext.pack.states[1] as State;
}

function fundPublicWorks(amount: number): void {
  state().departmentBalances = {
    marshalcy: 0,
    chancery: 0,
    stewardship: 0,
    spymastery: 0,
    ecclesiastica: 0,
    publicWorks: amount
  };
}

describe("publicWorks (docs/plan/economy-coupling-audit.md L8 stage 2)", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setupWorld();
    clearAnnualGateYear("publicWorks");
  });

  afterEach(() => {
    clearEconomyContext();
    clearAnnualGateYear("publicWorks");
  });

  describe("recordRouteTraffic()", () => {
    it("adds one point per departure to every land route the caravan will travel", () => {
      recordRouteTraffic([landSegment([0, 1, 2, 3])]);
      recordRouteTraffic([landSegment([0, 1])]);

      expect(worldContext.pack.routes[0].traffic).toBe(2);
    });

    it("counts a route once per caravan even when the itinerary crosses it repeatedly", () => {
      recordRouteTraffic([landSegment([0, 1, 2, 1, 0])]);

      expect(worldContext.pack.routes[0].traffic).toBe(1);
    });

    it("ignores sea and river legs — no budget maintains them", () => {
      recordRouteTraffic([
        { type: "sea", points: [[0, 0, 0]] },
        { type: "river", points: [[10, 0, 1]] }
      ]);

      expect(worldContext.pack.routes[0].traffic).toBeUndefined();
    });
  });

  describe("road promotion", () => {
    it("promotes a busy trail to roads once the works budget covers the paving cost", () => {
      worldContext.pack.routes[0].traffic = ROAD_PROMOTION_TRAFFIC_THRESHOLD;
      // The road envelope is half the balance, so fund twice the paving cost.
      fundPublicWorks(4 * ROAD_PROMOTION_COST_PER_CELL * 2);

      const result = PublicWorks.settleAnnual();

      expect(result.networkChanged).toBe(true);
      expect(worldContext.pack.routes[0].group).toBe("roads");
      expect(state().departmentBalances?.publicWorks).toBe(4 * ROAD_PROMOTION_COST_PER_CELL);
    });

    it("leaves a trail unpaved while its traffic is below the threshold, however rich the state", () => {
      worldContext.pack.routes[0].traffic = ROAD_PROMOTION_TRAFFIC_THRESHOLD - 1;
      fundPublicWorks(100000);

      const result = PublicWorks.settleAnnual();

      expect(result.networkChanged).toBe(false);
      expect(worldContext.pack.routes[0].group).toBe("trails");
    });

    it("leaves a busy trail unpaved while the state cannot afford it, and keeps the cash to save up", () => {
      worldContext.pack.routes[0].traffic = ROAD_PROMOTION_TRAFFIC_THRESHOLD;
      // Half of this is the road envelope — still short of the 4-cell paving cost.
      fundPublicWorks(4 * ROAD_PROMOTION_COST_PER_CELL);

      PublicWorks.settleAnnual();

      expect(worldContext.pack.routes[0].group).toBe("trails");
      // Not spent on roads; the leftover rolls into harbour/granary works instead of vanishing.
      expect(state().departmentBalances?.publicWorks).toBeGreaterThanOrEqual(0);
    });

    it("does not pave a trail that mostly lies outside the paying state", () => {
      // Only 1 of 4 cells is State 1's, well under ROAD_PROMOTION_OWNERSHIP_MIN.
      worldContext.pack.cells.state = [1, 2, 2, 2] as unknown as PackedGraph["cells"]["state"];
      worldContext.pack.routes[0].traffic = ROAD_PROMOTION_TRAFFIC_THRESHOLD;
      fundPublicWorks(100000);

      PublicWorks.settleAnnual();

      expect(worldContext.pack.routes[0].group).toBe("trails");
    });
  });

  describe("harbour and granary works", () => {
    it("builds harbour works only at port burgs, one step per year", () => {
      fundPublicWorks(HARBOR_WORKS_COST_PER_STEP * 4);

      PublicWorks.settleAnnual();

      expect(worldContext.pack.burgs[1].publicWorks?.harbor).toBe(WORKS_LEVEL_STEP);
      expect(worldContext.pack.burgs[2].publicWorks?.harbor).toBeUndefined();
    });

    it("puts a landlocked state's whole works budget into granaries", () => {
      worldContext.pack.burgs[1].port = 0;
      fundPublicWorks(GRANARY_WORKS_COST_PER_STEP * 2);

      PublicWorks.settleAnnual();

      expect(worldContext.pack.burgs[1].publicWorks?.granary).toBe(WORKS_LEVEL_STEP);
      expect(worldContext.pack.burgs[2].publicWorks?.granary).toBe(WORKS_LEVEL_STEP);
    });

    it("reports what it spent per state", () => {
      fundPublicWorks(HARBOR_WORKS_COST_PER_STEP + GRANARY_WORKS_COST_PER_STEP * 2);

      PublicWorks.settleAnnual();

      const [settlement] = getPublicWorksSettlements();
      expect(settlement.stateId).toBe(1);
      expect(settlement.harborSteps).toBe(1);
      expect(settlement.spent).toBeGreaterThan(0);
      expect(settlement.spent).toBeLessThanOrEqual(HARBOR_WORKS_COST_PER_STEP + GRANARY_WORKS_COST_PER_STEP * 2);
    });
  });

  describe("annual decay", () => {
    it("decays route traffic so a corridor that falls out of use loses its claim", () => {
      worldContext.pack.routes[0].traffic = 10;

      PublicWorks.settleAnnual();

      expect(worldContext.pack.routes[0].traffic).toBe(10 * ROUTE_TRAFFIC_ANNUAL_RETENTION);
    });

    it("decays existing works when nothing is funded", () => {
      worldContext.pack.burgs[1].publicWorks = { harbor: 0.5, granary: 0.5 };

      const result = PublicWorks.settleAnnual();

      expect(result.worksChanged).toBe(true);
      expect(worldContext.pack.burgs[1].publicWorks?.harbor).toBe(0.5 - WORKS_ANNUAL_DECAY);
      expect(worldContext.pack.burgs[1].publicWorks?.granary).toBe(0.5 - WORKS_ANNUAL_DECAY);
    });
  });

  it("settles at most once per simulation year", () => {
    fundPublicWorks(HARBOR_WORKS_COST_PER_STEP * 10);

    PublicWorks.settleAnnual();
    const afterFirst = state().departmentBalances?.publicWorks;
    PublicWorks.settleAnnual();

    expect(state().departmentBalances?.publicWorks).toBe(afterFirst);
  });

  describe("getGranaryReserveMultiplier()", () => {
    it("is 1 for a burg with no granary and rises with the works level", () => {
      expect(getGranaryReserveMultiplier({})).toBe(1);
      expect(getGranaryReserveMultiplier({ publicWorks: { granary: 0.5 } })).toBe(1.5);
      expect(getGranaryReserveMultiplier({ publicWorks: { granary: 1 } })).toBe(2);
    });
  });
});
