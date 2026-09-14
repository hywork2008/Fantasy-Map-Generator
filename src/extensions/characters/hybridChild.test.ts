import { describe, expect, it } from "vitest";
import { createDefaultRaces, raceIdByKey } from "../../data/races";
import { resolveChildRaceId, resolveChildRaceKey } from "./hybridChild";

describe("hybridChild", () => {
  it("resolves Human and Vampire coupling to Dhampir", () => {
    expect(resolveChildRaceKey("human", "vampire")).toBe("dhampir");
    expect(resolveChildRaceKey("vampire", "human")).toBe("dhampir");
  });

  it("resolves Human and Elf coupling to Half Elf", () => {
    expect(resolveChildRaceKey("human", "elf")).toBe("half_elf");
    expect(resolveChildRaceKey("elf", "human")).toBe("half_elf");
  });

  it("preserves race when both parents are identical", () => {
    expect(resolveChildRaceKey("vampire", "vampire")).toBe("vampire");
    expect(resolveChildRaceKey("human", "human")).toBe("human");
  });

  it("resolves child race id correctly using default catalog", () => {
    const races = createDefaultRaces();
    const humanId = raceIdByKey(races, "human");
    const vampireId = raceIdByKey(races, "vampire");
    const elfId = raceIdByKey(races, "elf");
    const dhampirId = raceIdByKey(races, "dhampir");
    const halfElfId = raceIdByKey(races, "half_elf");

    expect(resolveChildRaceId(humanId, vampireId, races)).toBe(dhampirId);
    expect(resolveChildRaceId(vampireId, humanId, races)).toBe(dhampirId);
    expect(resolveChildRaceId(humanId, elfId, races)).toBe(halfElfId);
    expect(resolveChildRaceId(vampireId, vampireId, races)).toBe(vampireId);
  });
});
