import type { ExtensionAPI } from "../../types/extension-api";
import type { WorldLanguages } from "../../types/worldLanguages";
import { assertObject, validateWorldLanguages } from "../../utils/worldLanguages";
import { getApi, getCharacters, getCurrentYear, getWorldContext } from "./charactersContext";
import type { Character } from "./characterTypes";
import { advanceSpecializationLearning } from "./specializationLearning";
import { decaySpecializations, emptySpecializations, recordSpecializationExperience } from "./specializations";
import { validateSpecializationProfile } from "./specializationValidation";
import { useCharactersUiState } from "./ui/charactersUiState";

export type AptitudeTierName = "poor" | "ordinary" | "promising" | "gifted" | "exceptional";

export interface EconomyCraftSkillRead {
  proficiency: number;
  aptitude?: AptitudeTierName;
}

const APTITUDE_TIERS: ReadonlySet<string> = new Set(["poor", "ordinary", "promising", "gifted", "exceptional"]);

function readEconomySkillEntry(characterId: number, domain: string): Record<string, unknown> | undefined {
  if (getApi().isExtensionEnabled && !getApi().isExtensionEnabled("economy")) return undefined;
  const economy = getApi().simulationContext?.extensions?.economy;
  if (!Array.isArray(economy?.individualSkills)) return undefined;
  const entry = economy.individualSkills.find((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return false;
    const value = candidate as Record<string, unknown>;
    return value.characterId === characterId && value.domain === domain;
  });
  return entry && typeof entry === "object" ? (entry as Record<string, unknown>) : undefined;
}

/** Structural read keeps the optional Economy extension out of the module dependency graph. */
export function readEconomyPractice(characterId: number, domain: string): number | undefined {
  const value = readEconomySkillEntry(characterId, domain)?.proficiency;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
}

/** Proficiency plus aptitude for craft epithets. Undefined when Economy is off or the person has no skill. */
export function readEconomyCraftSkill(characterId: number, domain: string): EconomyCraftSkillRead | undefined {
  const entry = readEconomySkillEntry(characterId, domain);
  const proficiency = entry?.proficiency;
  if (typeof proficiency !== "number" || !Number.isFinite(proficiency) || proficiency < 0 || proficiency > 100) {
    return undefined;
  }
  const aptitude =
    typeof entry?.aptitude === "string" && APTITUDE_TIERS.has(entry.aptitude) ? entry.aptitude : undefined;
  return { proficiency, aptitude: aptitude as AptitudeTierName | undefined };
}

export function validateLanguageWorldReferences(world: WorldLanguages): void {
  const pack = getWorldContext().pack;
  for (const culture of world.cultures)
    if (!pack.cultures.some(entry => entry.i === culture.cultureId)) throw new Error("Unknown culture");
  for (const state of world.states)
    if (!pack.states.some(entry => entry.i === state.stateId)) throw new Error("Unknown state");
  for (const character of getCharacters()) validateSpecializationProfile(character.specializations, world);
}

export function registerSpecializationCommands(api: ExtensionAPI): () => void {
  const unregisterProfile = api.registerExtensionCommand({
    extensionId: "characters",
    name: "setSpecializations",
    execute: value => {
      assertObject(value, "setSpecializations");
      const character = getCharacters().find(character => character.i === value.characterId);
      if (!character) throw new Error("Unknown character");
      validateSpecializationProfile(value.profile, getWorldContext().pack.languageWorld);
      if (!value.profile) throw new Error("A profile is required");
      character.specializations = structuredClone(value.profile);
      useCharactersUiState.getState().bumpRefreshToken();
      return { changed: true };
    }
  });
  const unregisterLanguages = api.registerExtensionCommand({
    extensionId: "characters",
    name: "setWorldLanguages",
    topics: ["map.politics", "extension.characters"],
    execute: value => {
      validateWorldLanguages(value);
      if (!value) throw new Error("Language settings are required");
      validateLanguageWorldReferences(value);
      getWorldContext().pack.languageWorld = structuredClone(value);
      useCharactersUiState.getState().bumpRefreshToken();
      return { changed: true };
    }
  });
  return () => {
    unregisterProfile();
    unregisterLanguages();
  };
}

/** Called once when real ongoing service has elapsed, including long simulation steps. */
export function advanceProfessionalExperience(character: Character, deltaYears: number): void {
  if (!character.specializations || character.dead || !(deltaYears > 0)) return;
  // A role alone supplies practice, never fabricated battles. Small allocation leaves room for events/study.
  const role =
    character.titles.find(title => title.endYear === undefined) ??
    character.roles?.find(role => role.endYear === undefined);
  if (!role) return;
  const title = "title" in role ? role.title : role.kind;
  const domainId = /Commander|Admiral|Marshal|War/.test(title)
    ? "martial.command"
    : /Spymaster/.test(title)
      ? "intrigue.networks"
      : /Chancellor|Diplomat/.test(title)
        ? "diplomacy.negotiation"
        : /Steward|Treasur|marketManager|merchant/.test(title)
          ? "stewardship.administration"
          : undefined;
  if (!domainId) return;
  const year = getCurrentYear();
  const id = `service:${year}:${title}`;
  const existing = character.specializations.experience.find(entry => entry.id === id);
  // Aggregate at an annual boundary via pending coverage; no per-day history growth.
  const pending = character.specializations.serviceLearning ?? { year, coverage: 0, domainId, role: title };
  if (pending.year !== year || pending.domainId !== domainId) {
    settleService(character, pending);
    character.specializations.serviceLearning = { year, coverage: 0, domainId, role: title };
  } else character.specializations.serviceLearning = pending;
  if (!existing)
    character.specializations.serviceLearning.coverage = Math.min(
      0.25,
      character.specializations.serviceLearning.coverage + deltaYears * 0.25
    );
  if (character.specializations.serviceLearning.coverage >= 0.25) {
    settleService(character, character.specializations.serviceLearning);
    character.specializations.serviceLearning.coverage = 0;
  }
}
function settleService(
  character: Character,
  pending: NonNullable<NonNullable<Character["specializations"]>["serviceLearning"]>
): void {
  recordSpecializationExperience(
    character,
    {
      id: `service:${pending.year}:${pending.role}`,
      domainId: pending.domainId,
      year: pending.year,
      coverage: pending.coverage,
      mode: "service",
      role: pending.role,
      outcome: "service",
      source: "simulation",
      targets: []
    },
    0.6
  );
}

export function profileForEditing(character: Character) {
  return structuredClone(character.specializations ?? emptySpecializations());
}

/** Characters owns education even on maps without political/court simulation. */
export function registerSpecializationSimulation(api: ExtensionAPI): () => void {
  return api.registerSimulationSystem({
    id: "characters.expertise",
    phase: "finalize",
    cadence: { every: 1 },
    reads: ["extension.characters", "map.politics", "simulation.clock"],
    writes: ["extension.characters"],
    run: (context, writer) => {
      if (!api.isExtensionEnabled("characters")) return;
      const deltaYears = context.delta.years + context.delta.months / 12 + context.delta.days / 365.2425;
      if (!(deltaYears > 0)) return;
      const characters = getCharacters();
      const year = getCurrentYear();
      let changed = false;
      for (const character of characters) {
        if (!character.specializations || character.dead) continue;
        advanceSpecializationLearning(character, characters, year, deltaYears, api.worldContext.pack.languageWorld);
        advanceProfessionalExperience(character, deltaYears);
        decaySpecializations(character, year);
        changed = true;
      }
      if (changed) writer.markChanged("extension.characters");
    }
  });
}
