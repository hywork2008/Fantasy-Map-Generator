import { describe, expect, it } from "vitest";
import type { Burg } from "../types/models";
import {
  calculateDefenseResolve,
  determineGovernanceForm,
  initializeIndependentBurgGovernance
} from "./independentBurgGovernance";

describe("independentBurgGovernance", () => {
  it("determines patrician_council for prosperous port burgs", () => {
    const burg: Burg = {
      cell: 10,
      x: 100,
      y: 100,
      port: 1,
      population: 6000
    };
    expect(determineGovernanceForm(burg)).toBe("patrician_council");
  });

  it("determines free_commune for large unfortified civic settlements", () => {
    const burg: Burg = {
      cell: 20,
      x: 200,
      y: 200,
      population: 9000,
      plaza: 1
    };
    expect(determineGovernanceForm(burg)).toBe("free_commune");
  });

  it("determines autocracy for small or fortified settlements", () => {
    const burg: Burg = {
      cell: 30,
      x: 300,
      y: 300,
      population: 1500,
      citadel: 1,
      walls: 1
    };
    expect(determineGovernanceForm(burg)).toBe("autocracy");
  });

  it("calculates defense resolve correctly", () => {
    const weakBurg: Burg = {
      cell: 40,
      x: 400,
      y: 400,
      population: 1000
    };
    expect(calculateDefenseResolve(weakBurg)).toBe(20); // 30 - 10

    const fortressBurg: Burg = {
      cell: 50,
      x: 500,
      y: 500,
      citadel: 1, // +25
      walls: 2, // +20
      fortificationQuality: 80, // +6
      population: 12000 // +15
    };
    // 30 + 25 + 20 + 6 + 15 = 96 -> clamped to 95
    expect(calculateDefenseResolve(fortressBurg)).toBe(95);
  });

  it("initializes governance with factions and defense resolve", () => {
    const burg: Burg = {
      cell: 60,
      x: 600,
      y: 600,
      population: 5000,
      port: 1
    };
    const gov = initializeIndependentBurgGovernance(burg, undefined, {
      neighborStateIds: [1, 2],
      initialRulerId: 101
    });

    expect(gov.form).toBe("patrician_council");
    expect(gov.rulerCharacterId).toBe(101);
    expect(gov.autonomyStatus).toBe("full_independent");
    expect(gov.factions.length).toBe(3); // 1 independent + 2 neighbors
    expect(gov.factions[0].targetStateId).toBe(0);
    expect(gov.factions.reduce((sum, f) => sum + f.weight, 0)).toBe(100);
  });
});
