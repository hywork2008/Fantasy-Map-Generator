import type { Character } from "./characterTypes";

/** Human guise age first, chronological Demon age in parentheses. */
export function formatCharacterAge(character: Pick<Character, "age" | "demonInfiltration">): string {
  const actualAge = character.demonInfiltration?.actualAge;
  return actualAge === undefined ? String(character.age) : `${character.age} (${actualAge})`;
}

/** Upgrade infiltrators saved before guise and chronological ages were separated. */
export function migrateDemonAges(characters: Character[]): Character[] {
  for (const character of characters) {
    const infiltration = character.demonInfiltration;
    if (!infiltration || infiltration.actualAge !== undefined) continue;
    infiltration.actualAge = character.age;
    // Stable per character/save, adult Human range 20–60; no load-time RNG drift.
    character.age = 20 + ((Math.abs(character.i) * 37) % 41);
    character.ageFraction = 0;
  }
  return characters;
}
