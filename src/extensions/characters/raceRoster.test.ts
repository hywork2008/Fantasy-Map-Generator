import { describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../data/races";
import {
  raceCharacterDensity,
  sampleRaceIdForState,
  selectCentralOfficeCount,
  selectCentralOffices
} from "./raceRoster";

describe("raceCharacterDensity", () => {
  it("gives long-lived races lower density than short-lived ones", () => {
    const races = createDefaultRaces();
    const human = raceCharacterDensity(races.find(r => r.key === "human"));
    const elf = raceCharacterDensity(races.find(r => r.key === "elf"));
    const goblin = raceCharacterDensity(races.find(r => r.key === "goblin"));
    expect(elf).toBeLessThan(human);
    expect(goblin).toBeGreaterThanOrEqual(human * 0.95);
    expect(elf).toBeGreaterThanOrEqual(0.2);
  });
});

describe("selectCentralOffices", () => {
  const offices = ["a", "b", "c", "d", "e"];

  it("fills a full human-scale court", () => {
    expect(selectCentralOfficeCount(5, 1)).toBe(5);
    expect(selectCentralOffices(offices, 1)).toHaveLength(5);
  });

  it("thins long-lived mono courts but keeps at least one office when any exist", () => {
    const elfDensity = raceCharacterDensity({ lifespan: 750 });
    const n = selectCentralOfficeCount(5, elfDensity);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThan(5);
  });
});

describe("sampleRaceIdForState", () => {
  it("returns culture race for mono polities", () => {
    const races = createDefaultRaces();
    const elf = races.find(r => r.key === "elf")!.i;
    const id = sampleRaceIdForState({ culture: 1, racialComposition: "mono" }, { race: elf, monoRacial: true }, races);
    expect(id).toBe(elf);
  });

  it("can return majority race often for mixed polities (smoke)", () => {
    const races = createDefaultRaces();
    const human = races.find(r => r.key === "human")!.i;
    let humanHits = 0;
    for (let i = 0; i < 80; i++) {
      const id = sampleRaceIdForState(
        { culture: 1, racialComposition: "mixed" },
        { race: human, monoRacial: false },
        races
      );
      if (id === human) humanHits++;
    }
    // Majority boost should make human the mode, not 100%
    expect(humanHits).toBeGreaterThan(20);
    expect(humanHits).toBeLessThan(80);
  });

  it("never samples goblins or arachnids into mixed multi-folk courts", () => {
    const races = createDefaultRaces();
    const human = races.find(r => r.key === "human")!.i;
    const goblin = races.find(r => r.key === "goblin")!.i;
    const arachnid = races.find(r => r.key === "arachnid")!.i;
    for (let i = 0; i < 100; i++) {
      const id = sampleRaceIdForState(
        { culture: 1, racialComposition: "mixed" },
        { race: human, monoRacial: false },
        races
      );
      expect(id).not.toBe(goblin);
      expect(id).not.toBe(arachnid);
    }
  });

  it("still allows goblin/arachnid mono polities to use their own race", () => {
    const races = createDefaultRaces();
    const goblin = races.find(r => r.key === "goblin")!.i;
    const arachnid = races.find(r => r.key === "arachnid")!.i;
    expect(
      sampleRaceIdForState({ culture: 1, racialComposition: "mono" }, { race: goblin, monoRacial: true }, races)
    ).toBe(goblin);
    expect(
      sampleRaceIdForState({ culture: 1, racialComposition: "mono" }, { race: arachnid, monoRacial: true }, races)
    ).toBe(arachnid);
  });
});
