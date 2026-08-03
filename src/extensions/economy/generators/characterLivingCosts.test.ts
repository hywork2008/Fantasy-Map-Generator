import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  applyCharacterLivingCosts,
  computeLivingCost,
  LIVING_COST_BY_TIER,
  resolveLifestyleTier,
  WEALTH_UPKEEP_MAX_MULT,
  WEALTH_UPKEEP_RATE
} from "./characterLivingCosts";
import {
  GUILD_MASTER_STIPEND,
  MARKET_MANAGER_STIPEND,
  MARKET_RIVAL_STIPEND,
  PROVINCE_LORD_STIPEND
} from "./characterStipends";
import {
  CENTRAL_OFFICE_STIPEND_FLOOR,
  FIELD_COMMANDER_STIPEND_FLOOR,
  HOUSEHOLD_STIPEND_FLOOR
} from "./treasuryAllocation";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
    age: 40,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {} as Character["personality"],
    family: {} as Character["family"],
    appearance: 0,
    prestige: 0,
    wealth: 10,
    pastTitles: [],
    ...overrides
  };
}

describe("characterLivingCosts", () => {
  describe("resolveLifestyleTier()", () => {
    it("classifies rulers, offices, commanders, lords, and economy roles", () => {
      expect(
        resolveLifestyleTier(
          makeCharacter({ titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }] })
        )
      ).toBe("ruler");
      expect(
        resolveLifestyleTier(
          makeCharacter({ titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }] })
        )
      ).toBe("centralOffice");
      expect(
        resolveLifestyleTier(
          makeCharacter({ titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }] })
        )
      ).toBe("fieldCommander");
      expect(
        resolveLifestyleTier(
          makeCharacter({ titles: [{ title: "Count", landed: true, entityType: "province", entityId: 1 }] })
        )
      ).toBe("provinceLord");
      expect(
        resolveLifestyleTier(
          makeCharacter({
            roles: [{ source: "economy", kind: "guildMaster", entityType: "burg", entityId: 1, label: "Guild Master" }]
          })
        )
      ).toBe("guildMaster");
      expect(
        resolveLifestyleTier(
          makeCharacter({
            age: 14,
            roles: [
              {
                source: "economy",
                kind: "guildApprentice",
                entityType: "burg",
                entityId: 1,
                organizationId: 2,
                label: "Guild Apprentice"
              }
            ]
          })
        )
      ).toBe("apprenticeBoarded");
    });

    it("picks the dearest tier when a character holds multiple roles", () => {
      const character = makeCharacter({
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }],
        roles: [{ source: "economy", kind: "guildMaster", entityType: "burg", entityId: 1, label: "Guild Master" }]
      });
      expect(resolveLifestyleTier(character)).toBe("fieldCommander");
    });
  });

  describe("computeLivingCost()", () => {
    it("is below typical stipend so paid roles still save without wealth drag", () => {
      // Zero-wealth path: only base lifestyle (status upkeep is 0).
      expect(LIVING_COST_BY_TIER.marketRival).toBeLessThan(MARKET_RIVAL_STIPEND);
      expect(LIVING_COST_BY_TIER.guildMaster).toBeLessThan(GUILD_MASTER_STIPEND);
      expect(LIVING_COST_BY_TIER.marketManager).toBeLessThan(MARKET_MANAGER_STIPEND);
      expect(LIVING_COST_BY_TIER.fieldCommander).toBeLessThan(FIELD_COMMANDER_STIPEND_FLOOR);
      expect(LIVING_COST_BY_TIER.provinceLord).toBeLessThan(PROVINCE_LORD_STIPEND);
      expect(LIVING_COST_BY_TIER.centralOffice).toBeLessThan(CENTRAL_OFFICE_STIPEND_FLOOR);
      expect(LIVING_COST_BY_TIER.ruler).toBeLessThan(HOUSEHOLD_STIPEND_FLOOR);
    });

    it("adds capped wealth-linked status upkeep on top of lifestyle", () => {
      const poor = makeCharacter({
        wealth: 1,
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
      });
      const rich = makeCharacter({
        wealth: 100,
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
      });

      const lifestyle = LIVING_COST_BY_TIER.fieldCommander;
      expect(computeLivingCost(poor)).toBeCloseTo(lifestyle + 1 * WEALTH_UPKEEP_RATE, 5);
      expect(computeLivingCost(rich)).toBeCloseTo(lifestyle + lifestyle * WEALTH_UPKEEP_MAX_MULT, 2);
    });
  });

  describe("applyCharacterLivingCosts()", () => {
    afterEach(() => {
      clearCharactersContext();
    });

    beforeEach(() => {
      initCharactersContext({ worldContext } as unknown as ExtensionAPI);
      worldContext.pack = { characters: [] } as unknown as PackedGraph;
    });

    it("deducts living costs from living characters and never goes negative", () => {
      const officer = makeCharacter({
        i: 1,
        wealth: 1,
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
      });
      const broke = makeCharacter({ i: 2, wealth: 0.02, titles: [] });
      const dead = makeCharacter({
        i: 3,
        wealth: 50,
        dead: true,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      });
      worldContext.pack.characters = [officer, broke, dead];

      const summary = applyCharacterLivingCosts();

      expect(officer.wealth).toBeLessThan(1);
      expect(officer.wealth).toBeGreaterThanOrEqual(0);
      expect(broke.wealth).toBe(0);
      expect(dead.wealth).toBe(50); // not charged
      expect(summary.charactersCharged).toBe(2);
      expect(summary.totalSpent).toBeGreaterThan(0);
    });

    it("is a no-op when Characters context is missing", () => {
      clearCharactersContext();
      expect(applyCharacterLivingCosts()).toEqual({ charactersCharged: 0, totalSpent: 0 });
    });
  });
});
