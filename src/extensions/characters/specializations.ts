import type { WorldLanguages } from "../../types/worldLanguages";
import { conversationScore } from "../../utils/worldLanguages";
import type { Character, CharacterSkills, EstateStatus, RaisedIn, SocialStratum } from "./characterTypes";
import { SPECIALIZATION_DEFINITIONS, SPECIALIZATIONS } from "./specializationCatalog";
import type {
  CharacterSpecializationProfile,
  PracticalSkillReader,
  SpecializationAxis,
  SpecializationDomain,
  SpecializationExperience,
  SpecializationTarget
} from "./specializationTypes";

export const EXPERTISE_APTITUDE_GAIN = { poor: 0.8, ordinary: 1, promising: 1.12, gifted: 1.25, exceptional: 1.4 };

export const clampExpertise = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100) / 100));
export function emptySpecializations(): CharacterSpecializationProfile {
  return { version: 1, domains: [], familiarities: [], languages: [], experience: [], experienceYears: {} };
}

/** Deterministic generation only, never called by load or by a read accessor. */
export function generateSpecializations(
  character: Character,
  primary?: keyof CharacterSkills,
  world?: WorldLanguages
): CharacterSpecializationProfile {
  const profile = emptySpecializations();
  const focus =
    primary ??
    (Object.keys(character.skills) as (keyof CharacterSkills)[]).sort(
      (a, b) => character.skills[b] - character.skills[a]
    )[0];
  const candidates = SPECIALIZATION_DEFINITIONS.filter(
    definition => definition.skill === focus && !definition.economyDomain
  );
  const start = (character.i * 37 + Math.floor(character.skills[focus])) % candidates.length;
  for (let offset = 0; offset < Math.min(3, candidates.length); offset++) {
    const definition = candidates[(start + offset) % candidates.length];
    const theoryFirst = (character.i + offset) % 2 === 0;
    const baseline = character.skills[focus];
    profile.domains.push({
      domainId: definition.id,
      knowledge: clampExpertise(baseline * (theoryFirst ? 1 : 0.55)),
      practice: clampExpertise(baseline * (theoryFirst ? 0.5 : 0.95)),
      ...(definition.appraisal ? { appraisal: clampExpertise(baseline * 0.7) } : {})
    });
  }
  const cultural = world?.cultures.find(entry => entry.cultureId === character.culture);
  if (cultural && world) {
    // A weighted native language; no literacy inferred from language or species.
    const roll = ((character.i * 53 + 17) % 100) / 100;
    let cumulative = 0;
    const choice =
      cultural.languages.find(entry => {
        cumulative += entry.share;
        return cumulative > roll;
      }) ?? cultural.languages[0];
    if (choice)
      profile.languages.push({
        languageId: choice.languageId,
        speaking: 85,
        listening: 90,
        acquisition: "native",
        literacy: []
      });
    profile.familiarities.push({
      domainId: "learning.cultures",
      kind: "culture",
      id: String(character.culture),
      knowledge: 30,
      practice: 65
    });
  }
  return profile;
}

const EDUCATED_UPBRINGINGS: ReadonlySet<RaisedIn> = new Set([
  "capital_court",
  "monastery",
  "foreign_court",
  "merchant_quarter"
]);
const LITERATE_STRATA: ReadonlySet<SocialStratum> = new Set([
  "royal",
  "high_noble",
  "minor_noble",
  "gentry",
  "clergy_orphan"
]);
const LITERATE_ESTATES: ReadonlySet<EstateStatus> = new Set([
  "reigning_dynasty",
  "court_noble",
  "landed_noble",
  "official",
  "cleric"
]);

function hasLiteracyAccess(character: Character): boolean {
  const origin = character.backstory?.origin;
  if (!origin) return false;
  return (
    EDUCATED_UPBRINGINGS.has(origin.raisedIn) ||
    LITERATE_STRATA.has(origin.socialStratum) ||
    LITERATE_ESTATES.has(origin.estateStatus)
  );
}

function nativeLiteracyScores(character: Character): { reading: number; writing: number } {
  const stratum = character.backstory?.origin.socialStratum;
  let reading = 20 + character.skills.learning * 0.65;
  let writing = 10 + character.skills.learning * 0.55;
  if (stratum === "royal" || stratum === "high_noble") {
    reading = Math.max(reading, 45);
    writing = Math.max(writing, 35);
  } else if (stratum === "minor_noble" || stratum === "gentry") {
    reading = Math.max(reading, 30);
    writing = Math.max(writing, 20);
  }
  return { reading: clampExpertise(reading), writing: clampExpertise(writing) };
}

/** Adds languages and literacy from upbringing and station. Oral languages stay without scripts. */
export function applySpecializationEducation(character: Character, world?: WorldLanguages): void {
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
  if (!hasLiteracyAccess(character)) return;
  const scores = nativeLiteracyScores(character);
  for (const language of profile.languages) {
    if (language.literacy.length) continue;
    // Class and office grant letters in the mother tongue; formal schooling can also teach a learned language.
    if (!educated && language.acquisition === "learned") continue;
    const scriptId = world.languages.find(entry => entry.id === language.languageId)?.scriptIds[0];
    if (!scriptId) continue;
    language.literacy.push({ scriptId, reading: scores.reading, writing: scores.writing });
  }
}

export function readSpecializationAxis(
  character: Character,
  domainId: string,
  axis: SpecializationAxis,
  readPractice?: PracticalSkillReader
): number | undefined {
  const definition = SPECIALIZATIONS.get(domainId);
  const domain = character.specializations?.domains.find(entry => entry.domainId === domainId);
  if (axis === "practice" && definition?.economyDomain) return readPractice?.(character.i, definition.economyDomain);
  return domain?.[axis];
}

export interface ExpertiseRequirement {
  domainId: string;
  axis: SpecializationAxis;
  weight: number;
}
export interface ExpertiseEvaluation {
  score: number;
  approximate: boolean;
  missing: string[];
}
export function evaluateExpertise(
  character: Character,
  requirements: readonly ExpertiseRequirement[],
  targets: readonly SpecializationTarget[] = [],
  readPractice?: PracticalSkillReader
): ExpertiseEvaluation {
  let weighted = 0;
  let weight = 0;
  const missing: string[] = [];
  for (const requirement of requirements) {
    const definition = SPECIALIZATIONS.get(requirement.domainId);
    if (!definition || !Number.isFinite(requirement.weight) || requirement.weight < 0)
      throw new Error("Invalid expertise requirement");
    if (!requirement.weight) continue;
    const axis = readSpecializationAxis(character, requirement.domainId, requirement.axis, readPractice);
    if (axis === undefined) missing.push(`${requirement.domainId}.${requirement.axis}`);
    weighted += (axis ?? character.skills[definition.skill]) * requirement.weight;
    weight += requirement.weight;
  }
  if (!weight) throw new Error("Expertise requires a positive weight");
  const contextual: number[] = [];
  for (const target of targets) {
    const entries =
      character.specializations?.familiarities.filter(
        entry =>
          entry.kind === target.kind &&
          entry.id === target.id &&
          requirements.some(
            requirement =>
              requirement.domainId === entry.domainId ||
              (requirement.domainId === "diplomacy.intercultural" && entry.domainId === "learning.cultures")
          )
      ) ?? [];
    if (!entries.length) continue;
    contextual.push(Math.max(...entries.map(entry => entry.practice ?? entry.knowledge ?? 0)));
  }
  const adjustment = contextual.length
    ? (contextual.reduce((sum, score) => sum + score, 0) / contextual.length - 50) / 5
    : 0;
  return { score: clampExpertise(weighted / weight + adjustment), approximate: missing.length > 0, missing };
}

export function specializationScore(
  character: Character,
  domainId: string,
  axis: SpecializationAxis = "practice"
): number {
  return evaluateExpertise(character, [{ domainId, axis, weight: 1 }]).score;
}

export const EXPERTISE_TASKS: Record<string, readonly ExpertiseRequirement[]> = {
  command: [
    { domainId: "martial.command", axis: "practice", weight: 2 },
    { domainId: "martial.leadership", axis: "practice", weight: 2 },
    { domainId: "martial.tactics", axis: "knowledge", weight: 1 }
  ],
  operations: [
    { domainId: "martial.operations", axis: "practice", weight: 2 },
    { domainId: "martial.logistics", axis: "knowledge", weight: 1 }
  ],
  siege: [
    { domainId: "martial.siege", axis: "practice", weight: 2 },
    { domainId: "martial.command", axis: "practice", weight: 1 },
    { domainId: "martial.leadership", axis: "practice", weight: 1 }
  ],
  naval: [
    { domainId: "martial.naval", axis: "practice", weight: 2 },
    { domainId: "martial.command", axis: "practice", weight: 1 }
  ],
  treaty: [
    { domainId: "diplomacy.treaties", axis: "practice", weight: 2 },
    { domainId: "learning.law", axis: "knowledge", weight: 1 }
  ],
  negotiation: [
    { domainId: "diplomacy.negotiation", axis: "practice", weight: 2 },
    { domainId: "diplomacy.intercultural", axis: "practice", weight: 1 }
  ],
  tax: [
    { domainId: "stewardship.taxation", axis: "practice", weight: 2 },
    { domainId: "stewardship.finance", axis: "knowledge", weight: 1 }
  ],
  intelligence: [
    { domainId: "intrigue.analysis", axis: "practice", weight: 1 },
    { domainId: "intrigue.networks", axis: "practice", weight: 1 }
  ],
  ceramics: [
    { domainId: "artistry.ceramics", axis: "appraisal", weight: 2 },
    { domainId: "artistry.ceramics", axis: "knowledge", weight: 1 }
  ],
  construction: [
    { domainId: "engineering.civil", axis: "knowledge", weight: 1 },
    { domainId: "engineering.architecture", axis: "practice", weight: 2 }
  ],
  navigation: [
    { domainId: "geography.navigation", axis: "practice", weight: 2 },
    { domainId: "geography.climate", axis: "knowledge", weight: 1 }
  ],
  combat: [{ domainId: "prowess.melee.swordsmanship", axis: "practice", weight: 1 }],
  teaching: [{ domainId: "learning.education", axis: "practice", weight: 1 }]
};

export interface CommunicationRoute {
  score: number;
  languageIds: string[];
  interpreterId?: number;
  enabled: boolean;
}
/** Callers supply available interpreters only; skill does not teleport a translator. */
export function resolveCommunication(
  a: Character,
  b: Character,
  world?: WorldLanguages,
  interpreters: readonly Character[] = [],
  options: { diplomatic?: boolean } = {}
): CommunicationRoute {
  if (!world) return { score: 100, languageIds: [], enabled: false };
  const permittedLanguages = (character: Character) => {
    const known = character.specializations?.languages ?? [];
    if (!options.diplomatic) return known;
    const stateId = character.nationalityStateId ?? character.state;
    const policy = world.states.find(policy => policy.stateId === stateId)?.diplomaticLanguageIds;
    // An empty policy means no formally designated language, not a ban on all diplomacy.
    return policy?.length ? known.filter(language => policy.includes(language.languageId)) : known;
  };
  const left = permittedLanguages(a);
  const right = permittedLanguages(b);
  let best: CommunicationRoute = { score: 0, languageIds: [], enabled: true };
  for (const language of world.languages) {
    const score = conversationScore(left, right, language.id);
    if (score > best.score) best = { score, languageIds: [language.id], enabled: true };
  }
  for (const interpreter of interpreters) {
    if (interpreter.dead || interpreter.i === a.i || interpreter.i === b.i) continue;
    const translation = readSpecializationAxis(interpreter, "learning.translation", "practice") ?? 0;
    for (const first of left)
      for (const second of right) {
        if (
          !world.languages.some(language => language.id === first.languageId) ||
          !world.languages.some(language => language.id === second.languageId)
        )
          continue;
        const own = interpreter.specializations?.languages ?? [];
        const score = Math.min(
          conversationScore(left, own, first.languageId),
          conversationScore(right, own, second.languageId),
          translation
        );
        if (score > best.score)
          best = {
            score,
            languageIds: [first.languageId, second.languageId],
            interpreterId: interpreter.i,
            enabled: true
          };
      }
  }
  return best;
}

/** Called only for real completed activity, not every request to read skill. */
export function recordSpecializationExperience(
  character: Character,
  entry: SpecializationExperience,
  quality = 1
): boolean {
  const profile = character.specializations;
  if (!profile || character.dead || profile.experience.some(existing => existing.id === entry.id)) return false;
  const definition = SPECIALIZATIONS.get(entry.domainId);
  if (
    !definition ||
    !Number.isSafeInteger(entry.year) ||
    !Number.isFinite(entry.coverage) ||
    entry.coverage <= 0 ||
    entry.coverage > 1 ||
    !Number.isFinite(quality) ||
    quality < 0 ||
    quality > 1
  )
    return false;
  const used = profile.experience
    .filter(existing => existing.year === entry.year)
    .reduce((sum, existing) => sum + existing.coverage, 0);
  if (used + entry.coverage > 1.000001) return false;
  if (entry.mode === "appraisal" && !definition.appraisal) return false;
  const axis: SpecializationAxis =
    entry.mode === "study" ? "knowledge" : entry.mode === "appraisal" ? "appraisal" : "practice";
  // Economy is responsible for its own practice time and growth.
  if (axis === "practice" && definition.economyDomain) return false;
  let domain = profile.domains.find(domain => domain.domainId === entry.domainId);
  if (!domain) {
    domain = { domainId: entry.domainId };
    if (definition.economyDomain) domain.practiceRef = { owner: "economy", domain: definition.economyDomain };
    profile.domains.push(domain);
  }
  const current = domain[axis] ?? 0;
  domain[axis] = clampExpertise(
    current +
      6 *
        EXPERTISE_APTITUDE_GAIN[domain.aptitude ?? "ordinary"] *
        entry.coverage *
        quality *
        Math.max(0.05, 1 - current / 110) *
        (current >= 90 ? 0.4 : 1)
  );
  if (axis === "practice") domain.lastPracticedYear = entry.year;
  for (const target of entry.targets) {
    let familiarity = profile.familiarities.find(
      value => value.domainId === entry.domainId && value.kind === target.kind && value.id === target.id
    );
    if (!familiarity) {
      familiarity = { ...target, domainId: entry.domainId };
      profile.familiarities.push(familiarity);
    }
    const targetAxis = axis === "knowledge" ? "knowledge" : "practice";
    familiarity[targetAxis] = clampExpertise((familiarity[targetAxis] ?? 0) + 8 * entry.coverage * quality);
    familiarity.lastUpdatedYear = entry.year;
  }
  profile.experience.push(structuredClone(entry));
  profile.experienceYears[entry.mode] = (profile.experienceYears[entry.mode] ?? 0) + entry.coverage;
  return true;
}

/** No current activity means no free growth. Knowledge survives physical aging. */
export function decaySpecializations(character: Character, year: number): void {
  const profile = character.specializations;
  if (!profile || character.dead || !Number.isSafeInteger(year)) return;
  profile.createdYear ??= year;
  const previous = profile.lastDecayYear ?? year;
  if (year <= previous) {
    profile.lastDecayYear ??= year;
    return;
  }
  for (const domain of profile.domains) {
    if (domain.practice === undefined) continue;
    const last = Math.max(
      previous,
      (domain.lastPracticedYear ?? profile.createdYear) + 5,
      ...profile.experience
        .filter(entry => entry.domainId === domain.domainId && entry.mode !== "study")
        .map(entry => entry.year + 5)
    );
    domain.practice = clampExpertise(domain.practice - Math.max(0, year - last) * 0.1);
  }
  for (const language of profile.languages) {
    if (language.lastUsedYear === undefined) continue;
    const inactive = Math.max(0, year - Math.max(previous, language.lastUsedYear + 10));
    language.speaking = clampExpertise(language.speaking - inactive * 0.1);
  }
  profile.lastDecayYear = year;
  // Keep the current year for coverage accounting and ten years for inactivity/inspection.
  profile.experience = profile.experience.filter(entry => entry.year >= year - 10);
}

export function setSpecializationDomain(profile: CharacterSpecializationProfile, domain: SpecializationDomain): void {
  const index = profile.domains.findIndex(entry => entry.domainId === domain.domainId);
  if (index < 0) profile.domains.push(domain);
  else profile.domains[index] = domain;
}
