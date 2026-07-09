import type { Character, Gender } from "../../characters/characterTypes";
import { P } from "../../hostUtils";

export function rollBalancedEconomyGender(characters: Character[]): Gender {
  let male = 0;
  let female = 0;

  for (const character of characters) {
    if (character.dead || !character.roles?.some(role => role.source === "economy")) continue;
    if (character.gender === "male") male++;
    else female++;
  }

  if (male < female) return "male";
  if (female < male) return "female";
  return P(0.5) ? "male" : "female";
}
