import type * as civic from "../data/raceCivicStance";
import type * as supernatural from "../data/raceSupernatural";
import type * as catalog from "../data/races";

/** Host-owned species data and pure queries. No extension-owned balance fields. */
export type RaceService = Readonly<
  Pick<
    typeof catalog,
    | "RACE_DEFINITIONS"
    | "DEFAULT_RACE_FERTILITY"
    | "DEFAULT_RACE_LIFESPAN"
    | "getRaceById"
    | "raceIdByKey"
    | "getRaceFertility"
    | "getRaceLifespan"
    | "getRaceMaxLifespan"
    | "getRaceBeautyIdeal"
    | "getRaceLooksBaseline"
    | "getRaceLooksRange"
    | "rollCharacterRaceAppearance"
  > &
    Pick<
      typeof civic,
      | "isFantasyCulturesSet"
      | "isEnemyColonyRaceKey"
      | "isDiplomaticCoreRaceKey"
      | "canAppearInMixedCourt"
      | "FANTASY_CULTURE_SETS"
      | "ENEMY_COLONY_RACE_KEYS"
    > &
    Pick<typeof supernatural, "supernaturalForRaceKey" | "HUMAN_SUPERNATURAL">
>;
