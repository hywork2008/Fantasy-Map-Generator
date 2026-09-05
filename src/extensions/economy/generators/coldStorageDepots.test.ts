import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  clearEconomyContext,
  getColdStorageDepots,
  getMarkets,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { COLD_STORAGE_DEPOT_BUDGET, FACILITY_MAINTENANCE_RATE } from "./chemMedCommon";
import { COLD_STORAGE_DEPOT_BASE_CAPACITY, ColdStorageDepots } from "./coldStorageDepots";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

describe("ColdStorageDepotsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1925 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Chillmark", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "LNG", tags: [], value: 12, unit: "therm", icon: "good-unknown", color: "#cfe8f0" },
      { i: 2, name: "Machine Parts", tags: [], value: 18, unit: "crate", icon: "good-unknown", color: "#6d7380" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 12 },
          2: { stock: 100, price: 18 }
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

  it("does not create a depot for a State where mechanicalRefrigeration has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(ColdStorageDepots.settleAnnual()).toBe(true);
    expect(getColdStorageDepots()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(200);
  });

  it("creates a depot, debits the budget, consumes LNG/Machine Parts, and computes storageCapacity once known", () => {
    setTechnologyProgressForTests([
      { technologyId: "mechanicalRefrigeration", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ColdStorageDepots.settleAnnual()).toBe(true);

    const depots = getColdStorageDepots();
    expect(depots).toHaveLength(1);
    expect(depots[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1, documentedRuns: 1 });
    // Trial-role capacity: COLD_STORAGE_DEPOT_BASE_CAPACITY * 0.25 * utilization(1).
    expect(depots[0]?.storageCapacity).toBe(COLD_STORAGE_DEPOT_BASE_CAPACITY * 0.25);
    // Same double-debit shape as PowerStations: one charge to found, one for this year's run.
    // One full charge to found the depot, one reduced FACILITY_MAINTENANCE_RATE renewal charge for
    // this year's operation (docs/plan/treasury-structural-deficit-investigation.md §8.2, fix "A").
    expect(worldContext.pack.states[1].treasury).toBe(
      200 - COLD_STORAGE_DEPOT_BUDGET - rn(COLD_STORAGE_DEPOT_BUDGET * FACILITY_MAINTENANCE_RATE, 2)
    );

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 2); // LNG consumed
    expect(market?.goods[2]?.stock).toBe(100 - 1.2); // Machine Parts consumed
  });

  it("reduces utilization and leaves storageCapacity at 0 when LNG stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.5, price: 12 },
          2: { stock: 100, price: 18 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "mechanicalRefrigeration", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ColdStorageDepots.settleAnnual()).toBe(true);

    const depots = getColdStorageDepots();
    expect(depots[0]?.utilization).toBeLessThan(0.5);
    expect(depots[0]).toMatchObject({
      documentedRuns: 0,
      storageCapacity: 0,
      lastFailureReason: "materialShortage"
    });
  });

  it("marks the depot inactive with fundingCut when the State cannot afford the annual budget", () => {
    worldContext.pack.states[1].treasury = COLD_STORAGE_DEPOT_BUDGET; // enough to found, not to operate
    setTechnologyProgressForTests([
      { technologyId: "mechanicalRefrigeration", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ColdStorageDepots.settleAnnual()).toBe(true);

    const depots = getColdStorageDepots();
    expect(depots[0]).toMatchObject({ active: false, storageCapacity: 0, lastFailureReason: "fundingCut" });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("promotes a trial depot to service once mechanicalRefrigeration reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "mechanicalRefrigeration", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(ColdStorageDepots.settleAnnual()).toBe(true);
    expect(getColdStorageDepots()[0]?.role).toBe("trial");
    expect(getColdStorageDepots()[0]?.storageCapacity).toBe(COLD_STORAGE_DEPOT_BASE_CAPACITY * 0.25);

    worldContext.options = { year: 1926 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "mechanicalRefrigeration", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(ColdStorageDepots.settleAnnual()).toBe(true);
    expect(getColdStorageDepots()[0]?.role).toBe("service");
    // Full-scale capacity once promoted to service (role factor 1 instead of 0.25).
    expect(getColdStorageDepots()[0]?.storageCapacity).toBe(COLD_STORAGE_DEPOT_BASE_CAPACITY);
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "mechanicalRefrigeration", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(ColdStorageDepots.settleAnnual()).toBe(true);
    expect(ColdStorageDepots.settleAnnual()).toBe(false);
  });
});
