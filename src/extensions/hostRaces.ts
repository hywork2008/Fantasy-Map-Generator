import type { RaceService } from "../types/race-service";

let service: RaceService | undefined;
/** Each extension bundle binds its own adapter from init(api); no host runtime imports. */
export function bindRaceService(value: RaceService): void {
  service = value;
}
function getService(): RaceService {
  if (!service) throw new Error("Race service is not initialized; pass ExtensionAPI.races to init(api)");
  return service;
}

// Stable save-format identifiers, not tunable catalog parameters.
export const HUMAN_RACE_ID = 1;
export const UNKNOWN_RACE_ID = 0;
export const DEFAULT_RACE_KEY = "human";
export const getRaceDefinitions = () => getService().RACE_DEFINITIONS;
export const getDefaultRaceFertility = () => getService().DEFAULT_RACE_FERTILITY;
export const getDefaultRaceLifespan = () => getService().DEFAULT_RACE_LIFESPAN;
export const getHumanSupernatural = () => getService().HUMAN_SUPERNATURAL;

export const getRaceById: RaceService["getRaceById"] = (...args) => getService().getRaceById(...args);
export const raceIdByKey: RaceService["raceIdByKey"] = (...args) => getService().raceIdByKey(...args);
export const getRaceFertility: RaceService["getRaceFertility"] = (...args) => getService().getRaceFertility(...args);
export const getRaceLifespan: RaceService["getRaceLifespan"] = (...args) => getService().getRaceLifespan(...args);
export const getRaceMaxLifespan: RaceService["getRaceMaxLifespan"] = (...args) =>
  getService().getRaceMaxLifespan(...args);
export const getRaceBeautyIdeal: RaceService["getRaceBeautyIdeal"] = (...args) =>
  getService().getRaceBeautyIdeal(...args);
export const getRaceLooksBaseline: RaceService["getRaceLooksBaseline"] = (...args) =>
  getService().getRaceLooksBaseline(...args);
export const getRaceLooksRange: RaceService["getRaceLooksRange"] = (...args) => getService().getRaceLooksRange(...args);
export const rollCharacterRaceAppearance: RaceService["rollCharacterRaceAppearance"] = (...args) =>
  getService().rollCharacterRaceAppearance(...args);
export const supernaturalForRaceKey: RaceService["supernaturalForRaceKey"] = (...args) =>
  getService().supernaturalForRaceKey(...args);
export const isFantasyCulturesSet: RaceService["isFantasyCulturesSet"] = (...args) =>
  getService().isFantasyCulturesSet(...args);
export const isEnemyColonyRaceKey: RaceService["isEnemyColonyRaceKey"] = (...args) =>
  getService().isEnemyColonyRaceKey(...args);
export const isDiplomaticCoreRaceKey: RaceService["isDiplomaticCoreRaceKey"] = (...args) =>
  getService().isDiplomaticCoreRaceKey(...args);
export const canAppearInMixedCourt: RaceService["canAppearInMixedCourt"] = (...args) =>
  getService().canAppearInMixedCourt(...args);

function lazySet(key: "FANTASY_CULTURE_SETS" | "ENEMY_COLONY_RACE_KEYS"): ReadonlySet<string> {
  return new Proxy(new Set<string>(), {
    get(_target, property) {
      const current = getService()[key];
      const value = Reflect.get(current, property, current);
      return typeof value === "function" ? value.bind(current) : value;
    }
  });
}
export const FANTASY_CULTURE_SETS = lazySet("FANTASY_CULTURE_SETS");
export const ENEMY_COLONY_RACE_KEYS = lazySet("ENEMY_COLONY_RACE_KEYS");

/** Compatibility export: resolve values after init instead of capturing the host at module load. */
export const HUMAN_SUPERNATURAL: RaceService["HUMAN_SUPERNATURAL"] = Object.freeze({
  get arcaneCap() {
    return getHumanSupernatural().arcaneCap;
  },
  get arcaneMedian() {
    return getHumanSupernatural().arcaneMedian;
  },
  get arcaneInclination() {
    return getHumanSupernatural().arcaneInclination;
  },
  get durability() {
    return getHumanSupernatural().durability;
  }
});
