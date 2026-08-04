import { describe, expect, it } from "vitest";
import { racePersonalityBiasForKey, rollCharacterPersonality, rollPersonalityTrait } from "./racePersonalityBias";

describe("racePersonalityBias", () => {
  it("lowers elf boldness, greed, and vengefulness vs baseline 50", () => {
    const bias = racePersonalityBiasForKey("elf");
    expect(bias.boldness ?? 0).toBeLessThan(0);
    expect(bias.greed ?? 0).toBeLessThan(0);
    expect(bias.vengefulness ?? 0).toBeLessThan(0);
    expect(bias.rationality ?? 0).toBeGreaterThan(0);
  });

  it("produces lower average boldness/greed/vengefulness for elves than humans", () => {
    const n = 400;
    let elfB = 0;
    let elfG = 0;
    let elfV = 0;
    let humB = 0;
    let humG = 0;
    let humV = 0;
    for (let i = 0; i < n; i++) {
      const e = rollCharacterPersonality({ raceKey: "elf", lifespan: 750 });
      const h = rollCharacterPersonality({ raceKey: "human", lifespan: 75 });
      elfB += e.boldness;
      elfG += e.greed;
      elfV += e.vengefulness;
      humB += h.boldness;
      humG += h.greed;
      humV += h.vengefulness;
    }
    expect(elfB / n).toBeLessThan(humB / n - 4);
    expect(elfG / n).toBeLessThan(humG / n - 4);
    expect(elfV / n).toBeLessThan(humV / n - 3);
  });

  it("nudges religious zeal presets by race bias", () => {
    const elf = rollCharacterPersonality({
      raceKey: "elf",
      lifespan: 750,
      presets: { zeal: 80, piety: 70, guile: 40, confidence: 55 }
    });
    // elf zeal delta -4
    expect(elf.zeal).toBe(76);
    expect(elf.piety).toBe(70);
  });

  it("clamps trait rolls to 1–100", () => {
    for (let i = 0; i < 30; i++) {
      const v = rollPersonalityTrait(40, 22);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
