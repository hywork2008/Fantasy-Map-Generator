import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./foodProduction", () => ({ getStapleFoodGood: () => ({ i: 7, value: 1 }) }));

import { DEFAULT_MARKET_SETTINGS, setMarketSettings } from "../../../simulation/marketSettings";
import { getReferenceSubsistenceWage, getSubsistenceWage, WAGE_SUBSISTENCE_MULTIPLE } from "./subsistenceWage";

describe("getSubsistenceWage", () => {
  afterEach(() => setMarketSettings(DEFAULT_MARKET_SETTINGS));

  it("is the multiple of 1,000 people's monthly food bill at the local grain price", () => {
    const perPointMonthAtOneSp = (DEFAULT_MARKET_SETTINGS.wageSubsistenceMultiple * 0.43 * 1000) / 12;
    expect(getSubsistenceWage({ goods: {} })).toBeCloseTo(perPointMonthAtOneSp, 6);
    expect(getSubsistenceWage({ goods: { 7: { stock: 0, price: 2 } } } as never)).toBeCloseTo(
      2 * perPointMonthAtOneSp,
      6
    );
  });

  it("follows the wage setting, while the reference wage stays at the default multiple", () => {
    const reference = getReferenceSubsistenceWage({ goods: {} });
    setMarketSettings({ ...DEFAULT_MARKET_SETTINGS, wageSubsistenceMultiple: 12 });
    expect(getSubsistenceWage({ goods: {} })).toBeCloseTo((reference * 12) / WAGE_SUBSISTENCE_MULTIPLE, 6);
    expect(getReferenceSubsistenceWage({ goods: {} })).toBeCloseTo(reference, 6);
  });
});
