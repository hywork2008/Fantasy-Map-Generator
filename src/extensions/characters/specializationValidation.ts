import type { WorldLanguages } from "../../types/worldLanguages";
import {
  assertId,
  assertList,
  assertObject,
  assertScore,
  validateCharacterLanguages
} from "../../utils/worldLanguages";
import { SPECIALIZATIONS } from "./specializationCatalog";
import type { CharacterSpecializationProfile } from "./specializationTypes";

export const FAMILIARITY_KINDS = [
  "terrain",
  "climate",
  "troop",
  "region",
  "culture",
  "institution",
  "weapon",
  "artSchool",
  "material",
  "commandScale",
  "languagePair"
] as const;
export const EXPERIENCE_MODES = ["study", "training", "service", "battle", "appraisal"] as const;

export function validateSpecializationProfile(
  value: unknown,
  world?: WorldLanguages
): asserts value is CharacterSpecializationProfile | undefined {
  if (value === undefined) return;
  assertObject(value, "specializations");
  if (value.version !== 1) throw new Error("specializations: unsupported version");
  const ids = new Set<string>();
  assertList(value.domains, "domains");
  for (const domain of value.domains) {
    assertObject(domain, "domain");
    assertId(domain.domainId, "domainId");
    const definition = SPECIALIZATIONS.get(domain.domainId);
    if (!definition || ids.has(domain.domainId)) throw new Error("unknown or duplicate specialization");
    ids.add(domain.domainId);
    for (const axis of ["knowledge", "practice", "appraisal"])
      if (domain[axis] !== undefined) assertScore(domain[axis], axis);
    if (
      domain.aptitude !== undefined &&
      (!["poor", "ordinary", "promising", "gifted", "exceptional"].includes(String(domain.aptitude)) ||
        definition.economyDomain)
    )
      throw new Error("invalid or duplicated aptitude");
    if (domain.lastPracticedYear !== undefined && !Number.isSafeInteger(domain.lastPracticedYear))
      throw new Error("invalid practice year");
    if (domain.appraisal !== undefined && !definition.appraisal) throw new Error("appraisal requires an art domain");
    if (definition.economyDomain && domain.practice !== undefined) throw new Error("Economy owns this practical skill");
    if (domain.practiceRef !== undefined) {
      assertObject(domain.practiceRef, "practiceRef");
      if (
        domain.practice !== undefined ||
        domain.practiceRef.owner !== "economy" ||
        !definition.economyDomain ||
        domain.practiceRef.domain !== definition.economyDomain
      )
        throw new Error("invalid or duplicated practical skill reference");
    }
  }
  assertList(value.familiarities, "familiarities");
  const targets = new Set<string>();
  const validateTarget = (target: unknown) => {
    assertObject(target, "target");
    assertId(target.id, "target.id");
    if (!FAMILIARITY_KINDS.includes(target.kind as (typeof FAMILIARITY_KINDS)[number]))
      throw new Error("unknown familiarity kind");
  };
  for (const entry of value.familiarities) {
    assertObject(entry, "familiarity");
    validateTarget(entry);
    if (typeof entry.domainId !== "string" || !SPECIALIZATIONS.has(entry.domainId))
      throw new Error("unknown familiarity domain");
    const key = JSON.stringify([entry.domainId, entry.kind, entry.id]);
    if (targets.has(key)) throw new Error("duplicate familiarity");
    targets.add(key);
    for (const axis of ["knowledge", "practice"]) if (entry[axis] !== undefined) assertScore(entry[axis], axis);
    if (entry.lastUpdatedYear !== undefined && !Number.isSafeInteger(entry.lastUpdatedYear))
      throw new Error("invalid familiarity year");
  }
  validateCharacterLanguages(value.languages, world);
  assertList(value.experience, "experience");
  const events = new Set<string>();
  const coverage = new Map<number, number>();
  for (const entry of value.experience) {
    assertObject(entry, "experience entry");
    assertId(entry.id, "experience.id");
    if (events.has(entry.id)) throw new Error("duplicate experience");
    events.add(entry.id);
    if (typeof entry.domainId !== "string" || !SPECIALIZATIONS.has(entry.domainId))
      throw new Error("unknown experience domain");
    if (!Number.isSafeInteger(entry.year)) throw new Error("invalid experience year");
    if (
      typeof entry.coverage !== "number" ||
      !Number.isFinite(entry.coverage) ||
      entry.coverage <= 0 ||
      entry.coverage > 1
    )
      throw new Error("invalid experience coverage");
    const total = (coverage.get(entry.year as number) ?? 0) + entry.coverage;
    if (total > 1.000001) throw new Error("experience exceeds available annual time");
    coverage.set(entry.year as number, total);
    if (!EXPERIENCE_MODES.includes(entry.mode as (typeof EXPERIENCE_MODES)[number]))
      throw new Error("invalid experience mode");
    if (entry.source !== "simulation" && entry.source !== "editor") throw new Error("invalid experience source");
    for (const field of ["role", "outcome"])
      if (typeof entry[field] !== "string") throw new Error(`invalid experience ${field}`);
    assertList(entry.targets, "experience.targets");
    entry.targets.forEach(validateTarget);
  }
  assertObject(value.experienceYears, "experienceYears");
  for (const [mode, amount] of Object.entries(value.experienceYears)) {
    if (
      !EXPERIENCE_MODES.includes(mode as (typeof EXPERIENCE_MODES)[number]) ||
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < 0
    )
      throw new Error("invalid cumulative experience");
  }
  if (value.learningYear !== undefined && !Number.isSafeInteger(value.learningYear))
    throw new Error("invalid learning year");
  if (
    value.learningCoverage !== undefined &&
    (typeof value.learningCoverage !== "number" ||
      !Number.isFinite(value.learningCoverage) ||
      value.learningCoverage < 0 ||
      value.learningCoverage > 0.250001)
  )
    throw new Error("invalid learning coverage");
  if (value.learningPlan !== undefined) {
    assertObject(value.learningPlan, "learningPlan");
    const plan = value.learningPlan;
    if (typeof plan.teacherId !== "number" || !Number.isSafeInteger(plan.teacherId) || plan.teacherId < 0)
      throw new Error("invalid teacher");
    if (plan.kind === "domain") {
      const definition = typeof plan.domainId === "string" ? SPECIALIZATIONS.get(plan.domainId) : undefined;
      if (
        !definition ||
        !["knowledge", "practice", "appraisal"].includes(String(plan.axis)) ||
        (plan.axis === "appraisal" && !definition.appraisal) ||
        (plan.axis === "practice" && definition.economyDomain)
      )
        throw new Error("invalid learning domain");
    } else if (plan.kind === "language") {
      assertId(plan.languageId, "learning language");
      const language = world?.languages.find(entry => entry.id === plan.languageId);
      if (world && !language) throw new Error("unknown learning language");
      if (!["listening", "speaking", "reading", "writing"].includes(String(plan.axis)))
        throw new Error("invalid language axis");
      if (plan.axis === "reading" || plan.axis === "writing") {
        assertId(plan.scriptId, "learning script");
        if (language && !language.scriptIds.includes(plan.scriptId)) throw new Error("invalid learning script");
      }
    } else throw new Error("invalid learning plan");
  }
  if (value.serviceLearning !== undefined) {
    assertObject(value.serviceLearning, "serviceLearning");
    const pending = value.serviceLearning;
    if (
      !Number.isSafeInteger(pending.year) ||
      typeof pending.coverage !== "number" ||
      !Number.isFinite(pending.coverage) ||
      pending.coverage < 0 ||
      pending.coverage > 0.25 ||
      typeof pending.domainId !== "string" ||
      !SPECIALIZATIONS.has(pending.domainId) ||
      typeof pending.role !== "string"
    )
      throw new Error("invalid service learning");
  }
  if (value.createdYear !== undefined && !Number.isSafeInteger(value.createdYear))
    throw new Error("invalid creation year");
  if (value.lastDecayYear !== undefined && !Number.isSafeInteger(value.lastDecayYear))
    throw new Error("invalid decay year");
}
