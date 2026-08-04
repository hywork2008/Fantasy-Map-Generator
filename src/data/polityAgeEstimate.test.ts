import { describe, expect, it } from "vitest";
import {
  estimatePolityAgeFromPopulation,
  FOUNDING_COUPLES_DEFAULT,
  generationLengthYears,
  growthFactorPerGeneration,
  rMaxFromFertility
} from "./polityAgeEstimate";
import { createDefaultRaces, getRaceFertility } from "./races";

describe("polityAgeEstimate", () => {
  const races = createDefaultRaces();
  const elf = races.find(r => r.key === "elf")!;
  const human = races.find(r => r.key === "human")!;
  const elfFert = getRaceFertility(races, elf.i);
  const humanFert = getRaceFertility(races, human.i);

  it("computes elf R_max near 2.5 and generation length mid-fertile window", () => {
    const rMax = rMaxFromFertility(elfFert);
    expect(rMax).toBeGreaterThanOrEqual(2);
    expect(rMax).toBeLessThanOrEqual(3.5);
    expect(growthFactorPerGeneration(rMax)).toBeCloseTo(rMax / 2, 5);
    const T = generationLengthYears(elfFert, elf.lifespan);
    expect(T).toBeGreaterThan(100);
    expect(T).toBeLessThan(400);
  });

  it("estimates multi-millennial age for large elf populations from 50 couples", () => {
    // User scenario: 58K and 492K elves
    const small = estimatePolityAgeFromPopulation(58_000, elfFert, {
      lifespan: elf.lifespan,
      foundingCouples: FOUNDING_COUPLES_DEFAULT,
      raceName: "Elf"
    });
    const large = estimatePolityAgeFromPopulation(492_000, elfFert, {
      lifespan: elf.lifespan,
      foundingCouples: FOUNDING_COUPLES_DEFAULT,
      raceName: "Elf"
    });
    expect(small.status).toBe("ok");
    expect(large.status).toBe("ok");
    expect(small.years).not.toBeNull();
    expect(large.years).not.toBeNull();
    expect(small.years!).toBeGreaterThan(1000);
    expect(large.years!).toBeGreaterThan(small.years!);
    // Sanity: not geological ages (millions)
    expect(large.years!).toBeLessThan(100_000);
  });

  it("gives shorter ages for humans than elves at the same population", () => {
    const pop = 100_000;
    const h = estimatePolityAgeFromPopulation(pop, humanFert, { lifespan: 75, raceName: "Human" });
    const e = estimatePolityAgeFromPopulation(pop, elfFert, { lifespan: 750, raceName: "Elf" });
    expect(h.status).toBe("ok");
    expect(e.status).toBe("ok");
    expect(h.years!).toBeLessThan(e.years!);
  });

  it("treats population at or below founding cohort as age 0", () => {
    const est = estimatePolityAgeFromPopulation(80, humanFert, { lifespan: 75 });
    expect(est.status).toBe("too_small");
    expect(est.years).toBe(0);
  });

  it("flags near-replacement when R_max is 2", () => {
    const fert = {
      fertilityStart: 16,
      fertilityEnd: 45,
      interbirthYears: 14.5,
      litterMean: 1,
      litterMax: 2
    };
    // (45-16)/14.5 ≈ 2.0
    expect(rMaxFromFertility(fert)).toBeCloseTo(2, 1);
    const est = estimatePolityAgeFromPopulation(50_000, fert, { lifespan: 75 });
    expect(est.status).toBe("near_replacement");
    expect(est.years).toBeNull();
  });
});
