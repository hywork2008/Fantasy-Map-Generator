import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../context/cellTables", () => ({ getOrCreateFaunaStockTable: () => ({ "0:Cattle": { breeding: 8 } }) }));
vi.mock("../economyContext", () => ({ getMarketCellColumn: () => [7] }));

import { DEFAULT_MARKET_SETTINGS, setMarketSettings } from "../../../simulation/marketSettings";
import { getDairyDemandPerHead } from "./dairyDemand";
import type { Market } from "./marketTypes";

describe("getDairyDemandPerHead (docs/plan/dairy-demand.md)", () => {
  afterEach(() => setMarketSettings(DEFAULT_MARKET_SETTINGS));

  it("starts from the market's own herds and wants less cheese when it is dear", () => {
    const market = { i: 7 } as Market;
    // 8 breeding cattle × 0.375 × 500 L = 1,500 L for 10 people: 150 L a person.
    const atValue = getDairyDemandPerHead(market, 10, [0], 14, 14);
    expect(market.dairyTraditionLitersPerHead).toBeCloseTo(150);
    expect(atValue.milkLiters + atValue.cheeseKilograms * 10).toBeCloseTo(150);
    expect(getDairyDemandPerHead(market, 10, [0], 28, 14).cheeseKilograms).toBeCloseTo(
      atValue.cheeseKilograms * 2 ** -0.8
    );
  });

  it("drops cheese above the animal-protein cap left after meat", () => {
    // 30 g a day is 10.95 kg a year; 60 kg of meat at 150 g/kg is 9 kg, leaving 1.95 kg.
    const market = { i: 7, dairyTraditionLitersPerHead: 150, meatKilogramsPerHeadYear: 60 } as Market;
    const demand = getDairyDemandPerHead(market, 10, [0], 14, 14);
    expect(demand.milkLiters * 0.033 + demand.cheeseKilograms * 0.25).toBeCloseTo(1.95);
  });

  it("keeps the old fixed targets when chosen", () => {
    setMarketSettings({ ...DEFAULT_MARKET_SETTINGS, dairyDemand: "fixedTargets" });
    expect(getDairyDemandPerHead({ i: 7 } as Market, 10, [0], 28, 14)).toEqual({ milkLiters: 20, cheeseKilograms: 25 });
  });
});
