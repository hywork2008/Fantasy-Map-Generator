import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createUrbanMorphology } from "../utils/urbanMorphology";
import { recordUrbanPopulationHistory } from "./urbanPopulationHistory";

describe("urban population calendar snapshots", () => {
  it("records one actual point per year and does not pretend a skipped year was observed", () => {
    const profile = createUrbanMorphology({
      seed: "save",
      burgId: 1,
      year: 100,
      population: 1000,
      capital: false,
      walls: true,
      polityAge: 100,
      generationYears: 30,
      polityPower: 0.5,
      defensePressure: 0,
      period: "lateMedieval",
      religious: false,
      extramuralBurial: false,
      plaza: false
    });
    const world = {
      populationRate: 1000,
      urbanization: 2,
      pack: { burgs: [0, { i: 1, population: 0.6 }] }
    } as unknown as WorldContext;
    const simulation = { currentYear: 101, burgs: { 1: { urbanMorphology: profile } } } as unknown as SimulationContext;
    expect(recordUrbanPopulationHistory(world, simulation)).toBe(true);
    expect(recordUrbanPopulationHistory(world, simulation)).toBe(false);
    simulation.currentYear = 104;
    recordUrbanPopulationHistory(world, simulation);
    expect(simulation.burgs[1].urbanPopulationHistory?.map(k => k.year)).toEqual([101, 104]);
    expect(simulation.burgs[1].urbanPopulationHistory?.[0].people).toBe(1200);
    expect(profile.foundedYear).toBeLessThan(100);
    expect(profile.baselineYear).toBe(100);
    expect(profile.populationKnots.at(-1)?.year).toBe(104);
  });
});
