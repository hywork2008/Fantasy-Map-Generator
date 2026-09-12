import type { Character, CharacterRoleClass, CharacterSkills, DemonSocietyExperience } from "./characterTypes";

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

/**
 * Demons possess centuries of accumulated guile, martial experience, and deep knowledge
 * far beyond a mortal lifetime. Endows the Demon's true identity sheet with innate racial
 * superiority, age-scaled expertise, and elevated floors on intellect and deception.
 */
export function applyDemonInfernalSkillBoost(character: Character, actualAge: number): void {
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

/**
 * Endows an overt Demon (who walks openly undisguised without wearing human guises)
 * with true abyssal supremacy. Unlike petty infiltrators who borrow mortal skills and
 * skulk in shadows, overt demons are monumental beings of raw power, terrifying dread,
 * and millennia-old martial dominion.
 */
export function applyOvertDemonSupremacy(
  character: Character,
  options?: { roleClass?: CharacterRoleClass; primarySkill?: keyof CharacterSkills }
): void {
  if (!character.skills) return;
  const roleClass = options?.roleClass;
  const age = character.age ?? 150;

  // First apply the baseline infernal age boost
  applyDemonInfernalSkillBoost(character, age);

  // Overt Demons exhibit primordial martial prowess, terrifying dominion, and forbidden lore
  const prowessBoost = 18;
  const martialBoost = 15;
  const learningBoost = 12;
  const intrigueBoost = 10;

  character.skills.prowess = Math.max(75, Math.min(100, character.skills.prowess + prowessBoost));
  character.skills.martial = Math.max(68, Math.min(100, character.skills.martial + martialBoost));
  character.skills.learning = Math.max(62, Math.min(100, character.skills.learning + learningBoost));
  character.skills.intrigue = Math.max(55, Math.min(100, character.skills.intrigue + intrigueBoost));

  // High Arcane manifestation: overt demons do not restrict their demonic aura
  character.arcane = Math.max(80, Math.min(100, character.arcane ?? 85));

  // Rulers and warlords among demons embody supreme Archdemon / Demon Lord might
  if (roleClass === "ruler") {
    character.skills.prowess = Math.max(88, character.skills.prowess);
    character.skills.martial = Math.max(85, character.skills.martial);
    character.skills.learning = Math.max(78, character.skills.learning);
    character.skills.stewardship = Math.max(70, character.skills.stewardship); // Tyrannical dread administration
    character.skills.intrigue = Math.max(75, character.skills.intrigue);
    character.arcane = Math.max(90, character.arcane);
  } else if (roleClass === "commander") {
    character.skills.prowess = Math.max(88, character.skills.prowess);
    character.skills.martial = Math.max(88, character.skills.martial);
    character.arcane = Math.max(85, character.arcane);
  }

  // Personality reflects colossal confidence, fearlessness, and absolute ruthlessness
  if (character.personality) {
    character.personality.confidence = Math.max(80, character.personality.confidence ?? 50);
    character.personality.boldness = Math.max(75, character.personality.boldness ?? 50);
    character.personality.compassion = Math.min(15, character.personality.compassion ?? 50);
    character.personality.vengefulness = Math.max(60, character.personality.vengefulness ?? 50);
  }

  // Initialize their abyssal dominion record
  initializeDemonDominionExperience(character);
}

/** Initialize the abyssal dominion tracking for an overt Demon. */
export function initializeDemonDominionExperience(character: Character): void {
  if (character.demonDominion || character.demonInfiltration) return;
  const martialAvg = Math.round(((character.skills?.martial ?? 50) + (character.skills?.prowess ?? 50)) / 2);
  character.demonDominion = {
    years: character.age ?? 100,
    dreadDominion: Math.min(100, Math.max(50, martialAvg)),
    abyssalMilestones: Math.floor((character.age ?? 100) / 50)
  };
}

/**
 * Advance an overt Demon's abyssal dominion with the passage of time.
 * Rather than mimicking humans, their centuries of tyrannical existence deepen
 * their connection to the abyss, honing their prowess and terror.
 */
export function advanceDemonDominionExperience(
  character: Character,
  wholeYears: number,
  random: () => number = Math.random
): void {
  if (!character.demonDominion || character.demonInfiltration) return;
  if (wholeYears > 0) character.demonDominion.years += wholeYears;

  const dueMilestones = Math.floor(character.demonDominion.years / 50);
  while (character.demonDominion.abyssalMilestones < dueMilestones) {
    character.demonDominion.abyssalMilestones += 1;
    // Each 50-year abyssal milestone further tempers their martial, prowess, or learning
    const key = (["prowess", "martial", "learning"] as const)[Math.floor(random() * 3)]!;
    if (character.skills) {
      character.skills[key] = Math.min(100, (character.skills[key] ?? 50) + 1 + Math.floor(random() * 2));
    }
    if ((character.arcane ?? 0) < 100 && random() > 0.4) {
      character.arcane = Math.min(100, (character.arcane ?? 80) + 1 + Math.floor(random() * 2));
    }
    character.demonDominion.dreadDominion = Math.min(100, character.demonDominion.dreadDominion + 1);
  }
}

/** Effective skill for an overt Demon, incorporating their dread dominion aura. */
export function effectiveOvertDemonSkill(character: Character, skill: keyof CharacterSkills): number {
  const dominion = character.demonDominion;
  const base = character.skills?.[skill] ?? 50;
  if (!dominion) return base;
  const dreadBonus = Math.min(5, Math.floor(dominion.dreadDominion / 20));
  return Math.min(100, base + dreadBonus);
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

/**
 * Unified helper returning the effective infernal skill for any demon:
 * covert infiltrators draw from their remembered human covers and deception,
 * whereas overt demons channel their tyrannical abyssal supremacy.
 */
export function effectiveDemonSkill(character: Character, skill: keyof CharacterSkills): number {
  if (character.demonInfiltration) {
    return effectiveDemonSecretSkill(character, skill);
  }
  if (character.demonDominion) {
    return effectiveOvertDemonSkill(character, skill);
  }
  return character.skills?.[skill] ?? 50;
}
