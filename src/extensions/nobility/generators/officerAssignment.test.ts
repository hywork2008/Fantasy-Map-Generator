import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, MilitaryRegiment, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import {
  assignOfficers,
  getRegimentCommander,
  MIN_TROOPS_FOR_DEDICATED_OFFICER,
  regimentQualifiesForDedicatedOfficer,
  regimentTroopStrength
} from "./officerAssignment";

function makeRegiment(overrides: Partial<MilitaryRegiment>): MilitaryRegiment {
  return {
    i: 0,
    t: 0,
    name: "Regiment",
    a: 100,
    s: 0,
    cell: 0,
    x: 0,
    y: 0,
    bx: 0,
    by: 0,
    u: { infantry: 100 },
    n: 0,
    type: "melee",
    state: 1,
    ...overrides
  };
}

describe("assignOfficers", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.seed = "123456";
    worldContext.options = { year: 1000 } as never;
    worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla,David,Erin" }];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearNobilityContext();
  });

  it("gives the capital guard to the state's living Marshal instead of a new character", () => {
    const marshal = {
      i: 5,
      dead: false,
      titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
    };
    const guard = makeRegiment({ i: 0, isCapitalGuard: true, state: 1 });

    worldContext.pack = {
      characters: [marshal],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [guard] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();

    expect(guard.commanderId).toBe(5);
    expect(getRegimentCommander([marshal] as unknown as Character[], guard)).toBe(marshal);
    // No extra character was created for the capital guard.
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("leaves the capital guard without a commander when the state has no living Marshal", () => {
    const guard = makeRegiment({ i: 0, isCapitalGuard: true, state: 1 });

    worldContext.pack = {
      characters: [],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [guard] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();

    expect(guard.commanderId).toBeUndefined();
  });

  it("creates a new Commander for a land regiment when the assignment roll succeeds", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3); // P(0.35) -> 0.3 < 0.35 -> always assign

    const fieldArmy = makeRegiment({ i: 1, state: 1, n: 0 });

    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [fieldArmy] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();

    expect(fieldArmy.commanderId).toBeDefined();
    const officer = worldContext.pack.characters.find(c => c.i === fieldArmy.commanderId)!;
    expect(officer).toBeDefined();
    expect(officer.titles[0].title).toBe("Commander");
    expect(officer.skills.martial).toBeGreaterThanOrEqual(40); // primarySkill "martial" floor
  });

  it("creates a new Admiral for a naval regiment (n > 0) when the assignment roll succeeds", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);

    const fleet = makeRegiment({ i: 1, state: 1, n: 5 });

    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [fleet] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();

    const officer = worldContext.pack.characters.find(c => c.i === fleet.commanderId)!;
    expect(officer.titles[0].title).toBe("Admiral");
  });

  it("does not assign an officer when the roll fails", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // P(0.35) -> false

    const fieldArmy = makeRegiment({ i: 1, state: 1 });

    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [fieldArmy] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();

    expect(fieldArmy.commanderId).toBeUndefined();
    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("leaves a regiment's living, titled commander untouched on a repeated call", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);

    const fieldArmy = makeRegiment({ i: 1, state: 1 });
    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [fieldArmy] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();
    const firstCommanderId = fieldArmy.commanderId;
    assignOfficers();

    expect(fieldArmy.commanderId).toBe(firstCommanderId);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("backfills a vacancy left by a dead commander", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);

    const fieldArmy = makeRegiment({ i: 1, state: 1, commanderId: 9 });
    const deadOfficer = {
      i: 9,
      dead: true,
      titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
    };

    worldContext.pack = {
      characters: [deadOfficer],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [fieldArmy] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();

    expect(fieldArmy.commanderId).not.toBe(9);
    expect(worldContext.pack.characters).toHaveLength(2);
  });

  it("does not create a Commander for a sub-company field regiment even when the assignment roll succeeds", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);

    const platoon = makeRegiment({ i: 1, state: 1, a: 17, u: { infantry: 17 } });

    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [platoon] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();

    expect(platoon.commanderId).toBeUndefined();
    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("still assigns a Commander once the regiment reaches company strength", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);

    const company = makeRegiment({
      i: 1,
      state: 1,
      a: MIN_TROOPS_FOR_DEDICATED_OFFICER,
      u: { infantry: MIN_TROOPS_FOR_DEDICATED_OFFICER }
    });

    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0, military: [company] }
      ]
    } as unknown as PackedGraph;

    assignOfficers();

    expect(company.commanderId).toBeDefined();
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("treats current strength `a` as authoritative over unit-table leftovers", () => {
    expect(regimentTroopStrength({ a: 17, u: { infantry: 80 } })).toBe(17);
    expect(regimentTroopStrength({ u: { infantry: 17, archers: 3 } })).toBe(20);
    expect(regimentQualifiesForDedicatedOfficer({ a: MIN_TROOPS_FOR_DEDICATED_OFFICER - 1, u: {} })).toBe(false);
    expect(regimentQualifiesForDedicatedOfficer({ a: MIN_TROOPS_FOR_DEDICATED_OFFICER, u: {} })).toBe(true);
    expect(regimentQualifiesForDedicatedOfficer({ a: 200, u: {}, isCapitalGuard: true })).toBe(false);
  });

  it("does not crash for states with no military and getRegimentCommander returns undefined for an unassigned regiment", () => {
    worldContext.pack = {
      characters: [],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0 }
      ]
    } as unknown as PackedGraph;

    expect(() => assignOfficers()).not.toThrow();
    expect(getRegimentCommander([], makeRegiment({}))).toBeUndefined();
  });
});
