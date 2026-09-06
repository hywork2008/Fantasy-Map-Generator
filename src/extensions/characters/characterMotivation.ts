import type { Character, CharacterGoalKind, CharacterPrinciple } from "./characterTypes";

type Subject = Pick<Character, "personality" | "backstory">;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Scope limits interpersonal concern, not the underlying trait. Unknown affiliation is not hostility. */
export function getCompassionFor(character: Character, target: Character): number {
  const base = character.personality.compassion;
  const scope = character.backstory?.compassionScope ?? "everyone";
  let included = true;
  if (scope === "community") {
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
  b.compassionScope ??= "everyone";
  b.religiousWar ??= "unspecified";
}
