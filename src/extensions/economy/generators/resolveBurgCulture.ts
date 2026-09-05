/**
 * Resolve a culture id for economy-generated named characters (merchants, guilds).
 *
 * Burg/cell/state may sit on Wildlands (culture id 0). That is fine for map tiles,
 * but people should not inherit the Unknown race — prefer any real culture, then a
 * Human-majority culture on the map.
 */
import { getRaceById, HUMAN_RACE_ID } from "../../../data/races";
import type { Burg, RaceKey } from "../../hostTypes";
import { getWorldContext } from "../economyContext";

/** First positive culture id among candidates, else 0. */
export function firstNonWildCultureId(...candidates: Array<number | undefined | null>): number {
  for (const id of candidates) {
    if (typeof id === "number" && id > 0) return id;
  }
  return 0;
}

/**
 * Culture for a burg-linked person: burg → cell → state, skipping Wildlands (0),
 * then any Human culture, then any non-wild culture.
 */
export function resolveBurgCulture(burg: Burg | undefined): number {
  const { pack } = getWorldContext();
  const cellCulture = burg?.cell !== undefined ? pack.cells?.culture?.[burg.cell] : undefined;
  const stateCulture = burg?.state !== undefined ? pack.states?.[burg.state]?.culture : undefined;
  const fromPlace = firstNonWildCultureId(burg?.culture, cellCulture, stateCulture);
  if (fromPlace > 0) return fromPlace;

  const cultures = pack.cultures;
  if (!cultures?.length) return 0;

  const humanCulture = cultures.find(c => c && c.i > 0 && !c.removed && c.race === HUMAN_RACE_ID);
  if (humanCulture) return humanCulture.i;

  const anyCulture = cultures.find(c => c && c.i > 0 && !c.removed);
  return anyCulture?.i ?? 0;
}

/** Species key for a burg's resolved culture (`raceWaterTechBias`, other race-conditioned effects). */
export function raceKeyForBurg(burg: Burg | undefined): RaceKey | undefined {
  const { pack } = getWorldContext();
  const cultureId = resolveBurgCulture(burg);
  const culture = pack.cultures?.[cultureId];
  return getRaceById(pack.races, culture?.race)?.key;
}

/** Species key of the State that owns a burg, resilient to id-indexed and dense State arrays. */
export function raceKeyForBurgState(burg: Burg | undefined): RaceKey | undefined {
  const { pack } = getWorldContext();
  const stateId = burg?.state ?? 0;
  if (!stateId) return undefined;
  const state = pack.states?.[stateId] ?? pack.states?.find(candidate => candidate?.i === stateId);
  const culture = pack.cultures?.[state?.culture ?? 0];
  return getRaceById(pack.races, culture?.race)?.key;
}

/**
 * Race that maintains a burg's waterworks. Ordinary works use the local Burg culture.
 * A Giant State's inherited Roman aqueduct/trunk sewer instead uses the State's engineering
 * tradition, because its operation is a country-scale responsibility.
 */
export function raceKeyForBurgWaterworks(
  burg: Burg | undefined,
  hasInheritedRomanWaterworks: boolean | undefined
): RaceKey | undefined {
  const stateRace = raceKeyForBurgState(burg);
  if (hasInheritedRomanWaterworks && stateRace === "giant") return stateRace;
  return raceKeyForBurg(burg);
}
