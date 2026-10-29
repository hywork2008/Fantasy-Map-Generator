import { describe, expect, it } from "vitest";
import { calculateHerdDietShare, getHerdFoodKcal } from "./herdDiet";

describe("herd diet share", () => {
  const herd = (heads: number) => ({ young: heads * 0.4, breeding: heads * 0.55, old: heads * 0.05 });
  const needPerPerson = 2100 * 365.2425;

  it("holds the wet-land diet share to what the standing herds give", () => {
    const stock = { "0:Cattle": herd(1), "0:Sheep": herd(3), "1:Cattle": herd(100) };
    const shares = calculateHerdDietShare(Float32Array.from([0.25, 0.25, 0]), () => 1, stock);
    const perPerson = getHerdFoodKcal({ Cattle: herd(1), Sheep: herd(3) }) / needPerPerson;
    // About one cow and three sheep feed well under a quarter of a person (§3.7).
    expect(perPerson).toBeGreaterThan(0.1);
    expect(perPerson).toBeLessThan(0.25);
    expect(shares[0]).toBeCloseTo(perPerson, 5);
    expect(shares[1]).toBeCloseTo(0.25, 6);
    expect(shares[2]).toBe(0);
  });

  it("keeps the rainfall share without a herd table", () => {
    expect(Array.from(calculateHerdDietShare(Float32Array.from([0.2]), () => 1, null))).toEqual([Math.fround(0.2)]);
  });
});
