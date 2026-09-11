import { applyCharacterBackstory, seedRelationsWithPeers } from "./backstoryProfile";
import {
  getCharacters,
  getCurrentYear,
  getPersonalTechnologyKnowledge,
  getWorldContext,
  setPersonalTechnologyKnowledge
} from "./charactersContext";
import type { Character, CharacterPersonality, CharacterRole, CharacterSkills } from "./characterTypes";
import { finalizeCharacterSocietyForPeer } from "./finalizeCharacterSociety";
import { createPerson } from "./personFactory";
import { syncCk3AbilityProfileSkills } from "./skillGeneration";

const FANTASY_OCCUPATIONS: readonly OccupationDefinition[] = [
  { kind: "adventurer", label: "Adventurer", primarySkill: "prowess" },
  { kind: "adventurer", label: "Adventurer", primarySkill: "geography" },
  { kind: "adventurer", label: "Adventurer", primarySkill: "learning" }
];

const HISTORICAL_OCCUPATIONS: readonly OccupationDefinition[] = [
  { kind: "hunter", label: "Hunter", primarySkill: "prowess" },
  { kind: "merchant", label: "Merchant", primarySkill: "stewardship", roleClass: "merchant" },
  { kind: "performer", label: "Performer", primarySkill: "artistry" },
  { kind: "farmer", label: "Farmer", primarySkill: "engineering" },
  { kind: "craftsperson", label: "Craftsperson", primarySkill: "engineering" },
  { kind: "scribe", label: "Scribe", primarySkill: "learning" }
];

interface OccupationDefinition {
  kind: string;
  label: string;
  primarySkill: keyof CharacterSkills;
  roleClass?: "merchant";
}

export interface GenerateBurgResidentsOptions {
  burgId: number;
  count: number;
  isFantasy: boolean;
}

export interface CreatePlayerCharacterOptions {
  name: string;
  burgId: number;
  cultureId: number;
  raceId: number;
  age: number;
  gender: "male" | "female";
  abilityValues: Record<string, number>;
  /** Only the first custom character is assigned the player-character role. */
  isPlayerCharacter?: boolean;
  /** Tools/create only. Never passed from world generation. */
  personalTechnologyKnowledge?: "all" | string[];
}

function getNextCharacterId(characters: readonly Character[]): number {
  return Math.max(-1, ...characters.map(character => character.i)) + 1;
}

function getStateNames(): Record<number, string> {
  const names: Record<number, string> = {};
  for (const state of getWorldContext().pack.states ?? []) {
    if (state.i) names[state.i] = state.name ?? `State ${state.i}`;
  }
  return names;
}

/**
 * Add a requested number of named residents to one burg without replacing the
 * existing political/economic roster. Fantasy maps receive adventurers; other
 * maps draw from a compact medieval occupational mix.
 */
export function generateBurgResidents(options: GenerateBurgResidentsOptions): Character[] {
  const count = Math.floor(options.count);
  if (!Number.isFinite(count) || count < 1) return [];

  const { pack } = getWorldContext();
  const burg = pack.burgs?.[options.burgId];
  if (!burg || burg.removed) return [];

  const state = burg.state !== undefined ? pack.states?.[burg.state] : undefined;
  const cultureId = burg.culture ?? state?.culture ?? pack.cultures?.find(culture => culture.i > 0)?.i ?? 0;
  const stateId = burg.state ?? 0;
  const occupationPool = options.isFantasy ? FANTASY_OCCUPATIONS : HISTORICAL_OCCUPATIONS;
  const characters = getCharacters();
  let nextId = getNextCharacterId(characters);
  const created: Character[] = [];

  for (let index = 0; index < count; index += 1) {
    const occupation = occupationPool[index % occupationPool.length]!;
    const character = createPerson(nextId++, cultureId, {
      homeStateId: stateId,
      primarySkill: occupation.primarySkill,
      roleClass: occupation.roleClass ?? "ordinary"
    });
    character.location = options.burgId;
    const role: CharacterRole = {
      source: "characters",
      kind: occupation.kind,
      entityType: "burg",
      entityId: options.burgId,
      label: occupation.label,
      startYear: getCurrentYear()
    };
    character.roles = [role];
    applyCharacterBackstory(character, {
      roleClass: occupation.roleClass ?? "ordinary",
      homeBurgId: options.burgId,
      birthBurgId: options.burgId,
      capitalBurgId: state?.capital
    });
    characters.push(character);
    seedRelationsWithPeers(character, characters);
    finalizeCharacterSocietyForPeer(character, characters, {
      stateNames: getStateNames(),
      currentYear: getCurrentYear()
    });
    created.push(character);
  }

  return created;
}

/** Create a custom character at a burg, optionally assigning the player-character role. */
export function createPlayerCharacter(options: CreatePlayerCharacterOptions): Character | null {
  const { pack } = getWorldContext();
  const burg = pack.burgs?.[options.burgId];
  if (!burg || burg.removed) return null;

  const characters = getCharacters();
  const stateId = burg.state ?? 0;
  const state = pack.states?.[stateId];
  const age = Number.isFinite(options.age) ? Math.max(1, Math.floor(options.age)) : 25;
  const character = createPerson(getNextCharacterId(characters), options.cultureId, {
    homeStateId: stateId,
    ageOverride: age,
    genderOverride: options.gender,
    raceOverride: options.raceId,
    roleClass: "ordinary"
  });
  const name = options.name.trim();
  if (name) character.name = name;
  character.location = options.burgId;
  if (options.isPlayerCharacter !== false) {
    character.roles = [
      {
        source: "characters",
        kind: "playerCharacter",
        entityType: "burg",
        entityId: options.burgId,
        label: "Player Character",
        startYear: getCurrentYear()
      }
    ];
  }
  applyCharacterBackstory(character, {
    roleClass: "ordinary",
    homeBurgId: options.burgId,
    birthBurgId: options.burgId,
    capitalBurgId: state?.capital
  });
  for (const [ability, value] of Object.entries(options.abilityValues)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const normalized = Math.max(1, Math.min(100, Math.round(value)));
    if (ability in character.skills) {
      character.skills[ability as keyof CharacterSkills] = normalized;
    } else if (ability in character.personality) {
      character.personality[ability as keyof CharacterPersonality] = normalized;
    }
    character.abilityProfile ??= { presetId: "ck3e", values: {} };
    character.abilityProfile.values[ability] = normalized;
  }
  if (character.abilityProfile?.presetId === "ck3e") syncCk3AbilityProfileSkills(character);

  characters.push(character);
  if (options.personalTechnologyKnowledge !== undefined) {
    const knowledge = { ...getPersonalTechnologyKnowledge() };
    knowledge[String(character.i)] = options.personalTechnologyKnowledge;
    setPersonalTechnologyKnowledge(knowledge);
  }
  seedRelationsWithPeers(character, characters);
  finalizeCharacterSocietyForPeer(character, characters, {
    stateNames: getStateNames(),
    currentYear: getCurrentYear()
  });
  return character;
}

/**
 * Generates official leadership characters for an independent/neutral burg.
 * Depending on the governance form, spawns a single Burgomaster or multiple Councilors.
 */
export function generateIndependentBurgRulers(burgId: number): Character[] {
  const { pack } = getWorldContext();
  const burg = pack.burgs?.[burgId];
  if (!burg || burg.removed || burg.state) return [];

  const gov = burg.independentGovernance;
  const form = gov?.form ?? "autocracy";
  const count = form === "autocracy" ? 1 : form === "patrician_council" ? 3 : 2;

  const cultureId = burg.culture ?? pack.cultures?.find(c => c.i > 0)?.i ?? 0;
  const characters = getCharacters();
  let nextId = getNextCharacterId(characters);
  const created: Character[] = [];
  const currentYear = getCurrentYear();

  for (let idx = 0; idx < count; idx++) {
    const isChief = idx === 0;
    const titleName =
      form === "autocracy"
        ? burg.citadel
          ? "Castellan"
          : "Burgomaster"
        : form === "patrician_council"
          ? isChief
            ? "Grand Syndic"
            : "Patrician Councilor"
          : isChief
            ? "Consul"
            : "Tribune";

    const character = createPerson(nextId++, cultureId, {
      homeStateId: 0,
      primarySkill: form === "patrician_council" ? "stewardship" : form === "autocracy" ? "martial" : "diplomacy",
      roleClass: form === "patrician_council" ? "merchant" : "ruler",
      marriageExpectation: "dynastic"
    });

    character.location = burgId;
    character.titles = [
      {
        title: titleName,
        landed: true,
        entityType: "burg",
        entityId: burgId,
        startYear: currentYear
      }
    ];

    applyCharacterBackstory(character, {
      roleClass: form === "patrician_council" ? "merchant" : "ruler",
      homeBurgId: burgId,
      birthBurgId: burgId
    });

    created.push(character);
    characters.push(character);
  }

  // Update burg governance pointers
  if (gov) {
    if (form === "autocracy" && created[0]) {
      gov.rulerCharacterId = created[0].i;
    } else {
      gov.rulerCharacterId = created[0]?.i;
      gov.councilCharacterIds = created.map(c => c.i);
    }
  }

  for (const c of created) {
    seedRelationsWithPeers(c, characters);
    finalizeCharacterSocietyForPeer(c, characters, {
      stateNames: getStateNames(),
      currentYear
    });
  }

  return created;
}
