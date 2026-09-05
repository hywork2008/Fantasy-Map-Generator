import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  clearEconomyContext,
  getFloodProtection,
  getLevees,
  getMarkets,
  initEconomyContext,
  setFloodProtection,
  setGoods,
  setLeveeSites,
  setMarkets
} from "../economyContext";
import { CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE, LEVEE_BUDGET } from "./chemMedCommon";
import { Goods } from "./goods-generator";
import { Levees, MAX_LEVEES_PER_STATE } from "./levees";
import type { LeveeSite } from "./leveeTypes";
import { Markets } from "./markets-generator";

function makeSite(overrides: Partial<LeveeSite> = {}): LeveeSite {
  return {
    i: 1,
    riverId: 1,
    cells: [5, 6, 7],
    x: 0,
    y: 0,
    meanFloodHazard: 0.6,
    qualityScore: 0.5,
    ...overrides
  };
}

describe("LeveesModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1880 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false }],
      cells: { state: { 5: 1, 6: 1, 7: 1 }, p: { 5: [0, 0] }, i: [0, 1, 2, 3, 4, 5, 6, 7] }
    } as unknown as PackedGraph;
    setLeveeSites([makeSite()]);
    setGoods([
      { i: 1, name: "Stone", tags: [], value: 4, unit: "block", icon: "good-stone", color: "#888" },
      { i: 2, name: "Timber", tags: [], value: 3, unit: "log", icon: "good-timber", color: "#654" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 4 },
          2: { stock: 100, price: 3 }
        }
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("does not found a levee when the State cannot afford LEVEE_BUDGET", () => {
    worldContext.pack.states[1].treasury = LEVEE_BUDGET - 1;
    expect(Levees.settleAnnual()).toBe(true);
    expect(getLevees()).toHaveLength(0);
  });

  it("founds a levee at the site within the State's territory, debits budget twice, consumes Stone/Timber", () => {
    expect(Levees.settleAnnual()).toBe(true);

    const levees = getLevees();
    expect(levees).toHaveLength(1);
    expect(levees[0]).toMatchObject({
      siteId: 1,
      stateId: 1,
      burgId: 1,
      active: true,
      utilization: 1
    });
    expect(levees[0].protectionRating).toBeGreaterThan(0);
    // Same double-debit shape as Dams: one charge to found, one for this year's run.
    // One full charge to found the levee, one reduced CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE renewal
    // charge for this year's operation (docs/plan/treasury-structural-deficit-investigation.md
    // §8.2, fix "A").
    expect(worldContext.pack.states[1].treasury).toBe(
      200 - LEVEE_BUDGET - rn(LEVEE_BUDGET * CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE, 2)
    );

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 1); // Stone consumed
    expect(market?.goods[2]?.stock).toBe(100 - 3); // Timber consumed
  });

  it("drops utilization and protectionRating to 0 when Stone/Timber are scarce", () => {
    setMarkets([
      { i: 1, centerBurgId: 1, color: "#111", goods: { 1: { stock: 0.2, price: 4 }, 2: { stock: 100, price: 3 } } }
    ]);
    Markets.sync();

    expect(Levees.settleAnnual()).toBe(true);
    const levee = getLevees()[0];
    expect(levee.utilization).toBeLessThan(0.5);
    expect(levee).toMatchObject({ protectionRating: 0, lastFailureReason: "materialShortage" });
  });

  it("marks the levee inactive with fundingCut when the State cannot afford the annual upkeep", () => {
    worldContext.pack.states[1].treasury = LEVEE_BUDGET; // enough to found, not to also run this year
    expect(Levees.settleAnnual()).toBe(true);
    expect(getLevees()[0]).toMatchObject({ active: false, protectionRating: 0, lastFailureReason: "fundingCut" });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("self-gates to once per simulation year", () => {
    expect(Levees.settleAnnual()).toBe(true);
    expect(Levees.settleAnnual()).toBe(false);
  });

  it("caps concurrent active levees per State at MAX_LEVEES_PER_STATE", () => {
    setLeveeSites(
      Array.from({ length: MAX_LEVEES_PER_STATE + 1 }, (_, index) =>
        makeSite({ i: index + 1, cells: [5, 6, 7], qualityScore: 1 - index * 0.01 })
      )
    );
    worldContext.pack.states[1].treasury = 10_000;

    for (let year = 1880; year < 1880 + MAX_LEVEES_PER_STATE + 1; year++) {
      worldContext.options = { year } as typeof worldContext.options;
      Levees.settleAnnual();
    }

    expect(getLevees().filter(levee => levee.stateId === 1 && levee.active)).toHaveLength(MAX_LEVEES_PER_STATE);
  });

  it("raises floodProtectionByCell uniformly across the site's reach, without lowering an existing higher value", () => {
    const existing = new Float32Array(8);
    existing[5] = 0.99; // higher than anything this levee could produce — must survive untouched
    setFloodProtection(existing);

    expect(Levees.settleAnnual()).toBe(true);

    const protection = getFloodProtection();
    const levee = getLevees()[0];
    expect(protection[5]).toBeCloseTo(0.99, 4);
    expect(protection[6]).toBeCloseTo(levee.protectionRating, 4);
    expect(protection[7]).toBeCloseTo(levee.protectionRating, 4); // uniform, no taper unlike Dam
  });
});
