import { describe, expect, it } from "vitest";
import { replacementAwareBirths } from "./demographyBirths";

describe("replacementAwareBirths", () => {
  it("floors births at this step's natural deaths when the site is at capacity", () => {
    expect(
      replacementAwareBirths({
        femaleAdults: 25,
        baseGrowthRate: 0.25,
        deltaYears: 1,
        roomForGrowth: 0,
        naturalDeaths: 4
      })
    ).toBe(4);
  });

  it("uses logistic growth when that exceeds replacement", () => {
    expect(
      replacementAwareBirths({
        femaleAdults: 40,
        baseGrowthRate: 0.25,
        deltaYears: 1,
        roomForGrowth: 0.5,
        naturalDeaths: 2
      })
    ).toBeCloseTo(5);
  });

  it("does not replace deaths while over capacity", () => {
    expect(
      replacementAwareBirths({
        femaleAdults: 40,
        baseGrowthRate: 0.25,
        deltaYears: 1,
        roomForGrowth: -0.1,
        naturalDeaths: 8
      })
    ).toBe(0);
  });

  it("cannot replace deaths without adult women", () => {
    expect(
      replacementAwareBirths({
        femaleAdults: 0,
        baseGrowthRate: 0.25,
        deltaYears: 1,
        roomForGrowth: 0,
        naturalDeaths: 5
      })
    ).toBe(0);
  });

  it("takes an extra floor (urban pregnancy due) without summing", () => {
    expect(
      replacementAwareBirths({
        femaleAdults: 40,
        baseGrowthRate: 0.25,
        deltaYears: 1,
        roomForGrowth: 0.1,
        naturalDeaths: 1,
        extraFloor: 3
      })
    ).toBe(3);
  });
});
