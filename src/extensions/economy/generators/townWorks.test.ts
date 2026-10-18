import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import { creditHouseholdWealth, debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { payTownWorks, TOWN_WORKS_RESERVE_MONTHS, TOWN_WORKS_TARGET_MONTHS } from "./townWorks";

describe("payTownWorks (docs/plan/farm-labour-calibration.md §12)", () => {
  // One population point at populationRate 1 and urbanization 1, grain price 1.
  const monthlyFoodBill = GROSS_FOOD_NEED / 12;

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.pack = {
      burgs: [{ i: 0 } as unknown as Burg, { i: 1, market: 1, population: 1, treasury: 0 } as unknown as Burg],
      cells: { i: [], h: [], pop: [], state: [] }
    } as unknown as PackedGraph;
    setMarkets([]);
    debitHouseholdWealth(1, getHouseholdWealth(1));
  });

  afterEach(() => clearEconomyContext());

  it("hires from the treasury above its reserve, up to the households' shortfall", () => {
    const burg = worldContext.pack.burgs[1];
    burg.treasury = monthlyFoodBill * (TOWN_WORKS_RESERVE_MONTHS + 100);

    const paid = payTownWorks();

    expect(paid).toBeCloseTo(monthlyFoodBill * TOWN_WORKS_TARGET_MONTHS, 2);
    expect(getHouseholdWealth(1)).toBeCloseTo(paid, 2);
    expect(burg.treasury).toBeCloseTo(monthlyFoodBill * (TOWN_WORKS_RESERVE_MONTHS + 100) - paid, 2);
  });

  it("keeps the reserve and pays nothing to households already holding the target", () => {
    const burg = worldContext.pack.burgs[1];
    burg.treasury = monthlyFoodBill * TOWN_WORKS_RESERVE_MONTHS;
    expect(payTownWorks()).toBe(0);

    burg.treasury = monthlyFoodBill * 1000;
    creditHouseholdWealth(1, monthlyFoodBill * TOWN_WORKS_TARGET_MONTHS);
    expect(payTownWorks()).toBe(0);
  });
});
