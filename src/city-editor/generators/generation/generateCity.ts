import { editorText } from "../../../i18n/editorMessages";
import { resolveBridgeSkewLimit } from "../../../utils/bridgeSkewPolicy";
import { measureProcessing, type ProcessingProfiler } from "../../../utils/processingProfiler";
import { inferredWallSettings, supportsUrbanMorphology } from "../../../utils/urbanMorphology";
import type { GenerationSample } from "../../types/contracts/generationDiagnostics";
import type { CityDocument, Point } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { tagExternalGateRoads } from "../approachBeyond";
import { buildBlockFabric } from "../blockInfill";
import { finalizeCastles } from "../castles";
import {
  MIN_CEMETERY_GROUND_M2,
  refreshCemeteryLayouts,
  relocateUndersizedCemeteries,
  syncDocumentCemeteries
} from "../cemeteryLayout";
import { createFabricPlan } from "../fabricDistricts";
import { finishCityGeometry } from "../finishCityGeometry";
import { fitImportedHousing } from "../fitImportedHousing";
import { generateFortOnDocument } from "../fortGeneration";
import { townCircuits, townGates } from "../fortifications";
import { straightenFrameRoadJunctions } from "../frameRoadJunction";
import { normalizeGeneratedRoadOwnership } from "../generatedRoadOwnership";
import { captureGenerationDebugPreview, type GenerationDebugObserver } from "../generationDebug";
import {
  type GenerationObserver,
  generationTimer,
  logGenerationFailures,
  reportGenerationFailure
} from "../generationDiagnostics";
import { isSimplePolygon, polygonArea } from "../geom";
import type { HarborPlan } from "../harborFabric";
import { clearHarborShips, placeHarborShips, spawnHarborShips } from "../harborShips";
import { GAP_BLOCKERS, INNER_WALL_FAILURES, type InnerTownPlanDiagnostics } from "../innerTownWall";
import { FabricCache } from "../localInfill";
import { shortcutMajorRoads } from "../majorRoadShortcuts";
import { clone, facePoints, validate } from "../mesh";
import { MoatReservation } from "../moats";
import {
  explainGeneratedCrossingFailures,
  retractProtrudingGates,
  straightenBridges,
  straightenGateCrossings
} from "../passages";
import { bramCoreRadiusForCity, bramSpokeRadiusMeters } from "../polygonalCirculadeLayout";
import { preparePopulationGeneration } from "../populationGeneration";
import { fitPopulationHousing } from "../populationHousingFit";
import { isHexagonalDocument, rectifyHexBlocks } from "../rectifyHexBlocks";
import { rectifyVoronoiBlocks } from "../rectifyVoronoiBlocks";
import { riverFlowsFromDescriptor } from "../riverFlow";
import { cultivateRoadside } from "../roadsideFarms";
import { attachSceneRegions } from "../sceneRegions";
import {
  innerWalledAreaShare,
  MIN_SETTLEMENT_AREA_SHARE,
  outerWalledAreaShare,
  resolveWalledAreaShare,
  townExtentMeters
} from "../settlementExtent";
import { farNodeFor } from "../streets";
import { approachBands } from "../suburbanLanduse";
import { consolidateThinRoadCells } from "../thinRoadCells";
import { auditTownDefenseClosure } from "../townDefenseClosure";
import { connectUrbanRiverDistricts } from "../urbanBridges";
import { planUrbanGrowth } from "../urbanGrowth";
import { applyPlan } from "./assembly/applyPlan";
import { settleTempleOnDocument } from "./assembly/temple";
import { GEN_PREFIX } from "./constants";
import { planningDebugDocument } from "./debugPreview";
import { runPlan } from "./pipeline";
import { plazaApproachPoint, requiredExternalRoads } from "./planning/roadGeometry";
import { prepareRun } from "./prepareRun";
import { finishFixedConnections } from "./routing/fixedConnections";
import { alignFrameRoadEndpoints, snapFrameRoadTerminals } from "./routing/frameRoadConnection";
import { countExternalApproachRoads } from "./routing/roadCounts";
import {
  resolveEffectiveLayout,
  resolveGenerationMethod,
  resolveStreetSettings,
  skeletonUnsupportedSettings
} from "./settings";
import { finishSkeletonGeometry } from "./skeleton/finish";
import { planSkeletonCity } from "./skeleton/toPlan";
import { applyImportedWaterAccess } from "./waterAccess";

export const COMPLETE_CITY_ATTEMPTS = 8;

/** Complete an editable town on the current grid, including intramural streets
 * and geometric finishing. The diagnostic stages omit smoothing but prepare valid gate junctions. */
export function generateCityOnDocument(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  observer?: GenerationObserver,
  onRejected?: GenerationDebugObserver,
  profiler?: ProcessingProfiler,
  stopAfter?: "streets" | "innerWall" | "innerGates" | "firstInnerGates"
): CityDocument | null {
  if (settings.mode === "fort") return generateFortOnDocument(document, settings, seed);
  try {
    ({ document, settings } = measureProcessing(profiler, "population-prepare", () =>
      preparePopulationGeneration(document, settings, seed)
    ));
  } catch (error) {
    reportGenerationFailure(
      observer,
      1,
      "prepare",
      "population-settings",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
  // A retry record only steers where the attempt loop starts; the recipe never stores it.
  const { generationRetry: retry, ...requested } = settings;
  settings = requested;
  let inputKey: string | undefined;
  // After the morphology rewrite below, over what the recipe stores as its input
  // (no fabric), so a roll from that recipe input gets the same key.
  const keyOfInput = () => (inputKey ??= generationInputKey({ ...document, fabric: undefined }, settings));
  const skeletonFirst = resolveGenerationMethod(settings) === "skeleton-first";
  const unsupported = skeletonUnsupportedSettings(settings);
  if (unsupported.length) {
    reportGenerationFailure(
      observer,
      1,
      "prepare",
      "unsupported-skeleton-settings",
      `Skeleton-first does not support: ${unsupported.join(", ")}`
    );
    return null;
  }
  if (settings.descriptor && settings.approachGrowthSource !== "traffic") {
    // Without the O4 opt-in the measured approach traffic must not reach the generation inputs,
    // so towns stay identical to those generated before the ledger existed.
    if (settings.descriptor.roads.some(road => road.approachTraffic)) {
      const descriptor = structuredClone(settings.descriptor);
      for (const road of descriptor.roads) delete road.approachTraffic;
      settings = { ...settings, descriptor };
    }
  }
  const profile = settings.descriptor?.urbanMorphology;
  if (profile && supportsUrbanMorphology(profile.period)) {
    const inferred = inferredWallSettings(profile, settings.descriptor!.burg.dwellings);
    const descriptor = structuredClone(settings.descriptor!);
    delete descriptor.economy;
    for (const road of descriptor.roads) {
      delete road.traffic;
      delete road.trafficRank;
    }
    settings = {
      ...settings,
      descriptor,
      townWallRings: settings.townWallRings ?? (skeletonFirst ? "single" : inferred.townWallRings),
      walledAreaShare: settings.walledAreaShare ?? inferred.walledAreaShare
    };
    document = { ...document, urbanMorphology: structuredClone(profile), siteEconomy: undefined };
    delete document.urbanGrowth;
    delete document.housingCapacity;
  }
  if (!profile || !supportsUrbanMorphology(profile.period)) {
    if (document.urbanMorphology) {
      document = { ...document };
      delete document.urbanMorphology;
      delete document.urbanGrowth;
      delete document.housingCapacity;
    }
  }
  // Some coast/river layouts cannot form valid crossings, or enough external
  // approach roads, on this grid. Try another deterministic layout with the
  // same requested settings, always starting from the untouched input rather
  // than accumulating failed merges.
  const failures: GenerationSample[] = [];
  let oldTownBuilt = false;
  const observe: GenerationObserver = sample => {
    if (sample.failure) failures.push(sample);
    if (sample.phase === "inner-wall" && sample.counts?.ok === 1) oldTownBuilt = true;
    observer?.(sample);
  };
  // Debug previews stop at the first rejection, keeping the requested seed.
  let attemptSettings = settings;
  // A double-walled town whose old-town wall repeatedly cannot be completed
  // (gates the streets cannot reach, a pinched castle) keeps its outer wall.
  let singleWallFallback: string | undefined;
  // Imported rivers drawn only as surveyed water (fixed banks or wide channels) keep FMG's flow
  // direction. It must be on the document while the fabric is built: ferry landings, mills and
  // yards read it, and a ferry plan made without it would be cached as "no flow".
  const importedFlows = settings.descriptor?.rivers?.length ? riverFlowsFromDescriptor(settings.descriptor) : [];
  const attemptDocument = importedFlows.length ? { ...document, riverFlows: importedFlows } : document;
  const resume =
    retry &&
    // A cached single-wall fallback must not permanently suppress an explicit
    // double-wall request after gate/corridor repairs have become possible.
    !(settings.townWallRings === "double" && retry.singleWallFallback !== undefined) &&
    !stopAfter &&
    !onRejected &&
    Number.isSafeInteger(retry.attempt) &&
    retry.attempt > 0 &&
    retry.attempt < COMPLETE_CITY_ATTEMPTS &&
    retry.seed === `${seed}:junction-retry:${retry.attempt}` &&
    retry.inputKey === keyOfInput()
      ? retry
      : undefined;
  // What the loop below has changed, so an accepted retry can be replayed (`GenerationRetry`).
  let castleRetry: { outward: boolean } | null = null;
  let singleWallApplied = false;
  const retrySettings = () => {
    let next = castleRetry
      ? { ...settings, castleStreetLinks: true, ...(castleRetry.outward ? { castleOutward: true } : {}) }
      : settings;
    if (singleWallApplied) next = { ...next, townWallRings: "single" as const, walledAreaShare: 1 };
    return next;
  };
  if (resume) {
    castleRetry = resume.castleStreetLinks ? { outward: !!resume.castleOutward } : null;
    singleWallApplied = resume.singleWallFallback !== undefined;
    singleWallFallback = resume.singleWallFallback;
    attemptSettings = retrySettings();
  }
  for (let attempt = resume?.attempt ?? 0; attempt < COMPLETE_CITY_ATTEMPTS; attempt++) {
    const attemptSeed = attempt ? `${seed}:junction-retry:${attempt}` : seed;
    const failed = failures.length;
    const result = measureProcessing(profiler, `attempt-${attempt + 1}`, () =>
      generateCityAttempt(
        attemptDocument,
        attemptSettings,
        attemptSeed,
        observe,
        attempt + 1,
        onRejected,
        profiler,
        stopAfter
      )
    );
    if (result && stopAfter) {
      result.generationSeed = attemptSeed;
      return result;
    }
    if (result) {
      result.historicalPeriod =
        settings.historicalPeriod ??
        settings.descriptor?.historicalPeriod ??
        document.historicalPeriod ??
        "ageOfExploration";
      const skewLimit = settings.descriptor?.transport?.maxBridgeSkewDegrees ?? document.maxBridgeSkewDegrees;
      if (skewLimit !== undefined) result.maxBridgeSkewDegrees = skewLimit;
      if (settings.descriptor?.economy) result.siteEconomy = structuredClone(settings.descriptor.economy);
      result.farmlandAreaHectares = settings.descriptor
        ? settings.descriptor.farmlandAreaHectares
        : document.farmlandAreaHectares;
      const prevailingWindDeg = settings.descriptor?.climate?.prevailingWindDeg;
      if (typeof prevailingWindDeg === "number" && Number.isFinite(prevailingWindDeg))
        result.prevailingWindDeg = prevailingWindDeg;
      result.generationSeed = attemptSeed;
      if (singleWallFallback)
        result.townWallGeneration = {
          requestedOrder: settings.townWallBuildOrder ?? "outer-first",
          actualOrder: "single",
          fallbackReason: singleWallFallback
        };
      if (result.fabric) {
        const input: CityDocument = measureProcessing(profiler, "recipe-input-clone", () =>
          clone(
            skeletonFirst && document.fabric?.generation?.algorithm === "skeleton-city-v1"
              ? document.fabric.generation.input
              : document
          )
        );
        delete input.fabric;
        result.fabric.generation = {
          algorithm: skeletonFirst
            ? "skeleton-city-v1"
            : settings.legacyCastles
              ? "evolution-city-v3"
              : "castle-city-v1",
          seed: attemptSeed,
          settings: {
            ...measureProcessing(profiler, "recipe-settings-clone", () => structuredClone(attemptSettings)),
            layout: result.layout,
            ...(skeletonFirst
              ? { generationMethod: "skeleton-first" as const, wallShape: attemptSettings.wallShape ?? "auto" }
              : {}),
            walledAreaShare:
              attemptSettings.townWallRings === "double"
                ? innerWalledAreaShare(settings.walledAreaShare, townExtentMeters(document.frame))
                : resolveWalledAreaShare(settings.walledAreaShare, townExtentMeters(document.frame))
          },
          input
        };
      }
      // Editable river groups carry their own direction.
      if (importedFlows.length) {
        if (result.featureGroups.some(g => g.kind === "river")) delete result.riverFlows;
        else result.riverFlows = importedFlows;
      }
      if (settings.descriptor?.regionalContext)
        measureProcessing(profiler, "scene-regions", () =>
          attachSceneRegions(result, settings.descriptor!.regionalContext!)
        );
      result.biome =
        settings.descriptor?.biome ??
        (settings.descriptor?.climate
          ? {
              id: settings.descriptor.climate.biomeId,
              key: settings.descriptor.climate.biomeKey,
              name: settings.descriptor.climate.biomeName ?? `Biome ${settings.descriptor.climate.biomeId}`,
              color: settings.descriptor.climate.biomeColor ?? "#d5cfbf"
            }
          : document.biome);
      // Count houses on the finished town: harbour ships, bridge approaches,
      // the historical period and scene regions all change which lots are
      // built, so an earlier count overstated the houses by up to ~20%.
      // One content-keyed district cache for the first fabric and every housing count.
      const fabricCache = new FabricCache(512);
      if (result.urbanMorphology && settings.descriptor) {
        const initialFabric = measureProcessing(profiler, "initial-fabric", () =>
          buildBlockFabric(result, fabricCache)
        );
        result.urbanGrowth = measureProcessing(profiler, "urban-growth-plan", () =>
          planUrbanGrowth(
            result,
            approachBands(result),
            settings.descriptor!.roads,
            settings.descriptor!.burg.dwellings,
            initialFabric
          )
        );
        const eligible = Object.values(result.mesh.faces).filter(
          f => f.properties.water === "land" && ["core", "outskirts"].includes(f.properties.settlement ?? "")
        );
        const area = (faces: typeof eligible) =>
          faces.reduce((sum, f) => sum + Math.abs(polygonArea(facePoints(result.mesh, f))), 0);
        const totalArea = area(eligible);
        const enclosed = eligible.filter(f => f.properties.settlement === "core");
        result.urbanGrowth.outerEnclosedUrbanAreaShare = totalArea ? area(enclosed) / totalArea : null;
        result.urbanGrowth.innerEnclosedAreaShare = area(enclosed)
          ? area(enclosed.filter(f => (f.properties.wallRing ?? 0) === 0)) / area(enclosed)
          : null;
        for (const phase of result.urbanMorphology.wallPhases)
          phase.absorbedClusterIds = result.urbanGrowth.absorbedClusters
            .filter(c => c.wallPhaseId === phase.id)
            .map(c => c.id);
      }
      if (settings.descriptor && !settings.population) {
        const fitStarted = performance.now();
        // Occupancy and storeys do not move streets, so every fabric the fit builds has the
        // harbour the finished town draws.
        let harbor: HarborPlan | undefined;
        const housingFit = measureProcessing(profiler, "fit-housing", () =>
          fitImportedHousing(
            result,
            settings.descriptor!.burg.dwellings,
            settings.descriptor!.burg.lotOccupancy,
            profiler,
            fabricCache,
            fabric => {
              harbor = fabric.harbor;
            }
          )
        );
        observe({ phase: "fit-housing", elapsedMs: performance.now() - fitStarted, attempt: attempt + 1, housingFit });
        measureProcessing(profiler, "harbor-ships", () => placeHarborShips(result, attemptSeed, profiler, harbor));
      }
      if (result.populationPlan)
        measureProcessing(profiler, "population-housing", () =>
          fitPopulationHousing(result, fabricCache, sample => observe({ ...sample, attempt: attempt + 1 }))
        );
      if (skeletonFirst) {
        const errors = measureProcessing(profiler, "validate", () => validate(result));
        if (errors.length) {
          const sample = reportGenerationFailure(
            observe,
            attempt + 1,
            "complete",
            "invalid-mesh",
            "The completed skeleton city has invalid mesh references.",
            undefined,
            errors
          );
          if (onRejected) {
            onRejected(captureGenerationDebugPreview(result, sample, attemptSeed));
            return null;
          }
          continue;
        }
      }
      if (attempt > 0 && !stopAfter)
        observe({
          phase: "accepted-attempt",
          elapsedMs: 0,
          attempt: attempt + 1,
          retry: {
            seed: attemptSeed,
            attempt,
            inputKey: keyOfInput(),
            ...(castleRetry
              ? { castleStreetLinks: true, ...(castleRetry.outward ? { castleOutward: true } : {}) }
              : {}),
            ...(singleWallApplied && singleWallFallback !== undefined ? { singleWallFallback } : {})
          }
        });
      return result;
    }
    if (onRejected) return null;
    // A castle can leave the gate streets no way past it while the face
    // graph still links them (Breistattlin), or cut an FMG road off from the
    // town (Dossiepoy, Courvilliers). Every attempt would site it again, so
    // later attempts judge castle sites on street edges.
    const retryReasons = new Set(["unconnected-gates", "fmg-road-mismatch", "castle-no-site"]);
    const reasons = failures.slice(failed).map(sample => sample.failure?.reason ?? "");
    if (reasons.some(reason => retryReasons.has(reason))) {
      castleRetry = { outward: reasons.some(reason => reason !== "unconnected-gates") || attempt >= 1 };
      singleWallApplied = false;
      attemptSettings = retrySettings();
    }
    // Only when an old-town wall was actually built: a town with no room for
    // one is already single-walled by its plan.
    if (settings.townWallRings === "double" && attempt >= 1 && reasons.length && oldTownBuilt) {
      singleWallFallback = reasons.at(-1);
      singleWallApplied = true;
      attemptSettings = retrySettings();
    }
  }
  observe({
    phase: "complete",
    elapsedMs: 0,
    attempt: COMPLETE_CITY_ATTEMPTS,
    counts: { attempts: COMPLETE_CITY_ATTEMPTS, rejected: failures.length },
    failure: {
      reason: "all-attempts-rejected",
      message: editorText("cityEditor.messages.allCandidatesWereRejected", { value0: COMPLETE_CITY_ATTEMPTS }),
      details: failures.map(sample =>
        editorText("cityEditor.messages.candidate", {
          value0: sample.attempt,
          value1: sample.failure?.message ?? sample.phase,
          value2: sample.phase
        })
      )
    }
  });
  const context = {
    seed,
    grid: document.gridKind ?? "unspecified",
    extentMeters: document.frame.extentMeters,
    cityRadiusMeters: document.frame.cityRadiusMeters,
    faces: Object.keys(document.mesh.faces).length
  };
  // Callers that pass an observer (UI / worker progress) log from the samples
  // they already collected. Direct calls still need a console report.
  if (!observer) logGenerationFailures(failures, context);
  return null;
}

/** Identifies the input of a roll: the document and the requested settings (without any retry record). */
export function generationInputKey(document: CityDocument, settings: GenerationSettings): string {
  const { generationRetry: _retry, ...requested } = settings;
  const text = JSON.stringify([document, requested]);
  // FNV-1a, 2 × 32 bits: a stale record must not match by accident, but this is no security boundary.
  let a = 0x811c9dc5,
    b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

/** Reads the immutable input, assembles an isolated candidate and returns only
 * an accepted document (or an explicitly requested checkpoint). Failed candidate
 * references are retained only by an explicitly supplied debug observer. */
export function generateCityAttempt(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  observer?: GenerationObserver,
  attempt = 1,
  onRejected?: GenerationDebugObserver,
  profiler?: ProcessingProfiler,
  /** Return right after the old-town wall, before geometry smoothing. */
  stopAfter?: "streets" | "innerWall" | "innerGates" | "firstInnerGates"
): CityDocument | null {
  const mark = generationTimer(observer, attempt);
  let debugDocument = () => document;
  const reject = (
    phase: string,
    reason: string,
    message: string,
    counts?: Record<string, number>,
    details?: string[]
  ): null => {
    const sample = reportGenerationFailure(observer, attempt, phase, reason, message, counts, [
      `seed=${seed}`,
      ...(details ?? [])
    ]);
    if (onRejected) onRejected(captureGenerationDebugPreview(debugDocument(), sample, seed));
    return null;
  };
  const skeletonFirst = resolveGenerationMethod(settings) === "skeleton-first";
  const unsupported = skeletonUnsupportedSettings(settings);
  if (unsupported.length)
    return reject(
      "prepare",
      "unsupported-skeleton-settings",
      `Skeleton-first does not support: ${unsupported.join(", ")}`
    );
  const faceCount = Object.keys(document.mesh.faces).length;
  if (!skeletonFirst && faceCount < 3)
    return reject(
      "prepare",
      "too-few-faces",
      editorText("cityEditor.messages.gridHasFewerThanThreeFaces", { value0: faceCount }),
      { faces: faceCount }
    );
  let skeletonRun: ReturnType<typeof planSkeletonCity> = null;
  if (skeletonFirst) {
    try {
      skeletonRun = measureProcessing(profiler, "skeleton-plan", () =>
        planSkeletonCity(document, settings, seed, observer, attempt)
      );
    } catch (error) {
      return reject("conformingMesh", "invalid-mesh", String(error));
    }
    if (!skeletonRun) return null;
    document = { ...document, gridKind: "evolution" };
  }
  const { cells, faceIdOf, geo, program, params, half, cellSize } = measureProcessing(
    profiler,
    "prepare",
    () => skeletonRun?.prepared ?? prepareRun(document, settings, seed)
  );
  mark("prepare", { faces: cells.length, edges: Object.keys(document.mesh.edges).length });
  const plan =
    skeletonRun?.plan ??
    measureProcessing(profiler, "plan", () =>
      runPlan(
        document.mesh,
        faceIdOf,
        cells,
        geo,
        program,
        params,
        seed,
        half,
        cellSize,
        settings,
        6,
        true,
        observer,
        attempt,
        true,
        document.gridKind,
        document
      )
    );
  mark("plan-total");
  debugDocument = () => planningDebugDocument(document, faceIdOf, plan, program);
  if (plan.castleFailure)
    return reject(
      "castle",
      plan.castleFailure,
      editorText("cityEditor.messages.noLocationSatisfiesTheRequestedCastlePlacementSettings"),
      undefined,
      plan.castleFailureDetails
    );
  // Do not save a nominally successful town when imported water has consumed
  // its centre. Measure the flood-fill settlement, not the walled core — wall
  // capacity (Medium 45% / Large 20%) is a later split of the same fill.
  const activeCells = plan.cells ?? cells;
  const activeFaceIdOf = plan.faceIdOf ?? faceIdOf;
  const targetArea = Math.PI * params.cityRadiusMeters ** 2;
  const areaShare =
    settings.urbanCoreMode === "compact" && program.walls ? outerWalledAreaShare(settings, params.extentMeters) : 1;
  const minimumUrbanArea = targetArea * areaShare * MIN_SETTLEMENT_AREA_SHARE;
  const settlementArea = activeCells
    .filter(cell => plan.builtUp.has(cell.id))
    .reduce((sum, cell) => sum + Math.abs(polygonArea(cell.polygon)), 0);
  if (settlementArea < minimumUrbanArea) {
    const walledShare = program.walls ? outerWalledAreaShare(settings, params.extentMeters) : 1;
    const walledArea = activeCells
      .filter(cell => plan.urban.has(cell.id))
      .reduce((sum, cell) => sum + Math.abs(polygonArea(cell.polygon)), 0);
    const floorPercent = Math.round(MIN_SETTLEMENT_AREA_SHARE * 100);
    const sharePercent = Math.round(walledShare * 100);
    return reject(
      "urban",
      "urban-area-too-small",
      editorText("cityEditor.messages.urbanAreaM2FallsShortOfTheMinimumM2Of", {
        value0: Math.round(settlementArea),
        value1: Math.round(minimumUrbanArea),
        value2: floorPercent
      }),
      {
        settlementArea: Math.round(settlementArea),
        walledArea: Math.round(walledArea),
        minimumUrbanArea: Math.round(minimumUrbanArea),
        targetArea: Math.round(targetArea),
        urbanFaces: plan.urban.size,
        builtUpFaces: plan.builtUp.size,
        cityRadiusMeters: Math.round(params.cityRadiusMeters),
        walledSharePercent: sharePercent,
        settlementFloorPercent: floorPercent
      },
      [
        `R=${params.cityRadiusMeters} m, πR²=${Math.round(targetArea)} m²`,
        editorText("cityEditor.messages.minimumUrbanAreaIsIndependentOfTheWalledShareMinimum", {
          value0: floorPercent
        }),
        editorText("cityEditor.messages.walledShareWallsWalledAreaM2", {
          value0: sharePercent,
          value1: program.walls ? "on" : "off",
          value2: Math.round(walledArea)
        })
      ]
    );
  }
  const buildingPattern = settings.buildingPattern ?? document.buildingPattern ?? "legacy";
  const wards = new Map(plan.wards);
  for (const [id, kind] of wards) {
    if (["slum", "gate", "shanty", "military"].includes(kind)) wards.set(id, "craftsmen");
    if (kind === "administration" || kind === "patriciate") wards.set(id, "merchant");
  }
  const streetOptions = resolveStreetSettings(settings);
  const plaza = plan.precincts.find(p => p.kind === "plaza");
  const effectiveLayout = skeletonFirst
    ? settings.layout === "classic"
      ? "classic"
      : "organic"
    : resolveEffectiveLayout(settings.layout ?? settings.config?.layout, params.extentMeters, seed);
  const hub: Point = plaza?.anchor ?? [0, 0];
  const isGate = (p: Point) => plan.gates.some(g => Math.hypot(g.point[0] - p[0], g.point[1] - p[1]) < 15);
  const isPlaza = (p: Point) => {
    if (!plaza) return Math.hypot(p[0], p[1]) < 40;
    if (plaza.anchor && Math.hypot(p[0] - plaza.anchor[0], p[1] - plaza.anchor[1]) < (plaza.radiusMeters ?? 20) + 25)
      return true;
    if (plaza.polygon?.some(pt => Math.hypot(p[0] - pt[0], p[1] - pt[1]) < 25)) return true;
    return Math.hypot(p[0], p[1]) < 40;
  };
  const isGateToPlaza = (line: Point[]) => {
    const a = line[0],
      b = line[line.length - 1];
    return (isGate(a) && isPlaza(b)) || (isGate(b) && isPlaza(a));
  };
  const sameEnd = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 8;

  const star = plan.gates.map(g => {
    let target = plazaApproachPoint(activeCells, plaza, g.point) ?? plaza?.anchor ?? [0, 0];
    if (effectiveLayout === "bram") {
      const angle = Math.atan2(g.point[1] - hub[1], g.point[0] - hub[0]);
      const spoke = bramSpokeRadiusMeters(bramCoreRadiusForCity(params.cityRadiusMeters, program.walls));
      target = [hub[0] + Math.cos(angle) * spoke, hub[1] + Math.sin(angle) * spoke];
    }
    return [g.point, target] as Point[];
  });
  const extras =
    effectiveLayout === "circulade" || effectiveLayout === "bram"
      ? []
      : plan.streets.filter(line => {
          if (isGateToPlaza(line)) return false;
          const a = line[0],
            b = line[line.length - 1];
          return !star.some(s => (sameEnd(s[0], a) && sameEnd(s[1], b)) || (sameEnd(s[0], b) && sameEnd(s[1], a)));
        });
  const isBramVoronoiUnwalled = effectiveLayout === "bram" && !program.walls;
  const streets = isBramVoronoiUnwalled ? [] : [...star, ...extras];
  const roads: Point[][] = plan.gates.map((gate, i) => [
    farNodeFor(
      gate,
      geo,
      half,
      plan.waterPolygon,
      plan.coastPath,
      cellSize,
      streetOptions.avoidSea,
      streetOptions.farNode,
      streetOptions.manualBearings?.[i]
    ),
    gate.point
  ]);
  // A surveyed river can leave one entrance with no dry wall corner. Keep the
  // town-side bank as an interior street. The frame road crosses onward.
  const coveredRoadIndexes = new Set(
    plan.gates.flatMap(gate => (gate.roadIndex === undefined ? [] : [gate.roadIndex]))
  );
  for (const [index, road] of (geo.importedRoads ?? []).entries()) {
    if (coveredRoadIndexes.has(index) || road.path.length < 2) continue;
    roads.push([[0, 0], [...road.path.at(-1)!]]);
  }
  // Stage order with double walls: gate-to-centre roads → old-town wall →
  // old-town gates and their roads → town streets. The wall is built inside
  // applyPlan before routing. The "innerGates" stage is the same routed town
  // with the town streets hidden, so every stage shows one and the same city.
  const routedStreets = streets;
  const applied = measureProcessing(profiler, "apply-plan", () =>
    applyPlan(
      document,
      activeCells,
      activeFaceIdOf,
      {
        ...plan,
        layout: effectiveLayout,
        wards,
        streets: routedStreets,
        roads: [...roads, ...routedStreets],
        innerArteries: plan.innerWall?.planned ? star : undefined
      },
      program,
      6,
      true,
      observer,
      attempt,
      onRejected ? (partial, sample) => onRejected(captureGenerationDebugPreview(partial, sample, seed)) : undefined,
      stopAfter === "innerWall" ? "innerWall" : stopAfter === "firstInnerGates" ? "firstInnerGates" : undefined
    )
  );
  mark("apply-total");
  if (!applied) return null;
  const next: CityDocument = applied;
  debugDocument = () => next;
  const minRoads = requiredExternalRoads(settings, townExtentMeters(document.frame));
  const roadsBeforeFinish = countExternalApproachRoads(next);
  // The old-town wall stage stops before any road is routed.
  if (stopAfter !== "innerWall" && stopAfter !== "firstInnerGates" && minRoads > 0 && roadsBeforeFinish < minRoads)
    return reject(
      "street-plan",
      "too-few-external-roads",
      editorText("cityEditor.messages.onlyOuterRoadsBeforeFinishingAtLeastRequired", {
        value0: roadsBeforeFinish,
        value1: minRoads
      }),
      { roads: roadsBeforeFinish, minRoads, gates: townGates(next).length }
    );
  // The old-town wall was built inside applyPlan, before the streets.
  if (plan.innerWall && !plan.innerWall.planned)
    mark("inner-wall", {
      ok: 0,
      failureCode: INNER_WALL_FAILURES.indexOf(plan.innerWall.failure ?? "gap") + 1,
      planned: 0,
      ...innerPlanDiagnosticCounts(plan.innerWall.diagnostics)
    });
  next.appearance = "town";
  if (stopAfter === "innerGates") {
    // Keep the approach roads, the gate-to-centre roads and bridges; hide the
    // town streets (routed after them, `road-<index>` past the gate roads).
    const gateRoads = roads.length + star.length;
    next.featureGroups = next.featureGroups.filter(group => {
      const index = group.kind === "road" ? /^gc:road-(\d+)/.exec(group.id)?.[1] : undefined;
      return index === undefined || Number(index) < gateRoads;
    });
  }
  if (stopAfter) return next;
  const coarse = document.gridKind === "evolution";
  const hexagonal = !coarse && isHexagonalDocument(document);
  const routed =
    coarse && !skeletonFirst ? measureProcessing(profiler, "road-shortcuts", () => shortcutMajorRoads(next)) : next;
  mark("major-road-shortcuts");
  const rectified = hexagonal
    ? measureProcessing(profiler, "rectify-hex", () => rectifyHexBlocks(routed, seed))
    : routed;
  mark("rectify-hex");
  const finished = resolveStreetSettings(settings).foldSmoothing
    ? measureProcessing(profiler, "finish-geometry", () =>
        plan.skeleton
          ? finishSkeletonGeometry(
              rectified,
              plan.skeleton,
              "finish-geometry",
              doc => finishCityGeometry(doc),
              observer,
              attempt
            )
          : finishCityGeometry(rectified)
      )
    : rectified;
  mark("finish-geometry");
  // Square each bridge immediately after smoothing, before block rectification
  // pins the road vertices. The crossing stays on the river; its two road
  // neighbours slide onto the normal so the span is the short perpendicular.
  const squared = measureProcessing(profiler, "straighten-bridges", () =>
    plan.skeleton
      ? finishSkeletonGeometry(finished, plan.skeleton, "straighten-bridges", straightenBridges, observer, attempt)
      : straightenBridges(finished)
  );
  const shaped =
    hexagonal || coarse
      ? squared
      : measureProcessing(profiler, "rectify-voronoi", () => rectifyVoronoiBlocks(squared, seed, rectified));
  mark("rectify-voronoi");
  const allowedRiverIds = new Set(
    plan.rivers.flatMap((river, index) => (river.bridgeAllowed ? [`${GEN_PREFIX}river-${index}`] : []))
  );
  const connected =
    coarse && !skeletonFirst
      ? measureProcessing(profiler, "river-district-connections", () =>
          connectUrbanRiverDistricts(shaped, allowedRiverIds)
        )
      : shaped;
  const crossingSettled = measureProcessing(profiler, "gate-and-bridge-crossings", () =>
    plan.skeleton
      ? finishSkeletonGeometry(
          connected,
          plan.skeleton,
          "gate-and-bridge-crossings",
          doc => straightenGateCrossings(retractProtrudingGates(straightenBridges(doc))),
          observer,
          attempt
        )
      : straightenGateCrossings(retractProtrudingGates(straightenBridges(connected)))
  );
  const settled = skeletonFirst
    ? crossingSettled
    : measureProcessing(
        profiler,
        "thin-road-cells",
        () => consolidateThinRoadCells(crossingSettled, new Set(roads.map((_, i) => `${GEN_PREFIX}road-${i}`))).document
      );
  debugDocument = () => settled;
  measureProcessing(profiler, "temple", () => settleTempleOnDocument(settled));
  if (
    settled.castles?.length &&
    !measureProcessing(profiler, "castle-finalization", () => finalizeCastles(settled, false))
  )
    return reject(
      "castle",
      "castle-layout-too-small",
      editorText("cityEditor.messages.castleGeometryIsInvalidAfterFinishing")
    );
  if (settled.defenseCircuits?.some(c => c.moat?.enabled)) {
    const reservations = new Map<number, MoatReservation>();
    const blocked = settled.featureGroups.flatMap(group => {
      if (group.kind !== "road") return [];
      let moat = reservations.get(group.style.widthMeters);
      if (!moat) {
        moat = new MoatReservation(settled, group.style.widthMeters / 2 + 1);
        reservations.set(group.style.widthMeters, moat);
      }
      return group.segments
        .filter(ref => {
          const edge = settled.mesh.edges[ref.edgeId];
          return !moat.roadAllowed(settled.mesh.vertices[edge.a].point, settled.mesh.vertices[edge.b].point);
        })
        .map(ref => `${group.id}: ${ref.edgeId}`);
    });
    if (blocked.length)
      return reject(
        "street-plan",
        "roads-in-moat",
        editorText("cityEditor.messages.finishedRoadsOverlapTheOuterMoatAwayFromGateBridges"),
        { roads: blocked.length },
        blocked
      );
  }
  if (geo.importedRoads !== undefined) {
    const sourceRoads = settled.featureGroups.filter(
      group => group.kind === "road" && group.sourceRoad && group.segments.length
    );
    const missing = geo.importedRoads.filter(
      road =>
        sourceRoads.filter(group => group.kind === "road" && group.sourceRoad?.index === road.sourceIndex).length !== 1
    );
    if (missing.length || sourceRoads.length !== geo.importedRoads.length)
      return reject(
        "street-plan",
        "fmg-road-mismatch",
        editorText("cityEditor.messages.cannotSecureEveryRoadConnectionSuppliedByFMG"),
        { expected: geo.importedRoads.length, actual: sourceRoads.length },
        missing.map(road => `source road ${road.sourceIndex}: route ${road.routeId}`)
      );
  }
  const roadsAfterFinish = countExternalApproachRoads(settled);
  const crossingDetails = measureProcessing(profiler, "crossing-validation", () =>
    explainGeneratedCrossingFailures(
      settled,
      resolveBridgeSkewLimit(
        settings.historicalPeriod ??
          settings.descriptor?.historicalPeriod ??
          document.historicalPeriod ??
          "ageOfExploration",
        settings.descriptor?.transport ?? { maxBridgeSkewDegrees: document.maxBridgeSkewDegrees }
      )
    )
  );
  const tangled = coarse
    ? Object.values(settled.mesh.faces)
        .filter(f => !isSimplePolygon(facePoints(settled.mesh, f), skeletonFirst && !f.properties.buildable ? 1e-8 : 1))
        .map(f => f.id)
    : [];
  const valid = !crossingDetails.length && (minRoads === 0 || roadsAfterFinish >= minRoads) && !tangled.length;
  mark("crossing-validation", {
    valid: Number(valid),
    faces: Object.keys(settled.mesh.faces).length,
    edges: Object.keys(settled.mesh.edges).length,
    roads: roadsAfterFinish,
    crossingIssues: crossingDetails.length,
    selfIntersectingFaces: tangled.length
  });
  if (crossingDetails.length)
    return reject(
      "crossing-validation",
      "invalid-crossings",
      editorText("cityEditor.messages.invalidGateOrBridgeIntersections", { value0: crossingDetails.length }),
      { issues: crossingDetails.length, gates: townGates(settled).length, roads: roadsAfterFinish },
      crossingDetails.slice(0, 20)
    );
  if (minRoads > 0 && roadsAfterFinish < minRoads)
    return reject(
      "crossing-validation",
      "too-few-external-roads",
      editorText("cityEditor.messages.onlyOuterRoadsAfterFinishingAtLeastRequired", {
        value0: roadsAfterFinish,
        value1: minRoads
      }),
      { roads: roadsAfterFinish, minRoads, gates: townGates(settled).length }
    );
  if (tangled.length)
    return reject(
      "crossing-validation",
      "self-intersecting-faces",
      editorText("cityEditor.messages.evolutionGridHasSelfIntersectingBlocks", { value0: tangled.length }),
      { faces: tangled.length },
      tangled.slice(0, 12)
    );
  settled.burialProfile = structuredClone(
    settings.burialProfile ?? settings.descriptor?.burialProfile ?? document.burialProfile
  );
  const civilization = settings.descriptor?.civilization ?? document.civilization;
  if (civilization) settled.civilization = structuredClone(civilization);
  settled.layout = effectiveLayout;
  settled.buildingPattern = buildingPattern;
  settled.historicalPeriod =
    settings.historicalPeriod ??
    settings.descriptor?.historicalPeriod ??
    document.historicalPeriod ??
    "ageOfExploration";
  if (coarse || document.populationPlan)
    settled.fabric = measureProcessing(profiler, "fabric-plan", () => createFabricPlan(settled, seed));
  // Housing style is applied only after roads, crossings and castle geometry
  // have passed the same validation as the legacy generator.
  if (buildingPattern === "medieval") {
    let hasPatriciate = false;
    for (const [id, ward] of plan.wards) {
      const face = settled.mesh.faces[activeFaceIdOf[id]];
      if (ward === "patriciate" && face?.properties.ward === "merchant" && !face.properties.locked) {
        face.properties.ward = "patriciate";
        hasPatriciate = true;
      }
    }
    if (!hasPatriciate) {
      for (const face of Object.values(settled.mesh.faces)) {
        if (face.properties.ward === "merchant" && !face.properties.locked) {
          face.properties.ward = "patriciate";
          break;
        }
      }
    }
  }
  measureProcessing(profiler, "external-gate-roads", () => tagExternalGateRoads(settled, seed, settings.descriptor));
  if (!skeletonFirst) measureProcessing(profiler, "frame-road-alignment", () => alignFrameRoadEndpoints(settled));
  if (!skeletonFirst) measureProcessing(profiler, "frame-road-terminals", () => snapFrameRoadTerminals(settled));
  if (!skeletonFirst)
    measureProcessing(profiler, "frame-road-junctions", () =>
      straightenFrameRoadJunctions(settled, settings.descriptor)
    );
  settled.ruralFieldVersion = 1;
  measureProcessing(profiler, "rural-land", () => cultivateRoadside(settled));
  measureProcessing(profiler, "cemetery-sync", () => syncDocumentCemeteries(settled));
  measureProcessing(profiler, "cemetery-layouts", () => refreshCemeteryLayouts(settled));
  measureProcessing(profiler, "cemetery-relocation", () =>
    relocateUndersizedCemeteries(
      settled,
      skeletonFirst
        ? new Set(
            Object.values(settled.mesh.faces)
              .filter(face => Math.abs(polygonArea(facePoints(settled.mesh, face))) >= MIN_CEMETERY_GROUND_M2)
              .map(f => f.id)
          )
        : undefined
    )
  );
  measureProcessing(profiler, "water-access", () => applyImportedWaterAccess(settled, settings));
  // An FMG town places its ships after the housing fit, from the harbour that fit already built.
  if (settings.descriptor && !stopAfter) clearHarborShips(settled);
  else measureProcessing(profiler, "harbor-ships", () => spawnHarborShips(settled, seed, profiler));
  const withApproaches = skeletonFirst
    ? settled
    : finishFixedConnections(settled, settings, geo, attempt, observer, profiler);
  const closureReports = program.walls
    ? townCircuits(withApproaches).map(c => auditTownDefenseClosure(withApproaches, c.id, true))
    : [];
  mark("wall-defense-closure", {
    innerFirst: settings.townWallBuildOrder === "inner-first" ? 1 : 0,
    rings: closureReports.length,
    unprotectedMeters: closureReports.reduce((n, r) => n + r.undefendedLengthMeters, 0),
    riverOpeningMeters: closureReports.reduce((n, r) => n + r.riverOpeningLengthMeters, 0),
    invasionPaths: closureReports.reduce((n, r) => n + r.invasionPaths, 0),
    ...ringClosureCounts(closureReports)
  });
  if (
    settings.townWallRings === "double" &&
    (settings.townWallDefensePolicy === "closed" ||
      (settings.townWallBuildOrder === "inner-first" && settings.townWallDefensePolicy !== "legacy"))
  ) {
    const open = closureReports.filter(r => !r.ok);
    if (open.length)
      return reject(
        "wall-defense-closure",
        "open-town-defense",
        editorText("cityEditor.messages.cannotSecureWallRiverSeparationDetoursAndRiverPassages"),
        { rings: closureReports.length },
        open.flatMap(r => r.issues.map(issue => `${r.circuitId}: ${issue}`))
      );
    if (settings.townWallBuildOrder === "inner-first")
      withApproaches.townWallGeneration ??= {
        requestedOrder: "inner-first",
        actualOrder: "single",
        fallbackReason: plan.innerWall?.failure ?? "unsupported-layout"
      };
  }
  const preserved = new Set(
    plan.skeleton
      ? plan.skeleton.skeleton.routes.map(route => `${GEN_PREFIX}road-${route.id}`)
      : roads.map((_, i) => `${GEN_PREFIX}road-${i}`)
  );
  mark("road-ownership-final", normalizeGeneratedRoadOwnership(withApproaches, preserved));
  return withApproaches;
}

/** ce:perf counts for an unsuccessful old-town pre-plan (`blockerCode` = GAP_BLOCKERS index + 1). */
function innerPlanDiagnosticCounts(d: InnerTownPlanDiagnostics | undefined): Record<string, number> {
  if (!d) return {};
  return {
    townFaces: d.townFaces ?? 0,
    trials: d.trials ?? 0,
    bestGap: Number.isFinite(d.bestGap) ? (d.bestGap ?? -1) : 999,
    blockerCode: d.blocker ? GAP_BLOCKERS.indexOf(d.blocker) + 1 : 0
  };
}

/** Per-ring split of the closure audit; `townCircuits` orders the inner ring first, the outer last. */
function ringClosureCounts(
  reports: { undefendedLengthMeters: number; riverOpeningLengthMeters: number; invasionPaths: number }[]
): Record<string, number> {
  if (!reports.length) return {};
  const ring = (prefix: string, r: (typeof reports)[number]) => ({
    [`${prefix}UnprotectedMeters`]: r.undefendedLengthMeters,
    [`${prefix}RiverOpeningMeters`]: r.riverOpeningLengthMeters,
    [`${prefix}InvasionPaths`]: r.invasionPaths
  });
  return { ...ring("outer", reports.at(-1)!), ...(reports.length > 1 ? ring("inner", reports[0]) : {}) };
}
