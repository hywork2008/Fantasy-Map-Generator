import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMineOperations, setMineralDeposits } from "../economyContext";
import { getMineralOverviewState } from "../store/mineralOverviewState";
import { refreshMineralOverview } from "./mineralOverview";

describe("refreshMineralOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [undefined, { i: 1, name: "Ironford" }]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("reports all mineral types, including an unprospected supply and an absent material", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 4,
        type: "skarn",
        primaryCommodity: "iron",
        commodities: ["iron", "copper"],
        yields: [
          { commodity: "iron", reserveTons: 900, annualCapacityTons: 180 },
          { commodity: "copper", reserveTons: 50, annualCapacityTons: 8.75 }
        ],
        richness: 5,
        depth: "deep",
        accessibility: 0.7,
        discovered: true,
        exhausted: false
      },
      {
        i: 2,
        districtId: 2,
        cell: 8,
        type: "graniteTin",
        primaryCommodity: "tin",
        commodities: ["tin"],
        yields: [{ commodity: "tin", reserveTons: 80, annualCapacityTons: 8 }],
        richness: 2,
        depth: "surface",
        accessibility: 0.35,
        discovered: false,
        exhausted: false
      }
    ]);
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 34,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: { iron: 120, copper: 6 },
        active: true
      }
    ]);

    refreshMineralOverview();

    const state = getMineralOverviewState();
    expect(state.commodities).toHaveLength(9);
    expect(state.commodities.find(row => row.commodity === "iron")).toMatchObject({
      depositCount: 1,
      activeMineCount: 1,
      reserveTons: 900,
      annualOutputTons: 120,
      status: "active"
    });
    expect(state.commodities.find(row => row.commodity === "tin")).toMatchObject({
      depositCount: 1,
      discoveredCount: 0,
      status: "unprospected"
    });
    expect(state.commodities.find(row => row.commodity === "gold")).toMatchObject({
      depositCount: 0,
      status: "absent"
    });
    expect(state.deposits[0]).toMatchObject({
      id: 1,
      burgName: "Ironford",
      primaryCommodity: "iron",
      commodities: "iron, copper",
      status: "active",
      annualOutputTons: 126
    });
  });
});
