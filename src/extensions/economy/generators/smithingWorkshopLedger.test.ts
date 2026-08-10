import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, getSmithingWorkshopLedgers, initEconomyContext } from "../economyContext";
import { SmithingWorkshopAccounting } from "./smithingWorkshopLedger";

describe("SmithingWorkshopAccounting", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    SmithingWorkshopAccounting.beginProductionCycle();
  });

  afterEach(() => clearEconomyContext());

  it("records material purchases, output, sales, guild profit, and the master's wage in one workshop ledger", () => {
    SmithingWorkshopAccounting.recordProduction({
      burgId: 4,
      goodId: 9,
      materials: [
        { goodId: 2, units: 0.5 },
        { goodId: 3, units: 1 }
      ],
      materialCost: 6,
      unitsProduced: 2,
      masterCharacterId: 12
    });
    SmithingWorkshopAccounting.recordSale(4, 9, 2, 18, 4.2);
    SmithingWorkshopAccounting.recordMasterWage(4, 12, 1.05);

    expect(getSmithingWorkshopLedgers()).toEqual([
      {
        burgId: 4,
        masterCharacterId: 12,
        masterWagesPaid: 1.05,
        productLines: [
          {
            goodId: 9,
            materials: [
              { goodId: 2, units: 0.5 },
              { goodId: 3, units: 1 }
            ],
            materialCost: 6,
            unitsProduced: 2,
            unitsSold: 2,
            salesRevenue: 18,
            realizedMargin: 12,
            guildProfit: 4.2
          }
        ]
      }
    ]);
  });

  it("resets the records at the next production cycle", () => {
    SmithingWorkshopAccounting.recordMasterWage(4, 12, 1.05);
    SmithingWorkshopAccounting.beginProductionCycle();

    expect(getSmithingWorkshopLedgers()).toEqual([]);
  });
});
