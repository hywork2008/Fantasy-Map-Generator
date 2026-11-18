import type { OpusWorkhomeCulture } from "../../buildings/medieval/opusWorkhomeProfiles";

/** A trade with enough practitioners to form a guild (three or more): it may or may not own a hall. */
export interface GuildChapter {
  domain: string;
  practitioners: number;
}

/**
 * A hall a town's guilds own (docs/plan/bv-workhome-facade-variation.md §5.6, §6.1 W5a):
 * - `town`: the one guildhall of an English-style town, its fraternity's, kept by its leading trade;
 * - `craft`: a craft guild's own hall, in the largest towns only;
 * - `zunft`: a German-style guild house, a town house the leading guilds bought and shared.
 * `domains` lists the guilds meeting in it, the one it is drawn for first.
 */
export interface PlannedGuildHall {
  kind: "town" | "craft" | "zunft";
  domains: string[];
}

/** Below this a German-style town's guilds meet in inns; one guild house for each this many people above it. */
const ZUNFT_TOWN = 2000;
const PEOPLE_PER_ZUNFT_HOUSE = 1250;
/** From this size an English-style town adds a craft hall for each `PEOPLE_PER_CRAFT_HALL` people. */
const CRAFT_HALL_TOWN = 10000;
const PEOPLE_PER_CRAFT_HALL = 5000;
/** A Mediterranean town's guilds meet in their church chapels; a hall for each this many people from this size. */
const PEOPLE_PER_MEDITERRANEAN_HALL = 10000;

/**
 * The guild halls a town without an economy of its own draws, by its culture and size (provisional thresholds, plan
 * §6.1): guilds without a hall meet in a church or an inn and draw nothing. The halls go to the largest guilds first.
 */
export function guildHallPlan(
  culture: OpusWorkhomeCulture,
  population: number,
  chapters: readonly GuildChapter[]
): PlannedGuildHall[] {
  const ranked = [...chapters]
    .sort((a, b) => b.practitioners - a.practitioners || a.domain.localeCompare(b.domain))
    .map(c => c.domain);
  const craft = (count: number): PlannedGuildHall[] =>
    ranked.slice(0, Math.max(0, count)).map(domain => ({ kind: "craft", domains: [domain] }));
  if (culture === "northern-urban") {
    if (population < ZUNFT_TOWN || !ranked.length) return [];
    const houses: PlannedGuildHall[] = ranked
      .slice(0, Math.min(ranked.length, Math.floor(population / PEOPLE_PER_ZUNFT_HOUSE)))
      .map(domain => ({ kind: "zunft", domains: [domain] }));
    // The smaller guilds share the leading guilds' houses, as at Konstanz's Rosgarten.
    for (const [i, domain] of ranked.slice(houses.length).entries()) houses[i % houses.length].domains.push(domain);
    return houses;
  }
  if (culture === "mediterranean") return craft(Math.floor(population / PEOPLE_PER_MEDITERRANEAN_HALL));
  // English-style towns, and provisionally the northern-wooded and stone-upland ones.
  const [lead, ...rest] = ranked,
    halls = population >= CRAFT_HALL_TOWN ? Math.floor(population / PEOPLE_PER_CRAFT_HALL) : 0;
  return [
    { kind: "town", domains: lead ? [lead] : [] },
    ...rest.slice(0, halls).map(domain => ({ kind: "craft" as const, domains: [domain] }))
  ];
}
