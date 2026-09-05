import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  clearEconomyContext,
  getDams,
  getFloodProtection,
  getMarkets,
  initEconomyContext,
  setDamSites,
  setFloodProtection,
  setGoods,
  setMarkets
} from "../economyContext";
import { CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE, DAM_BUDGET } from "./chemMedCommon";
import { Dams, HYDRO_BASE_CAPACITY, MAX_DAMS_PER_STATE } from "./dams";
import type { DamSite } from "./damTypes";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

function makeSite(overrides: Partial<DamSite> = {}): DamSite {
  return {
    i: 1,
    cell: 5,
    x: 0,
    y: 0,
    riverId: 1,
    dischargePotential: 0.6,
    headPotential: 0.8,
    qualityScore: 0.7,
    downstreamCells: [6, 7],
    ...overrides
  };
}

describe("DamsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1880 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false }],
      cells: { state: { 5: 1, 6: 1, 7: 1 }, p: { 5: [0, 0] }, i: [0, 1, 2, 3, 4, 5, 6, 7] }
    } as unknown as PackedGraph;
    setDamSites([makeSite()]);
    setGoods([
      { i: 1, name: "Stone", tags: [], value: 4, unit: "block", icon: "good-stone", color: "#888" },
      { i: 2, name: "Timber", tags: [], value: 3, unit: "log", icon: "good-timber", color: "#654" },
      { i: 3, name: "Copper Wire", tags: [], value: 16, unit: "coil", icon: "good-unknown", color: "#c98a4b" },
      { i: 4, name: "Machine Parts", tags: [], value: 18, unit: "crate", icon: "good-unknown", color: "#6d7380" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 4 },
          2: { stock: 100, price: 3 },
          3: { stock: 100, price: 16 },
          4: { stock: 100, price: 18 }
        }
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("does not found a dam when the State cannot afford DAM_BUDGET", () => {
    worldContext.pack.states[1].treasury = DAM_BUDGET - 1;
    expect(Dams.settleAnnual()).toBe(true);
    expect(getDams()).toHaveLength(0);
  });

  it("founds a dam at the site within the State's territory, debits budget twice, consumes Stone/Timber", () => {
    expect(Dams.settleAnnual()).toBe(true);

    const dams = getDams();
    expect(dams).toHaveLength(1);
    expect(dams[0]).toMatchObject({
      siteId: 1,
      stateId: 1,
      burgId: 1,
      role: "trial",
      active: true,
      utilization: 1,
      documentedRuns: 1,
      electrified: false,
      generationCapacity: 0
    });
    expect(dams[0].floodProtectionRating).toBeGreaterThan(0);
    // Same double-debit shape as PowerStations: one charge to found, one for this year's run.
    // One full charge to found the dam, one reduced CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE renewal
    // charge for this year's operation (docs/plan/treasury-structural-deficit-investigation.md
    // §8.2, fix "A").
    expect(worldContext.pack.states[1].treasury).toBe(
      200 - DAM_BUDGET - rn(DAM_BUDGET * CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE, 2)
    );

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 3); // Stone consumed
    expect(market?.goods[2]?.stock).toBe(100 - 2); // Timber consumed
    expect(market?.goods[3]?.stock).toBe(100); // Copper Wire untouched — not electrified
    expect(market?.goods[4]?.stock).toBe(100); // Machine Parts untouched — not electrified
  });

  it("does not electrify or produce generationCapacity while generatorAndMotor is below known", () => {
    setTechnologyProgressForTests([]);
    expect(Dams.settleAnnual()).toBe(true);
    expect(getDams()[0]).toMatchObject({ electrified: false, generationCapacity: 0 });
  });

  it("electrifies and computes generationCapacity once generatorAndMotor reaches known, without touching Coal", () => {
    setTechnologyProgressForTests([
      { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(Dams.settleAnnual()).toBe(true);

    const dam = getDams()[0];
    expect(dam.electrified).toBe(true);
    expect(dam.generationCapacity).toBeGreaterThan(0);
    expect(dam.generationCapacity).toBeLessThanOrEqual(HYDRO_BASE_CAPACITY);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[3]?.stock).toBe(100 - 0.6); // Copper Wire consumed
    expect(market?.goods[4]?.stock).toBe(100 - 0.8); // Machine Parts consumed
  });

  it("drops utilization and floodProtectionRating to 0 when Stone/Timber are scarce", () => {
    setMarkets([
      { i: 1, centerBurgId: 1, color: "#111", goods: { 1: { stock: 0.5, price: 4 }, 2: { stock: 100, price: 3 } } }
    ]);
    Markets.sync();

    expect(Dams.settleAnnual()).toBe(true);
    const dam = getDams()[0];
    expect(dam.utilization).toBeLessThan(0.5);
    expect(dam).toMatchObject({ documentedRuns: 0, floodProtectionRating: 0, lastFailureReason: "materialShortage" });
  });

  it("marks the dam inactive with fundingCut when the State cannot afford the annual upkeep", () => {
    worldContext.pack.states[1].treasury = DAM_BUDGET; // enough to found, not to also run this year
    expect(Dams.settleAnnual()).toBe(true);
    expect(getDams()[0]).toMatchObject({ active: false, generationCapacity: 0, lastFailureReason: "fundingCut" });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("promotes a dam to service after DAM_SERVICE_THRESHOLD years of utilization >= 0.5", () => {
    expect(Dams.settleAnnual()).toBe(true);
    expect(getDams()[0].role).toBe("trial");

    worldContext.options = { year: 1881 } as typeof worldContext.options;
    expect(Dams.settleAnnual()).toBe(true);
    expect(getDams()[0].role).toBe("trial");

    worldContext.options = { year: 1882 } as typeof worldContext.options;
    expect(Dams.settleAnnual()).toBe(true);
    expect(getDams()[0]).toMatchObject({ role: "service", documentedRuns: 3 });
  });

  it("self-gates to once per simulation year", () => {
    expect(Dams.settleAnnual()).toBe(true);
    expect(Dams.settleAnnual()).toBe(false);
  });

  it("caps concurrent active dams per State at MAX_DAMS_PER_STATE", () => {
    setDamSites(
      Array.from({ length: MAX_DAMS_PER_STATE + 1 }, (_, index) =>
        makeSite({ i: index + 1, cell: 5, qualityScore: 1 - index * 0.01 })
      )
    );
    worldContext.pack.states[1].treasury = 10_000;

    for (let year = 1880; year < 1880 + MAX_DAMS_PER_STATE + 1; year++) {
      worldContext.options = { year } as typeof worldContext.options;
      Dams.settleAnnual();
    }

    expect(getDams().filter(dam => dam.stateId === 1 && dam.active)).toHaveLength(MAX_DAMS_PER_STATE);
  });

  it("raises floodProtectionByCell at the site and tapers across downstreamCells, without lowering an existing higher value", () => {
    const existing = new Float32Array(8);
    existing[5] = 0.99; // higher than anything this dam could produce — must survive untouched
    setFloodProtection(existing);

    expect(Dams.settleAnnual()).toBe(true);

    const protection = getFloodProtection();
    expect(protection[5]).toBeCloseTo(0.99, 4);
    expect(protection[6]).toBeGreaterThan(0);
    expect(protection[7]).toBeGreaterThan(0);
    expect(protection[7]).toBeLessThan(protection[6]); // protection tapers with downstream distance
  });
});
