import type { Character, CharacterGoalKind, CharacterPrinciple, CompassionScope } from "./characterTypes";

type Subject = Pick<Character, "personality" | "backstory">;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Scope limits interpersonal concern, not the underlying trait. Unknown affiliation is not hostility. */
export function getCompassionFor(character: Character, target: Character): number {
  const base = character.personality.compassion;
  const scope = character.backstory?.compassionScope ?? "everyone";
  let included = true;
  if (scope === "self") {
    included = character.i === target.i;
  } else if (scope === "community") {
    const ownState = character.nationalityStateId ?? character.state;
    const otherState = target.nationalityStateId ?? target.state;
    if (ownState && otherState) included = ownState === otherState;
  } else if (scope === "faith") {
    const ownReligion = character.backstory?.origin.religionId;
    const otherReligion = target.backstory?.origin.religionId;
    if (ownReligion && otherReligion) included = ownReligion === otherReligion;
  } else if (scope === "family") {
    included =
      character.i === target.i ||
      [
        character.family.fatherId,
        character.family.motherId,
        ...(character.family.childIds ?? []),
        ...(character.family.spouseIds ?? [])
      ].includes(target.i);
  } else if (scope === "species") {
    const ownRace = character.race;
    const otherRace = target.race;
    if (ownRace !== undefined && otherRace !== undefined) {
      included = ownRace === otherRace;
    }
  }
  return included ? base : Math.round(base * 0.25);
}

export function tastePreference(character: Pick<Character, "backstory">, id: string): number {
  const taste = character.backstory?.tastes.find(t => t.id === id);
  return taste ? (taste.polarity === "like" ? taste.intensity : -taste.intensity) : 0;
}

export function hasPrinciple(character: Pick<Character, "backstory">, principle: CharacterPrinciple): boolean {
  return character.backstory?.principles?.includes(principle) ?? false;
}

export function activeGoalIntensity(character: Pick<Character, "backstory">, kind: CharacterGoalKind): number {
  return Math.max(
    0,
    ...(character.backstory?.goals ?? [])
      .filter(goal => goal.kind === kind && goal.status === "active")
      .map(goal => goal.intensity)
  );
}

/** Appetite for initiating war. Risk tolerance and ability deliberately do not enter this score. */
export function getWarPreference(character: Subject | undefined): number {
  if (!character) return 50;
  if (hasPrinciple(character, "reject_aggression") || character.backstory?.religiousWar === "defensive") return 0;
  const p = character.personality;
  const primary = character.backstory?.commitment.primary.kind;
  let value = 35 + (p.greed - 50) * 0.15 - (p.compassion - 50) * 0.2;
  value += (tastePreference(character, "war") - tastePreference(character, "peace")) * 0.4;
  if (primary === "rivalry") value += p.vengefulness * 0.2;
  if (primary === "people") value -= 10;
  value += activeGoalIntensity(character, "restore_homeland") * 0.25;
  if (character.backstory?.religiousWar === "holy_war" || character.backstory?.religiousWar === "sacrificial") {
    value += p.zeal * 0.3;
  }
  return clamp(value);
}

/** Rank and recognition can motivate a frugal person; professional duty is not ambition. */
export function getPersonalAmbition(character: Subject): number {
  return clamp(
    Math.max(
      activeGoalIntensity(character, "gain_office"),
      activeGoalIntensity(character, "gain_wealth"),
      Math.max(0, tastePreference(character, "titles_glory")) * 0.8,
      character.personality.greed * 0.55 + character.personality.energy * 0.15
    )
  );
}

/**
 * Select the scope of interpersonal compassion based on character commitments, personality,
 * origin, principles, and racial/demonic affiliation.
 */
export function determineCompassionScope(character: Character): CompassionScope {
  if (character.backstory?.compassionScope) {
    return character.backstory.compassionScope;
  }

  const p = character.personality;
  const b = character.backstory;
  const primaryKind = b?.commitment?.primary?.kind;
  const secondaryKind = b?.commitment?.secondary?.kind;
  const origin = b?.origin;

  // Base weights for medieval fantasy society (community as baseline majority)
  const scores: Record<CompassionScope, number> = {
    community: 35,
    faith: 20,
    family: 20,
    species: 15,
    everyone: 5,
    self: 5
  };

  // 1. Empathy & Compassion
  if (p.compassion <= 20) {
    scores.self += 40;
    scores.everyone -= 30;
  } else if (p.compassion <= 35) {
    scores.self += 20;
    scores.everyone -= 15;
  } else if (p.compassion >= 80) {
    scores.everyone += 40;
    scores.self -= 40;
  } else if (p.compassion >= 70) {
    scores.everyone += 20;
    scores.self -= 25;
  }

  // 2. Selfishness, Greed, and Malice
  if (p.greed >= 75 && p.compassion <= 45) scores.self += 25;
  if (p.guile >= 75 && p.compassion <= 40) scores.self += 20;
  if (p.vengefulness >= 75 && p.compassion <= 40) scores.self += 15;

  // 3. Piety & Faith
  if (p.piety >= 75) scores.faith += 30;
  else if (p.piety >= 60) scores.faith += 15;
  else if (p.piety <= 25) scores.faith -= 20;

  // 4. Commitments
  const applyCommitment = (kind?: string, weight = 1) => {
    if (!kind) return;
    if (kind === "faith") scores.faith += 45 * weight;
    else if (kind === "family" || kind === "house") scores.family += 45 * weight;
    else if (kind === "self" || kind === "rivalry" || kind === "hedonism") scores.self += 35 * weight;
    else if (kind === "nation_culture") {
      scores.species += 35 * weight;
      scores.community += 15 * weight;
    } else if (
      kind === "state" ||
      kind === "domain" ||
      kind === "office" ||
      kind === "liege" ||
      kind === "patron" ||
      kind === "comrades"
    ) {
      scores.community += 30 * weight;
    } else if (kind === "people") {
      scores.community += 20 * weight;
      scores.everyone += 30 * weight;
    }
  };
  applyCommitment(primaryKind, 1);
  applyCommitment(secondaryKind, 0.5);

  // 5. Principles
  if (hasPrinciple(character, "protect_civilians") || hasPrinciple(character, "reject_aggression")) {
    scores.everyone += 25;
    scores.community += 10;
    scores.self -= 30;
  }

  // 6. Origin & Upbringing
  if (origin) {
    if (origin.raisedIn === "monastery" || origin.familyOccupation === "religion") {
      scores.faith += 25;
    }
    if (origin.migration === "immigrant" || origin.migration === "exile") {
      scores.species += 20;
      scores.family += 15;
      scores.community -= 15;
    }
  }

  // 7. Demon infiltration
  if (character.demonInfiltration) {
    scores.self += 35;
    scores.species += 15;
    scores.everyone -= 30;
  }

  // 8. Family situation
  const hasDirectFamily = (character.family?.spouses ?? 0) > 0 || (character.family?.children ?? 0) > 0;
  if (hasDirectFamily) scores.family += 10;

  // Tie-breaking preference: community > faith > family > species > everyone > self
  const preferenceOrder: CompassionScope[] = ["community", "faith", "family", "species", "everyone", "self"];
  let bestScope: CompassionScope = "community";
  let maxScore = -Infinity;

  for (const scope of preferenceOrder) {
    const score = scores[scope];
    if (score > maxScore) {
      maxScore = score;
      bestScope = scope;
    }
  }

  return bestScope;
}

/** Seed modest present-day aspirations. No fabricated capture, bereavement, or conversion history. */
export function seedCharacterMotivation(character: Character): void {
  const b = character.backstory;
  if (!b) return;
  if (!b.goals) {
    const kinds: Partial<Record<typeof b.commitment.primary.kind, CharacterGoalKind>> = {
      self: "gain_office",
      wealth: "gain_wealth",
      people: "protect_people",
      family: "reunite_family",
      craft: "master_craft",
      faith: "serve_faith"
    };
    const kind = kinds[b.commitment.primary.kind];
    // Reuniting requires evidence that family is away; commitment alone does not supply it.
    b.goals = kind && kind !== "reunite_family" ? [{ kind, intensity: b.commitment.intensity, status: "active" }] : [];
  }
  b.principles ??= [
    ...(character.personality.honor >= 75 ? ["keep_oaths" as const] : []),
    ...(character.personality.compassion >= 75 ? ["protect_civilians" as const, "spare_prisoners" as const] : []),
    ...(tastePreference(character, "peace") >= 70 && tastePreference(character, "war") <= 0
      ? ["reject_aggression" as const]
      : [])
  ];
  b.compassionScope ??= determineCompassionScope(character);
  b.religiousWar ??= "unspecified";
}
