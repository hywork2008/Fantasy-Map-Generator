import * as civic from "../data/raceCivicStance";
import * as supernatural from "../data/raceSupernatural";
import * as catalog from "../data/races";
import type { RaceService } from "../types/race-service";

/** Copy returned records so extensions cannot change the host's catalog or saved race objects. */
const source: RaceService = { ...catalog, ...civic, ...supernatural };
export const raceService: RaceService = Object.freeze({
  get RACE_DEFINITIONS() {
    return structuredClone(source.RACE_DEFINITIONS);
  },
  get DEFAULT_RACE_FERTILITY() {
    return { ...source.DEFAULT_RACE_FERTILITY };
  },
  DEFAULT_RACE_LIFESPAN: source.DEFAULT_RACE_LIFESPAN,
  get HUMAN_SUPERNATURAL() {
    return { ...source.HUMAN_SUPERNATURAL };
  },
  get FANTASY_CULTURE_SETS() {
    return new Set(source.FANTASY_CULTURE_SETS);
  },
  get ENEMY_COLONY_RACE_KEYS() {
    return new Set(source.ENEMY_COLONY_RACE_KEYS);
  },
  getRaceById: (...args) => structuredClone(source.getRaceById(...args)),
  raceIdByKey: source.raceIdByKey,
  getRaceFertility: (...args) => structuredClone(source.getRaceFertility(...args)),
  getRaceLifespan: source.getRaceLifespan,
  getRaceMaxLifespan: source.getRaceMaxLifespan,
  getRaceBeautyIdeal: (...args) => structuredClone(source.getRaceBeautyIdeal(...args)),
  getRaceLooksBaseline: (...args) => structuredClone(source.getRaceLooksBaseline(...args)),
  getRaceLooksRange: (...args) => structuredClone(source.getRaceLooksRange(...args)),
  rollCharacterRaceAppearance: source.rollCharacterRaceAppearance,
  supernaturalForRaceKey: (...args) => ({ ...source.supernaturalForRaceKey(...args) }),
  isFantasyCulturesSet: civic.isFantasyCulturesSet,
  isEnemyColonyRaceKey: civic.isEnemyColonyRaceKey,
  isDiplomaticCoreRaceKey: civic.isDiplomaticCoreRaceKey,
  canAppearInMixedCourt: civic.canAppearInMixedCourt
});
