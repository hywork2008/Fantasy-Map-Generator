import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMineOperations, setMineralDeposits } from "../economyContext";
import { getMineralOverviewState } from "../store/mineralOverviewState";
import { refreshMineralOverview } from "./mineralOverview";

describe("refreshMineralOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [undefined, { i: 1, name: "Ironford" }],
      cells: { state: Uint16Array.from([0, 1, 2, 0, 1, 0, 0, 0, 2]) },
      states: [{ i: 0 } as State, { i: 1, name: "Ferrum" } as State, { i: 2, name: "Cassiteria" } as State]
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
    // 6 ore + coal/saltpeter/sulfur/phosphate rock/bauxite (docs/plan/phosphate-fertilizer-
    // vertical-slice.md §3.2, docs/plan/electrolytic-industry-vertical-slice.md §3.2).
    expect(state.commodities).toHaveLength(11);
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

  it("filters both resource totals and deposit rows by the State containing each deposit", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
        type: "skarn",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 900, annualCapacityTons: 180 }],
        richness: 5,
        depth: "deep",
        accessibility: 0.7,
        discovered: true,
        exhausted: false
      },
      {
        i: 2,
        districtId: 2,
        cell: 2,
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
    setMineOperations([]);

    refreshMineralOverview(1);

    const state = getMineralOverviewState();
    expect(state.states).toEqual([
      { id: 2, name: "Cassiteria" },
      { id: 1, name: "Ferrum" }
    ]);
    expect(state.deposits).toHaveLength(1);
    expect(state.deposits[0]).toMatchObject({ id: 1, stateId: 1, stateName: "Ferrum" });
    expect(state.commodities.find(row => row.commodity === "iron")).toMatchObject({
      depositCount: 1,
      reserveTons: 900
    });
    expect(state.commodities.find(row => row.commodity === "tin")).toMatchObject({
      depositCount: 0,
      status: "absent"
    });
  });

  it("shows an import in transit and an Enemy embargo for a State without an iron deposit", () => {
    worldContext.pack.goods = [
      { i: 10, name: "Iron Ingot" },
      { i: 11, name: "Iron Ore" }
    ] as PackedGraph["goods"];
    setMineralDeposits([]);
    setMineOperations([]);
    worldContext.pack.strategicProcurementOrders = [
      {
        id: 1,
        stateId: 1,
        destinationMarketId: 1,
        goodId: 10,
        requestedUnits: 4,
        fulfilledUnits: 0,
        maxLandedUnitPrice: 10,
        status: "inTransit",
        purpose: "metallurg"
      }
    ];

    refreshMineralOverview(1);

    expect(getMineralOverviewState().commodities.find(row => row.commodity === "iron")).toMatchObject({
      accessStatus: "importing",
      incomingUnits: 4
    });

    worldContext.pack.strategicProcurementOrders[0] = {
      ...worldContext.pack.strategicProcurementOrders[0],
      status: "blocked",
      blockedReason: "foreignPolicy"
    };
    refreshMineralOverview(1);

    expect(getMineralOverviewState().commodities.find(row => row.commodity === "iron")).toMatchObject({
      accessStatus: "embargoed",
      incomingUnits: 0
    });
  });
});
