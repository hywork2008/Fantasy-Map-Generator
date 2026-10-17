import { describe, expect, it, vi } from "vitest";

vi.mock("./foodProduction", () => ({ getStapleFoodGood: () => ({ i: 7, value: 1 }) }));

import { getSubsistenceWage, WAGE_SUBSISTENCE_MULTIPLE } from "./subsistenceWage";

describe("getSubsistenceWage", () => {
  it("is the multiple of 1,000 people's monthly food bill at the local grain price", () => {
    const perPointMonthAtOneSp = (WAGE_SUBSISTENCE_MULTIPLE * 0.43 * 1000) / 12;
    expect(getSubsistenceWage({ goods: {} })).toBeCloseTo(perPointMonthAtOneSp, 6);
    expect(getSubsistenceWage({ goods: { 7: { stock: 0, price: 2 } } } as never)).toBeCloseTo(
      2 * perPointMonthAtOneSp,
      6
    );
  });
});
