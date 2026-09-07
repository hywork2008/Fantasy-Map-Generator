import type { TechnologyStage } from "../../generators/technologyTypes";
import type { OptionsState } from "../../store/optionsState";
import type { WorldLanguages } from "../../types/worldLanguages";
import { getCultureKnowledgeValue } from "../../utils/cultureKnowledgeValue";
import { getApi, getWorldContext, hasCharactersContext } from "./charactersContext";
import type { Character, CharacterOrigin, EstateStatus, RaisedIn, SocialStratum } from "./characterTypes";
import type { FormPackId } from "./cultureFormPacks";
import { resolveFormPackId } from "./cultureFormPacks";

const clampLiteracy = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100) / 100));

export type HistoricalPeriod = OptionsState["historicalPeriod"];

export const EDUCATED_UPBRINGINGS: ReadonlySet<RaisedIn> = new Set([
  "capital_court",
  "monastery",
  "foreign_court",
  "merchant_quarter"
]);
export const LITERATE_STRATA: ReadonlySet<SocialStratum> = new Set([
  "royal",
  "high_noble",
  "minor_noble",
  "gentry",
  "clergy_orphan"
]);
export const LITERATE_ESTATES: ReadonlySet<EstateStatus> = new Set([
  "reigning_dynasty",
  "court_noble",
  "landed_noble",
  "official",
  "cleric"
]);
const LITERATE_OCCUPATIONS: ReadonlySet<NonNullable<CharacterOrigin["familyOccupation"]>> = new Set([
  "administration",
  "religion",
  "trade"
]);
const KNOWLEDGE_VALUE_CENTER = 0.45;

export interface LiteracyLocalEnvironment {
  monastery?: boolean;
  temple?: boolean;
  capital?: boolean;
  printingStock?: number;
  academyAdministrationStock?: number;
}

/** Optional world/polity/site signals. Missing fields leave that layer inert. */
export interface LiteracyInfluences {
  knowledgeValue?: number;
  formPackId?: FormPackId;
  local?: LiteracyLocalEnvironment;
  recordReplicationStage?: TechnologyStage;
  historicalPeriod?: HistoricalPeriod;
}

interface FormLiteracyShift {
  nobleReading: number;
  nobleWriting: number;
  commonerCeiling: number;
}

const FORM_LITERACY: Record<FormPackId, FormLiteracyShift> = {
  default: { nobleReading: 0, nobleWriting: 0, commonerCeiling: 0 },
  monarchy: { nobleReading: 0, nobleWriting: 0, commonerCeiling: 0 },
  theocracy: { nobleReading: 8, nobleWriting: 5, commonerCeiling: 8 },
  republic: { nobleReading: 5, nobleWriting: 4, commonerCeiling: 12 },
  empire: { nobleReading: 6, nobleWriting: 8, commonerCeiling: 5 },
  horde: { nobleReading: -12, nobleWriting: -18, commonerCeiling: -10 }
};

interface PeriodLiteracyPolicy {
  nobleReadingFloorCap: number;
  nobleWritingFloorCap: number;
  commonerReadingCeiling: number;
  commonerWritingCeiling: number;
  commonerLocalThreshold: number;
  massLiteracy: boolean;
}

const NEUTRAL_PERIOD: PeriodLiteracyPolicy = {
  nobleReadingFloorCap: 100,
  nobleWritingFloorCap: 100,
  commonerReadingCeiling: 100,
  commonerWritingCeiling: 100,
  commonerLocalThreshold: 1,
  massLiteracy: false
};

const PERIOD_LITERACY: Record<HistoricalPeriod, PeriodLiteracyPolicy> = {
  earlyMedieval: {
    nobleReadingFloorCap: 40,
    nobleWritingFloorCap: 22,
    commonerReadingCeiling: 12,
    commonerWritingCeiling: 6,
    commonerLocalThreshold: 0.5,
    massLiteracy: false
  },
  highMedieval: {
    nobleReadingFloorCap: 45,
    nobleWritingFloorCap: 30,
    commonerReadingCeiling: 22,
    commonerWritingCeiling: 12,
    commonerLocalThreshold: 0.45,
    massLiteracy: false
  },
  lateMedieval: {
    nobleReadingFloorCap: 45,
    nobleWritingFloorCap: 35,
    commonerReadingCeiling: 32,
    commonerWritingCeiling: 20,
    commonerLocalThreshold: 0.4,
    massLiteracy: false
  },
  ageOfExploration: {
    nobleReadingFloorCap: 50,
    nobleWritingFloorCap: 40,
    commonerReadingCeiling: 48,
    commonerWritingCeiling: 36,
    commonerLocalThreshold: 0.3,
    massLiteracy: false
  },
  maritimeEra: {
    nobleReadingFloorCap: 50,
    nobleWritingFloorCap: 40,
    commonerReadingCeiling: 55,
    commonerWritingCeiling: 42,
    commonerLocalThreshold: 0.26,
    massLiteracy: false
  },
  preIndustrialEra: {
    nobleReadingFloorCap: 55,
    nobleWritingFloorCap: 45,
    commonerReadingCeiling: 65,
    commonerWritingCeiling: 52,
    commonerLocalThreshold: 0.2,
    massLiteracy: false
  },
  steamEra: {
    nobleReadingFloorCap: 55,
    nobleWritingFloorCap: 45,
    commonerReadingCeiling: 80,
    commonerWritingCeiling: 70,
    commonerLocalThreshold: 0.12,
    massLiteracy: true
  },
  industrialChemistryEra: {
    nobleReadingFloorCap: 60,
    nobleWritingFloorCap: 50,
    commonerReadingCeiling: 90,
    commonerWritingCeiling: 82,
    commonerLocalThreshold: 0.08,
    massLiteracy: true
  },
  petroleumEra: {
    nobleReadingFloorCap: 60,
    nobleWritingFloorCap: 50,
    commonerReadingCeiling: 95,
    commonerWritingCeiling: 90,
    commonerLocalThreshold: 0.05,
    massLiteracy: true
  },
  rocketryEra: {
    nobleReadingFloorCap: 60,
    nobleWritingFloorCap: 50,
    commonerReadingCeiling: 98,
    commonerWritingCeiling: 95,
    commonerLocalThreshold: 0.04,
    massLiteracy: true
  }
};

const COPYING_DENSITY: Record<TechnologyStage, number> = {
  locked: 0,
  known: 0.15,
  demonstrated: 0.4,
  adopted: 0.7,
  diffused: 1
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function hasPersonalLiteracyAccess(origin: CharacterOrigin): boolean {
  return (
    EDUCATED_UPBRINGINGS.has(origin.raisedIn) ||
    LITERATE_STRATA.has(origin.socialStratum) ||
    LITERATE_ESTATES.has(origin.estateStatus) ||
    (origin.familyOccupation !== undefined && LITERATE_OCCUPATIONS.has(origin.familyOccupation))
  );
}

export function isSchooledForLetters(origin: CharacterOrigin): boolean {
  return (
    EDUCATED_UPBRINGINGS.has(origin.raisedIn) ||
    origin.socialStratum === "clergy_orphan" ||
    origin.estateStatus === "cleric" ||
    origin.estateStatus === "official"
  );
}

export function isNobleStratum(stratum: SocialStratum): boolean {
  return stratum === "royal" || stratum === "high_noble" || stratum === "minor_noble" || stratum === "gentry";
}

export function localLiteracyEnvironment(local?: LiteracyLocalEnvironment): number {
  if (!local) return 0;
  return clamp01(
    (local.monastery ? 0.45 : 0) +
      (local.temple ? 0.15 : 0) +
      (local.capital ? 0.2 : 0) +
      clamp01(local.printingStock ?? 0) * 0.35 +
      clamp01(local.academyAdministrationStock ?? 0) * 0.25
  );
}

export function copyingDensity(stage?: TechnologyStage): number {
  return stage ? COPYING_DENSITY[stage] : 0;
}

function periodPolicy(period?: HistoricalPeriod): PeriodLiteracyPolicy {
  return period ? PERIOD_LITERACY[period] : NEUTRAL_PERIOD;
}

function knowledgeShift(knowledgeValue?: number): number {
  if (knowledgeValue === undefined || !Number.isFinite(knowledgeValue)) return 0;
  return (clamp01(knowledgeValue) - KNOWLEDGE_VALUE_CENTER) * 40;
}

/**
 * Native-language reading/writing after the six layers. Undefined means no letters are granted.
 * 1. caller already skipped oral languages
 * 2. personal access, or local/period mass literacy for low birth
 * 3. culture knowledgeValue and polity shift noble floors / commoner ceilings
 * 4. monastery, temple, capital, printing, academy raise local scores
 * 5. recordReplication raises copying density
 * 6. historicalPeriod is the final ceiling
 */
export function computeLiteracyScores(
  character: Character,
  influences: LiteracyInfluences = {}
): { reading: number; writing: number } | undefined {
  const origin = character.backstory?.origin;
  if (!origin) return undefined;

  const local = localLiteracyEnvironment(influences.local);
  const copying = copyingDensity(influences.recordReplicationStage);
  const period = periodPolicy(influences.historicalPeriod);
  const noble = isNobleStratum(origin.socialStratum);
  const schooled = isSchooledForLetters(origin);
  const personal = hasPersonalLiteracyAccess(origin);

  let eligible = personal;
  if (!eligible && !noble) {
    const threshold = period.commonerLocalThreshold * (1 - copying * 0.4);
    if (period.massLiteracy || local >= threshold) eligible = true;
  }
  if (!eligible) return undefined;

  const form = FORM_LITERACY[influences.formPackId ?? "default"];
  const kvShift = knowledgeShift(influences.knowledgeValue);
  const learning = character.skills.learning;
  let reading = 20 + learning * 0.65;
  let writing = 10 + learning * 0.55;
  const high = origin.socialStratum === "royal" || origin.socialStratum === "high_noble";

  if (noble) {
    reading += kvShift + form.nobleReading;
    writing += kvShift * 0.8 + form.nobleWriting;
    let readingFloor = (high ? 45 : 30) + kvShift + form.nobleReading;
    let writingFloor = (high ? 35 : 20) + kvShift * 0.8 + form.nobleWriting;
    readingFloor = Math.min(readingFloor, period.nobleReadingFloorCap);
    writingFloor = Math.min(writingFloor, period.nobleWritingFloorCap);
    reading = Math.max(reading, readingFloor);
    writing = Math.max(writing, writingFloor);
  }

  const localScale = noble ? 0.35 : 1;
  reading += local * 25 * localScale;
  writing += local * 18 * localScale;
  reading += copying * 8;
  writing += copying * 14;

  if (!noble && !schooled) {
    const readingCeiling = period.commonerReadingCeiling + kvShift * 0.5 + form.commonerCeiling;
    const writingCeiling = period.commonerWritingCeiling + kvShift * 0.4 + form.commonerCeiling * 0.7;
    reading = Math.min(reading, readingCeiling);
    writing = Math.min(writing, writingCeiling);
  }

  reading = clampLiteracy(reading);
  writing = clampLiteracy(writing);
  if (reading <= 0 && writing <= 0) return undefined;
  return { reading, writing };
}

function readEconomyStock(
  economy: Record<string, unknown> | undefined,
  field: "guildKnowledgeStocks" | "academyKnowledgeStocks",
  burgId: number,
  domain: string
): number {
  const rows = economy?.[field];
  if (!Array.isArray(rows)) return 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const entry = row as { burgId?: unknown; domain?: unknown; stock?: unknown };
    if (entry.burgId !== burgId || entry.domain !== domain) continue;
    return typeof entry.stock === "number" ? clamp01(entry.stock) : 0;
  }
  return 0;
}

/** Host/economy/tech signals when the live map is present. Safe no-op in generator tests. */
export function gatherLiteracyInfluences(character: Character): LiteracyInfluences {
  const influences: LiteracyInfluences = {};
  if (!hasCharactersContext()) return influences;
  try {
    const { pack, options } = getWorldContext();
    const culture = pack.cultures?.[character.culture];
    if (culture) influences.knowledgeValue = getCultureKnowledgeValue(culture);

    const stateId = character.nationalityStateId ?? character.state;
    const state = typeof stateId === "number" ? pack.states?.[stateId] : undefined;
    if (state) influences.formPackId = resolveFormPackId(state.formName, state.form);
    if (options.historicalPeriod) influences.historicalPeriod = options.historicalPeriod;

    const origin = character.backstory?.origin;
    const burgId = origin?.birthBurgId ?? origin?.homeBurgId ?? character.location;
    const burg = typeof burgId === "number" ? pack.burgs?.[burgId] : undefined;
    if (burg && !burg.removed) {
      const economy = getApi().simulationContext?.extensions?.economy as Record<string, unknown> | undefined;
      influences.local = {
        monastery: burg.group === "monastery",
        temple: Boolean(burg.temple),
        capital: Boolean(burg.capital) || state?.capital === burg.i || state?.capital === burgId,
        printingStock: readEconomyStock(economy, "guildKnowledgeStocks", burgId, "printing"),
        academyAdministrationStock: readEconomyStock(economy, "academyKnowledgeStocks", burgId, "administration")
      };
    }

    if (typeof stateId === "number") {
      const progress = getApi().simulationContext?.technology?.progress;
      if (Array.isArray(progress)) {
        const entry = progress.find(
          (row: { technologyId?: unknown; ownerId?: unknown; stage?: unknown }) =>
            row?.technologyId === "recordReplication" && row?.ownerId === stateId
        );
        if (entry && typeof entry.stage === "string")
          influences.recordReplicationStage = entry.stage as TechnologyStage;
      }
    }
  } catch {
    /* Isolated generator tests. */
  }
  return influences;
}

/** Adds languages and literacy from upbringing, station, and the surrounding literate world. */
export function applySpecializationEducation(
  character: Character,
  world?: WorldLanguages,
  influences?: LiteracyInfluences
): void {
  const profile = character.specializations;
  const origin = character.backstory?.origin;
  if (!profile || !origin || !world) return;
  const educated = EDUCATED_UPBRINGINGS.has(origin.raisedIn);
  if (["foreign_court", "merchant_quarter"].includes(origin.raisedIn) && profile.languages.length === 1) {
    const alternatives = world.languages.filter(
      language => !profile.languages.some(entry => entry.languageId === language.id)
    );
    const second = alternatives[character.i % Math.max(1, alternatives.length)];
    if (second)
      profile.languages.push({
        languageId: second.id,
        speaking: 45,
        listening: 55,
        literacy: [],
        acquisition: "learned"
      });
  }
  const scores = computeLiteracyScores(character, influences ?? gatherLiteracyInfluences(character));
  if (!scores) return;
  for (const language of profile.languages) {
    if (language.literacy.length) continue;
    if (!educated && language.acquisition === "learned") continue;
    const scriptId = world.languages.find(entry => entry.id === language.languageId)?.scriptIds[0];
    if (!scriptId) continue;
    language.literacy.push({ scriptId, reading: scores.reading, writing: scores.writing });
  }
}
