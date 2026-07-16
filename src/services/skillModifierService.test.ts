import { afterEach, describe, expect, it } from "vitest";
import { getEffectiveSkill, registerSkillModifier } from "./skillModifierService";

const unregisterFns: Array<() => void> = [];
function register(...args: Parameters<typeof registerSkillModifier>) {
  const unregister = registerSkillModifier(...args);
  unregisterFns.push(unregister);
  return unregister;
}

afterEach(() => {
  while (unregisterFns.length) unregisterFns.pop()!();
});

describe("skillModifierService", () => {
  it("returns 0 when nothing has registered a modifier", () => {
    expect(getEffectiveSkill(1, "engineering")).toBe(0);
  });

  it("supplies a base value from a single registered modifier", () => {
    register("nobility", (characterId, skill, current) =>
      characterId === 1 && skill === "engineering" ? 80 : current
    );

    expect(getEffectiveSkill(1, "engineering")).toBe(80);
  });

  it("chains modifiers in registration order, each receiving the previous value", () => {
    register("nobility", (characterId, skill) => (characterId === 1 && skill === "engineering" ? 50 : 0));
    register("some-other-extension", (_characterId, skill, current) =>
      skill === "engineering" ? current + 10 : current
    );

    expect(getEffectiveSkill(1, "engineering")).toBe(60);
  });

  it("does not affect unrelated characters or skills", () => {
    register("nobility", (characterId, skill, current) =>
      characterId === 1 && skill === "engineering" ? 80 : current
    );

    expect(getEffectiveSkill(2, "engineering")).toBe(0);
    expect(getEffectiveSkill(1, "diplomacy")).toBe(0);
  });

  it("stops applying a modifier once its unregister function is called", () => {
    const unregister = register("nobility", () => 80);
    expect(getEffectiveSkill(1, "engineering")).toBe(80);

    unregister();
    expect(getEffectiveSkill(1, "engineering")).toBe(0);
  });
});
