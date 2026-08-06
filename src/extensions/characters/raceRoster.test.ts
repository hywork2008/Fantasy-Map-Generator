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

  it("never samples enemy-colony or distant races into mixed courts", () => {
    const races = createDefaultRaces();
    const human = races.find(r => r.key === "human")!.i;
    const forbidden = new Set(
      races
        .filter(r => ["goblin", "orc", "arachnid", "dark_elf", "giant", "draconic", "amazones"].includes(r.key))
        .map(r => r.i)
    );
    const allowed = new Set(races.filter(r => ["human", "elf", "dwarf"].includes(r.key)).map(r => r.i));
    for (let i = 0; i < 100; i++) {
      const id = sampleRaceIdForState(
        { culture: 1, racialComposition: "mixed" },
        { race: human, monoRacial: false },
        races
      );
      expect(forbidden.has(id)).toBe(false);
      expect(allowed.has(id)).toBe(true);
    }
  });

  it("still allows enemy-colony mono polities to use their own race", () => {
    const races = createDefaultRaces();
    const orc = races.find(r => r.key === "orc")!.i;
    const goblin = races.find(r => r.key === "goblin")!.i;
    const arachnid = races.find(r => r.key === "arachnid")!.i;
    expect(
      sampleRaceIdForState({ culture: 1, racialComposition: "mono" }, { race: orc, monoRacial: true }, races)
    ).toBe(orc);
    expect(
      sampleRaceIdForState({ culture: 1, racialComposition: "mono" }, { race: goblin, monoRacial: true }, races)
    ).toBe(goblin);
    expect(
      sampleRaceIdForState({ culture: 1, racialComposition: "mono" }, { race: arachnid, monoRacial: true }, races)
    ).toBe(arachnid);
  });

  it("staffs draconic mono merchants as wyrmkin, rulers as draconic", () => {
    const races = createDefaultRaces();
    const draconic = races.find(r => r.key === "draconic")!.i;
    const wyrmkin = races.find(r => r.key === "wyrmkin")!.i;
    expect(
      sampleRaceIdForState({ culture: 1, racialComposition: "mono" }, { race: draconic, monoRacial: true }, races, {
        roleClass: "merchant"
      })
    ).toBe(wyrmkin);
    expect(
      sampleRaceIdForState({ culture: 1, racialComposition: "mono" }, { race: draconic, monoRacial: true }, races, {
        roleClass: "ruler"
      })
    ).toBe(draconic);
  });
});
