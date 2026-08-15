import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearShipbuildingContext, initShipbuildingContext } from "../shipbuildingContext";
import {
  allocateByWeights,
  assignHullsToPorts,
  classifyMaritimeRole,
  collectOceanPortsByState,
  type OceanPortBurg,
  planSeaborneLandingRemnant,
  planStateFleet,
  SEABORNE_LANDING_REMNANT_MAX,
  seedInitialFleets,
  splitHullsByOwner,
  unitHash
} from "./initialFleet";
import { STARTER_GUIDELINES } from "./initialFleetTables";
import { clearShipyardQueues, getCompletedHulls, getHulls, getStateTechPoints } from "./shipyardQueue";

function port(overrides: Partial<OceanPortBurg> & Pick<OceanPortBurg, "burgId" | "stateId">): OceanPortBurg {
  return {
    population: 10,
    capital: false,
    citadel: false,
    isShipyard: false,
    navalCulture: false,
    ...overrides
  };
}

describe("initialFleet pure helpers", () => {
  it("unitHash is deterministic and in [0, 1)", () => {
    const a = unitHash(1, 2, 3);
    const b = unitHash(1, 2, 3);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(unitHash(1, 2, 4)).not.toBe(a);
  });

  it("allocateByWeights preserves the total", () => {
    const parts = allocateByWeights(10, [0.7, 0.25, 0.05]);
    expect(parts.reduce((s, n) => s + n, 0)).toBe(10);
    expect(parts[0]).toBeGreaterThanOrEqual(parts[1]);
  });

  it("classifyMaritimeRole uses ports not land area", () => {
    expect(
      classifyMaritimeRole({
        ports: [port({ burgId: 1, stateId: 1 })],
        period: "highMedieval",
        forceOceanic: false
      })
    ).toBe("minor_coastal");

    expect(
      classifyMaritimeRole({
        ports: [port({ burgId: 1, stateId: 1, capital: true })],
        period: "highMedieval",
        forceOceanic: false
      })
    ).toBe("regional_maritime");

    expect(
      classifyMaritimeRole({
        ports: [port({ burgId: 1, stateId: 1, isShipyard: true }), port({ burgId: 2, stateId: 1, isShipyard: true })],
        period: "highMedieval",
        forceOceanic: false
      })
    ).toBe("major_maritime");

    expect(
      classifyMaritimeRole({
        ports: Array.from({ length: 6 }, (_, i) => port({ burgId: i + 1, stateId: 1, isShipyard: i < 3 })),
        period: "ageOfExploration",
        forceOceanic: true
      })
    ).toBe("oceanic_empire");
  });

  it("planSeaborneLandingRemnant keeps one or two state boats and no galleons", () => {
    for (const period of ["earlyMedieval", "highMedieval", "lateMedieval", "ageOfExploration"] as const) {
      const plan = planSeaborneLandingRemnant(period, 3);
      expect(plan.total).toBeGreaterThanOrEqual(1);
      expect(plan.total).toBeLessThanOrEqual(SEABORNE_LANDING_REMNANT_MAX);
      expect(plan.stateHulls).toBe(plan.total);
      expect(plan.marketHulls).toBe(0);
      expect(plan.galleon).toBe(0);
      expect(plan.sloop + plan.caravel).toBe(plan.total);
    }
    const late = planSeaborneLandingRemnant("ageOfExploration", 1);
    expect(late.caravel).toBe(1);
  });

  it("planStateFleet matches guideline bases for highMedieval regional", () => {
    const plan = planStateFleet("highMedieval", "regional_maritime", 3, 42);
    const guide = STARTER_GUIDELINES.highMedieval.regional_maritime;
    expect(plan.total).toBe(guide.totalShipsBase);
    expect(plan.sloop + plan.caravel + plan.galleon).toBe(plan.total);
    expect(plan.stateHulls + plan.marketHulls).toBe(plan.total);
    expect(plan.galleon).toBe(0);
  });

  it("planStateFleet never yields galleons in earlyMedieval", () => {
    for (const role of ["minor_coastal", "regional_maritime", "major_maritime"] as const) {
      const plan = planStateFleet("earlyMedieval", role, 5, 7);
      expect(plan.galleon).toBe(0);
    }
  });

  it("planStateFleet raises tech floor when caravels or galleons are present", () => {
    const late = planStateFleet("lateMedieval", "major_maritime", 7, 1);
    expect(late.galleon).toBeGreaterThan(0);
    expect(late.maxTechPointsRequired).toBe(150);

    const early = planStateFleet("earlyMedieval", "major_maritime", 5, 1);
    expect(early.maxTechPointsRequired).toBe(early.caravel > 0 ? 50 : 0);
  });

  it("splitHullsByOwner prefers large hulls for the state navy", () => {
    const plan = planStateFleet("ageOfExploration", "major_maritime", 8, 3);
    const hulls = splitHullsByOwner(plan);
    expect(hulls).toHaveLength(plan.total);
    expect(hulls.filter(h => h.owner === "state")).toHaveLength(plan.stateHulls);
    expect(hulls.filter(h => h.owner === "market")).toHaveLength(plan.marketHulls);

    const stateClasses = hulls.filter(h => h.owner === "state").map(h => h.shipClassId);
    const marketClasses = hulls.filter(h => h.owner === "market").map(h => h.shipClassId);
    // State should absorb galleons first when any exist.
    if (plan.galleon > 0) {
      expect(stateClasses.filter(c => c === "galleon").length).toBeGreaterThan(0);
    }
    // Market should hold the bulk of sloops.
    expect(marketClasses.filter(c => c === "sloop").length).toBeGreaterThanOrEqual(
      stateClasses.filter(c => c === "sloop").length
    );
  });

  it("assignHullsToPorts keeps state hulls on capital when available", () => {
    const ports = [
      port({ burgId: 10, stateId: 1, population: 5 }),
      port({ burgId: 11, stateId: 1, population: 20, capital: true, citadel: true, isShipyard: true })
    ];
    const plan = planStateFleet("highMedieval", "regional_maritime", 2, 1);
    const assignments = assignHullsToPorts(plan, ports);
    const stateHomes = assignments.filter(a => a.owner === "state").map(a => a.homeBurgId);
    expect(stateHomes.every(id => id === 11)).toBe(true);
  });
});

describe("seedInitialFleets integration", () => {
  beforeEach(() => {
    clearShipyardQueues();
    initShipbuildingContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { ...(worldContext.options ?? {}), historicalPeriod: "highMedieval" };
  });

  afterEach(() => {
    clearShipyardQueues();
    clearShipbuildingContext();
  });

  function installPack(opts: {
    period?: "earlyMedieval" | "highMedieval" | "lateMedieval" | "ageOfExploration";
    burgs: Partial<Burg>[];
  }): void {
    worldContext.options = {
      ...(worldContext.options ?? {}),
      historicalPeriod: opts.period ?? "highMedieval"
    };

    // Cell layout: burg cell N has haven N+100 on ocean feature 1.
    const cellCount = 300;
    const haven = new Uint16Array(cellCount);
    const f = new Uint16Array(cellCount);
    const burgs: Burg[] = [{} as Burg];
    for (const o of opts.burgs) {
      const burgId = o.i!;
      const cell = o.cell ?? burgId;
      haven[cell] = cell + 100;
      f[cell + 100] = 1;
      burgs.push({
        x: 0,
        y: 0,
        cell,
        port: 1,
        population: 10,
        capital: 0,
        citadel: 0,
        ...o
      } as Burg);
    }

    worldContext.pack = {
      burgs,
      states: [{} as State, { i: 1, name: "Testland" } as State, { i: 2, name: "Other" } as State],
      cells: { haven, f },
      features: [{}, { i: 1, type: "ocean" }],
      cultures: [{}, { i: 1, type: "Naval", name: "Sea Folk", base: 0, shield: "" }]
    } as unknown as PackedGraph;
  }

  it("seeds hulls for port-owning states and records them by owner", () => {
    installPack({
      burgs: [
        { i: 1, state: 1, capital: 1, citadel: 1, population: 30 },
        { i: 2, state: 1, population: 12 },
        { i: 3, state: 2, population: 8 }
      ]
    });

    const seeded = seedInitialFleets([], new Map());
    expect(seeded).toBeGreaterThan(0);

    const hulls = getHulls();
    expect(hulls.length).toBe(seeded);
    expect(hulls.every(h => h.status === "voyage" || h.status === "docked")).toBe(true);

    const state1 = hulls.filter(h => h.owner === "state" && h.ownerId === 1);
    const market = hulls.filter(h => h.owner === "market");
    expect(state1.length).toBeGreaterThan(0);
    expect(market.length).toBeGreaterThan(0);

    // completedHulls counters match individual hulls
    let accounted = 0;
    for (const h of hulls) {
      accounted += 1;
      expect(getCompletedHulls(h.owner, h.ownerId, h.shipClassId)).toBeGreaterThan(0);
    }
    expect(accounted).toBe(seeded);
  });

  it("raises state tech points to cover the highest seeded class", () => {
    installPack({
      period: "ageOfExploration",
      burgs: Array.from({ length: 8 }, (_, i) => ({
        i: i + 1,
        state: 1,
        capital: i === 0 ? 1 : 0,
        citadel: i === 0 ? 1 : 0,
        population: 20 - i
      }))
    });

    seedInitialFleets(
      [
        { burgId: 1, forestRatio: 0.5, loggingCellId: 1 },
        { burgId: 2, forestRatio: 0.5, loggingCellId: 2 },
        { burgId: 3, forestRatio: 0.5, loggingCellId: 3 }
      ],
      new Map()
    );

    const hasGalleon = getHulls().some(h => h.shipClassId === "galleon" && h.owner === "state");
    if (hasGalleon) {
      expect(getStateTechPoints(1)).toBeGreaterThanOrEqual(150);
    } else {
      // Still at least caravel-level for a major/oceanic ageOfExploration fleet.
      expect(getStateTechPoints(1)).toBeGreaterThanOrEqual(50);
    }
  });

  it("does not seed hulls on frontier land-origin maps", () => {
    installPack({
      burgs: [{ i: 1, state: 1, capital: 1, citadel: 1, population: 30 }]
    });
    worldContext.options = {
      ...(worldContext.options ?? {}),
      initialSettlementPattern: "frontier",
      frontierStartMode: "landOrigin"
    };

    expect(seedInitialFleets([], new Map())).toBe(0);
    expect(getHulls()).toHaveLength(0);
  });

  it("still seeds hulls on frontier seaborne maps", () => {
    installPack({
      burgs: [{ i: 1, state: 1, capital: 1, citadel: 1, population: 30 }]
    });
    worldContext.options = {
      ...(worldContext.options ?? {}),
      historicalPeriod: "highMedieval",
      initialSettlementPattern: "frontier",
      frontierStartMode: "seaborne"
    };

    expect(seedInitialFleets([], new Map())).toBeGreaterThan(0);
  });

  it("leaves only a 1–2 ship remnant per seaborne landing colony", () => {
    installPack({
      period: "ageOfExploration",
      burgs: [
        { i: 1, state: 1, capital: 1, citadel: 1, population: 8 },
        { i: 2, state: 2, capital: 1, citadel: 1, population: 6 },
        { i: 3, state: 3, capital: 1, citadel: 1, population: 5 }
      ]
    });
    worldContext.pack.states = [
      {} as State,
      { i: 1, name: "A" } as State,
      { i: 2, name: "B" } as State,
      { i: 3, name: "C" } as State
    ];
    worldContext.options = {
      ...(worldContext.options ?? {}),
      historicalPeriod: "ageOfExploration",
      initialSettlementPattern: "frontier",
      frontierStartMode: "seaborne"
    };

    const seeded = seedInitialFleets([], new Map());
    const hulls = getHulls();
    expect(seeded).toBeGreaterThanOrEqual(3);
    expect(seeded).toBeLessThanOrEqual(3 * SEABORNE_LANDING_REMNANT_MAX);
    expect(hulls).toHaveLength(seeded);
    expect(hulls.every(h => h.owner === "state")).toBe(true);
    expect(hulls.every(h => h.shipClassId !== "galleon")).toBe(true);

    const byState = new Map<number, number>();
    for (const hull of hulls) {
      byState.set(hull.ownerId, (byState.get(hull.ownerId) ?? 0) + 1);
    }
    expect([...byState.values()].every(count => count >= 1 && count <= SEABORNE_LANDING_REMNANT_MAX)).toBe(true);
  });

  it("skips states with no ocean ports", () => {
    installPack({ burgs: [{ i: 1, state: 1, port: 0, population: 50 }] });
    // Override: no ocean haven
    (worldContext.pack.cells.haven as Uint16Array)[1] = 0;

    expect(seedInitialFleets([], new Map())).toBe(0);
    expect(getHulls()).toHaveLength(0);
  });

  it("collectOceanPortsByState ignores free-city ports (state 0)", () => {
    installPack({
      burgs: [
        { i: 1, state: 0, population: 40 },
        { i: 2, state: 1, population: 10 }
      ]
    });
    const map = collectOceanPortsByState(worldContext.pack, new Set());
    expect(map.has(0)).toBe(false);
    expect(map.get(1)?.length).toBe(1);
  });
});
