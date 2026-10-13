import { describe, expect, it } from "vitest";
import { createUrbanMorphology, outsidePopulationCap, validUrbanMorphology } from "./urbanMorphology";

const input = {
  seed: "fixture",
  burgId: 1,
  year: 341,
  population: 38255,
  capital: true,
  walls: true,
  polityAge: 178,
  generationYears: 30.5,
  polityPower: 0.6,
  defensePressure: 0.3,
  period: "ageOfExploration",
  religious: true,
  extramuralBurial: true,
  plaza: true
};
describe("non-economic urban history", () => {
  it("keeps chronology, current people and a city older than its present polity", () => {
    const p = createUrbanMorphology(input);
    expect(validUrbanMorphology(p)).toBe(true);
    expect(p.foundedYear).toBeLessThan(341 - 178);
    expect(p.populationKnots.at(-1)?.people).toBe(38255);
    expect(p.wallPhases).toHaveLength(2);
    expect(p.wallPhases[1].year).toBeGreaterThan(p.wallPhases[0].year);
    expect(createUrbanMorphology(input)).toEqual(p);
  });
  it("does not invent centuries of prior history for an observed new settlement", () => {
    const p = createUrbanMorphology({ ...input, foundedYear: 340, foundedSource: "observed" });
    expect(p.foundedYear).toBe(340);
    expect(p.foundedSource).toBe("observed");
    expect(p.wallPhases).toHaveLength(1);
    expect(outsidePopulationCap(p, 38255)).toBeCloseTo(0.07);
  });
  it("handles near-replacement and long-lived races without zero-age or NaN", () => {
    const p = createUrbanMorphology({ ...input, polityAge: null, generationYears: 250 });
    expect(p.polityAgeAtBaseline).toBe(600);
    expect(validUrbanMorphology(p)).toBe(true);
    const small = createUrbanMorphology({ ...input, population: 10, polityAge: 10, capital: false });
    expect(small.wallPhases).toHaveLength(1);
    expect(validUrbanMorphology(small)).toBe(true);
  });
  it("can explain a shrinking city with a larger past wall population", () => {
    const p = createUrbanMorphology({ ...input, growthRegime: "declining" });
    expect(p.wallPhases.at(-1)!.people).toBeGreaterThan(p.baselinePopulation);
    expect(p.populationKnots.at(-1)!.people).toBe(input.population);
    expect(validUrbanMorphology(p)).toBe(true);
  });

  it("rejects corrupt saved lore without throwing", () => {
    const p = createUrbanMorphology(input);
    expect(validUrbanMorphology({ ...p, populationKnots: [null] })).toBe(false);
    expect(validUrbanMorphology({ ...p, wallPhases: [...p.wallPhases].reverse() })).toBe(false);
    expect(validUrbanMorphology({ ...p, defensePressure: NaN })).toBe(false);
  });
});
