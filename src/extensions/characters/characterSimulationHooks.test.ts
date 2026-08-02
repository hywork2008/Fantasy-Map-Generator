import { describe, expect, it } from "vitest";
import { applyCharacterBackstory } from "./backstoryProfile";
import {
  applyCharacterCorruption,
  evaluateDynasticMarriage,
  getEffectivePatriotism,
  getWarDriveModifiers,
  resolveCorruptionEvents
} from "./characterSimulationHooks";
import type { Character } from "./characterTypes";

function baseCharacter(overrides: Partial<Character> & Pick<Character, "i" | "name">): Character {
  return {
    age: 40,
    gender: "male",
    culture: 1,
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 50,
      diplomacy: 50,
      engineering: 50,
      geography: 50,
      intrigue: 50,
      learning: 50,
      martial: 50,
      prowess: 50,
      stewardship: 50
    },
    personality: {
      boldness: 50,
      compassion: 50,
      greed: 50,
      honor: 50,
      rationality: 50,
      sociability: 50,
      vengefulness: 50,
      zeal: 50,
      energy: 50,
      piety: 50,
      guile: 50,
      confidence: 50
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: [],
    titles: [],
    ...overrides
  };
}

describe("getWarDriveModifiers", () => {
  it("marks faith+zeal rulers as holy_war against other cultures", () => {
    const ruler = baseCharacter({
      i: 1,
      name: "Zealot",
      culture: 1,
      personality: {
        boldness: 60,
        compassion: 40,
        greed: 40,
        honor: 50,
        rationality: 40,
        sociability: 40,
        vengefulness: 40,
        zeal: 90,
        energy: 60,
        piety: 85,
        guile: 30,
        confidence: 60
      },
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    applyCharacterBackstory(ruler, { roleClass: "ruler", capitalBurgId: 1, formName: "Theocracy" });
    ruler.backstory!.commitment.primary = { kind: "faith", weight: 100 };
    ruler.backstory!.commitment.intensity = 90;

    const mods = getWarDriveModifiers(ruler, {
      isCornered: false,
      historicallyOwn: false,
      targetCulture: 2
    });
    expect(mods.justification).toBe("holy_war");
    expect(mods.tensionSpeedMultiplier).toBeGreaterThan(1);
  });

  it("lowers force requirements for greedy domain-first rulers", () => {
    const ruler = baseCharacter({
      i: 1,
      name: "Conqueror",
      personality: {
        boldness: 70,
        compassion: 30,
        greed: 90,
        honor: 40,
        rationality: 50,
        sociability: 40,
        vengefulness: 40,
        zeal: 40,
        energy: 70,
        piety: 20,
        guile: 50,
        confidence: 70
      },
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    applyCharacterBackstory(ruler, { roleClass: "ruler", capitalBurgId: 1 });
    ruler.backstory!.commitment.primary = { kind: "domain", weight: 100 };

    const mods = getWarDriveModifiers(ruler, { isCornered: false, historicallyOwn: false });
    expect(mods.forceRequirementMultiplier).toBeLessThan(1);
    expect(mods.initialTensionBonus).toBeGreaterThan(0);
  });
});

describe("evaluateDynasticMarriage", () => {
  it("rejects faith-first rulers marrying different culture", () => {
    const a = baseCharacter({
      i: 1,
      name: "A",
      culture: 1,
      prestige: 70,
      personality: {
        boldness: 40,
        compassion: 50,
        greed: 30,
        honor: 60,
        rationality: 50,
        sociability: 50,
        vengefulness: 30,
        zeal: 80,
        energy: 50,
        piety: 90,
        guile: 30,
        confidence: 50
      }
    });
    const b = baseCharacter({ i: 2, name: "B", culture: 3, prestige: 80 });
    applyCharacterBackstory(a, { roleClass: "ruler", capitalBurgId: 1 });
    a.backstory!.commitment.primary = { kind: "faith", weight: 100 };

    const result = evaluateDynasticMarriage(a, b);
    expect(result.accept).toBe(false);
    expect(result.reason).toBe("faith_culture_mismatch");
  });

  it("rejects house-first rulers marrying far lower prestige", () => {
    const a = baseCharacter({ i: 1, name: "A", prestige: 90 });
    const b = baseCharacter({ i: 2, name: "B", prestige: 40 });
    applyCharacterBackstory(a, { roleClass: "ruler", capitalBurgId: 1 });
    a.backstory!.commitment.primary = { kind: "house", weight: 100 };

    const result = evaluateDynasticMarriage(a, b);
    expect(result.accept).toBe(false);
    expect(result.reason).toBe("house_prestige_gap");
  });
});

describe("getEffectivePatriotism", () => {
  it("is higher for state-committed honorable rulers than greedy self-dealers", () => {
    const patriot = baseCharacter({
      i: 1,
      name: "Patriot",
      personality: {
        boldness: 50,
        compassion: 50,
        greed: 20,
        honor: 90,
        rationality: 60,
        sociability: 50,
        vengefulness: 20,
        zeal: 50,
        energy: 50,
        piety: 40,
        guile: 20,
        confidence: 50
      }
    });
    const selfish = baseCharacter({
      i: 2,
      name: "Selfish",
      personality: {
        boldness: 50,
        compassion: 30,
        greed: 90,
        honor: 20,
        rationality: 50,
        sociability: 40,
        vengefulness: 40,
        zeal: 30,
        energy: 50,
        piety: 20,
        guile: 80,
        confidence: 50
      }
    });
    applyCharacterBackstory(patriot, { roleClass: "ruler", capitalBurgId: 1 });
    applyCharacterBackstory(selfish, { roleClass: "ruler", capitalBurgId: 1 });
    patriot.backstory!.commitment.primary = { kind: "state", weight: 100 };
    selfish.backstory!.commitment.primary = { kind: "self", weight: 100 };

    expect(getEffectivePatriotism(patriot)).toBeGreaterThan(getEffectivePatriotism(selfish));
  });
});

describe("applyCharacterCorruption", () => {
  it("lets greedy low-honor officers produce skimming events", () => {
    const thief = baseCharacter({
      i: 1,
      name: "Thief",
      state: 1,
      wealth: 0,
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 40,
        compassion: 20,
        greed: 95,
        honor: 20,
        rationality: 50,
        sociability: 40,
        vengefulness: 40,
        zeal: 20,
        energy: 50,
        piety: 10,
        guile: 40,
        confidence: 50
      }
    });
    applyCharacterBackstory(thief, { roleClass: "central_officer", capitalBurgId: 1 });
    thief.backstory!.commitment.primary = { kind: "wealth", weight: 100 };
    thief.backstory!.tastes = [{ id: "gold", polarity: "like", intensity: 90 }];

    // Force many trials via large deltaYears
    let any = false;
    for (let i = 0; i < 30; i++) {
      const events = applyCharacterCorruption([thief], 5);
      if (events.length) {
        any = true;
        const treasury = { bal: 1000 };
        resolveCorruptionEvents([thief], events, {
          get: () => treasury.bal,
          set: (_id, v) => {
            treasury.bal = v;
          }
        });
        expect(thief.wealth).toBeGreaterThan(0);
        expect(treasury.bal).toBeLessThan(1000);
        break;
      }
    }
    expect(any).toBe(true);
  });
});
