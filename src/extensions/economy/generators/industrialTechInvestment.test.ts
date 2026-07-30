import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMineOperations,
  getSmelterOperations,
  initEconomyContext,
  setGoods,
  setMarkets,
  setMineOperations,
  setMineralDeposits,
  setSmelterOperations
} from "../economyContext";
import { Goods } from "./goods-generator";
import { IndustrialTechInvestment } from "./industrialTechInvestment";
import { Markets } from "./markets-generator";

const TOOLS_ID = 1;

describe("IndustrialTechInvestmentModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
    } as unknown as PackedGraph;
    setGoods([
      {
        i: TOOLS_ID,
        name: "Tools",
        tags: ["construction", "military"],
        value: 14,
        unit: "set",
        icon: "tools",
        color: "#808080"
      }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [TOOLS_ID]: { stock: 100, price: 14 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 2,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => clearEconomyContext());

  it("raises MineOperation.toolsInvestmentStock and spends the market treasury", () => {
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 10,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);

    IndustrialTechInvestment.settleAnnual();

    const mine = getMineOperations()[0];
    expect(mine.toolsInvestmentStock).toBeGreaterThan(0);
    expect(Markets.get(1)?.marketTreasury?.balance).toBeLessThan(1000);
    expect(Markets.get(1)?.goods[TOOLS_ID].stock).toBeLessThan(100);
  });

  it("raises SmelterOperation.toolsInvestmentStock independently of MineOperation", () => {
    setSmelterOperations([
      {
        i: 1,
        depositId: 1,
        cell: 0,
        burgId: 1,
        marketId: 1,
        waterPower: 1,
        fuelAccess: 1,
        technology: 1,
        smeltingYield: 0.8,
        annualCapacityTons: 120,
        workers: 10,
        securityInvestment: 0,
        lastSecurityUpkeep: 0,
        lastTheftLoss: 0,
        lastTheftRisk: 0,
        active: true
      }
    ]);

    IndustrialTechInvestment.settleAnnual();

    expect(getSmelterOperations()[0].toolsInvestmentStock).toBeGreaterThan(0);
  });

  it("decays toolsInvestmentStock for an inactive operation instead of buying more", () => {
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 0,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        toolsInvestmentStock: 0.5,
        annualOutputTons: {},
        active: false
      }
    ]);

    IndustrialTechInvestment.settleAnnual();

    const mine = getMineOperations()[0];
    expect(mine.toolsInvestmentStock).toBeLessThan(0.5);
    expect(Markets.get(1)?.marketTreasury?.balance).toBe(1000);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 10,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);

    IndustrialTechInvestment.settleAnnual();
    const stockAfterFirstCall = getMineOperations()[0].toolsInvestmentStock;
    IndustrialTechInvestment.settleAnnual();

    expect(getMineOperations()[0].toolsInvestmentStock).toBe(stockAfterFirstCall);
  });
});
