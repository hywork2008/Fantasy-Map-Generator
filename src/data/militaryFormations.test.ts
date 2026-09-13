import { describe, expect, it } from "vitest";
import type { Character } from "../extensions/characters/characterTypes";
import {
  COUNTER_FORMATIONS,
  getFormationMatchupFactor,
  getTacticalSkill,
  getTroopPreferredFormation,
  resolveBattleFormations
} from "./militaryFormations";

function createMockCommander(martial: number, tactics = 0, command = 0): Character {
  return {
    i: 1,
    name: "General",
    age: 40,
    dead: false,
    culture: 1,
    skills: {
      martial,
      diplomacy: 50,
      stewardship: 50,
      intrigue: 50,
      learning: 50,
      prowess: 50,
      engineering: 50,
      geography: 50
    },
    specializations: {
      domains: [
        { domainId: "martial.tactics", knowledge: tactics, practice: tactics, targets: [] },
        { domainId: "martial.command", knowledge: command, practice: command, targets: [] }
      ]
    },
    titles: []
  } as unknown as Character;
}

describe("militaryFormations", () => {
  describe("FORMATION_MATCHUPS and rock-paper-scissors dynamics", () => {
    it("Wedge beats Line (shock penetration breaks thin lines)", () => {
      const wedgeVsLine = getFormationMatchupFactor("wedge", "line");
      const lineVsWedge = getFormationMatchupFactor("line", "wedge");
      expect(wedgeVsLine).toBeGreaterThan(1.0);
      expect(lineVsWedge).toBeLessThan(1.0);
      expect(COUNTER_FORMATIONS.line).toBe("wedge");
    });

    it("Line beats Square (enveloping firepower outranges dense hedgehog)", () => {
      const lineVsSquare = getFormationMatchupFactor("line", "square");
      const squareVsLine = getFormationMatchupFactor("square", "line");
      expect(lineVsSquare).toBeGreaterThan(1.0);
      expect(squareVsLine).toBeLessThan(1.0);
      expect(COUNTER_FORMATIONS.square).toBe("line");
    });

    it("Square beats Wedge (dense pike/spear wall stops spearhead charges)", () => {
      const squareVsWedge = getFormationMatchupFactor("square", "wedge");
      const wedgeVsSquare = getFormationMatchupFactor("wedge", "square");
      expect(squareVsWedge).toBeGreaterThan(1.0);
      expect(wedgeVsSquare).toBeLessThan(1.0);
      expect(COUNTER_FORMATIONS.wedge).toBe("square");
    });
  });

  describe("Spearmen synergy in Square formation", () => {
    it("Square with spearmen gains higher defense against wedge / cavalry than pure infantry square", () => {
      const pureInfantrySquare = getFormationMatchupFactor(
        "square",
        "wedge",
        { infantry: 100 },
        { cavalry: 50, infantry: 50 }
      );
      const spearmenSquare = getFormationMatchupFactor(
        "square",
        "wedge",
        { spearmen: 100 },
        { cavalry: 50, infantry: 50 }
      );

      expect(spearmenSquare).toBeGreaterThan(pureInfantrySquare);
    });
  });

  describe("Troop preferred formation", () => {
    it("recommends square for spearmen-heavy troops", () => {
      expect(getTroopPreferredFormation({ spearmen: 80, archers: 20 })).toBe("square");
    });

    it("recommends wedge for cavalry-heavy troops", () => {
      expect(getTroopPreferredFormation({ cavalry: 70, infantry: 30 })).toBe("wedge");
    });

    it("recommends line for archer-heavy troops", () => {
      expect(getTroopPreferredFormation({ archers: 80, infantry: 20 })).toBe("line");
    });
  });

  describe("Tactical Skill and Commander Decision Logic", () => {
    it("returns 0 for no commander or dead commander", () => {
      expect(getTacticalSkill(undefined)).toBe(0);
      expect(getTacticalSkill({ dead: true } as Character)).toBe(0);
    });

    it("calculates tactical skill incorporating martial, tactics and command", () => {
      const commander = createMockCommander(80, 70, 60);
      // 80*0.7 + 70*0.2 + 60*0.1 = 56 + 14 + 6 = 76
      expect(getTacticalSkill(commander)).toBe(76);
    });

    it("skilled commander against unled troops always selects an advantageous counter-formation", () => {
      const skilledCommander = createMockCommander(90, 80, 80);
      const troopsA = { infantry: 100 };
      const troopsB = { spearmen: 100 }; // Unled B defaults to square

      // Cover the probability interval deterministically.
      let advantagedCount = 0;
      for (let i = 0; i < 20; i++) {
        const result = resolveBattleFormations(skilledCommander, troopsA, undefined, troopsB, () => i / 20);
        if (result.advantageA === "advantaged" && result.advantageB === "disadvantaged") {
          advantagedCount++;
        }
      }

      // A skilled commander must counter on every roll.
      expect(advantagedCount).toBe(20);
    });

    it("unled troops against an unled enemy settle into default troop formations", () => {
      const troopsA = { spearmen: 100 }; // square
      const troopsB = { archers: 100 }; // line

      const result = resolveBattleFormations(undefined, troopsA, undefined, troopsB);
      expect(result.formationA).toBe("square");
      expect(result.formationB).toBe("line");
    });

    it("superior commander counters an inferior commander with high probability", () => {
      const greatCommander = createMockCommander(95, 90, 90); // ~93 score
      const weakCommander = createMockCommander(40, 20, 20); // ~34 score (diff ~59)
      const troopsA = { infantry: 100 };
      const troopsB = { archers: 100 }; // weak commander defaults to line

      let greatAdvantageCount = 0;
      for (let i = 0; i < 20; i++) {
        const result = resolveBattleFormations(greatCommander, troopsA, weakCommander, troopsB, () => i / 20);
        if (result.advantageA === "advantaged") {
          greatAdvantageCount++;
        }
      }

      expect(greatAdvantageCount).toBeGreaterThanOrEqual(16);
    });
  });
});

it("martial 85 without specializations counters an unled opponent even on the highest roll", () => {
  const commander = { skills: { martial: 85 } } as Character;
  expect(
    resolveBattleFormations(commander, { infantry: 100 }, undefined, { spearmen: 100 }, () => 0.99999).advantageA
  ).toBe("advantaged");
  expect(
    resolveBattleFormations(undefined, { spearmen: 100 }, commander, { infantry: 100 }, () => 0.99999).advantageB
  ).toBe("advantaged");
});

it("an ordinary commander counters an unled army in 85 percent of deterministic rolls", () => {
  let wins = 0;
  for (let i = 0; i < 100; i++) {
    const result = resolveBattleFormations(
      createMockCommander(40),
      { infantry: 100 },
      undefined,
      { spearmen: 100 },
      () => i / 100
    );
    if (result.advantageA === "advantaged") wins++;
  }
  expect(wins).toBe(85);
});
