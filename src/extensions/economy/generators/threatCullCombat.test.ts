import { afterEach, describe, expect, it } from "vitest";
import type { RNGService } from "../../../utils/probabilityUtils";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setIndividualSkills } from "../economyContext";
import {
  ANON_COMBAT_SCORE,
  combatScore,
  cullDomainBonus,
  domainBonusFromProficiencies,
  equipmentBonusFromLoadout,
  namedHunterCombatScore,
  resolveCullCombat,
  targetDifficulty
} from "./threatCullCombat";

function rngSequence(values: number[]): RNGService {
  let i = 0;
  return {
    rand: () => {
      const v = values[i] ?? 0;
      i += 1;
      return v;
    },
    P: () => false,
    each: () => () => false,
    gauss: () => 0,
    Pint: n => Math.floor(n),
    ra: <T>(array: T[]) => array[0],
    rw: () => "",
    biased: () => 0,
    getNumberInRange: () => 0,
    generateSeed: () => "0"
  };
}

describe("threatCullCombat", () => {
  afterEach(() => {
    clearEconomyContext();
  });

  it("combatScore weights prowess over martial (0.55 / 0.45)", () => {
    const character = {
      skills: { prowess: 100, martial: 0 }
    } as Character;
    expect(combatScore(character)).toBeCloseTo(55, 5);
    const character2 = {
      skills: { prowess: 0, martial: 100 }
    } as Character;
    expect(combatScore(character2)).toBeCloseTo(45, 5);
  });

  it("equipmentBonusFromLoadout scales weapon quality and fine body attire", () => {
    expect(equipmentBonusFromLoadout(undefined)).toBe(0);
    expect(equipmentBonusFromLoadout({})).toBe(0);
    expect(
      equipmentBonusFromLoadout({
        weapon: { goodId: 1, quality: 1, source: "seeded" }
      })
    ).toBe(0);
    expect(
      equipmentBonusFromLoadout({
        weapon: { goodId: 1, quality: 5, source: "seeded" }
      })
    ).toBeCloseTo(10, 5);
    expect(
      equipmentBonusFromLoadout({
        body: { goodId: 2, quality: 4, source: "seeded" }
      })
    ).toBe(1);
    expect(
      equipmentBonusFromLoadout({
        weapon: { goodId: 1, quality: 5, source: "seeded" },
        body: { goodId: 2, quality: 5, source: "seeded" }
      })
    ).toBeCloseTo(11, 5);
  });

  it("combatScore adds equipment from character.loadout", () => {
    const character = {
      skills: { prowess: 50, martial: 50 },
      loadout: {
        weapon: { goodId: 1, quality: 3, source: "equipped" }
      }
    } as Character;
    // base 50 + weapon (3-1)*2.5 = 5
    expect(combatScore(character)).toBeCloseTo(55, 5);
  });

  it("domainBonusFromProficiencies uses max practice × 0.08 capped at 8", () => {
    expect(domainBonusFromProficiencies(0, 0)).toBe(0);
    expect(domainBonusFromProficiencies(50, 10)).toBeCloseTo(4, 5);
    expect(domainBonusFromProficiencies(100, 100)).toBe(8);
    expect(domainBonusFromProficiencies(10, 80)).toBeCloseTo(6.4, 5);
  });

  it("cullDomainBonus and namedHunterCombatScore read individualSkills", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { characters: [] } as typeof worldContext.pack;
    setIndividualSkills([
      {
        characterId: 7,
        domain: "swordsmanship",
        proficiency: 50,
        aptitude: "ordinary",
        techniques: []
      },
      {
        characterId: 7,
        domain: "archery",
        proficiency: 10,
        aptitude: "ordinary",
        techniques: []
      }
    ]);

    expect(cullDomainBonus(7)).toBeCloseTo(4, 5);
    expect(cullDomainBonus(999)).toBe(0);

    const character = {
      i: 7,
      skills: { prowess: 50, martial: 50 },
      loadout: {
        weapon: { goodId: 1, quality: 3, source: "equipped" }
      }
    } as Character;
    // base 50 + domain 4 + weapon 5 = 59
    expect(namedHunterCombatScore(character)).toBeCloseTo(59, 5);
  });

  it("explicit domainBonus argument stacks with equipment", () => {
    const character = {
      skills: { prowess: 50, martial: 50 },
      loadout: {
        weapon: { goodId: 1, quality: 1, source: "seeded" }
      }
    } as Character;
    expect(combatScore(character, 3)).toBeCloseTo(53, 5);
  });

  it("targetDifficulty uses rarity and power snapshot", () => {
    // r1 power 5 → 15+12+7.5 = 34.5
    expect(
      targetDifficulty({
        kind: "monster",
        monsterId: 0,
        cellId: 1,
        rarity: 1,
        powerSnapshot: 5,
        label: "Beast"
      })
    ).toBeCloseTo(34.5, 5);
  });

  it("score 60 vs r1 beast → success band (example B)", () => {
    const result = resolveCullCombat({
      combatScore: 60,
      difficulty: 34.5,
      rarity: 1,
      // first u after death checks is intensity, second is injury
      rng: rngSequence([0.5, 0.99])
    });
    expect(result.outcome).toBe("success");
    expect(result.intensity).toBeGreaterThanOrEqual(0.85);
    expect(result.injured).toBe(false);
  });

  it("score 40 vs r1 beast → partial band (example A)", () => {
    const result = resolveCullCombat({
      combatScore: 40,
      difficulty: 34.5,
      rarity: 1,
      rng: rngSequence([0.5, 0.99])
    });
    expect(result.outcome).toBe("partial");
    expect(result.intensity).toBeGreaterThanOrEqual(0.35);
    expect(result.intensity).toBeLessThanOrEqual(0.6);
  });

  it("large negative delta can death-check before fail", () => {
    // delta = 40-72 = -32 < -25; first roll < 0.03 → dead
    const dead = resolveCullCombat({
      combatScore: 40,
      difficulty: 72,
      rarity: 3,
      rng: rngSequence([0.01])
    });
    expect(dead.outcome).toBe("dead");
    expect(dead.intensity).toBe(0);

    // death check fails, then fail band
    const fail = resolveCullCombat({
      combatScore: 40,
      difficulty: 72,
      rarity: 3,
      rng: rngSequence([0.5, 0.99])
    });
    expect(fail.outcome).toBe("fail");
    expect(fail.injured).toBe(false);
  });

  it("ANON_COMBAT_SCORE is a modest hunter", () => {
    expect(ANON_COMBAT_SCORE).toBe(45);
  });
});
