import { describe, expect, it } from "vitest";
import { getDnd5eAbilityModifier } from "./abilityPresets";

describe("getDnd5eAbilityModifier", () => {
  it("uses the D&D 5e score-to-modifier rule", () => {
    expect(getDnd5eAbilityModifier(3)).toBe(-4);
    expect(getDnd5eAbilityModifier(9)).toBe(-1);
    expect(getDnd5eAbilityModifier(10)).toBe(0);
    expect(getDnd5eAbilityModifier(16)).toBe(3);
    expect(getDnd5eAbilityModifier(18)).toBe(4);
  });
});
