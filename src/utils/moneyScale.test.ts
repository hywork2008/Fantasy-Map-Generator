import { describe, expect, it } from "vitest";
import { computeMoneyScale } from "./moneyScale";

describe("computeMoneyScale", () => {
  it("keeps legacy maps without a money scale base at 1", () => {
    expect(computeMoneyScale({}, 1000)).toBe(1);
    expect(computeMoneyScale(undefined, 1000)).toBe(1);
  });

  it("scales the base with the population rate", () => {
    expect(computeMoneyScale({ moneyScaleBase: 16 }, 1000)).toBe(16);
    expect(computeMoneyScale({ moneyScaleBase: 16 }, 500)).toBe(8);
  });
});
