import { describe, expect, it } from "vitest";
import { createDefaultRaces, RACE_DEFINITIONS, raceIdByKey } from "./races";

describe("races catalog", () => {
  it("builds a fixed-id table with Unknown at 0 and Human at 1", () => {
    const races = createDefaultRaces();
    expect(races[0]?.key).toBe("unknown");
    expect(races[1]?.key).toBe("human");
    expect(races).toHaveLength(RACE_DEFINITIONS.length);
  });

  it("marks Amazones as female_only", () => {
    const races = createDefaultRaces();
    const amazones = races.find(r => r.key === "amazones");
    expect(amazones?.characterGender).toBe("female_only");
  });

  it("resolves race keys to stable ids", () => {
    const races = createDefaultRaces();
    expect(raceIdByKey(races, "elf")).toBe(races.find(r => r.key === "elf")!.i);
    expect(raceIdByKey(races, "missing")).toBe(1); // human fallback
  });
});
