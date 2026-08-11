import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultRaces } from "../../data/races";
import { Names, worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import { createPlayerCharacter, generateBurgResidents } from "./characterPopulation";
import {
  clearCharactersContext,
  getAllowedCharacterRaceKeys,
  getCharacters,
  getSelectedAbilityPresetId,
  initCharactersContext,
  setAllowedCharacterRaceKeys,
  setSelectedAbilityPresetId
} from "./charactersContext";
import { setInitialPlayerCharacter } from "./controllers/playerCharacter";
import { usePlayerCharacterState } from "./store/playerCharacterState";

describe("characterPopulation", () => {
  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    vi.spyOn(Names, "getCulture").mockReturnValue("Test Person");
    worldContext.pack = {
      characters: [],
      races: createDefaultRaces(),
      cultures: [
        { i: 0, name: "Wildlands", base: 0, shield: "round", race: 0 },
        { i: 1, name: "Test Culture", base: 1, shield: "heater", race: 1 }
      ],
      burgs: [
        { i: 0, cell: 0, x: 0, y: 0 },
        { i: 1, cell: 1, x: 10, y: 10, state: 1, culture: 1, name: "Testburg" }
      ],
      states: [
        { i: 0, name: "Neutral" },
        { i: 1, name: "Test State", culture: 1, capital: 1 }
      ]
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    setSelectedAbilityPresetId("ck3e");
    setAllowedCharacterRaceKeys(
      createDefaultRaces()
        .filter(race => race.i > 0)
        .map(race => race.key)
    );
    vi.restoreAllMocks();
    usePlayerCharacterState.getState().clear();
    clearCharactersContext();
  });

  it("generates the requested fantasy residents as adventurers at the selected burg", () => {
    const created = generateBurgResidents({ burgId: 1, count: 3, isFantasy: true });

    expect(created).toHaveLength(3);
    expect(created.every(character => character.location === 1)).toBe(true);
    expect(created.every(character => character.roles?.[0]?.label === "Adventurer")).toBe(true);
    expect(getCharacters()).toHaveLength(3);
  });

  it("uses medieval occupations for non-fantasy resident generation", () => {
    const created = generateBurgResidents({ burgId: 1, count: 6, isFantasy: false });

    expect(created.map(character => character.roles?.[0]?.label)).toEqual([
      "Hunter",
      "Merchant",
      "Performer",
      "Farmer",
      "Craftsperson",
      "Scribe"
    ]);
  });

  it("creates a configured player character with supplied skills", () => {
    const character = createPlayerCharacter({
      name: "Aster",
      burgId: 1,
      cultureId: 1,
      raceId: 1,
      age: 31,
      gender: "female",
      abilityValues: { diplomacy: 77, prowess: 66 }
    });

    expect(character).toMatchObject({
      name: "Aster",
      age: 31,
      gender: "female",
      race: 1,
      location: 1,
      skills: { diplomacy: 77, prowess: 66 }
    });
    expect(character?.roles?.[0]?.label).toBe("Player Character");
    expect(character?.abilityProfile?.values.diplomacy).toBe(77);
  });

  it("selects only the first custom character as the player character", () => {
    const first = createPlayerCharacter({
      name: "Aster",
      burgId: 1,
      cultureId: 1,
      raceId: 1,
      age: 31,
      gender: "female",
      abilityValues: {}
    });
    expect(first).not.toBeNull();
    expect(setInitialPlayerCharacter(first!.i)).toBe(true);

    const additional = createPlayerCharacter({
      name: "Beren",
      burgId: 1,
      cultureId: 1,
      raceId: 1,
      age: 28,
      gender: "male",
      abilityValues: {},
      isPlayerCharacter: false
    });
    expect(additional).not.toBeNull();
    expect(setInitialPlayerCharacter(additional!.i)).toBe(false);
    expect(usePlayerCharacterState.getState().playerCharacterId).toBe(first!.i);
    expect(additional?.roles).toBeUndefined();
  });

  it("uses the Characters-wide ability system for a new player character", () => {
    expect(setSelectedAbilityPresetId("dnd5e")).toBe(true);
    expect(getSelectedAbilityPresetId()).toBe("dnd5e");

    const character = createPlayerCharacter({
      name: "Neris",
      burgId: 1,
      cultureId: 1,
      raceId: 1,
      age: 80,
      gender: "male",
      abilityValues: { STR: 16, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }
    });

    expect(character?.abilityProfile).toEqual({
      presetId: "dnd5e",
      values: { STR: 16, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }
    });
    expect(character?.skills).toEqual({});
    expect(character?.personality).toEqual({});
    expect(character?.family).toEqual({
      spouses: 0,
      children: 0,
      grandchildren: 0,
      greatGrandchildren: 0,
      spouseIds: [],
      childIds: []
    });
    expect(character?.backstory).toBeUndefined();
  });

  it("limits new residents and player characters to the configured race roster", () => {
    expect(setAllowedCharacterRaceKeys(["elf"])).toBe(true);
    expect(getAllowedCharacterRaceKeys()).toEqual(["elf"]);

    const residents = generateBurgResidents({ burgId: 1, count: 2, isFantasy: false });
    const player = createPlayerCharacter({
      name: "Aster",
      burgId: 1,
      cultureId: 1,
      raceId: 1,
      age: 31,
      gender: "female",
      abilityValues: {}
    });

    const elf = createDefaultRaces().find(race => race.key === "elf")!;
    expect(residents.every(character => character.race === elf.i)).toBe(true);
    expect(player?.race).toBe(elf.i);
  });
});
