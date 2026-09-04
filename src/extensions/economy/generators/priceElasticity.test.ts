import { describe, expect, it } from "vitest";
import {
  applyPriceElasticity,
  DEFAULT_FOOD_PRICE_ELASTICITY,
  DEFAULT_LUXURY_PRICE_ELASTICITY,
  getPriceElasticity,
  PRICE_ADJUSTMENT_RATE,
  relaxMarketPrice
} from "./priceElasticity";

describe("getPriceElasticity", () => {
  it("uses an explicit field, including 0", () => {
    expect(getPriceElasticity({ tags: ["food"], priceElasticity: -1 })).toBe(-1);
    expect(getPriceElasticity({ tags: ["luxury"], priceElasticity: 0 })).toBe(0);
  });

  it("defaults food and luxury from tags / demand coverage when unset", () => {
    expect(getPriceElasticity({ tags: ["food"] })).toBe(DEFAULT_FOOD_PRICE_ELASTICITY);
    expect(getPriceElasticity({ tags: [], demandCoverage: { food: 1 } })).toBe(DEFAULT_FOOD_PRICE_ELASTICITY);
    expect(getPriceElasticity({ tags: ["luxury"] })).toBe(DEFAULT_LUXURY_PRICE_ELASTICITY);
    expect(getPriceElasticity({ tags: ["food", "luxury"] })).toBe(DEFAULT_LUXURY_PRICE_ELASTICITY);
    expect(getPriceElasticity({ tags: ["construction"] })).toBe(0);
  });
});

describe("applyPriceElasticity", () => {
  it("is a no-op at elasticity 0 or when price equals value", () => {
    expect(applyPriceElasticity(12, { value: 10, priceElasticity: 0, tags: [] }, 40)).toBe(12);
    expect(applyPriceElasticity(12, { value: 10, priceElasticity: -1, tags: [] }, 10)).toBe(12);
  });

  it("cuts demand when price is above value for a unit-elastic good", () => {
    expect(applyPriceElasticity(10, { value: 10, priceElasticity: -1, tags: [] }, 20)).toBeCloseTo(5, 6);
  });

  it("raises demand when price is below value", () => {
    expect(applyPriceElasticity(10, { value: 10, priceElasticity: -1, tags: [] }, 5)).toBeCloseTo(20, 6);
  });
});

describe("relaxMarketPrice", () => {
  it("closes PRICE_ADJUSTMENT_RATE of the gap toward the target", () => {
    expect(relaxMarketPrice(10, 2.5, 2.5, 30)).toBeCloseTo(10 + (2.5 - 10) * PRICE_ADJUSTMENT_RATE, 6);
  });

  it("snaps to the target when there is no previous price", () => {
    expect(relaxMarketPrice(0, 12, 2.5, 30)).toBe(12);
  });
});
