import { appServices } from "../context/appServices";
import { worldContext } from "../context/worldContext";
import { HUMAN_RACE_ID, UNKNOWN_RACE_ID } from "../data/races";
import { Burgs } from "../generators/burgs-generator";
import { refreshAllRiverHydrology } from "../generators/riverHydrology";
import { Routes } from "../generators/routes-generator";
import { legacyMutation } from "../runtime/worldRuntime";
import { updateAllBurgWaterAccess } from "../services/burgWaterAccess";
import { burgsUnplacedOnRivers, removeRepeatedRiverCells } from "../services/repairRiverCells";
import { getWorldLandConnectionCurrent } from "../services/worldLandConnectionRuntime";
import { optionsStore } from "../state/optionsStore";
import type { Culture, LandRouteGenerationMode, Route, SeaRouteGenerationMode } from "../types/models";
import { WARN } from "../utils/debug";
import { normalizeFrontierPolitySpacing, normalizeFrontierStartMode } from "../utils/frontierStartMode";
import { normalizeInitialPolityRealmSize } from "../utils/initialPolityScope";
import { normalizeInitialSettlementPattern } from "../utils/initialSettlementPattern";
import { isLoadRepairCurrent, markLoadRepairCurrent } from "./loadRepairs";

/**
 * Simulation-affecting work that follows a `.fmg` archive's `world.replace`
 * (docs/plan/simulation-core-separation.md §20, S6). The browser load and a headless
 * `SimulationHost.loadArchive` both run it, so a world loaded in either place starts the same.
 */

/** Values read from the decoded archive before `world.replace` (the live options may differ). */
export interface LoadedArchiveFacts {
  readonly seaRouteGenerationMode?: SeaRouteGenerationMode;
  readonly landRouteGenerationMode?: LandRouteGenerationMode;
  readonly landRouteElevationAversion?: number;
  readonly currentYear: number;
  readonly era: string;
}

/** Repairs and derived data a loaded archive needs. `betweenViewWork` runs where the browser fits its view. */
export function normalizeLoadedWorld(facts: LoadedArchiveFacts, betweenViewWork?: () => void): void {
  // Archives created before river hydrology stored source conditions have no
  // derived per-cell surface data. Backfill it once the validated world is live.
  legacyMutation(() => {
    refreshAllRiverHydrology(worldContext);
    updateAllBurgWaterAccess(worldContext.pack);
    return { result: undefined, topics: ["map.networks"] };
  });

  // Archives whose rivers repeat a lake cell could not place their river burgs; repair and re-site them.
  const repairedRivers = removeRepeatedRiverCells(worldContext);
  if (repairedRivers.size)
    legacyMutation(() => {
      const moved = Burgs.resiteRiverBurgs(burgsUnplacedOnRivers(worldContext, repairedRivers));
      WARN &&
        console.warn("[Data integrity] Repeated river cells removed", [...repairedRivers], "re-sited burgs", moved);
      return { result: undefined, topics: ["map.networks", "map.settlements"] };
    });

  // Archives created before the generation-mode field was introduced have no
  // reliable indication of which algorithm produced their routes. Preserve
  // those routes verbatim instead of forcibly replacing them with augmented.
  // When sea mode is present we rebuild; land mode defaults to elevationAware
  // when the archive has no landRouteGenerationMode field.
  const hasRegisteredLandArchive =
    !!worldContext.options.landConnectionGeneration && !!worldContext.options.registeredLandConnections;
  if (
    facts.seaRouteGenerationMode &&
    !hasRegisteredLandArchive &&
    !isLoadRepairCurrent(worldContext.options, "routes")
  ) {
    const seaMode = facts.seaRouteGenerationMode;
    legacyMutation(() => {
      if (facts.landRouteElevationAversion !== undefined) {
        worldContext.options.landRouteElevationAversion = facts.landRouteElevationAversion;
      }
      regenerateLoadedRoutes(seaMode, facts.landRouteGenerationMode ?? "elevationAware");
      markLoadRepairCurrent(worldContext.options, "routes");
      return { result: undefined, topics: ["map.networks"] };
    });
  }

  optionsStore.getState().setOptions({
    ...(hasRegisteredLandArchive && worldContext.options.registeredLandConnectionUnit
      ? { distanceUnit: worldContext.options.registeredLandConnectionUnit }
      : {}),
    ...(worldContext.options.mapName ? { mapName: worldContext.options.mapName } : {}),
    seed: worldContext.seed,
    year: facts.currentYear,
    era: facts.era,
    // A Province/Islet-scope map keeps the canvas it was cut from, so regenerating does not shrink twice.
    mapWidth: worldContext.grid.scope?.canvasWidth ?? worldContext.graphWidth,
    mapHeight: worldContext.grid.scope?.canvasHeight ?? worldContext.graphHeight,
    initialSettlementPattern: normalizeInitialSettlementPattern(worldContext.options.initialSettlementPattern),
    initialPolityRealmSize: normalizeInitialPolityRealmSize(
      worldContext.options.initialPolityRealmSize ?? worldContext.options.initialPolityScope
    ),
    frontierStartMode: normalizeFrontierStartMode(worldContext.options.frontierStartMode),
    frontierPolitySpacing: normalizeFrontierPolitySpacing(worldContext.options.frontierPolitySpacing),
    ...(worldContext.options.portCoastPlacement ? { portCoastPlacement: worldContext.options.portCoastPlacement } : {})
  });
  betweenViewWork?.();
  if (worldContext.options.landConnectionGeneration) {
    legacyMutation(() => {
      const physical = getWorldLandConnectionCurrent(worldContext, optionsStore.getState().distanceUnit);
      const ids = new Set(physical?.snapshot.connectionIds ?? []);
      worldContext.pack.cells.routes = Routes.buildLinks(
        worldContext.pack.routes.filter(
          route =>
            route.group === "searoutes" ||
            (route.registeredConnectionId !== undefined && ids.has(route.registeredConnectionId))
        )
      );
      return { result: undefined, topics: ["map.networks"] };
    });
  }
  // Saved routes keep their converged bridge approaches; CE re-prepares on demand.
  // Wildlands merchants saved with race 0 (catalog Unknown) → Human for display/play.
  legacyMutation(() => {
    migrateUnknownCharacterRaces(worldContext.pack.characters, worldContext.pack.cultures as Culture[]);
    return { result: undefined, topics: ["map.politics"] };
  });
}

/**
 * Route generation is intentionally upgraded when an archive is loaded. A
 * `.fmg` archives that explicitly record a generation mode are rebuilt using
 * that mode. Locked routes remain user-authored and are retained.
 *
 * This runs immediately after `world.replace`: `Routes.sync()` uses the River
 * singleton's current world context to build river geometry, so it cannot
 * safely operate on the detached decoded document.
 */
function regenerateLoadedRoutes(
  seaRouteGenerationMode: SeaRouteGenerationMode,
  landRouteGenerationMode: LandRouteGenerationMode = "elevationAware"
): void {
  const lockedRoutes = worldContext.pack.routes
    .filter((route: Route) => route.lock)
    .map((route: Route, index: number) => ({ ...route, i: index }));
  const { pack, grid, seed, options, nameBases, biomesData, notes } = worldContext;
  Routes.generate(
    worldContext,
    undefined,
    appServices,
    { pack, grid, seed, options, nameBases, biomesData, notes },
    lockedRoutes,
    seaRouteGenerationMode,
    landRouteGenerationMode
  );
}

/**
 * Named characters created on Wildlands (culture 0) can store race id 0 (catalog "Unknown").
 * Court generation already remaps that to Human; economy merchants did not — fix on load.
 */
export function migrateUnknownCharacterRaces(
  characters: Array<{ race?: number; culture?: number } | null | undefined> | undefined,
  cultures: Culture[] | undefined
): void {
  if (!characters?.length) return;
  for (const character of characters) {
    if (!character) continue;
    if (character.race !== undefined && character.race !== null && character.race !== UNKNOWN_RACE_ID) continue;
    const cultureRace = character.culture !== undefined ? cultures?.[character.culture]?.race : undefined;
    character.race =
      cultureRace !== undefined && cultureRace !== null && cultureRace !== UNKNOWN_RACE_ID
        ? cultureRace
        : HUMAN_RACE_ID;
  }
}
