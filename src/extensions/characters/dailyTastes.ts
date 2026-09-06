import { rand } from "../hostUtils";
import type { CharacterTaste } from "./characterTypes";

/** Small everyday categories: independent of occupation, skill, gender, and moral character. */
export const DAILY_TASTE_GROUPS = [
  ["sweets", "spicy_food", "fish_dishes", "vegetable_dishes", "local_food"],
  ["cooking", "baking", "gardening", "flowers"],
  ["walking", "fishing", "mountains", "sea", "travel"],
  ["board_games", "puzzles", "theater", "dancing", "singing", "storytelling", "humor"],
  ["woodworking", "needlework", "pottery", "collecting"],
  ["quiet", "crowds", "cleanliness", "tidiness", "perfume", "bathing"],
  ["deep_conversation", "teaching", "routine", "improvisation", "paperwork", "competition"],
  ["boasting", "meddling", "lateness", "being_ordered", "public_attention"],
  ["cats", "dogs", "birds", "insects"]
] as const;

export const DAILY_TASTE_IDS: readonly string[] = DAILY_TASTE_GROUPS.flat();

export const DAILY_TASTE_GOODS: Readonly<Record<string, readonly string[]>> = {
  sweets: ["Honey"],
  spicy_food: ["Spices"],
  fish_dishes: ["Fish"],
  cooking: ["Spices", "Cheese"],
  baking: ["Honey", "Flour"],
  needlework: ["Cloth", "Silk"],
  pottery: ["Ceramics"],
  perfume: ["Perfume"],
  woodworking: ["Timber"],
  singing: ["Instruments"]
};

export function buildDailyTastes(): CharacterTaste[] {
  const groups: readonly string[][] = DAILY_TASTE_GROUPS.map(group => [...group]);
  const available = [...groups];
  return ["like", "like", "dislike"].map(polarity => {
    const index = rand(0, available.length - 1);
    const group = available.splice(index, 1)[0]!;
    return {
      id: group[rand(0, group.length - 1)]!,
      polarity: polarity as CharacterTaste["polarity"],
      intensity: rand(40, 90),
      aspect: "preference"
    };
  });
}

/** Preserve later-generated interests and morals. Display limits must never erase saved data. */
export function retainTastes(tastes: readonly CharacterTaste[]): CharacterTaste[] {
  const unique = new Map<string, CharacterTaste>();
  for (const taste of tastes) {
    const key = `${taste.aspect ?? "preference"}:${taste.id}`;
    const previous = unique.get(key);
    if (!previous || taste.intensity > previous.intensity) unique.set(key, taste);
  }
  return [...unique.values()].sort((a, b) => b.intensity - a.intensity || a.id.localeCompare(b.id));
}
