import { describe, expect, it } from "vitest";
import {
  ARCH_BEAST_NATURE,
  BEAST_NATURE,
  CALAMITY_NATURE,
  DIRE_BEAST_NATURE,
  GREATER_MONSTER_NATURE,
  type MonsterNature,
  natureForMonster,
  natureIsLegal,
  rarityDangerPeak
} from "./monsterNature";

const DEFAULTS: readonly MonsterNature[] = [
  BEAST_NATURE,
  DIRE_BEAST_NATURE,
  GREATER_MONSTER_NATURE,
  ARCH_BEAST_NATURE,
  CALAMITY_NATURE
];

describe("monster nature cards", () => {
  it("accepts the five default cards, all on land", () => {
    for (const card of DEFAULTS) {
      expect(natureIsLegal(card)).toBe(true);
      expect(card.medium).toBe("land");
    }
    expect(rarityDangerPeak(1)).toBe(48);
    expect(rarityDangerPeak(5)).toBe(255);
    expect(rarityDangerPeak(0)).toBe(0);
  });

  it("rejects traits above the rarity cap", () => {
    expect(natureIsLegal({ ...BEAST_NATURE, appetite: "catastrophic" })).toBe(false);
    expect(natureIsLegal({ ...BEAST_NATURE, blight: "curse" })).toBe(false);
    expect(natureIsLegal({ ...BEAST_NATURE, size: "vast" })).toBe(false);
    expect(natureIsLegal({ ...DIRE_BEAST_NATURE, size: "vast" })).toBe(false);
    expect(natureIsLegal({ ...GREATER_MONSTER_NATURE, mundaneStrike: "futile" })).toBe(false);
    expect(natureIsLegal({ ...GREATER_MONSTER_NATURE, innateScale: "regional" })).toBe(false);
  });

  it("allows a small flying rarity-5 card without raising the peak", () => {
    expect(natureIsLegal({ ...CALAMITY_NATURE, size: "small", medium: "air" })).toBe(true);
    expect(rarityDangerPeak(CALAMITY_NATURE.rarity)).toBe(255);
  });

  it("uses the named card, and the rarity row for an unknown type", () => {
    expect(natureForMonster({ type: "Dire Beast", rarity: 2 })).toBe(DIRE_BEAST_NATURE);
    expect(natureForMonster({ type: "Drake", rarity: 4 })).toEqual(ARCH_BEAST_NATURE);
    expect(natureForMonster({ type: "Arch-Fiend", rarity: 5 })).toEqual(CALAMITY_NATURE);
    expect(natureForMonster({ rarity: 3 }).track).toBe("ecology");
  });
});
