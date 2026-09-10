import type { Character, CharacterSkills, DemonSocietyExperience } from "./characterTypes";

export const CHARACTER_SKILL_KEYS: readonly (keyof CharacterSkills)[] = [
  "artistry",
  "diplomacy",
  "engineering",
  "geography",
  "intrigue",
  "learning",
  "martial",
  "prowess",
  "stewardship"
];

function experienceFor(character: Character): DemonSocietyExperience | undefined {
  return character.demonInfiltration?.humanSocietyExperience;
}

function skillValue(character: Character, skill: keyof CharacterSkills): number {
  return character.skills?.[skill] ?? 0;
}

/** Start a fresh infiltrator with the skills of the Human identity it first assumes. */
export function initializeDemonSocietyExperience(character: Character): void {
  const infiltration = character.demonInfiltration;
  if (!infiltration || infiltration.humanSocietyExperience) return;
  infiltration.humanSocietyExperience = {
    years: 0,
    coverCount: 1,
    learnedSkillPeaks: Object.fromEntries(CHARACTER_SKILL_KEYS.map(key => [key, skillValue(character, key)])),
    arcaneGrowthMilestones: 0
  };
}

/** Record lessons from the active Human cover and add whole years of lived experience. */
export function advanceDemonSocietyExperience(
  character: Character,
  wholeYears: number,
  random: () => number = Math.random
): void {
  const infiltration = character.demonInfiltration;
  if (!infiltration) return;
  initializeDemonSocietyExperience(character);
  const experience = experienceFor(character)!;
  if (wholeYears > 0) experience.years += wholeYears;
  recordHumanCoverSkills(character);
  growDemonArcaneFromHumanSociety(character, random);
}

/** Each fifty-year milestone can yield a small, increasingly hard-earned infernal gain. */
function growDemonArcaneFromHumanSociety(character: Character, random: () => number): void {
  const infiltration = character.demonInfiltration;
  const experience = infiltration?.humanSocietyExperience;
  if (!infiltration || !experience) return;
  const dueMilestones = Math.floor(experience.years / 50);
  while (experience.arcaneGrowthMilestones < dueMilestones) {
    experience.arcaneGrowthMilestones += 1;
    // Most, but not every, long-lived cover grants an occasion to deepen the true art.
    if (random() > 0.7) continue;
    const current = infiltration.demonIdentity?.arcane ?? character.arcane ?? 0;
    if (current >= 100) continue;
    const gain = 1 + Math.floor(random() * 3);
    const next = Math.min(100, current + gain);
    character.arcane = next;
    if (infiltration.demonIdentity) infiltration.demonIdentity.arcane = next;
  }
}

/** Preserve the best human skill levels the Demon has encountered. */
export function recordHumanCoverSkills(character: Character): void {
  const experience = experienceFor(character);
  if (!experience) return;
  for (const key of CHARACTER_SKILL_KEYS) {
    experience.learnedSkillPeaks[key] = Math.max(experience.learnedSkillPeaks[key] ?? 0, skillValue(character, key));
  }
}

/**
 * Transfer a limited residue of past Human expertise into a new identity.
 * Only the three strongest learned disciplines cross the boundary, and each
 * new cover receives at most 30% of the gap to that remembered peak.
 */
export function inheritDemonCoverSkills(character: Character, nextCover: Character): void {
  const experience = experienceFor(character);
  if (!experience) return;
  recordHumanCoverSkills(character);
  const strongest = [...CHARACTER_SKILL_KEYS]
    .map(key => [key, experience.learnedSkillPeaks[key] ?? 0] as const)
    .filter(([, value]) => value >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [key, peak] of strongest) {
    const current = skillValue(nextCover, key);
    nextCover.skills ??= {} as CharacterSkills;
    nextCover.skills[key] = Math.min(100, Math.max(current, Math.round(current + (peak - current) * 0.3)));
  }
  experience.coverCount += 1;
  recordHumanCoverSkills(nextCover);
}

/**
 * Secret plots use the better of the public cover, the Demon's native skill,
 * and its remembered Human expertise. Every 50 years living among Humans adds
 * 3 points, capped at 15; each prior cover adds up to another 6 points total.
 */
export function effectiveDemonSecretSkill(character: Character, skill: keyof CharacterSkills): number {
  const infiltration = character.demonInfiltration;
  if (!infiltration) return character.skills[skill];
  const experience = infiltration.humanSocietyExperience;
  const base = Math.max(
    skillValue(character, skill),
    infiltration.demonIdentity?.skills[skill] ?? 0,
    experience?.learnedSkillPeaks[skill] ?? 0
  );
  const ageBonus = Math.min(15, Math.floor((experience?.years ?? 0) / 50) * 3);
  const coverBonus = Math.min(6, Math.max(0, (experience?.coverCount ?? 1) - 1) * 2);
  return Math.min(100, base + ageBonus + coverBonus);
}
