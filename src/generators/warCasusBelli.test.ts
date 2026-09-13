import { describe, expect, it } from "vitest";
import type { State } from "../types/models";
import { generateWarCasusBelli } from "./warCasusBelli";

describe("generateWarCasusBelli", () => {
  const baseAttacker: State = {
    i: 1,
    name: "Valdor",
    form: "Monarchy",
    formName: "Kingdom",
    type: "Generic",
    expansionism: 1.5,
    center: 10,
    diplomacy: []
  };

  const baseDefender: State = {
    i: 2,
    name: "Osteria",
    form: "Monarchy",
    formName: "Kingdom",
    type: "Generic",
    expansionism: 1.2,
    center: 20,
    diplomacy: []
  };

  it("generates a valid casus belli with action, reason, rawText, and warName", () => {
    const cb = generateWarCasusBelli({
      attacker: baseAttacker,
      defender: baseDefender,
      warCount: 1
    });

    expect(cb).toBeDefined();
    expect(cb.action).toBeTypeOf("string");
    expect(cb.reason).toBeTypeOf("string");
    expect(cb.rawText).toContain("Valdor");
    expect(cb.rawText).toContain("Osteria");
    expect(cb.warName).toContain("War");
  });

  it("favors feud/retribution for recurring wars (warCount > 1)", () => {
    // With high feud weight, recurring wars should produce feud or territorial
    const cb = generateWarCasusBelli({
      attacker: baseAttacker,
      defender: baseDefender,
      warCount: 4,
      rng: () => 0.05 // low roll picks first high-weight category (feud)
    });

    expect(cb.category).toBe("feud");
    expect(cb.action).toBe("declared a war of vengeance on its rival");
    expect(cb.warName).toContain("IV");
  });

  it("favors holy war when fighting across different religions involving a theocracy", () => {
    const holyAttacker: State = {
      ...baseAttacker,
      form: "Theocracy",
      formName: "Holy State"
    };

    const cb = generateWarCasusBelli({
      attacker: holyAttacker,
      defender: baseDefender,
      attackerReligionName: "Sun Worship",
      defenderReligionName: "Moon Cult",
      warCount: 1,
      rng: () => 0.1
    });

    expect(cb.category).toBe("religious");
    expect(cb.action).toBe("declared a holy war on its rival");
    expect(cb.rawText).toContain("holy");
  });

  it("favors trade wars for naval/republic powers", () => {
    const navalAttacker: State = {
      ...baseAttacker,
      type: "Naval",
      form: "Republic",
      formName: "Most Serene Republic"
    };

    const cb = generateWarCasusBelli({
      attacker: navalAttacker,
      defender: baseDefender,
      warCount: 1,
      rng: () => 0.2
    });

    expect(cb.category).toBe("trade");
    expect(cb.action).toBe("declared a trade war on its rival");
    expect(cb.warName).toContain("Trade War");
  });

  it("favors raiding campaigns for nomadic/horde realms", () => {
    const nomadAttacker: State = {
      ...baseAttacker,
      type: "Nomadic",
      formName: "Great Horde"
    };

    const cb = generateWarCasusBelli({
      attacker: nomadAttacker,
      defender: baseDefender,
      warCount: 1,
      rng: () => 0.1
    });

    expect(cb.category).toBe("raiding");
    expect(cb.action).toContain("campaign of conquest");
    expect(cb.warName).toContain("Incursion");
  });

  it("generates dynastic succession claims between monarchies", () => {
    const cb = generateWarCasusBelli({
      attacker: baseAttacker,
      defender: baseDefender,
      warCount: 1,
      rng: () => 0.4
    });

    // Both are Monarchies
    expect(["succession", "territorial"]).toContain(cb.category);
  });
});
