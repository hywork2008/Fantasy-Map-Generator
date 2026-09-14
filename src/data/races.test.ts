import { describe, expect, it } from "vitest";
import { createDefaultRaces, RACE_DEFINITIONS, raceIdByKey, rollCharacterRaceAppearance } from "./races";

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
    const giant = races.find(r => r.key === "giant")!;
    const goblin = races.find(r => r.key === "goblin")!;
    const draconic = races.find(r => r.key === "draconic")!;
    expect(elf.lifespan!).toBeGreaterThan(human.lifespan!);
    expect(dwarf.lifespan!).toBeGreaterThan(human.lifespan!);
    expect(goblin.lifespan!).toBeLessThan(human.lifespan!);
    // God-line giants: deep-time band just above high elves, below draconic.
    expect(giant.lifespan!).toBeGreaterThan(elf.lifespan!);
    expect(giant.lifespan!).toBeLessThan(draconic.lifespan!);
    expect(draconic.lifespan!).toBeGreaterThan(elf.lifespan!);
  });

  it("ships looks baselines, beauty ideals, and fertility for every race", () => {
    for (const race of createDefaultRaces()) {
      expect(race.looksBaseline?.stature).toBeDefined();
      expect(race.beautyIdeal?.weights).toBeDefined();
      expect(race.fertility?.interbirthYears).toBeGreaterThan(0);
      if (
        race.key === "half_elf" ||
        race.key === "lich" ||
        race.key === "skeleton" ||
        race.key === "zombie" ||
        race.key === "lesser_vampire"
      ) {
        expect(race.fertility!.litterMean).toBe(0);
        expect(race.fertility!.litterMax).toBe(0);
      } else {
        expect(race.fertility!.litterMax).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("attaches fantasy Arcane caps and durability (Amazones 20, dwarf runes stay off Arcane)", () => {
    const races = createDefaultRaces();
    const byKey = Object.fromEntries(races.map(race => [race.key, race]));
    expect(byKey.demon?.supernatural?.arcaneCap).toBe(100);
    expect(byKey.elf?.supernatural?.arcaneCap).toBe(95);
    expect(byKey.amazones?.supernatural?.arcaneCap).toBe(20);
    expect(byKey.human?.supernatural?.arcaneCap).toBe(10);
    expect(byKey.dwarf?.supernatural?.arcaneCap).toBe(10);
    expect(byKey.draconic?.supernatural?.durability).toBeGreaterThan(byKey.giant?.supernatural?.durability ?? 0);
    expect(byKey.draconic?.supernatural?.arcaneInclination).toBeLessThan(0.1);
  });

  it("records Giants' food- and temperature-independent low-density survival", () => {
    const expected = {
      foodIndependent: true,
      temperatureIndependent: true,
      populationCapacityMultiplier: 0.1
    };
    expect(RACE_DEFINITIONS.find(race => race.key === "giant")?.environmentalSurvival).toEqual(expected);
    expect(createDefaultRaces().find(race => race.key === "giant")?.environmentalSurvival).toEqual(expected);
  });

  it("defines randomized Demon horns and Beastfolk animal ancestry with furry scale 1–10", () => {
    const races = createDefaultRaces();
    const demon = races.find(race => race.key === "demon")!;
    const beastfolk = races.find(race => race.key === "beastfolk")!;

    expect(demon.characterAppearance?.kind).toBe("demon");
    expect(beastfolk.characterAppearance?.kind).toBe("beastfolk");

    const demonAppearance = rollCharacterRaceAppearance(demon, min => min);
    const beastfolkAppearance = rollCharacterRaceAppearance(beastfolk, (_min, max) => max);

    expect(demonAppearance).toEqual({ kind: "demon", hornAnimal: "antelope" });
    expect(beastfolkAppearance).toEqual({ kind: "beastfolk", animal: "wolf", furryScale: 10 });
  });

  it("resolves race keys to stable ids", () => {
    const races = createDefaultRaces();
    expect(raceIdByKey(races, "elf")).toBe(races.find(r => r.key === "elf")!.i);
    expect(raceIdByKey(races, "missing")).toBe(1); // human fallback
  });

  it("appends Half Elf after existing catalog ids and hybridizes Human×Elf looks", () => {
    const races = createDefaultRaces();
    const human = races.find(r => r.key === "human")!;
    const elf = races.find(r => r.key === "elf")!;
    const halfElf = races.find(r => r.key === "half_elf")!;
    expect(halfElf.i).toBeGreaterThan(elf.i);
    expect(halfElf.i).toBeGreaterThan(human.i);

    for (const axis of ["stature", "build", "symmetry", "refinement", "vitality", "ornament"] as const) {
      const h = human.looksBaseline![axis]!;
      const e = elf.looksBaseline![axis]!;
      expect(halfElf.looksBaseline![axis]).toBe(Math.min(h, e));
      expect(halfElf.looksRange![axis]).toEqual({ min: Math.min(h, e), max: Math.max(h, e) });
    }
    expect(halfElf.lifespan).toBe(Math.min(human.lifespan!, elf.lifespan!));
    expect(halfElf.maxLifespan).toBe(Math.max(human.maxLifespan!, elf.maxLifespan!));
  });

  it("appends Vampire, Dhampir, and Lesser Vampire with human-like appearance and hybrid inheritance", () => {
    const races = createDefaultRaces();
    const human = races.find(r => r.key === "human")!;
    const vampire = races.find(r => r.key === "vampire")!;
    const dhampir = races.find(r => r.key === "dhampir")!;
    const lesserVampire = races.find(r => r.key === "lesser_vampire")!;

    expect(vampire).toBeDefined();
    expect(dhampir).toBeDefined();
    expect(lesserVampire).toBeDefined();

    // Vampire is immortal, distant, human-like appearance (no demon/beastfolk kind)
    expect(vampire.lifespan).toBe(9999);
    expect(vampire.characterAppearance?.kind).toBeUndefined();
    expect(RACE_DEFINITIONS.find(r => r.key === "vampire")?.civicStance).toBe("distant");

    // Dhampir derives traits from Human x Vampire
    expect(dhampir.lifespan).toBe(Math.min(human.lifespan!, vampire.lifespan!));
    expect(dhampir.maxLifespan).toBe(Math.max(human.maxLifespan!, vampire.maxLifespan!));
    expect(RACE_DEFINITIONS.find(r => r.key === "dhampir")?.civicStance).toBe("distant");

    // Lesser Vampire is bound thrall of Vampire
    expect(RACE_DEFINITIONS.find(r => r.key === "lesser_vampire")?.civicStance).toBe("bound");
    expect(lesserVampire.fertility?.litterMean).toBe(0);
  });
});
