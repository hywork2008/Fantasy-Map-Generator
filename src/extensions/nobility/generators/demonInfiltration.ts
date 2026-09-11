import { rollCharacterArcane } from "../../characters/arcane";
import { applyCharacterBackstory } from "../../characters/backstoryProfile";
import type {
  Character,
  CharacterRole,
  CharacterRoleClass,
  CharacterSkills,
  DemonCoverStratum,
  DemonIdentity
} from "../../characters/characterTypes";
import { CHARACTER_SKILL_KEYS, initializeDemonSocietyExperience } from "../../characters/demonExperience";
import { createPerson } from "../../characters/personFactory";
import { rollDefaultAdultAge } from "../../characters/raceAge";
import { getRaceDefinitions, HUMAN_RACE_ID, rollCharacterRaceAppearance } from "../../hostRaces";
import type { State } from "../../hostTypes";

const STRATUM_SHARE: Readonly<Record<DemonCoverStratum, number>> = {
  ruler: 0.15,
  military: 0.2,
  influential: 0.25,
  commoner: 0.4
};

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Exact largest-remainder allocation, so even small maps keep the intended 15/20/25/40 mix. */
export function allocateDemonStrata(total: number): Record<DemonCoverStratum, number> {
  const strata = Object.keys(STRATUM_SHARE) as DemonCoverStratum[];
  const result = Object.fromEntries(
    strata.map(stratum => [stratum, Math.floor(total * STRATUM_SHARE[stratum])])
  ) as Record<DemonCoverStratum, number>;
  const remaining = total - strata.reduce((sum, stratum) => sum + result[stratum], 0);
  const remainderOrder = [...strata].sort(
    (a, b) =>
      total * STRATUM_SHARE[b] -
      Math.floor(total * STRATUM_SHARE[b]) -
      (total * STRATUM_SHARE[a] - Math.floor(total * STRATUM_SHARE[a]))
  );
  for (let i = 0; i < remaining; i += 1) result[remainderOrder[i]!] += 1;
  return result;
}

/**
 * Produces a deliberately uneven host-state list: about 40% of realms are empty,
 * while the rest contain one or more infiltrators (capped at four where possible).
 */
export function allocateDemonHostStates(stateIds: readonly number[], total: number): number[] {
  if (!stateIds.length || total <= 0) return [];
  const occupiedCount = Math.min(stateIds.length, total, Math.max(1, Math.round(stateIds.length * 0.6)));
  const occupied = shuffled(stateIds).slice(0, occupiedCount);
  const result = [...occupied];
  let cursor = 0;
  while (result.length < total) {
    const belowCap = occupied.filter(id => result.filter(host => host === id).length < 4);
    const pool = belowCap.length ? belowCap : occupied;
    result.push(pool[cursor % pool.length]!);
    cursor += 1;
  }
  return result;
}

function titleText(character: Character): string {
  return character.titles.map(title => title.title.toLowerCase()).join(" ");
}

function matchesStratum(character: Character, stratum: DemonCoverStratum): boolean {
  if (character.dead || character.demonInfiltration) return false;
  if (stratum === "ruler") return character.titles.some(title => title.landed && title.entityType === "state");
  if (stratum === "military") {
    return /\b(?:marshal|general|admiral|commander|captain|warlord|minister of war|shogun)\b/.test(
      titleText(character)
    );
  }
  if (stratum === "influential") return character.titles.length > 0 && !character.titles.some(title => title.landed);
  return character.titles.length === 0;
}

function isPoliticalOrMilitaryFigure(character: Character): boolean {
  return matchesStratum(character, "ruler") || matchesStratum(character, "military");
}

function stateOf(character: Character): number {
  return character.nationalityStateId ?? character.state ?? 0;
}

function humanCultureId(
  pack: { cultures?: { i: number; race?: number; removed?: boolean }[] },
  fallback: number
): number {
  return (
    pack.cultures?.find(culture => culture.i > 0 && !culture.removed && culture.race === HUMAN_RACE_ID)?.i ?? fallback
  );
}

function makeCoverRole(stratum: DemonCoverStratum, burgId: number, year: number): CharacterRole {
  const label = stratum === "military" ? "Soldier" : stratum === "influential" ? "Merchant" : "Resident";
  return {
    source: "characters",
    kind: stratum === "military" ? "soldier" : stratum === "influential" ? "merchant" : "resident",
    entityType: "burg",
    entityId: burgId,
    label,
    startYear: year
  };
}

function rollDemonAppearance():
  | { kind: "demon"; hornAnimal: "goat" }
  | Extract<NonNullable<Character["raceAppearance"]>, { kind: "demon" }> {
  const definition = getRaceDefinitions().find(race => race.key === "demon");
  const appearance = rollCharacterRaceAppearance(definition, (min, max) =>
    Math.floor(Math.random() * (max - min + 1) + min)
  );
  return appearance?.kind === "demon" ? appearance : { kind: "demon", hornAnimal: "goat" };
}

/** Deep-copy a complete sheet without recursively capturing an existing disguise. */
function cloneIdentity(character: Character): DemonIdentity {
  const identity = structuredClone(character);
  delete identity.demonInfiltration;
  return identity;
}

const DEMON_ARCANE_FIELDS = ["arcane", "arcaneReadyYear", "arcaneWorkingsSpent", "arcaneLastHighYear"] as const;

/** Overlay the Demon’s active Arcane state without discarding the stored Human cover value. */
function applyDemonArcaneIdentity(infiltrator: Character): void {
  const identity = infiltrator.demonInfiltration?.demonIdentity;
  if (!identity) return;
  for (const field of DEMON_ARCANE_FIELDS) infiltrator[field] = identity[field];
}

/** True forms are never constrained by the public character-race allow-list. */
function forceDemonTrueIdentity(character: Character, demonRaceId: number): void {
  if (character.race === demonRaceId) return;
  character.race = demonRaceId;
  character.arcane = rollCharacterArcane({ raceKey: "demon" });
  delete character.arcaneLineage;
}

export interface SeedDemonInfiltrationOptions {
  characters: Character[];
  states: State[];
  pack: {
    cultures?: { i: number; race?: number; removed?: boolean }[];
    burgs?: { i?: number; state?: number; culture?: number; removed?: boolean }[];
    races?: { i: number; key: string }[];
  };
  currentYear: number;
}

/**
 * Demons possess centuries of accumulated guile, martial experience, and deep knowledge
 * far beyond a mortal lifetime. Endows the Demon's true identity sheet with innate racial
 * superiority, age-scaled expertise, and elevated floors on intellect and deception.
 */
function applyDemonInfernalSkillBoost(character: Character, actualAge: number): void {
  if (!character.skills) return;
  const ageExpertise = Math.min(15, Math.floor(Math.max(0, actualAge - 30) / 20) * 2);
  for (const key of CHARACTER_SKILL_KEYS) {
    const current = character.skills[key] ?? 50;
    let boost = ageExpertise + 4;
    if (key === "intrigue") {
      boost += 12;
      character.skills[key] = Math.max(65, Math.min(100, current + boost));
    } else if (key === "learning") {
      boost += 10;
      character.skills[key] = Math.max(60, Math.min(100, current + boost));
    } else if (key === "prowess" || key === "martial") {
      boost += 8;
      character.skills[key] = Math.max(55, Math.min(100, current + boost));
    } else {
      character.skills[key] = Math.max(1, Math.min(100, current + boost));
    }
  }
}

function turnIntoDemonInfiltrator(
  infiltrator: Character,
  stratum: DemonCoverStratum,
  options: Pick<SeedDemonInfiltrationOptions, "pack" | "currentYear">
): Character {
  const { pack } = options;
  const coverIdentity = cloneIdentity(infiltrator);
  // Existing public figures may originate in another folk's court. Their visible body is Human.
  const demonRaceId = pack.races?.find(race => race.key === "demon")?.i;
  const wasOpenDemon = demonRaceId !== undefined && infiltrator.race === demonRaceId;
  const actualAge = wasOpenDemon
    ? infiltrator.age
    : demonRaceId !== undefined
      ? rollDefaultAdultAge(demonRaceId)
      : Math.max(80, infiltrator.age + 80);

  const roleClass: CharacterRoleClass =
    stratum === "ruler"
      ? "ruler"
      : stratum === "military"
        ? "commander"
        : stratum === "influential"
          ? "merchant"
          : "ordinary";
  const primarySkill: keyof CharacterSkills = stratum === "military" ? "martial" : "intrigue";

  const trueFormSource =
    wasOpenDemon || demonRaceId === undefined
      ? infiltrator
      : createPerson(infiltrator.i, infiltrator.culture, {
          homeStateId: stateOf(infiltrator),
          raceOverride: demonRaceId,
          roleClass,
          primarySkill,
          ageOverride: actualAge
        });
  if (!wasOpenDemon && demonRaceId !== undefined) {
    forceDemonTrueIdentity(trueFormSource, demonRaceId);
    applyDemonInfernalSkillBoost(trueFormSource, actualAge);
  }
  const raceAppearance =
    trueFormSource.raceAppearance?.kind === "demon"
      ? structuredClone(trueFormSource.raceAppearance)
      : rollDemonAppearance();
  const trueForm = {
    appearance: trueFormSource.appearance,
    ...(trueFormSource.looks ? { looks: structuredClone(trueFormSource.looks) } : {}),
    raceAppearance
  };
  const demonIdentity = cloneIdentity(trueFormSource);
  // Every cover must begin at a plausible Human age. Existing candidates can
  // come from long-lived cultures and otherwise expose ages such as 198.
  if (wasOpenDemon || infiltrator.age >= 70) {
    infiltrator.age = rollDefaultAdultAge(HUMAN_RACE_ID);
    infiltrator.ageFraction = 0;
  }
  infiltrator.race = HUMAN_RACE_ID;
  delete infiltrator.raceAppearance;
  infiltrator.demonInfiltration = {
    coverStratum: stratum,
    objective: "maximizeHumanDeaths",
    actualAge,
    demonIdentity,
    coverIdentity,
    trueForm,
    collaboratorIds: []
  };
  applyDemonArcaneIdentity(infiltrator);
  initializeDemonSocietyExperience(infiltrator);
  return infiltrator;
}

/** Seeds exactly one covert Demon per living state, all publicly represented as Human. */
export function seedDemonInfiltration(options: SeedDemonInfiltrationOptions): Character[] {
  const { characters, states, pack, currentYear } = options;
  const livingStates = states.filter(state => state.i > 0 && !state.removed);
  const total = livingStates.length;
  if (!total) return [];

  const hosts = allocateDemonHostStates(
    livingStates.map(state => state.i),
    total
  );
  const quota = allocateDemonStrata(total);
  const desired = (Object.keys(quota) as DemonCoverStratum[]).flatMap(stratum => Array(quota[stratum]).fill(stratum));
  const created: Character[] = [];
  let nextId = Math.max(0, ...characters.map(character => character.i), -1) + 1;

  for (const [index, stratum] of shuffled(desired).entries()) {
    const hostStateId = hosts[index]!;
    const state = livingStates.find(candidate => candidate.i === hostStateId)!;
    const candidates = characters.filter(
      character => stateOf(character) === hostStateId && matchesStratum(character, stratum)
    );
    let infiltrator = candidates[Math.floor(Math.random() * candidates.length)];

    if (!infiltrator) {
      const burg = pack.burgs?.find(candidate => !candidate.removed && candidate.state === hostStateId);
      const burgId = burg?.i ?? state.capital;
      const cultureId = humanCultureId(pack, burg?.culture ?? state.culture);
      infiltrator = createPerson(nextId++, cultureId, {
        homeStateId: hostStateId,
        raceOverride: HUMAN_RACE_ID,
        roleClass: stratum === "military" ? "commander" : stratum === "influential" ? "merchant" : "ordinary",
        primarySkill: stratum === "military" ? "martial" : stratum === "influential" ? "intrigue" : undefined
      });
      infiltrator.location = burgId;
      infiltrator.roles = [makeCoverRole(stratum, burgId, currentYear)];
      applyCharacterBackstory(infiltrator, {
        roleClass: stratum === "military" ? "commander" : stratum === "influential" ? "merchant" : "ordinary",
        homeBurgId: burgId,
        birthBurgId: burgId,
        capitalBurgId: state.capital
      });
      characters.push(infiltrator);
    }

    created.push(turnIntoDemonInfiltrator(infiltrator, stratum, { pack, currentYear }));
  }

  // 10–20% cooperate at a time. Use disjoint pairs; everyone else remains independent.
  const cooperatingCount = Math.min(
    created.length - (created.length % 2),
    Math.max(0, Math.round((created.length * 0.15) / 2) * 2)
  );
  const cooperating = shuffled(created).slice(0, cooperatingCount);
  for (let i = 0; i + 1 < cooperating.length; i += 2) {
    const first = cooperating[i]!;
    const second = cooperating[i + 1]!;
    first.demonInfiltration!.collaboratorIds.push(second.i);
    second.demonInfiltration!.collaboratorIds.push(first.i);
  }

  return created;
}

export interface ReplenishDemonInfiltrationOptions extends SeedDemonInfiltrationOptions {
  /** Defaults to a small, deliberately irregular cohort of two to four. */
  count?: number;
}

/**
 * Replenishes the infernal population by quietly replacing serving rulers and
 * military figures. It never creates a new public office: the selected person's
 * identity, titles and command remain in place while their true form becomes a Demon.
 */
export function replenishDemonInfiltration(options: ReplenishDemonInfiltrationOptions): Character[] {
  const count = options.count ?? 2 + Math.floor(Math.random() * 3);
  if (!Number.isFinite(count) || count < 1) return [];

  const eligible = shuffled(
    options.characters.filter(
      character => !character.dead && !character.demonInfiltration && isPoliticalOrMilitaryFigure(character)
    )
  );
  const created: Character[] = [];
  for (const candidate of eligible.slice(0, Math.floor(count))) {
    const stratum: DemonCoverStratum = matchesStratum(candidate, "ruler") ? "ruler" : "military";
    created.push(turnIntoDemonInfiltrator(candidate, stratum, options));
  }
  return created;
}

/**
 * Migrates infiltrators written before true Demon identities bypassed the public
 * race allow-list. Their public cover remains Human; only the hidden true sheet
 * and effective Arcane value are corrected.
 */
export function repairDemonInfiltrationTrueIdentities(
  options: Pick<SeedDemonInfiltrationOptions, "characters" | "pack">
): number {
  const demonRaceId = options.pack.races?.find(race => race.key === "demon")?.i;
  if (demonRaceId === undefined) return 0;
  let repaired = 0;
  for (const character of options.characters) {
    const infiltration = character.demonInfiltration;
    if (!infiltration || infiltration.demonIdentity?.race === demonRaceId) continue;
    const identity = infiltration.demonIdentity ?? cloneIdentity(character);
    forceDemonTrueIdentity(identity, demonRaceId);
    infiltration.demonIdentity = identity;
    character.arcane = identity.arcane;
    repaired += 1;
  }
  return repaired;
}
