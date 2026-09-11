import { describe, expect, it, vi } from "vitest";
import { createDefaultRaces, RACE_DEFINITIONS } from "../data/races";
import { bindRaceService, getRaceFertility, HUMAN_SUPERNATURAL, supernaturalForRaceKey } from "../extensions/hostRaces";
import { raceService } from "./raceService";

describe("race service injection", () => {
  it("queries the injected host instead of importing its catalog", () => {
    const query = vi.fn(() => ({ arcaneCap: 77, arcaneMedian: 20, arcaneInclination: 0.4, durability: 2 }));
    bindRaceService({ ...raceService, supernaturalForRaceKey: query });
    try {
      expect(supernaturalForRaceKey("human").arcaneCap).toBe(77);
      expect(HUMAN_SUPERNATURAL.arcaneCap).toBe(10);
      expect(query).toHaveBeenCalledWith("human");
    } finally {
      bindRaceService(raceService);
    }
  });
  it("does not expose mutable host catalog or saved race references", () => {
    bindRaceService(raceService);
    const worldRaces = createDefaultRaces();
    getRaceFertility(worldRaces, 1).litterMean = 999;
    raceService.RACE_DEFINITIONS[1].fertility.litterMean = 888;
    raceService.getRaceById(worldRaces, 1)!.name = "Changed";
    raceService.HUMAN_SUPERNATURAL.arcaneCap = 1;
    expect(worldRaces[1].fertility?.litterMean).toBe(1.05);
    expect(worldRaces[1].name).toBe("Human");
    expect(RACE_DEFINITIONS[1].fertility.litterMean).toBe(1.05);
    expect(raceService.HUMAN_SUPERNATURAL.arcaneCap).toBe(10);
  });
  it("exposes no character or economy parameters on core definitions", () => {
    for (const def of raceService.RACE_DEFINITIONS) {
      for (const key of [
        "skillBias",
        "personalityBias",
        "infernalAtavism",
        "boundServitor",
        "waterTechBias",
        "hoardSpPerAdultYear"
      ])
        expect(def).not.toHaveProperty(key);
    }
  });
});
