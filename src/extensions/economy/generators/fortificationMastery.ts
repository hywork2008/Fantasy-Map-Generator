/**
 * Military-engineer fortification craft and the quality of built walls, citadels, and
 * frontier forts. Economy owns the practical skill; burgs/forts store the resulting
 * construction quality for combat to read without importing this module.
 */
import type { Character } from "../../characters/characterTypes";
import type { Burg, FrontierFort } from "../../hostTypes";
import {
  ANNUAL_GATE,
  getGuildKnowledgeStocks,
  getIndividualSkills,
  getSimulationYear,
  getWorldContext,
  isEconomyContextReady,
  setIndividualSkills,
  settleAnnualOnce
} from "../economyContext";
import { aptitudeFromEngineering, discardIndividualSkill, getIndividualSkill } from "./individualSkillMastery";
import type { AptitudeTier, CharacterDomainSkill } from "./individualSkillTypes";

export const FORTIFICATION_DOMAIN = "fortification" as const;
/** Officers below this engineering score do not receive the craft. */
export const MILITARY_ENGINEERING_THRESHOLD = 65;
/**
 * Identity quality for the classic 3× siege ratio. Old saves and unfortified-then-walled
 * works without an engineer use this so existing combat tests keep their ratios.
 */
export const DEFAULT_FORTIFICATION_QUALITY = 50;

const MILITARY_TITLE_RE = /Commander|Admiral|Marshal|General|Warlord|Minister of War|Shogun/i;
const BASE_PRACTICE_GAIN = 2.2;
const APTITUDE_GROWTH: Readonly<Record<AptitudeTier, number>> = {
  poor: 0.8,
  ordinary: 1,
  promising: 1.12,
  gifted: 1.25,
  exceptional: 1.4
};

function clampProficiency(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function clampQuality(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function diminishingReturns(proficiency: number): number {
  const base = Math.max(0.05, 1 - proficiency / 120);
  return proficiency >= 90 ? base * 0.4 : base;
}

export function isMilitaryFortificationCandidate(character: Pick<Character, "dead" | "skills" | "titles">): boolean {
  if (character.dead) return false;
  if (character.skills.engineering < MILITARY_ENGINEERING_THRESHOLD) return false;
  return character.titles.some(title => MILITARY_TITLE_RE.test(title.title));
}

function initialProficiency(character: Pick<Character, "skills">): number {
  const mixed =
    character.skills.engineering * 0.7 + character.skills.geography * 0.15 + character.skills.martial * 0.15;
  return clampProficiency(Math.max(20, Math.min(90, mixed)));
}

/** Materialize the fortification craft for a qualifying officer. Idempotent. */
export function ensureFortificationSkill(character: Character): CharacterDomainSkill | undefined {
  if (!isMilitaryFortificationCandidate(character)) return getIndividualSkill(character.i, FORTIFICATION_DOMAIN);

  const existing = getIndividualSkill(character.i, FORTIFICATION_DOMAIN);
  if (existing) return existing;

  const skill: CharacterDomainSkill = {
    characterId: character.i,
    domain: FORTIFICATION_DOMAIN,
    proficiency: initialProficiency(character),
    aptitude: aptitudeFromEngineering(character),
    techniques: []
  };
  setIndividualSkills([...getIndividualSkills(), skill]);
  return skill;
}

/**
 * Design quality of a built work: the engineer's craft, plus local masonry technique.
 * Missing or weak engineers never fall below the classic typical-walls quality of 50.
 */
export function computeFortificationQuality(proficiency: number | undefined, masonryStock = 0): number {
  if (proficiency === undefined) return DEFAULT_FORTIFICATION_QUALITY;
  const skill = Math.max(0, Math.min(100, proficiency));
  const stock = Math.max(0, Math.min(1, masonryStock));
  return clampQuality(Math.max(DEFAULT_FORTIFICATION_QUALITY, skill * 0.8 + stock * 20));
}

function masonryStockForBurg(burgId: number | undefined): number {
  if (!burgId) return 0;
  return getGuildKnowledgeStocks().find(stock => stock.burgId === burgId && stock.domain === "masonry")?.stock ?? 0;
}

function bestFortificationProficiency(
  characters: readonly Character[],
  stateId: number | undefined,
  burgId?: number
): number | undefined {
  let bestProficiency: number | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const character of characters) {
    if (character.dead) continue;
    if (stateId && character.state !== stateId) {
      const holdsOffice = character.titles.some(
        title => title.entityType === "state" && title.entityId === stateId && MILITARY_TITLE_RE.test(title.title)
      );
      if (!holdsOffice) continue;
    }
    const skill = getIndividualSkill(character.i, FORTIFICATION_DOMAIN);
    if (!skill) continue;
    const locatedBonus = burgId !== undefined && character.location === burgId ? 8 : 0;
    const score = skill.proficiency + locatedBonus;
    if (score > bestScore) {
      bestScore = score;
      bestProficiency = skill.proficiency;
    }
  }
  return bestProficiency;
}

function qualityFromStateEngineers(
  characters: readonly Character[],
  stateId: number | undefined,
  burgId?: number
): number {
  return computeFortificationQuality(
    bestFortificationProficiency(characters, stateId, burgId),
    masonryStockForBurg(burgId)
  );
}

function raiseFortificationQuality(target: { fortificationQuality?: number }, next: number): void {
  target.fortificationQuality = Math.max(target.fortificationQuality ?? 0, clampQuality(next));
}

/** Raise a burg's stored quality when walls or a citadel are completed. */
export function applyFortificationQualityOnWorks(burg: Burg): void {
  if (!(burg.citadel || burg.walls)) return;
  if (!isEconomyContextReady()) {
    raiseFortificationQuality(burg, DEFAULT_FORTIFICATION_QUALITY);
    return;
  }
  const characters = getWorldContext().pack.characters ?? [];
  raiseFortificationQuality(burg, qualityFromStateEngineers(characters, burg.state, burg.i));
}

function seedMilitaryFortificationSkills(): void {
  const characters = getWorldContext().pack.characters ?? [];
  for (const character of characters) {
    if (character.dead) {
      discardIndividualSkill(character.i, FORTIFICATION_DOMAIN);
      continue;
    }
    ensureFortificationSkill(character);
  }
}

function growFortificationSkills(): void {
  const { pack } = getWorldContext();
  const characters = pack.characters ?? [];
  const year = getSimulationYear();
  for (const character of characters) {
    if (!isMilitaryFortificationCandidate(character)) continue;
    const skill = getIndividualSkill(character.i, FORTIFICATION_DOMAIN);
    if (!skill || skill.proficiency >= 100) continue;
    const burg = character.location !== undefined ? pack.burgs[character.location] : undefined;
    const fortifiedWorkplace = !!(burg && !burg.removed && (burg.citadel || burg.walls));
    const fortifying = burg?.domainFiscalPolicy === "fortify";
    const coverage = fortifiedWorkplace || fortifying ? 0.55 : 0.28;
    const masonry = masonryStockForBurg(burg?.i);
    const trainingQuality = 0.4 + Math.min(1, masonry) * 0.6;
    const gain =
      BASE_PRACTICE_GAIN *
      coverage *
      trainingQuality *
      APTITUDE_GROWTH[skill.aptitude] *
      diminishingReturns(skill.proficiency);
    skill.proficiency = clampProficiency(skill.proficiency + gain);
    skill.lastPracticedYear = year;
  }
}

function seedMissingFortificationQuality(): void {
  const { pack } = getWorldContext();
  const characters = pack.characters ?? [];
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    if (!(burg.citadel || burg.walls)) continue;
    if (typeof burg.fortificationQuality === "number" && Number.isFinite(burg.fortificationQuality)) continue;
    burg.fortificationQuality = qualityFromStateEngineers(characters, burg.state, burg.i);
  }
  for (const fort of (pack.frontierForts ?? []) as FrontierFort[]) {
    if (typeof fort.fortificationQuality === "number" && Number.isFinite(fort.fortificationQuality)) continue;
    fort.fortificationQuality = qualityFromStateEngineers(characters, fort.state);
  }
}

export class FortificationMasteryModule {
  /** Idempotent seed for new maps and newly titled officers. Does not grow skills. */
  generate(): void {
    if (!isEconomyContextReady()) return;
    seedMilitaryFortificationSkills();
    seedMissingFortificationQuality();
  }

  settleAnnual(): boolean {
    if (!settleAnnualOnce(ANNUAL_GATE.fortificationMastery)) return false;
    seedMilitaryFortificationSkills();
    growFortificationSkills();
    seedMissingFortificationQuality();
    return true;
  }
}

export const FortificationMastery = new FortificationMasteryModule();
