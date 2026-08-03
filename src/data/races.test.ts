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

  it("assigns Western-fantasy lifespans (typical ≤ max, long-lived races longer than humans)", () => {
    const races = createDefaultRaces();
    for (const race of races) {
      expect(race.lifespan).toBeGreaterThan(0);
      expect(race.maxLifespan).toBeGreaterThanOrEqual(race.lifespan!);
    }
    const human = races.find(r => r.key === "human")!;
    const elf = races.find(r => r.key === "elf")!;
    const dwarf = races.find(r => r.key === "dwarf")!;
    const goblin = races.find(r => r.key === "goblin")!;
    const draconic = races.find(r => r.key === "draconic")!;
    expect(elf.lifespan!).toBeGreaterThan(human.lifespan!);
    expect(dwarf.lifespan!).toBeGreaterThan(human.lifespan!);
    expect(goblin.lifespan!).toBeLessThan(human.lifespan!);
    expect(draconic.lifespan!).toBeGreaterThan(elf.lifespan!);
  });

  it("ships looks baselines, beauty ideals, and fertility for every race", () => {
    for (const race of createDefaultRaces()) {
      expect(race.looksBaseline?.stature).toBeDefined();
      expect(race.beautyIdeal?.weights).toBeDefined();
      expect(race.fertility?.interbirthYears).toBeGreaterThan(0);
      expect(race.fertility!.litterMax).toBeGreaterThanOrEqual(1);
    }
  });

  it("resolves race keys to stable ids", () => {
    const races = createDefaultRaces();
    expect(raceIdByKey(races, "elf")).toBe(races.find(r => r.key === "elf")!.i);
    expect(raceIdByKey(races, "missing")).toBe(1); // human fallback
  });
});
