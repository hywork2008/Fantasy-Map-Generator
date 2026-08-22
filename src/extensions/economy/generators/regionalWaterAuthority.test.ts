import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getRegionalWaterSchemes,
  initEconomyContext,
  setRegionalWaterSchemes,
  setRegionalWaterSchemesLastSettledYear,
  setUrbanWaterSystems
} from "../economyContext";
import { getRegionalSchemeConnectedBurgIds, RegionalWaterAuthority } from "./regionalWaterAuthority";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

/**
 * A minimal 4-cell gravity-feasible graph: burg 1 at cell 0, burg 2 at cell 2, a shared hub at
 * cell 1, and a protected river intake at cell 3 (higher than every other cell, same landmass and
 * State) — same shape as urbanWaterSupply.test.ts's own fixtures, reused here so surveyScheme()
 * finds a real route instead of failing immediately.
 */
function fixtureCells() {
  return {
    i: [0, 1, 2, 3],
    c: [[1], [0, 2, 3], [1], [1]],
    p: [
      [0, 0],
      [10, 0],
      [20, 0],
      [10, 10]
    ],
    f: new Uint16Array([1, 1, 1, 1]),
    haven: new Uint16Array([0, 0, 0, 0]),
    r: new Uint16Array([0, 0, 0, 1]),
    h: new Uint16Array([30, 40, 30, 60]),
    state: new Uint16Array([1, 1, 1, 1])
  };
}

function baseSystem(burgId: number, hasUpstreamIntake: boolean): UrbanWaterSystem {
  return { burgId, hasUpstreamIntake } as UrbanWaterSystem;
}

function scheme(overrides: Partial<ReturnType<typeof baseScheme>> = {}) {
  return { ...baseScheme(), ...overrides };
}

function baseScheme() {
  return {
    id: 1,
    sponsorStateId: 1,
    authorityKind: "stateWaterAuthority" as const,
    status: "proposed" as const,
    sourceCellId: -1,
    routeCellIds: [] as number[],
    memberBurgIds: [1, 2],
    transitBurgIds: [] as number[],
    contractedCapacityByBurg: { 1: 5000, 2: 5000 } as Record<number, number>,
    approvalByParty: {} as Record<string, "pending" | "approved" | "rejected">,
    capitalContributionByParty: {} as Record<string, number>,
    compensationReserve: 0,
    constructionProgress: 0,
    operationsReserve: 0
  };
}

describe("regionalWaterAuthority", () => {
  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext: { currentYear: 1000, extensions: {} }
    } as unknown as ExtensionAPI);
    worldContext.options = { historicalPeriod: "steamEra" } as typeof worldContext.options;
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false, capital: 1, treasury: 5000 }],
      burgs: [
        { i: 0 },
        { i: 1, state: 1, cell: 0, x: 0, y: 0, population: 5000, treasury: 30000, product: 500, removed: false },
        { i: 2, state: 1, cell: 2, x: 20, y: 0, population: 5000, treasury: 30000, product: 500, removed: false }
      ],
      cells: fixtureCells(),
      cultures: [],
      races: []
    } as unknown as PackedGraph;
    setUrbanWaterSystems([baseSystem(1, false), baseSystem(2, false)]);
  });

  afterEach(() => clearEconomyContext());

  describe("getRegionalSchemeConnectedBurgIds", () => {
    it("returns member burgs only for operating schemes", () => {
      setRegionalWaterSchemes([
        scheme({ id: 1, status: "operating", memberBurgIds: [1, 2] }),
        scheme({ id: 2, status: "building", memberBurgIds: [3] })
      ]);
      const ids = getRegionalSchemeConnectedBurgIds();
      expect(ids.has(1)).toBe(true);
      expect(ids.has(2)).toBe(true);
      expect(ids.has(3)).toBe(false);
    });
  });

  describe("proposing new schemes", () => {
    it("proposes nothing before the modern water era", () => {
      worldContext.options = { historicalPeriod: "lateMedieval" } as typeof worldContext.options;
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()).toHaveLength(0);
    });

    it("proposes nothing for a burg that already has an upstream intake", () => {
      setUrbanWaterSystems([baseSystem(1, true), baseSystem(2, true)]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()).toHaveLength(0);
    });

    it("proposes nothing when no gravity-feasible source exists on the landmass", () => {
      const cells = fixtureCells();
      cells.r = new Uint16Array([0, 0, 0, 0]); // no river cell anywhere
      worldContext.pack.cells = cells as unknown as PackedGraph["cells"];
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()).toHaveLength(0);
    });

    it("groups eligible, uncovered same-State/same-landmass burgs into one proposed scheme", () => {
      RegionalWaterAuthority.settleAnnual();
      const schemes = getRegionalWaterSchemes();
      expect(schemes).toHaveLength(1);
      expect(schemes[0]).toMatchObject({
        status: "proposed",
        sponsorStateId: 1,
        authorityKind: "stateWaterAuthority",
        memberBurgIds: [1, 2]
      });
    });

    it("does not propose a second scheme for burgs already covered by an existing one", () => {
      setRegionalWaterSchemes([scheme({ id: 5, status: "surveying", memberBurgIds: [1, 2] })]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes().filter(s => s.memberBurgIds.includes(1))).toHaveLength(1);
    });
  });

  describe("lifecycle advancement", () => {
    it("advances proposed -> surveying with no route computed yet", () => {
      setRegionalWaterSchemes([scheme({ status: "proposed" })]);
      RegionalWaterAuthority.settleAnnual();
      const [result] = getRegionalWaterSchemes();
      expect(result.status).toBe("surveying");
      expect(result.sourceCellId).toBe(-1);
    });

    it("resolves surveying -> negotiating with a real intake and route once a valid source exists", () => {
      setRegionalWaterSchemes([scheme({ status: "surveying" })]);
      RegionalWaterAuthority.settleAnnual();
      const [result] = getRegionalWaterSchemes();
      expect(result.status).toBe("negotiating");
      expect(result.sourceCellId).toBe(3);
      expect(result.routeCellIds).toEqual([0, 1, 2, 3]);
    });

    it("suspends surveying when no gravity-feasible route exists", () => {
      const cells = fixtureCells();
      cells.r = new Uint16Array([0, 0, 0, 0]);
      worldContext.pack.cells = cells as unknown as PackedGraph["cells"];
      setRegionalWaterSchemes([scheme({ status: "surveying" })]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()[0].status).toBe("suspended");
    });

    it("stalls in negotiating while the sponsor State cannot afford the negotiation fee, then resolves once it can", () => {
      worldContext.pack.states[1].treasury = 1;
      setRegionalWaterSchemes([scheme({ status: "negotiating", sourceCellId: 3, routeCellIds: [0, 1, 2, 3] })]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()[0].status).toBe("negotiating");

      worldContext.pack.states[1].treasury = 5000;
      setRegionalWaterSchemesLastSettledYear(999);
      RegionalWaterAuthority.settleAnnual();
      const [result] = getRegionalWaterSchemes();
      expect(result.status).toBe("funded");
      expect(result.approvalByParty).toMatchObject({ "1": "approved", "2": "approved" });
      expect(worldContext.pack.states[1].treasury).toBeLessThan(5000);
    });

    it("advances funded -> building immediately", () => {
      setRegionalWaterSchemes([scheme({ status: "funded" })]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()[0].status).toBe("building");
    });

    it("accumulates constructionProgress while building and promotes to commissioning once fully funded", () => {
      setRegionalWaterSchemes([
        scheme({
          status: "building",
          sourceCellId: 3,
          routeCellIds: [0, 1, 2, 3],
          capitalContributionByParty: { "1": 900, "2": 300, "3": 300 }
        })
      ]);
      RegionalWaterAuthority.settleAnnual();
      const [result] = getRegionalWaterSchemes();
      expect(result.constructionProgress).toBeGreaterThan(0.9);
    });

    it("commissions successfully when every member burg is still in the sponsor State", () => {
      setRegionalWaterSchemes([scheme({ status: "commissioning" })]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()[0].status).toBe("operating");
    });

    it("suspends at commissioning when a member burg no longer belongs to the sponsor State", () => {
      worldContext.pack.burgs[2].state = 2;
      setRegionalWaterSchemes([scheme({ status: "commissioning" })]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()[0].status).toBe("suspended");
    });

    it("keeps operating while funding covers the annual need", () => {
      setRegionalWaterSchemes([scheme({ status: "operating", operationsReserve: 0 })]);
      RegionalWaterAuthority.settleAnnual();
      const [result] = getRegionalWaterSchemes();
      expect(result.status).toBe("operating");
    });

    it("suspends operating once funding and reserve both run out", () => {
      worldContext.pack.states[1].treasury = 0;
      worldContext.pack.burgs[1].treasury = 0;
      worldContext.pack.burgs[2].treasury = 0;
      setRegionalWaterSchemes([scheme({ status: "operating", operationsReserve: 0 })]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()[0].status).toBe("suspended");
    });

    it("recovers a suspended scheme to operating once the sponsor State is solvent again", () => {
      worldContext.pack.states[1].treasury = 0;
      setRegionalWaterSchemes([scheme({ status: "suspended" })]);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()[0].status).toBe("suspended");

      worldContext.pack.states[1].treasury = 5000;
      setRegionalWaterSchemesLastSettledYear(999);
      RegionalWaterAuthority.settleAnnual();
      expect(getRegionalWaterSchemes()[0].status).toBe("operating");
    });
  });
});
