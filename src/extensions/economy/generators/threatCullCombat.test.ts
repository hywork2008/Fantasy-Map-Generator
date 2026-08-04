import { describe, expect, it } from "vitest";
import type { RNGService } from "../../../utils/probabilityUtils";
import type { Character } from "../../characters/characterTypes";
import { ANON_COMBAT_SCORE, combatScore, resolveCullCombat, targetDifficulty } from "./threatCullCombat";

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
