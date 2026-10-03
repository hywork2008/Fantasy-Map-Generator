import { castleRoadEdgeAllowed, finalizeCastles, installCastle, registerTownCircuit } from "./castles";
import { castleWallIds, reservedCastleFaces, townGates } from "./fortifications";
import { connectDryCellInteriors, openWallRiverMouths, shortcutExteriorRoads } from "./gateApproaches";
import { type CastleSite, placeCastleRegion } from "./gen/castlePlacement";
import {
  orientedRectPolylineDistance,
  orientTempleHybrid,
  placeAndClearTempleRect,
  polygonHitsOrientedRect,
  templeFitsLand,
  templeHazards,
  templeRectForElement
} from "./gen/civicPlacement";
import { COASTAL_BUILDING_SETBACK_METERS, oceanShoreSegments } from "./gen/coastalSuitability";
import { createFabricPlan } from "./gen/fabricDistricts";
import { fitImportedHousing } from "./gen/fitImportedHousing";
import { plazaFootprintMeters, templeFootprintMeters } from "./gen/housing";
import { captureGenerationDebugPreview, type GenerationDebugObserver } from "./generationDebug";
import type { RoadRoutingTrace } from "./generationDiagnostics";
import { MoatReservation } from "./moats";
import { enclosedTownFaces, repairRiverWalls } from "./riverWallRouting";
import { cellInsideWater, dryRuns, lineHitsWater, waterPolygons } from "./waterGeometry";
// Step-by-step random city generation for the City Editor.
//
// This runs a City-Editor-local generation engine (./gen/ — a vendored MIT copy
// of the former src/city-generator/core, see ./gen/LICENSE-NOTE.md) — classifiers
// and builders run ON THE DOCUMENT'S EXISTING MESH; it never rebuilds the block
// grid (that is the Document panel's job) and never resizes the map. Each stage
// button recomputes
// the plan up to its own process from a seed (shown in the Generate panel, and
// encoded in a shareable `city-editor/#…` link) and writes only the
// visible result back onto a clone of the current document:
//
//   ① coast   → face.water on sea cells
//   ② river   → a "gc:river-*" feature group along the mesh edges
//   ③ urban   → face.buildable on the built-up cells
//   ④ walls   → "gc:wall-*" groups round the urban outline + gates + plaza/citadel
//   ⑤ streets → "gc:road-*" approach roads
//   ⑥ wards   → face.ward per urban cell + temple / harbour landmarks
//
// A press clears every "gc:*" layer and non-locked face tag first, so the stages
// read as a scrub through the drawing process. The seed is shown in the Generate
// panel and encoded in a shareable link; "🎲 新しい都市" rolls a new one. Coast /
// Rivers / Features (or a real FMG descriptor) are the deliberate inputs and
// are kept across presses.

import { maxWallGatesForExtent, sizePresetForExtent } from "./document";
import { featureGroupVertices, orderedBoundaryLoops, shortestPath } from "./features";
import { tagExternalGateRoads } from "./gen/approachBeyond";
import { refreshCemeteryLayouts, syncDocumentCemeteries } from "./gen/cemeteryLayout";
import { planCirculadeLayout } from "./gen/circuladeLayout";
import { classifyRiver } from "./gen/classifyRiver";
import { type CoastResult, classifyCoast } from "./gen/classifySea";
import { classifyUrban } from "./gen/classifyUrban";
import { aStar, buildEdgeGraph, type EdgeGraph, graphEdgeKey, vertexKey } from "./gen/edgeGraph";
import { finishCityGeometry } from "./gen/finishCityGeometry";
import {
  isSimplePolygon,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonTouchesRectEdge,
  polylineCrossesSegment
} from "./gen/geom";
import { spawnHarborShips } from "./gen/harborShips";
import { markSeaSurroundedGates, markWaterGate, placeGates, placePrecincts } from "./gen/interior";
import { shortcutMajorRoads } from "./gen/majorRoadShortcuts";
import {
  clipPolylinesToLand,
  majorityLandGatesUnserved,
  remakeUnreachableLandGates,
  splitDryWallRuns
} from "./gen/plausibility";
import {
  bramCoreRadiusForCity,
  bramCoreRadiusMeters,
  bramRoadBanRadiusMeters,
  bramSpokeRadiusMeters,
  planPolygonalCirculadeLayout,
  urbanDiskRadiusMeters
} from "./gen/polygonalCirculadeLayout";
import { makeRng } from "./gen/prng";
import { isHexagonalDocument, rectifyHexBlocks } from "./gen/rectifyHexBlocks";
import { rectifyVoronoiBlocks } from "./gen/rectifyVoronoiBlocks";
import { type RoutedRiver, walkRiver } from "./gen/riverPath";
import { cultivateRoadside } from "./gen/roadsideFarms";
import {
  defaultRoadWidthMeters,
  evolutionWallInsetRings,
  extendCoreToCoast,
  insetWalledCore,
  MIN_SETTLEMENT_AREA_SHARE,
  minExternalRoadsForExtent,
  resolveWalledAreaShare,
  splitUrbanCore
} from "./gen/settlementExtent";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { DEFAULT_SITE_CONFIG, randomSiteConfig, type SiteConfig } from "./gen/site/siteConfig";
import { resolveWallPlan, siteToGeography, siteToProgram } from "./gen/site/siteInput";
import { synthSite } from "./gen/site/synthSite";
import { buildStreets, type FarNodeMode, farNodeFor } from "./gen/streets";
import type {
  Cell,
  CityGeography,
  CityParams,
  CityProgram,
  Gate,
  Precinct,
  UrbanStage,
  WallSegmentKind,
  WardAssignment,
  WardKind
} from "./gen/types";
import { DEFAULT_WALL_PLAN } from "./gen/types";
import { connectUrbanRiverDistricts } from "./gen/urbanBridges";
import { assignWards } from "./gen/wards";
import {
  type GenerationObserver,
  type GenerationSample,
  generationTimer,
  logGenerationFailures,
  reportGenerationFailure
} from "./generationDiagnostics";
import { clone, edgeBetween, edgeEnd, faceNeighbors, facePoints, faceVertices, validate } from "./mesh";
import {
  addBridge,
  addWideRiverBridge,
  explainGeneratedCrossingFailures,
  kindEdgeIds,
  minGateSpacingMeters,
  openBarrierPassage,
  openGeneratedPassages,
  straightenBridges,
  straightenGateCrossings,
  throughEdgesAt,
  vertexHasCrossing,
  vertexHasKindPassage
} from "./passages";
import type { CityDocument, EdgeRef, FeatureGroup, Id, Mesh, Point } from "./types";

export type { CityFeatureSet, CityLayout, SiteConfig } from "./gen/site/siteConfig";
export { CITY_LAYOUTS, FEATURE_KEYS } from "./gen/site/siteConfig";
export type { FarNodeMode };

/** Resolve effective morphology layout:
 * - "circulade" -> "circulade"
 * - "bram" -> "bram"
 * - "organic" -> "organic"
 * - "classic" -> "classic"
 * - "auto" -> deterministically roll Circulade, Bram, or Organic for tiny maps (<= 700m)
 */
export function resolveEffectiveLayout(
  layout: import("./gen/site/siteConfig").CityLayout | undefined,
  extentMeters: number,
  seed: string
): "organic" | "circulade" | "bram" | "classic" {
  if (layout === "classic") return "classic";
  if (layout === "circulade") return "circulade";
  if (layout === "bram") return "bram";
  if (layout === "organic") return "organic";
  if (extentMeters <= 700) {
    const rng = makeRng(`${seed}:effective-layout`);
    const roll = rng();
    if (roll < 0.33) return "circulade";
    if (roll < 0.66) return "bram";
    return "organic";
  }
  return "organic";
}

/** All feature groups / gates / elements this module owns carry this id prefix,
 * so a re-press can clear exactly its own output and leave hand-drawn work. */
const GEN_PREFIX = "gc:";

/** Population is only a wall-pattern nudge here (features come from the panel), so
 * a fixed nominal preset is fine — the real scale is the document's frame. */
const NOMINAL_PRESET = "largeTown" as const;

/** One visible process, in order. `processStep` is the S-index it recomputes up to;
 * the grid step (S0) is intentionally absent — the mesh is the Document panel's. */
export interface GenerationStage {
  id:
    | "coast"
    | "river"
    | "urban"
    | "walls"
    | "riverPassages"
    | "passages"
    | "gates"
    | "streets"
    | "wards"
    | "geometry"
    | "blocks"
    | "buildings"
    | "conceal";
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
  /** Original planning pass; separate from the visible slider number. */
  processStep: number;
  wallCheckpoint?: "walls" | "riverPassages" | "passages";
  label: string;
  hint: string;
}

export const GENERATION_STAGES: GenerationStage[] = [
  { id: "coast", step: 1, processStep: 1, label: "① 海岸線と海", hint: "Tag sea cells along a coastline walk" },
  { id: "river", step: 2, processStep: 2, label: "② 河川", hint: "Route a river along the existing cell edges" },
  { id: "urban", step: 3, processStep: 3, label: "③ 市街地コア", hint: "Mark the built-up cells" },
  {
    id: "walls",
    step: 4,
    processStep: 4,
    wallCheckpoint: "walls",
    label: "④ 城壁",
    hint: "市街地の外周に城壁を描く。河川横断用・門用のセル分割前の状態。"
  },
  {
    id: "riverPassages",
    step: 5,
    processStep: 4,
    wallCheckpoint: "riverPassages",
    label: "⑤ 河川横断・セル分割",
    hint: "城壁が河川を横断するためのセル分割と経路調整を行う。門の通路はまだ開かない。"
  },
  {
    id: "passages",
    step: 6,
    processStep: 4,
    wallCheckpoint: "passages",
    label: "⑥ 門の通路・セル分割",
    hint: "門候補で通路を開く。必要なセルを分割し、門の確定前のメッシュを表示する。"
  },
  {
    id: "gates",
    step: 7,
    processStep: 4,
    label: "⑦ 門・城郭",
    hint: "開いた通路に門を確定し、広場・寺院・城郭を配置する。"
  },
  { id: "streets", step: 8, processStep: 5, label: "⑧ 街路", hint: "Approach roads to the gates" },
  { id: "wards", step: 9, processStep: 6, label: "⑨ 地区割り当て", hint: "Assign a district type to each urban cell" },
  {
    id: "geometry",
    step: 10,
    processStep: 7,
    label: "⑩ 幾何平滑化",
    hint: "Smooth walls and streets into rounded shapes (finishCityGeometry)"
  },
  {
    id: "blocks",
    step: 11,
    processStep: 8,
    label: "⑪ 街区・小道",
    hint: "Form interior blocks and secondary access lanes"
  },
  {
    id: "buildings",
    step: 12,
    processStep: 9,
    label: "⑫ 住居・完成都市",
    hint: "Place residential and civic buildings"
  },
  {
    id: "conceal",
    step: 13,
    processStep: 10,
    label: "⑬ 道路・小道を隠す",
    hint: "Hide roads between the centre and the outer wall, and the lanes that divide blocks. Keep river bridges."
  }
];

/** The deliberate inputs the user picks. Neither the seed nor the map size is
 * here — the panel holds the seed, and the frame is the document's. */
export interface StreetSettings {
  farNode: FarNodeMode;
  manualBearings?: number[];
  /** When true (default), roads / walls / buildings may not sit in `waterPolygon`. */
  avoidSea: boolean;
  /** Phase G5: fold smoothed artery vertices back into the mesh. Default true. */
  foldSmoothing: boolean;
}

export interface GenerationSettings {
  /** Unset preserves the existing flood fill and outer residential belt. */
  urbanCoreMode?: "legacy" | "compact";
  moats?: { town?: boolean; castle?: boolean };
  /** Single generated river: pass through town, or skirt the planned wall by roughly 1–3 cells. */
  riverPlacement?: "through" | "outside" | "outsideNear";
  historicalPeriod?: import("./types").HistoricalPeriod;
  buildingPattern?: import("./types").BuildingPattern;
  castle?: Partial<import("./types").CastleSettings>;
  /** Only used when replaying a pre-castle-city recipe. */
  legacyCastles?: boolean;
  config: SiteConfig;
  /** Urban morphology layout (Bram circulade or Organic). Unset = config.layout or "auto". */
  layout?: import("./gen/site/siteConfig").CityLayout;
  /** Approximate fraction of built-up area enclosed by the main wall (0.05–1).
   * Unset: tiny/small 100%, medium 45%, large 20%. Ignored when walls are disabled.
   * Standalone grid evolution pulls a tiny curtain in by one cell, and a small curtain
   * in by one or two cells, so houses can sit outside that line. Bram keeps the
   * settlement edge so its spoke roads can reach the gates. FMG imports without
   * bridgeable rivers retain the supplied town radius without the random inset. */
  walledAreaShare?: number;
  /**
   * Debug/tuning override for the ③ urban-core stage: cap its flood-fill to the
   * first N cells in ascending-cost fill order (TownGeneratorTS-style "first
   * nPatches") instead of the default accumulated polygon-area budget. Unset =
   * actual area up to π R². See docs/city-generator/towngen-comparison.md §2.1.
   */
  urbanNPatches?: number;
  /** Phase G2 street-extension / sea-avoidance knobs. Unset = `defaultStreetSettings()`. */
  streets?: Partial<StreetSettings>;
  /** Real FMG (or shared) site. When set, geography and programme come from this
   * instead of `synthSite(config, seed)`. The document frame should match
   * `descriptor.frame` so corridors sit on the mesh. */
  descriptor?: BurgSiteDescriptor;
}

export function defaultStreetSettings(): StreetSettings {
  return { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
}

export function resolveStreetSettings(settings: GenerationSettings): StreetSettings {
  return { ...defaultStreetSettings(), ...settings.streets };
}

/** A random internal seed for one town; completed evolution maps retain it for replay. */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

export function defaultGenerationSettings(): GenerationSettings {
  return { config: structuredClone(DEFAULT_SITE_CONFIG), streets: defaultStreetSettings() };
}

/** `gc:road-*` groups that leave the built-up area. Intramural streets run
 * gate → plaza (one end near the origin) and are ignored. Cape land may never
 * reach the window edge, so "outward from the town" is the test, not the frame. */
export function countExternalApproachRoads(document: CityDocument): number {
  if (document.importedRoadCount !== undefined)
    return document.featureGroups.filter(g => g.kind === "road" && !g.locked && g.sourceRoad && g.segments.length)
      .length;
  const cellSize = Math.max(1, document.frame.blockSizeMeters);
  const core = document.frame.cityRadiusMeters * 0.25;
  let count = 0;
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || group.locked || !group.id.startsWith(`${GEN_PREFIX}road-`)) continue;
    const ids = featureGroupVertices(document, group);
    if (ids.length < 2) continue;
    const start = document.mesh.vertices[ids[0]]?.point;
    const end = document.mesh.vertices[ids.at(-1)!]?.point;
    if (!start || !end) continue;
    const near = Math.min(Math.hypot(start[0], start[1]), Math.hypot(end[0], end[1]));
    const far = Math.max(Math.hypot(start[0], start[1]), Math.hypot(end[0], end[1]));
    if (near >= core && far >= near + cellSize * 0.5) count++;
  }
  return count;
}

/** Standalone random cities must keep the size's minimum; an FMG descriptor
 * already carries the world's own road count. */
function requiredExternalRoads(settings: GenerationSettings, extentMeters: number): number {
  return settings.descriptor ? 0 : minExternalRoadsForExtent(extentMeters);
}

/** A fresh coherent random coast / rivers / relief / feature combination. */
export function randomGeography(): SiteConfig {
  return randomSiteConfig(makeRng(randomSeed()));
}

/** Rebuild `config.rivers` for a plain "how many rivers" control: the first one
 * reaches the coast when there is one, the rest are pronounced meanders. */
export function riversForCount(config: SiteConfig, count: number): SiteConfig["rivers"] {
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    config.coast !== "none" && index === 0 ? "toCoast" : "meander"
  );
}

// --- main ---------------------------------------------------------------------

/** Everything `runPlan` needs, derived once from the document + the deliberate
 * inputs. Shared by `generateStageOnDocument` and `generateUrbanPatchStep` so
 * both read the exact same geography for a given `(document, settings, seed)`. */
function prepareRun(document: CityDocument, settings: GenerationSettings, seed: string) {
  const frame = document.frame;
  const half = frame.extentMeters / 2;
  const cellSize = Math.max(1, frame.blockSizeMeters);
  const descriptor =
    settings.descriptor ??
    synthSite(NOMINAL_PRESET, settings.config, seed, {
      extentMeters: frame.extentMeters,
      cityRadiusMeters: frame.cityRadiusMeters
    });
  const geo = siteToGeography(descriptor, !!settings.descriptor);
  const baseProgram = siteToProgram(descriptor);
  const program: CityProgram = {
    ...baseProgram,
    wallPlan: resolveWallPlan(baseProgram.wallPlan ?? DEFAULT_WALL_PLAN, settings.config.wall)
  };
  const params: CityParams = {
    seed,
    extentMeters: frame.extentMeters,
    cityRadiusMeters: settings.descriptor?.frame.cityRadiusMeters ?? frame.cityRadiusMeters,
    dwellings: descriptor.burg.dwellings,
    cellSizeMeters: cellSize,
    lloydPasses: 1,
    urbanNPatches: settings.urbanNPatches
  };
  const { cells, faceIdOf } = cellsFromMesh(document.mesh, half);
  return { cells, faceIdOf, geo, program, params, half, cellSize };
}

/**
 * Recompute the plan up to `stageStep` on `document`'s own mesh and return a new
 * document with the result written in. Stages ①–③ leave the mesh topology
 * untouched. From ④, vertices where a road meets a wall or river may be merged
 * or split so the meeting becomes a 4-way gate/bridge (opposite edges); river,
 * road and wall still never share an edge. `null` if the result fails validation.
 * Deterministic in `(document, settings, seed, stageStep)`.
 */
export function generateStageOnDocument(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stageStep: number,
  onRejected?: GenerationDebugObserver,
  wallCheckpoint?: "walls" | "riverPassages" | "passages",
  observer?: GenerationObserver
): CityDocument | null {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) {
    const sample = reportGenerationFailure(
      observer,
      1,
      "prepare",
      "too-few-faces",
      `格子の面が3未満 (${faces.length})`,
      {
        faces: faces.length,
        stageStep
      }
    );
    if (onRejected) onRejected(captureGenerationDebugPreview(document, sample, seed));
    return null;
  }

  if (stageStep >= 7) {
    const full =
      generateCityAttempt(document, settings, seed, observer, 1, onRejected) ??
      (onRejected ? null : generateCityOnDocument(document, settings, seed, observer));
    if (!full) return null;
    if (stageStep === 7) {
      const res = clone(full);
      delete res.appearance;
      delete res.fabric;
      syncDocumentCemeteries(res);
      res.generationSeed = full.generationSeed ?? seed;
      return res;
    }
    if (stageStep === 8) {
      const res = clone(full);
      syncDocumentCemeteries(res);
      res.generationSeed = full.generationSeed ?? seed;
      return res;
    }
    return full;
  }

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(
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
    stageStep,
    false,
    observer,
    1,
    true,
    document.gridKind,
    document
  );
  if (plan.castleFailure && (onRejected || observer) && !wallCheckpoint) {
    const sample = reportGenerationFailure(
      observer,
      1,
      "castle",
      plan.castleFailure,
      "指定した城の配置条件を満たす場所がありません"
    );
    onRejected?.(captureGenerationDebugPreview(planningDebugDocument(document, faceIdOf, plan, program), sample, seed));
    return null;
  }
  const res = applyPlan(
    document,
    cells,
    faceIdOf,
    plan,
    program,
    stageStep,
    false,
    observer,
    1,
    onRejected ? (partial, sample) => onRejected(captureGenerationDebugPreview(partial, sample, seed)) : undefined,
    wallCheckpoint
  );
  if (res) {
    res.layout = resolveEffectiveLayout(settings.layout ?? settings.config?.layout, document.frame.extentMeters, seed);
    res.generationSeed = seed;
    if (stageStep >= 5) tagExternalGateRoads(res, seed, settings.descriptor);
    if (stageStep >= 6) cultivateRoadside(res);
    if (stageStep >= 6) spawnHarborShips(res, seed);
  }
  return res;
}

/** Junction / approach-road retries for a complete town. Enough to keep Small /
 * Medium / Large cities on at least two external roads, and Tiny maps on one. */
export const COMPLETE_CITY_ATTEMPTS = 8;

/** Complete an editable town on the current grid, including intramural streets
 * and geometric finishing. The diagnostic stages omit smoothing but prepare valid gate junctions. */
export function generateCityOnDocument(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  observer?: GenerationObserver,
  onRejected?: GenerationDebugObserver
): CityDocument | null {
  // Some coast/river layouts cannot form valid crossings, or enough external
  // approach roads, on this grid. Try another deterministic layout with the
  // same requested settings, always starting from the untouched input rather
  // than accumulating failed merges.
  const failures: GenerationSample[] = [];
  const observe: GenerationObserver = sample => {
    if (sample.failure) failures.push(sample);
    observer?.(sample);
  };
  // Debug previews stop at the first rejection, keeping the requested seed.
  for (let attempt = 0; attempt < COMPLETE_CITY_ATTEMPTS; attempt++) {
    const attemptSeed = attempt ? `${seed}:junction-retry:${attempt}` : seed;
    const result = generateCityAttempt(document, settings, attemptSeed, observe, attempt + 1, onRejected);
    if (result) {
      result.historicalPeriod =
        settings.historicalPeriod ??
        settings.descriptor?.historicalPeriod ??
        document.historicalPeriod ??
        "ageOfExploration";
      result.generationSeed = attemptSeed;
      if (result.fabric) {
        const input = clone(document);
        delete input.fabric;
        result.fabric.generation = {
          algorithm: settings.legacyCastles ? "evolution-city-v3" : "castle-city-v1",
          seed: attemptSeed,
          settings: {
            ...structuredClone(settings),
            layout: result.layout,
            walledAreaShare: resolveWalledAreaShare(settings.walledAreaShare, document.frame.extentMeters)
          },
          input
        };
      }
      return result;
    }
    if (onRejected) return null;
  }
  observe({
    phase: "complete",
    elapsedMs: 0,
    attempt: COMPLETE_CITY_ATTEMPTS,
    counts: { attempts: COMPLETE_CITY_ATTEMPTS, rejected: failures.length },
    failure: {
      reason: "all-attempts-rejected",
      message: `${COMPLETE_CITY_ATTEMPTS}案すべてが不採用になった`,
      details: failures.map(
        sample => `案${sample.attempt}: ${sample.failure?.message ?? sample.phase}（${sample.phase}）`
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

export function generateCityAttempt(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  observer?: GenerationObserver,
  attempt = 1,
  onRejected?: GenerationDebugObserver
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
  const faceCount = Object.keys(document.mesh.faces).length;
  if (faceCount < 3) return reject("prepare", "too-few-faces", `格子の面が3未満 (${faceCount})`, { faces: faceCount });
  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  mark("prepare", { faces: cells.length, edges: Object.keys(document.mesh.edges).length });
  const plan = runPlan(
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
  );
  mark("plan-total");
  debugDocument = () => planningDebugDocument(document, faceIdOf, plan, program);
  if (plan.castleFailure) return reject("castle", plan.castleFailure, "指定した城の配置条件を満たす場所がありません");
  // Do not save a nominally successful town when imported water has consumed
  // its centre. Measure the flood-fill settlement, not the walled core — wall
  // capacity (Medium 45% / Large 20%) is a later split of the same fill.
  const activeCells = plan.cells ?? cells;
  const activeFaceIdOf = plan.faceIdOf ?? faceIdOf;
  const targetArea = Math.PI * params.cityRadiusMeters ** 2;
  const areaShare =
    settings.urbanCoreMode === "compact" && program.walls
      ? resolveWalledAreaShare(settings.walledAreaShare, params.extentMeters)
      : 1;
  const minimumUrbanArea = targetArea * areaShare * MIN_SETTLEMENT_AREA_SHARE;
  const settlementArea = activeCells
    .filter(cell => plan.builtUp.has(cell.id))
    .reduce((sum, cell) => sum + Math.abs(polygonArea(cell.polygon)), 0);
  if (settlementArea < minimumUrbanArea) {
    const walledShare = program.walls ? resolveWalledAreaShare(settings.walledAreaShare, params.extentMeters) : 1;
    const walledArea = activeCells
      .filter(cell => plan.urban.has(cell.id))
      .reduce((sum, cell) => sum + Math.abs(polygonArea(cell.polygon)), 0);
    const floorPercent = Math.round(MIN_SETTLEMENT_AREA_SHARE * 100);
    const sharePercent = Math.round(walledShare * 100);
    return reject(
      "urban",
      "urban-area-too-small",
      `市街地面積 ${Math.round(settlementArea)} m² が最低 ${Math.round(minimumUrbanArea)} m²（目標πR²の${floorPercent}%）に届かない`,
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
        `市街地下限 ${floorPercent}% は城壁シェアとは別（海に中心を食われた都市の下限）`,
        `城壁内シェア ${sharePercent}%（Walls ${program.walls ? "on" : "off"}）→ 城壁内 ${Math.round(walledArea)} m²`
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
  const effectiveLayout = resolveEffectiveLayout(settings.layout ?? settings.config?.layout, params.extentMeters, seed);
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
  const next = applyPlan(
    document,
    activeCells,
    activeFaceIdOf,
    { ...plan, layout: effectiveLayout, wards, streets, roads: [...roads, ...streets] },
    program,
    6,
    true,
    observer,
    attempt,
    onRejected ? (partial, sample) => onRejected(captureGenerationDebugPreview(partial, sample, seed)) : undefined
  );
  mark("apply-total");
  if (!next) return null;
  debugDocument = () => next;
  const minRoads = requiredExternalRoads(settings, document.frame.extentMeters);
  const roadsBeforeFinish = countExternalApproachRoads(next);
  if (minRoads > 0 && roadsBeforeFinish < minRoads)
    return reject(
      "street-plan",
      "too-few-external-roads",
      `仕上げ前の外縁道路が ${roadsBeforeFinish} 本で、最低 ${minRoads} 本に届かない`,
      { roads: roadsBeforeFinish, minRoads, gates: townGates(next).length }
    );
  next.appearance = "town";
  const coarse = document.gridKind === "evolution";
  const hexagonal = !coarse && isHexagonalDocument(document);
  const routed = coarse ? shortcutMajorRoads(next) : next;
  mark("major-road-shortcuts");
  const rectified = hexagonal ? rectifyHexBlocks(routed, seed) : routed;
  mark("rectify-hex");
  const finished = resolveStreetSettings(settings).foldSmoothing ? finishCityGeometry(rectified) : rectified;
  mark("finish-geometry");
  // Square each bridge immediately after smoothing, before block rectification
  // pins the road vertices. The crossing stays on the river; its two road
  // neighbours slide onto the normal so the span is the short perpendicular.
  const squared = straightenBridges(finished);
  const shaped = hexagonal || coarse ? squared : rectifyVoronoiBlocks(squared, seed, rectified);
  mark("rectify-voronoi");
  const allowedRiverIds = new Set(
    plan.rivers.flatMap((river, index) => (river.bridgeAllowed ? [`${GEN_PREFIX}river-${index}`] : []))
  );
  const connected = coarse ? connectUrbanRiverDistricts(shaped, allowedRiverIds) : shaped;
  const settled = straightenGateCrossings(straightenBridges(connected));
  debugDocument = () => settled;
  settleTempleOnDocument(settled);
  if (settled.castles?.length && !finalizeCastles(settled, false))
    return reject("castle", "castle-layout-too-small", "仕上げ後の城郭形状が成立しません");
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
        "仕上げ後の道路が門の橋以外で外堀に重なります",
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
        "FMGから与えられた街道の接続をすべて確保できません",
        { expected: geo.importedRoads.length, actual: sourceRoads.length },
        missing.map(road => `source road ${road.sourceIndex}: route ${road.routeId}`)
      );
  }
  const roadsAfterFinish = countExternalApproachRoads(settled);
  const crossingDetails = explainGeneratedCrossingFailures(settled);
  const tangled = coarse
    ? Object.values(settled.mesh.faces)
        .filter(f => !isSimplePolygon(facePoints(settled.mesh, f)))
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
      `門・橋の交差が不正（${crossingDetails.length}件）`,
      { issues: crossingDetails.length, gates: townGates(settled).length, roads: roadsAfterFinish },
      crossingDetails.slice(0, 20)
    );
  if (minRoads > 0 && roadsAfterFinish < minRoads)
    return reject(
      "crossing-validation",
      "too-few-external-roads",
      `仕上げ後の外縁道路が ${roadsAfterFinish} 本で、最低 ${minRoads} 本に届かない`,
      { roads: roadsAfterFinish, minRoads, gates: townGates(settled).length }
    );
  if (tangled.length)
    return reject(
      "crossing-validation",
      "self-intersecting-faces",
      `evolution格子に自己交差する街区が ${tangled.length} 面ある`,
      { faces: tangled.length },
      tangled.slice(0, 12)
    );
  settled.layout = effectiveLayout;
  settled.buildingPattern = buildingPattern;
  settled.historicalPeriod =
    settings.historicalPeriod ??
    settings.descriptor?.historicalPeriod ??
    document.historicalPeriod ??
    "ageOfExploration";
  if (coarse) settled.fabric = createFabricPlan(settled, seed);
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
  tagExternalGateRoads(settled, seed, settings.descriptor);
  cultivateRoadside(settled);
  syncDocumentCemeteries(settled);
  refreshCemeteryLayouts(settled);
  if (settings.descriptor) fitImportedHousing(settled, settings.descriptor.burg.dwellings);
  spawnHarborShips(settled, seed);
  return settled;
}

/** One ③ urban-core flood-fill iteration, as shown on the document's mesh. */
export interface UrbanPatchStep {
  /** The document with only THIS step's cumulative cells marked buildable — null
   * if the mesh is unusable or the result fails validation. */
  document: CityDocument | null;
  /** Total flood-fill iterations for this `(document, settings, seed)` (0 when
   * there is no eligible land at all). */
  total: number;
  /** The step actually shown, clamped to `[0, total - 1]` (-1 when `total` is 0). */
  index: number;
  /** The cell id admitted to the urban core at this step, or null. */
  cellId: number | null;
}

/**
 * Step through the ③ urban-core flood-fill one admitted cell at a time, directly
 * on the document's existing (Voronoi-filled) mesh — the debug tool for tuning
 * the S3 cost function / `settings.urbanNPatches` by eye, one loop iteration at a
 * time (docs/city-generator/towngen-comparison.md §2.1). `stepIndex` is clamped
 * into range; outskirts are not shown mid-fill (they are a final, downstream
 * ribbon — press ③ once patching is done to see them).
 */
export function generateUrbanPatchStep(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stepIndex: number
): UrbanPatchStep {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) return { document: null, total: 0, index: -1, cellId: null };

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(
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
    3,
    false,
    undefined,
    1,
    false,
    document.gridKind,
    document
  );
  const total = plan.urbanStages.length;
  if (total === 0) {
    return { document: applyPlan(document, cells, faceIdOf, plan, program, 3), total: 0, index: -1, cellId: null };
  }
  const index = Math.max(0, Math.min(stepIndex, total - 1));
  const stage = plan.urbanStages[index];
  const stepped: Plan = {
    ...plan,
    mesh: undefined,
    faceIdOf: undefined,
    cells: undefined,
    urban: new Set(plan.urbanStages.slice(0, index + 1).map(s => s.cellId)),
    outskirts: new Set()
  };
  return {
    document: applyPlan(document, cells, faceIdOf, stepped, program, 3),
    total,
    index,
    cellId: stage.cellId
  };
}

/**
 * One ◀/▶ scrub step for one of the other five processes (①②④⑤⑥). Mirrors
 * `UrbanPatchStep`'s shape but stays generic, since "one loop iteration" means
 * something different in each: a walked graph vertex (①/②), a placed gate (④),
 * a routed road (⑤), an assigned cell (⑥). See
 * docs/city-generator/towngen-comparison.md.
 */
export interface GenerationStepResult {
  /** The document with only this step's cumulative result shown — null if the
   * mesh is unusable or the result fails validation. */
  document: CityDocument | null;
  /** Total iterations for this `(document, settings, seed)` (0 = nothing to
   * step through, e.g. no coastline configured, or Walls is off for ④). */
  total: number;
  /** The step actually shown, clamped to `[0, total - 1]` (-1 when `total` is 0). */
  index: number;
  /** A short label for what this step is (e.g. "vertex 4/12", "gate 2/5"), or
   * null when `total` is 0. */
  detail: string | null;
  /** Raw graph-walk polylines to draw as an overlay (① a single shoreline, ②
   * one per configured river) — omitted for ④⑤⑥, whose partial result is
   * already visible on `document` itself (gates / roads / ward colours). */
  overlayPaths?: Point[][];
}

/**
 * Step through the ① coastline walk one graph vertex at a time. `shoreline` IS
 * the walk in walked order (design §4.2) — the exact mechanism behind the
 * "gatagata" outline complaint in towngen-comparison.md §2.3/2.4, visible here
 * before any smoothing or polygon-closing. `document` never shows a partial
 * sea while scrubbing (there is no meaningful "sea so far" mid-walk) — press
 * ① itself for the classified result.
 */
export function generateCoastWalkStep(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stepIndex: number
): GenerationStepResult {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) return { document: null, total: 0, index: -1, detail: null, overlayPaths: [] };

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(
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
    1,
    false,
    undefined,
    1,
    true,
    document.gridKind,
    document
  );
  const shownDoc = applyPlan(document, cells, faceIdOf, { ...plan, sea: new Set() }, program, 1);
  const total = plan.coastPath.length;
  if (total === 0) return { document: shownDoc, total: 0, index: -1, detail: null, overlayPaths: [] };
  const index = Math.max(0, Math.min(stepIndex, total - 1));
  return {
    document: shownDoc,
    total,
    index,
    detail: `vertex ${index + 1}/${total}`,
    overlayPaths: [plan.coastPath.slice(0, index + 1)]
  };
}

/**
 * Step through the ② river walk(s) one graph vertex at a time, same idea as
 * `generateCoastWalkStep`. A corridor can carry more than one river: steps run
 * through them in configured order, one river's walk completing before the
 * next begins. No partial river feature group is drawn while scrubbing —
 * press ② itself for the smoothed, classified result.
 */
export function generateRiverWalkStep(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stepIndex: number
): GenerationStepResult {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) return { document: null, total: 0, index: -1, detail: null, overlayPaths: [] };

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(
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
    2,
    false,
    undefined,
    1,
    true,
    document.gridKind,
    document
  );
  const shownDoc = applyPlan(document, cells, faceIdOf, { ...plan, rivers: [] }, program, 2);
  const lengths = plan.rivers.map(r => r.edgePoints.length);
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (total === 0) return { document: shownDoc, total: 0, index: -1, detail: null, overlayPaths: [] };
  const index = Math.max(0, Math.min(stepIndex, total - 1));

  // Which river this step falls in, and how far into its walk.
  let remaining = index;
  let riverIndex = 0;
  while (riverIndex < lengths.length - 1 && remaining >= lengths[riverIndex]) {
    remaining -= lengths[riverIndex];
    riverIndex++;
  }
  const overlayPaths = plan.rivers.map((r, i) =>
    i < riverIndex ? r.edgePoints : i === riverIndex ? r.edgePoints.slice(0, remaining + 1) : []
  );
  const riverTag = plan.rivers.length > 1 ? `river ${riverIndex + 1} · ` : "";
  return {
    document: shownDoc,
    total,
    index,
    detail: `${riverTag}vertex ${remaining + 1}/${lengths[riverIndex]}`,
    overlayPaths
  };
}

/**
 * Step through ④'s gate placement one gate at a time, in the same
 * bearing-match greedy order `placeGates` runs in (towngen-comparison.md
 * §2.2). The wall outline, plaza and citadel are single atomic picks, not a
 * loop — they stay fully drawn as context throughout; only the gates
 * accumulate. Like the ④ stage button itself, a gate only renders once it
 * sits on a drawn wall, so this needs the Walls feature on to show anything.
 */
export function generateGateStep(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stepIndex: number
): GenerationStepResult {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) return { document: null, total: 0, index: -1, detail: null };

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(
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
    4,
    false,
    undefined,
    1,
    true,
    document.gridKind,
    document
  );
  const total = plan.gates.length;
  if (total === 0) {
    return { document: applyPlan(document, cells, faceIdOf, plan, program, 4), total: 0, index: -1, detail: null };
  }
  const index = Math.max(0, Math.min(stepIndex, total - 1));
  const stepped: Plan = { ...plan, gates: plan.gates.slice(0, index + 1) };
  return {
    document: applyPlan(document, cells, faceIdOf, stepped, program, 4),
    total,
    index,
    detail: `gate ${index + 1}/${total}`
  };
}

/** Step through ⑤'s approach roads one gate's road at a time, in the same
 * per-gate order `buildStreets` routes them in. */
export function generateRoadStep(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stepIndex: number
): GenerationStepResult {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) return { document: null, total: 0, index: -1, detail: null };

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(
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
    5,
    false,
    undefined,
    1,
    true,
    document.gridKind,
    document
  );
  const total = plan.roads.length;
  if (total === 0) {
    return { document: applyPlan(document, cells, faceIdOf, plan, program, 5), total: 0, index: -1, detail: null };
  }
  const index = Math.max(0, Math.min(stepIndex, total - 1));
  const stepped: Plan = { ...plan, roads: plan.roads.slice(0, index + 1) };
  return {
    document: applyPlan(document, cells, faceIdOf, stepped, program, 5),
    total,
    index,
    detail: `road ${index + 1}/${total}`
  };
}

let wardStepCache: {
  key: string;
  document: CityDocument | null;
  order: WardAssignment[];
  stepOfFace: Map<Id, number>;
} | null = null;

/**
 * Step through ⑥'s district assignment one cell at a time, in
 * `assignWards`'s actual decision order (harbour → temple → gate wards → the
 * shuffled mix loop → outer gate wards → outskirts → shanty) rather than
 * sorted by cell id. Reserved precincts (plaza / citadel / temple / harbour)
 * are single atomic picks made before the per-cell loop, so — like ④'s wall
 * and gates — they stay fully drawn as context throughout.
 */
export function generateWardStep(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stepIndex: number
): GenerationStepResult {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) return { document: null, total: 0, index: -1, detail: null };

  // Scrubbing wards changes only their visibility. Keep the repaired road
  // topology fixed instead of rebuilding gates and splitting cells per click.
  // A content key also invalidates this bounded cache after in-place edits.
  const key = JSON.stringify([document, settings, seed]);
  if (wardStepCache?.key !== key) {
    const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
    const plan = runPlan(
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
      false,
      undefined,
      1,
      true,
      document.gridKind,
      document
    );
    const result = applyPlan(document, cells, faceIdOf, plan, program, 6);
    const activeCells = plan.cells ?? cells;
    const activeIds = plan.faceIdOf ?? faceIdOf;
    const stepOfCell = new Map(plan.wardOrder.map((ward, index) => [ward.cellId, index]));
    const cellOfFace = new Map(activeIds.map((id, index) => [id, index]));
    const stepOfFace = new Map<Id, number>();
    for (const face of Object.values(result?.mesh.faces ?? {})) {
      let cellId = cellOfFace.get(face.id);
      if (cellId === undefined && result) {
        const center = polygonCentroid(facePoints(result.mesh, face));
        cellId = activeCells.find(cell => pointInPolygon(center, cell.polygon))?.id;
      }
      const step = cellId === undefined ? undefined : stepOfCell.get(cellId);
      if (step !== undefined) stepOfFace.set(face.id, step);
    }
    wardStepCache = { key, document: result, order: plan.wardOrder, stepOfFace };
  }
  const { order, stepOfFace } = wardStepCache;
  const total = order.length;
  const index = total ? Math.max(0, Math.min(stepIndex, total - 1)) : -1;
  const result = wardStepCache.document ? clone(wardStepCache.document) : null;
  if (result && total) {
    for (const face of Object.values(result.mesh.faces)) {
      if (!face.properties.locked && (stepOfFace.get(face.id) ?? Infinity) > index) face.properties.ward = null;
    }
  }
  const last = order[index];
  return {
    document: result,
    total,
    index,
    detail: last ? `${last.kind} · cell #${last.cellId} — ${index + 1}/${total}` : null
  };
}

// --- classifier chain (a trimmed pipeline.ts, no mesh-mutating steps) ---------

interface Plan {
  urbanCoreMode?: "legacy" | "compact";
  layout?: "organic" | "circulade" | "bram" | "classic";
  sea: Set<number>;
  ocean: Set<number>;
  /** S1's raw graph walk (upstream → downstream), before it is closed into
   * `sea`'s water polygon. Empty before S1 runs. See `generateCoastWalkStep`. */
  coastPath: Point[];
  /** Closed water polygon from S1, or null when landlocked. Used by the G2
   * plausibility filter in `applyPlan` (wet wall edges) and tests. */
  waterPolygon: Point[] | null;
  channelPolygons?: Point[][];
  /** Resolved `settings.streets.avoidSea` so `applyPlan` can drop wet walls
   * without taking the whole settings object. */
  avoidSea: boolean;
  rivers: RoutedRiver[];
  urban: Set<number>;
  outskirts: Set<number>;
  /** S3 flood-fill before the wall-capacity split. The settlement-area floor
   * is measured against this, not the walled core in `urban`. */
  builtUp: Set<number>;
  /** S3 flood-fill in fill order, one entry per cell admitted to `urban`. Empty
   * before S3 runs. See `UrbanPatchStep`. */
  urbanStages: UrbanStage[];
  borderLoops: MeshBorderLoop[];
  gates: Gate[];
  precincts: Precinct[];
  citadelOutline: Point[] | null;
  castleSite?: CastleSite | null;
  castleFailure?: string;
  moats?: GenerationSettings["moats"];
  legacyCastles?: boolean;
  roads: Point[][];
  roadPaths?: Point[][];
  importedRoads?: CityGeography["importedRoads"];
  streets: Point[][];
  wards: Map<number, WardKind>;
  /** `wards`' source data, in decision order rather than sorted by cell id. Empty
   * before S6 runs. See `generateWardStep`. */
  wardOrder: WardAssignment[];
  templeHarbor: Precinct[];
  mesh?: Mesh;
  faceIdOf?: string[];
  cells?: Cell[];
}

/** An urban-component outline: the exact mesh edges (for a Wall group) and their
 * vertex coordinates (for the generator's BorderLoop shape). */
interface MeshBorderLoop {
  segments: EdgeRef[];
  points: Point[];
  cellIds: number[];
}

/** Keep continuous water even when no coarse face is wholly wet.
 * Only wholly covered cells become water; partial cells use the exact reservation. */
function applyWideChannels(
  cells: Cell[],
  channels: NonNullable<CityGeography["channels"]>,
  sea: Set<number>
): NonNullable<CityGeography["channels"]> {
  if (!channels.length || !cells.length) return [];
  const applied: NonNullable<CityGeography["channels"]> = [];
  for (const channel of channels) {
    const wet = cells.filter(cell => pointInPolygon(cell.centroid, channel.polygon));
    for (const cell of wet) if (cellInsideWater(cell.polygon, channel.polygon)) sea.add(cell.id);
    applied.push(channel);
  }
  return applied;
}

/** Keep the dry piece nearest the burg when a road crosses a wide channel.
 * The longest dry piece is often the far bank, which is not part of the town. */
function keepCitySide(lines: Point[][], polygon: Point[]): Point[][] {
  const out: Point[][] = [];
  for (const line of lines) {
    const runs = dryRuns(line, [polygon]);
    if (!runs.length) continue;
    let best = runs[0];
    let bestD = Number.POSITIVE_INFINITY;
    for (const run of runs) {
      let d = Number.POSITIVE_INFINITY;
      for (const p of run) d = Math.min(d, p[0] * p[0] + p[1] * p[1]);
      if (d < bestD) {
        best = run;
        bestD = d;
      }
    }
    if (best.length >= 2) out.push(best);
  }
  return out;
}

export function runPlan(
  mesh: Mesh,
  faceIdOf: string[],
  cells: Cell[],
  geo: CityGeography,
  program: CityProgram,
  params: CityParams,
  seed: string,
  half: number,
  cellSize: number,
  settings: GenerationSettings,
  stageStep: number,
  complete = false,
  observer?: GenerationObserver,
  attempt = 1,
  _resolveRiverSplit = true,
  gridKind?: "hex" | "voronoi" | "evolution",
  sourceDocument?: CityDocument
): Plan {
  const mark = generationTimer(observer, attempt);
  const streetOpts = resolveStreetSettings(settings);
  const effectiveLayout = resolveEffectiveLayout(settings.layout ?? settings.config?.layout, params.extentMeters, seed);
  const empty: Plan = {
    urbanCoreMode: settings.urbanCoreMode,
    moats: settings.moats,
    legacyCastles: settings.legacyCastles,
    layout: effectiveLayout,
    sea: new Set(),
    ocean: new Set(),
    coastPath: [],
    waterPolygon: null,
    avoidSea: streetOpts.avoidSea,
    importedRoads: geo.importedRoads,
    rivers: [],
    urban: new Set(),
    outskirts: new Set(),
    builtUp: new Set(),
    urbanStages: [],
    borderLoops: [],
    gates: [],
    precincts: [],
    citadelOutline: null,
    roads: [],
    streets: [],
    wards: new Map(),
    wardOrder: [],
    templeHarbor: []
  };
  if (!cells.length) return empty;
  const graph = buildEdgeGraph(cells);
  if (!graph.points.length) return empty;
  mark("edge-graph");

  // S1 — coast. `coast.shoreline` is the raw graph walk in walked order — the
  // ① per-loop scrub in `generateCoastWalkStep` steps through it directly, no
  // separate instrumentation needed (unlike S3's flood-fill, a walk's own
  // return value already IS its step sequence).
  const waterInputs =
    geo.waterAreas && geo.waterAreas.length > 0
      ? geo.waterAreas
      : geo.coast
        ? [{ ...geo.coast, kind: "ocean" as const }]
        : [];
  const originCell = cells.reduce((best, cell) =>
    cell.centroid[0] ** 2 + cell.centroid[1] ** 2 < best.centroid[0] ** 2 + best.centroid[1] ** 2 ? cell : best
  );
  const wetsOrigin = (result: CoastResult | null): boolean =>
    !!result && (pointInPolygon([0, 0], result.waterPolygon) || result.sea.has(originCell.id));
  const classified = waterInputs.map((water, i) => {
    const coast = classifyCoast(
      graph,
      water.corridor,
      water.waterAzimuthDeg,
      cells,
      half,
      cellSize,
      makeRng(`${seed}:water:${i}`)
    );
    if (!wetsOrigin(coast)) return { kind: water.kind, coast };
    // The closure picked the side that contains the burg. Take the other side
    // when that leaves the map origin dry; otherwise drop the surface.
    const flipped = classifyCoast(
      graph,
      water.corridor,
      (water.waterAzimuthDeg + 180) % 360,
      cells,
      half,
      cellSize,
      makeRng(`${seed}:water:${i}:flip`)
    );
    return { kind: water.kind, coast: flipped && !wetsOrigin(flipped) ? flipped : null };
  });
  const coasts = classified.flatMap(item => (item.coast ? [item.coast] : []));
  let coast: CoastResult | null = coasts[0] ?? null;
  let coastPath = coast?.shoreline ?? [];
  let waterPolygon = coast?.waterPolygon ?? null;
  const sea = new Set<number>(coasts.flatMap(c => [...c.sea]));
  const ocean = new Set<number>(
    classified.flatMap(item => (item.kind === "ocean" && item.coast ? [...item.coast.sea] : []))
  );
  // Channel polygons remain authoritative; coarse cells only classify wholly wet land.
  const appliedChannels = applyWideChannels(cells, geo.channels ?? [], sea);
  if (!coast && appliedChannels[0]) {
    coast = {
      sea: new Set<number>(),
      shoreline: appliedChannels[0].shoreline,
      waterPolygon: appliedChannels[0].polygon
    };
    coastPath = appliedChannels[0].shoreline;
    waterPolygon = appliedChannels[0].polygon;
  }
  empty.channelPolygons = appliedChannels.map(channel => channel.polygon);
  mark("coast");
  if (stageStep < 2) return { ...empty, sea, ocean, coastPath, waterPolygon };

  // S2 — river along the cell-edge graph (no fold-back into the mesh).
  const seaVertices = new Set(cells.filter(cell => sea.has(cell.id)).flatMap(cell => cell.polygon.map(vertexKey)));
  // A coast walk can classify zero water cells (notably on cape layouts).
  // In that case its polygon is not a real river mouth: route edge to edge.
  const riverCoast = seaVertices.size ? coast : null;
  const outsideRiver =
    (settings.riverPlacement === "outside" || settings.riverPlacement === "outsideNear") &&
    geo.rivers.length === 1 &&
    program.walls;
  const compactCore = settings.urbanCoreMode === "compact";
  // River crossings still need the established inward curtain routing. Other
  // FMG towns already have a population-scaled radius and retain that core.
  const preserveImportedCore = !!settings.descriptor && geo.rivers.length === 0;
  const openCoastalCore = program.walls && program.wallPlan?.coast === "open" && sea.size > 0;
  const coreShare = program.walls ? resolveWalledAreaShare(settings.walledAreaShare, params.extentMeters) : 1;
  const urbanRadius = compactCore
    ? params.cityRadiusMeters * Math.sqrt(coreShare)
    : urbanDiskRadiusMeters(params.cityRadiusMeters, program.walls);
  const urbanBearings = program.port && geo.coast ? [...geo.roadBearings, geo.coast.waterAzimuthDeg] : geo.roadBearings;
  const plannedUrban = outsideRiver
    ? classifyUrban(
        cells,
        { sea, bank: new Map() },
        urbanBearings,
        urbanRadius,
        null,
        params.urbanNPatches ?? null,
        params.cellSizeMeters,
        !complete && stageStep === 3,
        settings.urbanCoreMode
      )
    : null;
  let plannedCore = plannedUrban ? splitUrbanCore(cells, plannedUrban.urban, compactCore ? 1 : coreShare).urban : null;
  // The burg is the map origin. Keep that dry cell in the curtain when it
  // already touches the core, and never peel it off afterwards.
  const burgCell = cells.find(cell => !sea.has(cell.id) && pointInPolygon([0, 0], cell.polygon)) ?? null;
  const retainBurg = (core: Set<number>): Set<number> => {
    if (!burgCell || core.has(burgCell.id)) return core;
    if (core.size > 0 && !burgCell.neighbors.some(id => core.has(id))) return core;
    const next = new Set(core);
    next.add(burgCell.id);
    return next;
  };
  // Evolution curtains are peeled inward unless the imported core is retained.
  // Route relative to that curtain rather than adding a river setback to the
  // unpeeled settlement.
  if (!preserveImportedCore && !openCoastalCore && !compactCore && plannedCore && effectiveLayout !== "bram") {
    const rings = evolutionWallInsetRings(
      sizePresetForExtent(params.extentMeters),
      seed,
      gridKind,
      program.walls,
      resolveWalledAreaShare(settings.walledAreaShare, params.extentMeters)
    );
    if (rings > 0) plannedCore = insetWalledCore(cells, retainBurg(plannedCore), rings, burgCell?.id).urban;
  }
  const plannedWallLoops = plannedCore
    ? componentBorderLoops(mesh, faceIdOf, plannedCore).map(loop => [...loop.points, loop.points[0]])
    : [];
  const riverGapCells = settings.riverPlacement === "outsideNear" ? 1.5 : 2;
  const rivers: RoutedRiver[] = [];
  const againstRiverFlow = new Set<string>();
  for (const [i, r] of geo.rivers.entries()) {
    let selected: RoutedRiver | null = null;
    let selectedError = Infinity;
    for (let routeAttempt = 0; routeAttempt < (outsideRiver ? 4 : 1); routeAttempt++) {
      let corridor = r.corridor;
      const routeBlocks = new Set(againstRiverFlow);
      const relaxedBlocks = new Set(againstRiverFlow);
      if (plannedCore && corridor.length >= 2) {
        const first = corridor[0];
        const last = corridor[corridor.length - 1];
        const length = Math.hypot(last[0] - first[0], last[1] - first[1]) || 1;
        const direction: Point = [(last[0] - first[0]) / length, (last[1] - first[1]) / length];
        const tangent: Point = routeAttempt < 2 ? direction : [-direction[1], direction[0]];
        const normal: Point = [-tangent[1], tangent[0]];
        const wallPoints = cells.filter(cell => plannedCore.has(cell.id)).flatMap(cell => cell.polygon);
        const candidates = [1, -1].map(sign => {
          const n: Point = [normal[0] * sign, normal[1] * sign];
          const support = Math.max(0, ...wallPoints.map(p => p[0] * n[0] + p[1] * n[1]));
          const offset = support + cellSize * riverGapCells;
          const dry = cells.filter(
            cell => !sea.has(cell.id) && Math.abs(cell.centroid[0] * n[0] + cell.centroid[1] * n[1] - offset) < cellSize
          ).length;
          return { n, support, offset, dry };
        });
        const side = candidates.sort((a, b) => b.dry - a.dry)[routeAttempt % 2];
        const origin: Point = [side.n[0] * side.offset, side.n[1] * side.offset];
        let low = -Infinity;
        let high = Infinity;
        for (const axis of [0, 1]) {
          if (Math.abs(tangent[axis]) < 1e-8) continue;
          const limits = [(-half - origin[axis]) / tangent[axis], (half - origin[axis]) / tangent[axis]];
          low = Math.max(low, Math.min(...limits));
          high = Math.min(high, Math.max(...limits));
        }
        corridor = Array.from({ length: 33 }, (_, index) => low + ((high - low) * index) / 32).map(
          distance => [tangent[0] * distance + origin[0], tangent[1] * distance + origin[1]] as Point
        );
        if (riverCoast?.waterPolygon && pointInPolygon(corridor[0], riverCoast.waterPolygon)) corridor.reverse();
        const wallLoops = componentBorderLoops(mesh, faceIdOf, plannedCore).map(loop => [
          ...loop.points,
          loop.points[0]
        ]);
        const clearance = (p: Point): number =>
          wallLoops.some(loop => pointInPolygon(p, loop))
            ? 0
            : Math.min(...wallLoops.map(loop => nearestOnPolyline(p, loop).dist));
        // Protect the actual curtain. A half-plane exclusion also blocked dry
        // routes back to the frame on coarse grids, even far from the wall.
        for (const [from, edges] of graph.adjacency.entries()) {
          for (const edge of edges) {
            const a = graph.points[from];
            const b = graph.points[edge.to];
            const distance = Math.min(clearance(a), clearance(b), clearance([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
            if (distance < cellSize) routeBlocks.add(graphEdgeKey(a, b));
            if (distance < cellSize * 0.5) relaxedBlocks.add(graphEdgeKey(a, b));
          }
        }
      }
      const routingCoast =
        outsideRiver &&
        riverCoast?.waterPolygon &&
        !corridor.some(point => pointInPolygon(point, riverCoast.waterPolygon!))
          ? null
          : riverCoast;
      let band = walkRiver(
        graph,
        corridor,
        r.widths,
        routingCoast?.waterPolygon ?? null,
        routingCoast?.shoreline ?? null,
        cellSize,
        half,
        makeRng(`${seed}:river:${i}`),
        r.bridgeAllowed,
        seaVertices.size ? seaVertices : undefined,
        routeBlocks
      );
      for (let retry = 0; outsideRiver && band.fallback && retry < 8; retry++) {
        band = walkRiver(
          graph,
          corridor,
          r.widths,
          routingCoast?.waterPolygon ?? null,
          routingCoast?.shoreline ?? null,
          cellSize,
          half,
          makeRng(retry === 0 ? `${seed}:river:${i}` : `${seed}:river:${i}:outside:${retry}`),
          r.bridgeAllowed,
          seaVertices.size ? seaVertices : undefined,
          relaxedBlocks
        );
      }
      if (band.fallback || band.edgePoints.length < 2) continue;
      const distance = outsideRiver
        ? Math.min(
            ...plannedWallLoops.flatMap(loop => loop.map(point => nearestOnPolyline(point, band.smoothPoints).dist)),
            ...band.smoothPoints.flatMap(point => plannedWallLoops.map(loop => nearestOnPolyline(point, loop).dist))
          )
        : 0;
      const error = outsideRiver ? Math.abs(distance - riverGapCells * cellSize) : 0;
      if (error < selectedError) {
        selected = band;
        selectedError = error;
      }
      if (
        !outsideRiver ||
        (distance >= cellSize && distance <= cellSize * (settings.riverPlacement === "outsideNear" ? 2 : 3))
      )
        break;
    }
    if (!selected) continue;
    rivers.push(selected);
    for (let j = 1; j < selected.resolvedEdgePoints.length; j++)
      againstRiverFlow.add(graphEdgeKey(selected.resolvedEdgePoints[j], selected.resolvedEdgePoints[j - 1]));
  }
  const river = classifyRiver(
    cells,
    sea,
    rivers.map(band => ({ edgePoints: band.edgePoints }))
  );
  mark("river");
  if (stageStep < 3) return { ...empty, sea, ocean, coastPath, waterPolygon, rivers };

  // S3 — urban core. `params.urbanNPatches` (debug/tuning override) caps the
  // fill to a fixed cell count; otherwise accumulate actual area up to π R².
  // `urbanStages` records each admitted cell in fill order for
  // `generateUrbanPatchStep`'s per-loop scrub.
  const classification =
    plannedUrban ??
    classifyUrban(
      cells,
      { sea, bank: river.bank },
      urbanBearings,
      urbanRadius,
      null,
      params.urbanNPatches ?? null,
      params.cellSizeMeters,
      !complete && stageStep === 3,
      settings.urbanCoreMode
    );
  // City extent and wall capacity are independent. The outer residential
  // belt retains the rest of the same flood-fill, including its connectivity.
  // Grid evolution may then pull a tiny/small curtain in by one or two cells.
  const walledShare = program.walls ? resolveWalledAreaShare(settings.walledAreaShare, params.extentMeters) : 1;
  const split = splitUrbanCore(cells, classification.urban, compactCore ? 1 : walledShare);
  // An open curtain must meet the shore; a smaller wall capacity must not
  // leave a dry ring between the protected core and its natural boundary.
  const urban = openCoastalCore
    ? extendCoreToCoast(cells, plannedCore ?? split.urban, classification.urban, sea)
    : (plannedCore ?? split.urban);
  let residentialOutskirts = new Set([...classification.urban].filter(id => !urban.has(id)));
  const outskirts = new Set([...classification.outskirts, ...residentialOutskirts]);
  let urbanStages = classification.stages.filter(stage => urban.has(stage.cellId));
  const builtUp = classification.urban;
  mark("urban", { urbanFaces: urban.size, recordedStages: urbanStages.length, builtUpFaces: builtUp.size });

  let currentMesh = mesh;
  let currentFaceIdOf = faceIdOf;
  let currentCells = cells;
  let currentUrban = urban;
  let currentBuiltUp = builtUp;
  let currentOutskirts = outskirts;
  let meshModified = false;

  // Wall routing owns river conflicts. Planning must not subdivide every
  // river-side cell before a usable curtain route has been found.

  // Bram's spoke roads have to meet a curtain outside the 120 m core. A
  // one-cell peel on this coarse mesh drops that curtain onto the spoke and
  // leaves the gates unroutable, so Bram keeps the settlement-edge curtain.
  // Imports without bridgeable rivers keep the supplied disk rather than a random inset.
  const insetRings =
    preserveImportedCore || openCoastalCore || effectiveLayout === "bram" || outsideRiver
      ? 0
      : evolutionWallInsetRings(sizePresetForExtent(params.extentMeters), seed, gridKind, program.walls, walledShare);
  if (!compactCore && insetRings > 0 && currentUrban.size > 0) {
    const inset = insetWalledCore(currentCells, retainBurg(currentUrban), insetRings, burgCell?.id);
    if (inset.peeled.size) {
      currentUrban = inset.urban;
      for (const id of inset.peeled) {
        residentialOutskirts.add(id);
        currentOutskirts.add(id);
      }
      // Original cell IDs are retained throughout the wall plan.
      urbanStages = classification.stages.filter(stage => currentUrban.has(stage.cellId));
    }
  }
  // A channel can leave the flooded core on the far bank. The curtain belongs
  // around the burg; grow that core on the near bank instead of walling the
  // opposite shore.
  if (program.walls && burgCell && !currentUrban.has(burgCell.id) && effectiveLayout !== "bram") {
    const target = Math.max(currentUrban.size, 1);
    const byId = new Map(currentCells.map(cell => [cell.id, cell]));
    const grown = new Set<number>([burgCell.id]);
    const pending = [burgCell.id];
    while (pending.length && grown.size < target) {
      const id = pending.shift()!;
      const cell = byId.get(id);
      if (!cell) continue;
      const neighbors = cell.neighbors.filter(
        neighbor => !grown.has(neighbor) && !sea.has(neighbor) && byId.has(neighbor)
      );
      neighbors.sort((a, b) => {
        const pa = byId.get(a)!.centroid;
        const pb = byId.get(b)!.centroid;
        return pa[0] ** 2 + pa[1] ** 2 - (pb[0] ** 2 + pb[1] ** 2);
      });
      for (const neighbor of neighbors) {
        grown.add(neighbor);
        pending.push(neighbor);
        if (grown.size >= target) break;
      }
    }
    for (const id of currentUrban) {
      if (grown.has(id)) continue;
      residentialOutskirts.add(id);
      currentOutskirts.add(id);
    }
    currentUrban = grown;
    urbanStages = classification.stages.filter(stage => currentUrban.has(stage.cellId));
  }
  // One cell has no interior vertex once the gate passage splits it, so the
  // street snaps onto the curtain. Keep a second dry cell beside the burg,
  // off the river so the curtain does not inherit a shared bank.
  if (
    program.walls &&
    burgCell &&
    currentUrban.has(burgCell.id) &&
    currentUrban.size < 2 &&
    effectiveLayout !== "bram"
  ) {
    const byId = new Map(currentCells.map(cell => [cell.id, cell]));
    const riverVertices = new Set(
      rivers.flatMap(river =>
        river.edgePoints.map(point => `${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`)
      )
    );
    const touchesRiver = (cellId: number) =>
      byId
        .get(cellId)
        ?.polygon.some(point => riverVertices.has(`${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`)) ??
      false;
    const neighbors = burgCell.neighbors
      .filter(
        neighbor => !currentUrban.has(neighbor) && !sea.has(neighbor) && !touchesRiver(neighbor) && byId.has(neighbor)
      )
      .sort((a, b) => {
        const pa = byId.get(a)!.centroid;
        const pb = byId.get(b)!.centroid;
        return pa[0] ** 2 + pa[1] ** 2 - (pb[0] ** 2 + pb[1] ** 2);
      });
    if (neighbors.length) {
      currentUrban = new Set([...currentUrban, neighbors[0]]);
      urbanStages = classification.stages.filter(stage => currentUrban.has(stage.cellId));
    }
  }

  if (stageStep < 4) {
    return {
      ...empty,
      sea,
      ocean,
      coastPath,
      waterPolygon,
      rivers,
      urban: currentUrban,
      outskirts: currentOutskirts,
      urbanStages,
      builtUp: currentBuiltUp,
      mesh: meshModified ? currentMesh : undefined,
      faceIdOf: meshModified ? currentFaceIdOf : undefined,
      cells: meshModified ? currentCells : undefined
    };
  }

  // S4 — outline the urban blob along real mesh edges, gates, plaza & citadel.
  const riverLines = rivers.map(band => band.smoothPoints);
  let borderLoops = componentBorderLoops(currentMesh, currentFaceIdOf, currentUrban);
  let genBorders = borderLoops.map(loop => toGeneratorBorder(loop));
  let precincts = placePrecincts(
    currentCells,
    currentUrban,
    sea,
    genBorders,
    geo,
    params,
    settings.legacyCastles ? program : { ...program, citadel: false },
    riverLines
  );
  const citadel = precincts.find(p => p.kind === "citadel");
  const citadelOutline = citadel
    ? (componentBorderLoops(currentMesh, currentFaceIdOf, new Set(citadel.cellIds))[0]?.points ?? null)
    : null;

  let circuladePlan: import("./gen/circuladeLayout").CirculadeLayoutPlan | null = null;
  let polygonalCirculadePlan: import("./gen/polygonalCirculadeLayout").PolygonalCirculadePlan | null = null;
  if (effectiveLayout === "circulade") {
    const urbanCells = currentCells.filter(c => currentUrban.has(c.id));
    const hub: Point = urbanCells.length
      ? (urbanCells
          .reduce<Point>((sum, c) => [sum[0] + c.centroid[0], sum[1] + c.centroid[1]], [0, 0])
          .map(v => v / urbanCells.length) as Point)
      : [0, 0];
    circuladePlan = planCirculadeLayout(hub, urbanRadius, seed, program.temple);

    // Replace default plaza and temple with circulade core plaza & attached temple
    precincts = precincts.filter(p => p.kind !== "plaza" && p.kind !== "temple");
    if (program.plaza) precincts.push(circuladePlan.plaza);
    if (program.temple && circuladePlan.temple) precincts.push(circuladePlan.temple);
  } else if (effectiveLayout === "bram") {
    const urbanCells = currentCells.filter(c => currentUrban.has(c.id));
    const hub: Point = urbanCells.length
      ? (urbanCells
          .reduce<Point>((sum, c) => [sum[0] + c.centroid[0], sum[1] + c.centroid[1]], [0, 0])
          .map(v => v / urbanCells.length) as Point)
      : [0, 0];
    polygonalCirculadePlan = planPolygonalCirculadeLayout(
      hub,
      seed,
      bramCoreRadiusMeters(urbanRadius),
      program.temple,
      16
    );

    precincts = precincts.filter(p => p.kind !== "plaza" && p.kind !== "temple");
    if (program.plaza) precincts.push(polygonalCirculadePlan.plaza);
    if (program.temple && polygonalCirculadePlan.temple) precincts.push(polygonalCirculadePlan.temple);
  }

  let castleSite: CastleSite | null = null;
  let castleFailure: string | undefined;
  const preservedOwners = new Set(
    (sourceDocument?.castles ?? []).filter(c => c.locked || c.provenance !== "generated").map(c => c.id)
  );
  const preservedCastleIds = new Set(
    (sourceDocument?.defenseCircuits ?? [])
      .filter(c => c.ownerCastleId && preservedOwners.has(c.ownerCastleId))
      .flatMap(c => c.areaFaceIds)
  );
  if (program.citadel && !settings.legacyCastles && !preservedCastleIds.size) {
    const originalCells = currentCells;

    const urbanFaces = new Set([...currentUrban].map(id => currentFaceIdOf[id]));
    const reserve = new Set(precincts.flatMap(p => p.cellIds.map(id => currentFaceIdOf[id])));
    for (const face of Object.values(currentMesh.faces)) if (face.properties.locked) reserve.add(face.id);
    const temp: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      frame: { extentMeters: half * 2, cityRadiusMeters: params.cityRadiusMeters, blockSizeMeters: cellSize },
      mesh: currentMesh,
      featureGroups: program.walls
        ? [
            {
              id: "planning-town-wall",
              kind: "wall",
              name: "Town wall",
              segments: [],
              style: { widthMeters: 3, color: "#41382e" },
              locked: false
            }
          ]
        : [],
      gates: [],
      elements: []
    };
    const terrain = (
      settings.descriptor ??
      synthSite(NOMINAL_PRESET, settings.config, seed, {
        extentMeters: half * 2,
        cityRadiusMeters: params.cityRadiusMeters
      })
    ).terrain;
    castleSite = placeCastleRegion(
      temp,
      urbanFaces,
      new Set([...sea].map(id => currentFaceIdOf[id])),
      reserve,
      rivers.map(r => ({ points: r.edgePoints, width: Math.max(...r.widths, 6) })),
      seed,
      settings.castle,
      terrain
    );
    if (castleSite) {
      currentMesh = castleSite.mesh;
      const updated = cellsFromMesh(currentMesh, half);
      const parentOf = (cell: Cell) => originalCells.find(old => pointInPolygon(cell.centroid, old.polygon));
      const remap = (set: Set<number>) =>
        new Set(
          updated.cells
            .filter(cell => {
              const old = parentOf(cell);
              return old && set.has(old.id);
            })
            .map(cell => cell.id)
        );
      currentUrban = remap(currentUrban);
      currentOutskirts = remap(currentOutskirts);
      currentBuiltUp = remap(currentBuiltUp);
      residentialOutskirts = remap(residentialOutskirts);
      const newSea = remap(sea);
      sea.clear();
      for (const id of newSea) sea.add(id);
      for (const precinct of precincts) {
        const previous = new Set(precinct.cellIds);
        precinct.cellIds = updated.cells
          .filter(cell => {
            const old = parentOf(cell);
            return old && previous.has(old.id);
          })
          .map(cell => cell.id);
      }
      currentCells = updated.cells;
      currentFaceIdOf = updated.faceIdOf;
      const castleCell = currentFaceIdOf.indexOf(castleSite.faceId);
      if (castleSite.relationship === "integrated") currentUrban.add(castleCell);
      const anchor = currentCells[castleCell].centroid;
      precincts.push({ kind: "citadel", cellIds: [castleCell], anchor, label: "Castle" });
      borderLoops = componentBorderLoops(currentMesh, currentFaceIdOf, currentUrban);
      genBorders = borderLoops.map(toGeneratorBorder);
      meshModified = true;
    } else castleFailure = "castle-no-site";
  }
  // Reserved/manual castles remain part of the planning obstacles.
  if (preservedCastleIds.size) {
    const cellIds = currentFaceIdOf.flatMap((id, i) => (preservedCastleIds.has(id) ? [i] : []));
    if (cellIds.length)
      precincts.push({ kind: "citadel", cellIds, anchor: currentCells[cellIds[0]].centroid, label: "Castle" });
  }
  empty.castleSite = castleSite;
  empty.castleFailure = castleFailure;

  const castleGateRegions = [...preservedCastleIds, ...(castleSite ? [castleSite.faceId] : [])].flatMap(id =>
    currentMesh.faces[id] ? [facePoints(currentMesh, currentMesh.faces[id])] : []
  );
  const channelPolygons = empty.channelPolygons ?? [];
  const gateNearest = nearestVertexLookup(currentMesh, Math.max(1, cellSize));
  const urbanFaces = new Set([...currentUrban].map(id => currentFaceIdOf[id]));
  const canPlaceTownGate = (p: Point) => {
    if (castleGateRegions.some(r => pointInPolygon(p, r) || nearestOnPolyline(p, [...r, r[0]]).dist < 10)) return false;
    if (!channelPolygons.length) return true;
    const vertex = gateNearest(p);
    if (!vertex || channelPolygons.some(polygon => pointInPolygon(p, polygon))) return false;
    // A wall corner needs a dry inward edge. Otherwise a narrow surveyed
    // channel can isolate its gate even though both incident faces are land.
    return Object.values(currentMesh.edges).some(edge => {
      if (edge.a !== vertex && edge.b !== vertex) return false;
      if (!edge.leftFace || !edge.rightFace || !urbanFaces.has(edge.leftFace) || !urbanFaces.has(edge.rightFace))
        return false;
      const line = [currentMesh.vertices[edge.a].point, currentMesh.vertices[edge.b].point];
      return !lineHitsWater(line, channelPolygons) && !castleGateRegions.some(region => lineHitsWater(line, [region]));
    });
  };

  const placed = markWaterGate(
    placeGates(
      currentCells,
      currentUrban,
      genBorders,
      {
        ...geo,
        rivers: rivers.map(river => ({
          corridor: river.edgePoints,
          widths: river.widths,
          cityBank: "left" as const,
          bridgeAllowed: river.bridgeAllowed
        }))
      },
      maxWallGatesForExtent(params.extentMeters),
      canPlaceTownGate
    ),
    genBorders,
    coast?.shoreline ?? null,
    program.port && geo.importedRoads === undefined
  );
  let gates = streetOpts.avoidSea ? markSeaSurroundedGates(placed, waterPolygon, cellSize) : placed;

  // For pure circulade or Bram, snap gates to recommended opposed positions along the border
  const recommendedGates =
    effectiveLayout === "circulade" && circuladePlan
      ? circuladePlan.recommendedGates
      : effectiveLayout === "bram" && polygonalCirculadePlan
        ? polygonalCirculadePlan.recommendedGates
        : null;

  if (recommendedGates && genBorders.length && geo.importedRoads === undefined) {
    const customGates: Gate[] = [];
    for (const rec of recommendedGates) {
      let bestDist = Infinity;
      let bestPt: Point | null = null;
      let bestBIdx = 0;
      genBorders.forEach((border, bIdx) => {
        for (const pt of border.points) {
          if (!canPlaceTownGate(pt)) continue;
          const d = Math.hypot(pt[0] - rec[0], pt[1] - rec[1]);
          if (d < bestDist) {
            bestDist = d;
            bestPt = pt;
            bestBIdx = bIdx;
          }
        }
      });
      if (bestPt && !customGates.some(g => Math.hypot(g.point[0] - bestPt![0], g.point[1] - bestPt![1]) < 12)) {
        customGates.push({ point: bestPt, borderIndex: bestBIdx, water: false });
      }
    }
    if (customGates.length >= 2) {
      gates = customGates;
    }
  }

  mark("wall-plan");
  if (stageStep < 5) {
    return {
      ...empty,
      sea,
      ocean,
      coastPath,
      waterPolygon,
      rivers,
      urban: currentUrban,
      outskirts: currentOutskirts,
      urbanStages,
      builtUp: currentBuiltUp,
      borderLoops,
      gates,
      precincts,
      citadelOutline,
      mesh: meshModified ? currentMesh : undefined,
      faceIdOf: meshModified ? currentFaceIdOf : undefined,
      cells: meshModified ? currentCells : undefined
    };
  }

  // S5 — approach roads (raw A* on the same graph; not smoothed into the mesh).
  const streetInput = {
    cells: currentCells,
    urban: currentUrban,
    sea,
    waterPolygon,
    shoreline: coast?.shoreline ?? null,
    borders: genBorders,
    gates,
    precincts,
    citadelOutline,
    geo,
    cellSizeMeters: cellSize,
    halfExtentMeters: half,
    rivers: rivers.map(band => band.edgePoints),
    farNode: streetOpts.farNode,
    manualBearings: streetOpts.manualBearings,
    avoidSea: streetOpts.avoidSea
  };
  let streetResult = buildStreets(streetInput);
  // Local streets seed housing independently of external roads. Retain the
  // ordinary interior access pattern, without creating world roads or gates
  // for these extra anchors (including settlements with no FMG roads).
  if (geo.importedRoads !== undefined && geo.importedRoads.length < 3) {
    const anchors = placeGates(
      currentCells,
      currentUrban,
      genBorders,
      { ...geo, importedRoads: undefined },
      3,
      canPlaceTownGate
    );
    const local = buildStreets({ ...streetInput, gates: anchors, geo: { ...geo, importedRoads: undefined } });
    streetResult = {
      ...streetResult,
      streets: local.streets,
      arteries: local.arteries,
      vertexShifts: local.vertexShifts
    };
  }
  let routedGates = gates;
  let streetGeo = geo;
  const minRoads = requiredExternalRoads(settings, params.extentMeters);
  const needsBetterRoads = (): boolean =>
    (streetOpts.avoidSea && majorityLandGatesUnserved(routedGates, streetResult.roads, cellSize)) ||
    (minRoads > 0 && streetResult.roads.length < minRoads);
  for (let roadAttempt = 0; roadAttempt < 3 && needsBetterRoads() && !settings.descriptor; roadAttempt++) {
    const retrySeed = roadAttempt === 0 ? `${seed}:roads-retry` : `${seed}:roads-retry:${roadAttempt}`;
    const retry = synthSite(NOMINAL_PRESET, settings.config, retrySeed, {
      extentMeters: params.extentMeters,
      cityRadiusMeters: params.cityRadiusMeters
    });
    const retryGeo = siteToGeography(retry);
    streetGeo = { ...geo, roadBearings: retryGeo.roadBearings, roadPaths: retryGeo.roadPaths };
    streetResult = buildStreets({ ...streetInput, geo: streetGeo });
  }
  let roads = streetResult.roads;
  if (streetOpts.avoidSea) {
    const oceanPolygon = coasts[0]?.waterPolygon ?? null;
    roads = clipPolylinesToLand(roads, oceanPolygon);
    roads = appliedChannels.reduce((lines, channel) => keepCitySide(lines, channel.polygon), roads);
    streetResult = {
      ...streetResult,
      roads,
      arteries: appliedChannels.reduce(
        (lines, channel) => keepCitySide(lines, channel.polygon),
        clipPolylinesToLand(streetResult.arteries, oceanPolygon)
      )
    };
    routedGates = remakeUnreachableLandGates(routedGates, roads, cellSize);
  }

  // Materialize routes only after opening passages on the actual mesh. Keep
  // one stable slot per gate even when the preliminary edge walk was blocked.
  roads = routedGates.map((gate, i) => [
    farNodeFor(
      gate,
      streetGeo,
      half,
      waterPolygon,
      coast?.shoreline ?? null,
      cellSize,
      streetOpts.avoidSea,
      streetOpts.farNode,
      streetOpts.manualBearings?.[i]
    ),
    gate.point
  ]);
  const gateStreets = routedGates.map(gate => [
    gate.point,
    plazaApproachPoint(
      currentCells,
      precincts.find(p => p.kind === "plaza"),
      gate.point
    ) ?? ([0, 0] as Point)
  ]);

  mark("street-plan");
  if (stageStep < 6) {
    return {
      ...empty,
      sea,
      ocean,
      coastPath,
      waterPolygon,
      rivers,
      urban: currentUrban,
      outskirts: currentOutskirts,
      urbanStages,
      builtUp: currentBuiltUp,
      borderLoops,
      gates: routedGates,
      precincts,
      citadelOutline,
      roads,
      streets: [],
      mesh: meshModified ? currentMesh : undefined,
      faceIdOf: meshModified ? currentFaceIdOf : undefined,
      cells: meshModified ? currentCells : undefined
    };
  }

  // S6 — wards.
  const historicalPeriod =
    settings.historicalPeriod ?? settings.descriptor?.historicalPeriod ?? sourceDocument?.historicalPeriod;

  const warded = assignWards({
    cells: currentCells,
    urban: currentUrban,
    outskirts: currentOutskirts,
    residentialOutskirts,
    sea,
    borders: genBorders,
    gates: routedGates,
    precincts,
    geo: streetGeo,
    params,
    program,
    shoreline: coast?.shoreline ?? null,
    oceanShorelines: classified.flatMap(item => (item.kind === "ocean" && item.coast ? [item.coast.shoreline] : [])),
    waterPolygon,
    streets: [...streetResult.streets, ...roads],
    rivers: rivers.map(band => band.edgePoints),
    historicalPeriod
  });
  mark("wards");
  return {
    urbanCoreMode: settings.urbanCoreMode,
    layout: effectiveLayout,
    castleSite,
    castleFailure,
    moats: settings.moats,
    legacyCastles: settings.legacyCastles,
    sea,
    ocean,
    coastPath,
    waterPolygon,
    avoidSea: streetOpts.avoidSea,
    channelPolygons: empty.channelPolygons,
    rivers,
    urban: currentUrban,
    outskirts: currentOutskirts,
    urbanStages,
    builtUp: currentBuiltUp,
    borderLoops,
    gates: routedGates,
    precincts,
    citadelOutline,
    roads: complete ? roads : [...roads, ...gateStreets],
    roadPaths: geo.roadPaths,
    importedRoads: geo.importedRoads,
    streets: complete ? streetResult.streets : gateStreets,
    wards: new Map(warded.wards.map(w => [w.cellId, w.kind])),
    wardOrder: warded.assignmentOrder,
    templeHarbor: warded.precincts,
    mesh: meshModified ? currentMesh : undefined,
    faceIdOf: meshModified ? currentFaceIdOf : undefined,
    cells: meshModified ? currentCells : undefined
  };
}

/** A planning checkpoint, not another generation pass (notably when a castle has no site). */
function planningDebugDocument(
  source: CityDocument,
  faceIdOf: string[],
  plan: Plan,
  program: CityProgram
): CityDocument {
  const next = clone(source);
  if (plan.mesh) next.mesh = clone(plan.mesh);
  const ids = plan.faceIdOf ?? faceIdOf;
  next.importedRoadCount = plan.importedRoads?.length;
  next.waterAreas = plan.channelPolygons?.map(polygon => ({ kind: "river", polygon: clone(polygon) }));
  delete next.appearance;
  delete next.fabric;
  next.featureGroups = next.featureGroups.filter(g => g.locked || !g.id.startsWith(GEN_PREFIX));
  next.gates = next.gates.filter(g => g.locked || !g.id.startsWith(GEN_PREFIX));
  next.elements = next.elements.filter(e => e.locked || !e.id.startsWith(GEN_PREFIX));
  for (const [index, id] of ids.entries()) {
    const face = next.mesh.faces[id];
    if (!face || face.properties.locked) continue;
    face.properties.water = plan.sea.has(index) ? "sea" : "land";
    face.properties.buildable = !plan.sea.has(index) && (plan.urban.has(index) || plan.outskirts.has(index));
    face.properties.settlement = plan.urban.has(index) ? "core" : "outskirts";
    face.properties.ward = editorWard(plan.wards.get(index) ?? "empty");
  }
  const nearest = nearestVertexLookup(next.mesh, Math.max(1, source.frame.blockSizeMeters));
  for (const [index, river] of plan.rivers.entries())
    next.featureGroups.push({
      id: `${GEN_PREFIX}river-${index}`,
      kind: "river",
      name: `River ${index + 1}`,
      vertices: polylineToVertexPath(next.mesh, river.resolvedEdgePoints, nearest),
      source: null,
      mouth: null,
      style: { widthMeters: Math.max(6, river.widths[0] ?? 12), color: "#4f8aad" },
      locked: false
    });
  // This is the planned wall, before passage construction and road routing.
  for (const [index, loop] of (program.walls ? plan.borderLoops : []).entries())
    next.featureGroups.push({
      id: `${GEN_PREFIX}debug-wall-${index}`,
      kind: "wall",
      name: `Planned wall ${index + 1}`,
      segments: clone(loop.segments),
      style: { widthMeters: 4, color: "#41382e" },
      locked: false
    });
  for (const precinct of [...plan.precincts, ...plan.templeHarbor]) {
    if (!["plaza", "citadel", "temple", "harbor"].includes(precinct.kind)) continue;
    next.elements.push({
      id: `${GEN_PREFIX}debug-${precinct.kind}`,
      kind: precinct.kind as "plaza" | "citadel" | "temple" | "harbor",
      faceIds: precinct.cellIds.map(id => ids[id]).filter(Boolean),
      point: clone(precinct.anchor),
      locked: false
    });
  }
  return next;
}

function settingsLegacy(plan: Plan): boolean {
  return !!plan.legacyCastles;
}

// --- write the plan onto a document clone (mesh untouched) -------------------

function applyPlan(
  source: CityDocument,
  cells: Cell[],
  faceIdOf: string[],
  plan: Plan,
  program: CityProgram,
  stageStep: number,
  complete = false,
  observer?: GenerationObserver,
  attempt = 1,
  onRejected?: (document: CityDocument, sample: import("./generationDiagnostics").GenerationSample) => void,
  wallCheckpoint?: "walls" | "riverPassages" | "passages"
): CityDocument | null {
  const mark = generationTimer(observer, attempt);
  let next = clone(source);
  const gateRouting = new Map<Id, RoadRoutingTrace[]>();
  const reject = (
    phase: string,
    reason: string,
    message: string,
    counts?: Record<string, number>,
    details?: string[],
    routing?: RoadRoutingTrace[]
  ): null => {
    const sample = reportGenerationFailure(observer, attempt, phase, reason, message, counts, details, routing);
    onRejected?.(next, sample);
    return null;
  };
  if (plan.mesh) {
    next.mesh = clone(plan.mesh);
    cells = plan.cells!;
    faceIdOf = plan.faceIdOf!;
  }
  next.importedRoadCount = plan.importedRoads?.length;
  next.waterAreas = plan.channelPolygons?.map(polygon => ({ kind: "river", polygon: clone(polygon) }));
  delete next.appearance;
  // Keep the active morphology even when routing rejects before town finish.
  next.layout = plan.layout ?? source.layout;
  if (!settingsLegacy(plan)) {
    next.castles = (next.castles ?? []).filter(c => c.locked || c.provenance !== "generated");
    const retained = new Set(next.castles.map(c => c.id));
    next.defenseCircuits = (next.defenseCircuits ?? []).filter(
      c => c.locked || (c.ownerCastleId && retained.has(c.ownerCastleId))
    );
  }
  if (plan.castleFailure && !wallCheckpoint) return null;
  let mesh = next.mesh;

  // Clear this module's previous output + every non-locked face tag, so the
  // stages read as a scrub through the process rather than an accumulation.
  const retainedWalls = castleWallIds(next);
  next.featureGroups = next.featureGroups.filter(
    group => group.locked || retainedWalls.has(group.id) || !group.id.startsWith(GEN_PREFIX)
  );
  next.gates = (next.gates ?? []).filter(
    gate =>
      gate.locked ||
      (gate.ownerCastleId && next.castles?.some(c => c.id === gate.ownerCastleId)) ||
      !gate.id.startsWith(GEN_PREFIX)
  );
  next.elements = next.elements.filter(element => element.locked || !element.id.startsWith(GEN_PREFIX));
  for (const face of Object.values(mesh.faces)) {
    if (face.properties.locked || reservedCastleFaces(next).has(face.id)) continue;
    face.properties.water = "land";
    if (face.properties.elevation <= 0) face.properties.elevation = 1;
    face.properties.buildable = true;
    face.properties.ward = null;
    delete face.properties.settlement;
  }

  const appendGeneratedGroup = (group: FeatureGroup) => {
    if (next.featureGroups.some(existing => existing.id === group.id && existing.locked)) return;
    if (group.kind === "wall" && next.castles?.length) {
      const occupied = new Set(
        next.featureGroups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : []))
      );
      const runs: EdgeRef[][] = [];
      let current: EdgeRef[] = [];
      for (const ref of group.segments) {
        if (occupied.has(ref.edgeId)) {
          if (current.length) runs.push(current);
          current = [];
        } else current.push(ref);
      }
      if (current.length) runs.push(current);
      for (const [index, segments] of runs.entries())
        next.featureGroups.push({
          ...group,
          id: next.featureGroups.some(g => g.id === group.id) || index ? `${group.id}:town-run-${index}` : group.id,
          segments
        });
      return;
    }
    next.featureGroups.push(group);
  };

  const faceFor = (cellId: number): (typeof mesh.faces)[string] | undefined => mesh.faces[faceIdOf[cellId]];
  const nearest = nearestVertexLookup(mesh, Math.max(1, source.frame.blockSizeMeters));
  let urbanRegions = [...plan.urban]
    .map(id => faceFor(id))
    .filter(face => !!face)
    .map(face => facePoints(mesh, face));

  // ① sea
  for (const cellId of plan.sea) {
    const face = faceFor(cellId);
    if (face && !face.properties.locked && !reservedCastleFaces(next).has(face.id)) {
      face.properties.water = "sea";
      face.properties.elevation = 0;
      face.properties.depth ??= 3;
      face.properties.buildable = false;
    }
  }
  next.coastalOceanFaceIds = [...plan.ocean]
    .map(cellId => faceFor(cellId)?.id)
    .filter((id): id is string => !!id && mesh.faces[id].properties.water === "sea");

  // ③ built-up cells (buildable). Non-urban land is not buildable.
  if (stageStep >= 3) {
    const built = new Set<number>([...plan.urban, ...plan.outskirts]);
    for (let id = 0; id < cells.length; id++) {
      const face = faceFor(id);
      if (
        face &&
        !face.properties.locked &&
        face.properties.water === "land" &&
        !reservedCastleFaces(next).has(face.id)
      ) {
        face.properties.buildable = built.has(id);
        if ((source.gridKind === "evolution" || plan.urbanCoreMode === "compact") && built.has(id))
          face.properties.settlement = plan.urban.has(id) ? "core" : "outskirts";
      }
    }
  }

  // ② river feature groups
  if (stageStep >= 2) {
    const againstFlow = new Set<string>();
    plan.rivers.forEach((band, i) => {
      const vertices = polylineToVertexPath(mesh, band.resolvedEdgePoints, nearest, againstFlow);
      if (vertices.length < 2) return;
      for (let j = 1; j < vertices.length; j++) againstFlow.add(`${vertices[j]}>${vertices[j - 1]}`);
      const width = band.widths.length ? band.widths.reduce((s, w) => s + w, 0) / band.widths.length : 12;
      appendGeneratedGroup({
        id: `${GEN_PREFIX}river-${i}`,
        kind: "river",
        name: `River ${i + 1}`,
        vertices,
        source: null,
        mouth: null,
        // Imported widths are physical. The former completed-view multiplier
        // turned a broad border river into water over the town itself.
        style: { widthMeters: Math.max(6, width), color: "#4f8aad" },
        locked: false
      });
    });
  }

  // Assign stage-six wards before passage splits so every child inherits its district.
  if (stageStep >= 6) {
    for (const [cellId, kind] of plan.wards) {
      const face = faceFor(cellId);
      let editor = editorWard(kind);
      if (face && !face.properties.locked && editor && !reservedCastleFaces(next).has(face.id)) {
        if (editor === "harbor") {
          const touchesSea = faceNeighbors(mesh, face.id).some(nid => mesh.faces[nid]?.properties.water === "sea");
          if (!touchesSea) {
            editor = "merchant";
          }
        }
        face.properties.ward = editor;
        if (editor === "cemetery" || editor === "park") {
          face.properties.buildable = false;
        }
      }
    }
  }

  if (plan.castleSite) {
    const face = mesh.faces[plan.castleSite.faceId];
    if (face) {
      face.properties.ward = "castle";
      face.properties.buildable = false;
    }
  }
  mark("apply-terrain");
  // ④ walls + gates + plaza / citadel. When avoidSea is on, drop edges whose
  // midpoint sits in the water so the sea side is left open (§3.E.2), splitting
  // the remainder into contiguous runs (`validate` requires that).
  if (stageStep >= 4 && program.walls) {
    let wallIndex = 0;
    const openEdges = new Set<Id>();
    const coastMode = program.wallPlan?.coast ?? "open";
    // `opening` keeps the sea wall and drops a single harbour gap below.
    const keepSeaWall = coastMode === "seaWall" || coastMode === "opening";
    if (plan.avoidSea && !keepSeaWall) {
      for (const edge of Object.values(mesh.edges)) {
        if ([edge.leftFace, edge.rightFace].some(id => id && mesh.faces[id].properties.water !== "land"))
          openEdges.add(edge.id);
      }
    }
    if (coastMode === "opening") {
      const harbor =
        plan.templeHarbor.find(precinct => precinct.kind === "harbor") ??
        plan.precincts.find(precinct => precinct.kind === "harbor");
      for (const id of seaOpeningEdgeIds(mesh, plan.borderLoops, plan.waterPolygon, harbor?.anchor ?? null)) {
        openEdges.add(id);
      }
    }
    plan.borderLoops.forEach(loop => {
      const runs =
        plan.avoidSea && plan.waterPolygon
          ? splitDryWallRuns(loop.points, loop.segments, plan.waterPolygon)
          : [loop.segments];
      for (const ref of loop.segments) {
        const edge = mesh.edges[ref.edgeId];
        if (lineHitsWater([mesh.vertices[edge.a].point, mesh.vertices[edge.b].point], waterPolygons(next)))
          openEdges.add(edge.id);
      }
      for (const segments of runs.flatMap(run => unbannedRuns(run, openEdges))) {
        if (segments.length < 1) continue;
        appendGeneratedGroup({
          id: `${GEN_PREFIX}wall-${wallIndex}`,
          kind: "wall",
          name: `Wall ${wallIndex + 1}`,
          segments,
          style: {
            widthMeters: Math.max(4, source.frame.blockSizeMeters * 0.14),
            color: "#41382e"
          },
          locked: false
        });
        wallIndex++;
      }
    });
  }
  if (stageStep === 4 && wallCheckpoint === "walls") return next;
  let actualTownFaces: Set<Id> | null = null;
  let routingPlan = plan;
  if (stageStep >= 4) {
    // Round shared river/wall vertices before clearance repair, passage splits
    // and gate/road placement constrain them. Keep the raw curtain checkpoint
    // available for diagnostics; subsequent checkpoints use this prepared mesh.
    const precincts = [...plan.precincts, ...plan.templeHarbor];
    const reservedVertices = new Set(
      [
        ...reservedCastleFaces(next),
        ...(plan.castleSite ? [plan.castleSite.faceId] : []),
        ...precincts.flatMap(precinct => precinct.cellIds.map(id => faceIdOf[id]))
      ].flatMap(id => (next.mesh.faces[id] ? faceVertices(next.mesh, next.mesh.faces[id]) : []))
    );
    // Polygonal plazas may have no reserved faces; keep their inserted ring
    // aligned with the planned civic landmarks as the outer boundary rounds.
    for (const point of precincts.flatMap(precinct => precinct.polygon ?? [])) {
      const id = nearest(point);
      if (id && Math.hypot(mesh.vertices[id].point[0] - point[0], mesh.vertices[id].point[1] - point[1]) < 1e-6)
        reservedVertices.add(id);
    }
    const lockedBefore = new Map([...reservedVertices].map(id => [id, next.mesh.vertices[id].locked]));
    for (const id of reservedVertices) next.mesh.vertices[id].locked = true;
    next = finishCityGeometry(next, "boundaries");
    for (const [id, locked] of lockedBefore) next.mesh.vertices[id].locked = locked;
    mesh = next.mesh;
    urbanRegions = [...plan.urban]
      .map(id => faceFor(id))
      .filter(face => !!face)
      .map(face => facePoints(mesh, face));
    mark("smooth-boundaries");
    // Cell splitting handles ordinary bank overlaps. Resolve any residual
    // coastal span before placing gates, so later junction repairs cannot
    // consume an already published gate vertex.
    next = openWallRiverMouths(next);
    const riverRepair = repairRiverWalls(
      next,
      urbanRegions,
      new Set([...reservedCastleFaces(next), ...(plan.castleSite ? [plan.castleSite.faceId] : [])])
    );
    next = riverRepair.document;
    if (riverRepair.issues.length)
      return reject(
        "wall-river-routing",
        "wall-river-routing-failed",
        "城壁・河川の離隔、迂回・河川通過口を確保できない",
        {
          issues: riverRepair.issues.length,
          preparedRiverPassages: riverRepair.preparedPassages.length,
          crossingSplitFaces: riverRepair.splitFaces
        },
        [
          ...riverRepair.adjustments,
          ...riverRepair.preparedPassages.map(id => `河川横断口の準備完了: ${id}`),
          ...riverRepair.issues
        ]
      );
    actualTownFaces = enclosedTownFaces(next);
    if (actualTownFaces) {
      urbanRegions = [...actualTownFaces].map(id => facePoints(next.mesh, next.mesh.faces[id]));
      routingPlan = {
        ...plan,
        urban: new Set(faceIdOf.flatMap((id, index) => (actualTownFaces!.has(id) ? [index] : [])))
      };
      for (const face of Object.values(next.mesh.faces)) {
        if (face.properties.locked || reservedCastleFaces(next).has(face.id)) continue;
        if (face.properties.water !== "land") continue;
        if (actualTownFaces.has(face.id)) {
          face.properties.settlement = "core";
        } else if (face.properties.settlement === "core") {
          face.properties.settlement = "outskirts";
        }
      }
    }
    if (stageStep === 4 && wallCheckpoint === "riverPassages") return next;
    mesh = next.mesh;
    const wallVertices = new Set<Id>();
    for (const group of next.featureGroups) {
      if (group.kind !== "wall") continue;
      for (const segment of group.segments) {
        const edge = mesh.edges[segment.edgeId];
        if (edge) wallVertices.add(edge.a).add(edge.b);
      }
    }
    // Reserve gates only on banks whose exterior land reaches the frame.
    // The cell graph deliberately ignores dry-corner bottlenecks: those can
    // be repaired by splitting cells without changing the gate later.
    const coreIds = actualTownFaces ?? new Set([...plan.urban].map(id => faceIdOf[id]));
    const riverEdges = kindEdgeIds(next, "river");
    const reachable = new Set<Id>();
    const queue: Id[] = [];
    for (const edge of Object.values(mesh.edges)) {
      if (edge.leftFace && edge.rightFace) continue;
      const id = edge.leftFace ?? edge.rightFace;
      if (!id || coreIds.has(id) || mesh.faces[id].properties.water !== "land" || reachable.has(id)) continue;
      reachable.add(id);
      queue.push(id);
    }
    for (const id of queue) {
      for (const ref of mesh.faces[id].boundary) {
        if (riverEdges.has(ref.edgeId)) continue;
        const edge = mesh.edges[ref.edgeId];
        const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
        if (!other || coreIds.has(other) || mesh.faces[other].properties.water !== "land" || reachable.has(other))
          continue;
        reachable.add(other);
        queue.push(other);
      }
    }
    const exteriorRegions = [...reachable].map(id => facePoints(mesh, mesh.faces[id]));
    const wallWidth = Math.max(4, source.frame.blockSizeMeters * 0.14);
    const minGateSpacing = minGateSpacingMeters(wallWidth);
    // A cape or island keeps most of its curtain on the water. Gate count follows
    // the landward share of the built edge, so two gates are not planted on the
    // same short land neck. Inland towns (little or no sea front) are unchanged.
    let seaFront = 0;
    let landFront = 0;
    for (const edge of Object.values(mesh.edges)) {
      const left = edge.leftFace ? mesh.faces[edge.leftFace] : null;
      const right = edge.rightFace ? mesh.faces[edge.rightFace] : null;
      if (!left || !right) continue;
      if (!left.properties.buildable && !right.properties.buildable) continue;
      const sea = left.properties.water === "sea" || right.properties.water === "sea";
      const outer = sea || !left.properties.buildable || !right.properties.buildable;
      if (!outer) continue;
      const a = mesh.vertices[edge.a]?.point;
      const b = mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (sea) seaFront += length;
      else landFront += length;
    }
    const frontTotal = seaFront + landFront;
    const seaShare = frontTotal > 0 ? seaFront / frontTotal : 0;
    const gateBudget =
      seaShare >= 0.3
        ? Math.max(1, Math.min(plan.gates.length, Math.round(plan.gates.length * (1 - seaShare))))
        : plan.gates.length;
    const placedPoints: Point[] = next.gates.flatMap(gate => {
      const point = mesh.vertices[gate.vertexId]?.point;
      return point ? [[point[0], point[1]] as Point] : [];
    });
    const tooCloseToGate = (point: Point): boolean =>
      placedPoints.some(placed => Math.hypot(placed[0] - point[0], placed[1] - point[1]) < minGateSpacing);
    plan.gates.forEach((gate, i) => {
      if (townGates(next).length >= gateBudget) return;
      if (townGates(next).some(g => g.id === `${GEN_PREFIX}gate-${i}` && g.locked)) return;
      const riverVertices = new Set(
        [...kindEdgeIds(next, "river")].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b])
      );
      const occupied = new Set(townGates(next).map(g => g.vertexId));
      const castleFaces = new Set([...reservedCastleFaces(next), ...(plan.castleSite ? [plan.castleSite.faceId] : [])]);
      const castleVertices = new Set(
        [...castleFaces].flatMap(id => (mesh.faces[id] ? faceVertices(mesh, mesh.faces[id]) : []))
      );
      const candidates = [...wallVertices].filter(
        id => !occupied.has(id) && !riverVertices.has(id) && !castleVertices.has(id)
      );
      candidates.sort((a, b) => {
        const p = mesh.vertices[a].point,
          q = mesh.vertices[b].point;
        return (
          Math.hypot(p[0] - gate.point[0], p[1] - gate.point[1]) -
          Math.hypot(q[0] - gate.point[0], q[1] - gate.point[1])
        );
      });
      for (const vertexId of candidates) {
        const point = mesh.vertices[vertexId]?.point;
        if (!point || tooCloseToGate(point)) continue;
        // Gate preparation must not collapse a neighbouring reserved castle corner.
        const lockedBefore = new Map([...castleVertices].map(id => [id, mesh.vertices[id].locked]));
        for (const id of castleVertices) mesh.vertices[id].locked = true;
        const opened = openBarrierPassage(next, vertexId, "wall");
        for (const [id, locked] of lockedBefore) {
          if (mesh.vertices[id]) mesh.vertices[id].locked = locked;
          if (opened?.mesh.vertices[id]) opened.mesh.vertices[id].locked = locked;
        }
        if (!opened) continue;
        if (
          throughEdgesAt(opened, vertexId, "wall").some(edge =>
            [edge.leftFace, edge.rightFace].some(id => id && opened.mesh.faces[id].properties.water !== "land")
          )
        )
          continue;
        const arms = throughEdgesAt(opened, vertexId, "wall");
        const inRegion = (edge: (typeof arms)[number], regions: Point[][]) =>
          [edge.leftFace, edge.rightFace].some(id => {
            if (!id) return false;
            const center = polygonCentroid(facePoints(opened.mesh, opened.mesh.faces[id]));
            return regions.some(region => pointInPolygon(center, region));
          });
        if (!arms.some(edge => inRegion(edge, urbanRegions)) || !arms.some(edge => inRegion(edge, exteriorRegions)))
          continue;
        next = opened;
        mesh = next.mesh;
        const placed = mesh.vertices[vertexId]?.point ?? point;
        placedPoints.push([placed[0], placed[1]]);
        next.gates.push({
          id: `${GEN_PREFIX}gate-${i}`,
          vertexId,
          ...(settingsLegacy(plan) ? {} : { role: "town" as const }),
          locked: false
        });
        break;
      }
    });
    if (stageStep === 4 && wallCheckpoint === "passages") {
      // Selection uses temporary gates to reserve spacing and stable indices.
      // Display the opened mesh before materializing those generated gates.
      next.gates = next.gates.filter(gate => gate.locked || !gate.id.startsWith(GEN_PREFIX));
      return next;
    }
    // Reserved precinct landmarks as point-anchored elements.
    for (const precinct of [...plan.precincts, ...plan.templeHarbor]) {
      if (!["plaza", "citadel", "temple", "harbor"].includes(precinct.kind)) continue;
      if (next.elements.some(e => e.id === `${GEN_PREFIX}${precinct.kind}`)) continue;
      if (precinct.kind === "harbor") {
        const harborFaceIds = precinct.cellIds.map(id => faceIdOf[id]).filter(Boolean);
        const hasCoastalFace = harborFaceIds.some(fid =>
          faceNeighbors(mesh, fid).some(nid => mesh.faces[nid]?.properties.water === "sea")
        );
        if (!hasCoastalFace) continue;
      }
      next.elements.push({
        id: `${GEN_PREFIX}${precinct.kind}`,
        kind: precinct.kind as "plaza" | "citadel" | "temple" | "harbor",
        faceIds: precinct.cellIds.map(id => faceIdOf[id]).filter(Boolean),
        point: [precinct.anchor[0], precinct.anchor[1]],
        sizeMeters:
          precinct.kind === "temple"
            ? templeFootprintMeters(next.frame.extentMeters).length
            : precinct.kind === "plaza"
              ? plazaFootprintMeters(next.frame.extentMeters)
              : undefined,
        rotation:
          precinct.kind === "temple"
            ? orientTempleHybrid(
                [precinct.anchor[0], precinct.anchor[1]],
                precinct.rotation ?? 0,
                plan.precincts.find(p => p.kind === "plaza")?.anchor,
                next.historicalPeriod
              )
            : precinct.rotation,
        locked: false
      });
    }
  }

  if (stageStep >= 4 && !settingsLegacy(plan)) {
    registerTownCircuit(
      next,
      urbanRegions,
      program.walls,
      actualTownFaces ? [...actualTownFaces] : [...plan.urban].map(id => faceIdOf[id])
    );
    if (plan.castleSite) {
      const installed = installCastle(next, plan.castleSite, plan.castleSite.faceId, source.generationSeed ?? "");
      if (!installed) {
        return reject("castle", "castle-layout-too-small", "城の門・庭・必須棟が区画に入りません");
      }
      next = installed;
      mesh = next.mesh;
    }
  }

  for (const circuit of next.defenseCircuits ?? []) {
    if (!circuit.locked && plan.moats?.[circuit.scope] !== undefined)
      circuit.moat = { enabled: !!plan.moats[circuit.scope], widthMeters: circuit.scope === "town" ? 12 : 8 };
  }

  mark("wall-junctions");
  // ⑤ roads. First open 4-way wall passages at gates (merge nearest wall
  // neighbour or split a cell) so a road can pass through on opposite edges.
  // Then snap roads, never onto a river or wall edge. Finally open river
  // bridges at remaining road–river meetings and thread the road through.
  if (stageStep >= 5) {
    {
      // Open a real crossing before routing, keeping roads off river edges.
      const rivers = next.featureGroups.filter(g => g.kind === "river");
      const center = plan.precincts.find(p => p.kind === "plaza")?.anchor ?? [0, 0];
      for (const [riverIndex, river] of rivers.entries()) {
        const allowed = plan.rivers[riverIndex]?.bridgeAllowed;
        const locked = next.featureGroups.some(g => g.id === `${GEN_PREFIX}bridge-${riverIndex}` && g.locked);
        if (river.kind !== "river" || !allowed || locked) continue;
        const candidates = river.vertices
          .slice(1, -1)
          .filter(
            id =>
              next.mesh.vertices[id] &&
              Object.values(next.mesh.edges).some(
                e =>
                  (e.a === id || e.b === id) &&
                  [e.leftFace, e.rightFace].some(fid => fid && next.mesh.faces[fid].properties.buildable)
              )
          );
        const crossingScore = (id: Id) => {
          const point = next.mesh.vertices[id].point;
          const distance = Math.hypot(point[0] - center[0], point[1] - center[1]);
          if (!complete || next.gridKind !== "evolution" || river.style.widthMeters <= next.frame.blockSizeMeters)
            return distance;
          const index = river.vertices.indexOf(id);
          const before = next.mesh.vertices[river.vertices[index - 1]].point;
          const after = next.mesh.vertices[river.vertices[index + 1]].point;
          const ax = point[0] - before[0],
            ay = point[1] - before[1];
          const bx = after[0] - point[0],
            by = after[1] - point[1];
          const dot = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
          // A sharp bend has no single short perpendicular across its ribbon.
          // Prefer a nearby straight reach before opening the crossing.
          return distance + river.style.widthMeters * 2 * (1 - dot);
        };
        candidates.sort((a, b) => crossingScore(a) - crossingScore(b));
        for (const id of candidates) {
          if (complete && next.gridKind === "evolution" && river.style.widthMeters > next.frame.blockSizeMeters) {
            const bridged = addWideRiverBridge(next, id, `${GEN_PREFIX}bridge-${riverIndex}`);
            if (bridged) {
              next = bridged;
              break;
            }
            continue;
          }
          const opened = openBarrierPassage(next, id, "river");
          if (opened) {
            const bridged = addBridge(opened, id, `${GEN_PREFIX}bridge-${riverIndex}`);
            if (bridged) {
              next = bridged;
              break;
            }
          }
        }
      }
    }
    for (const gate of townGates(next)) {
      if (gate.locked) continue;
      const opened = openBarrierPassage(next, gate.vertexId, "wall");
      if (opened) next = opened;
    }
    {
      const preliminaryBans = new Set([...kindEdgeIds(next, "river"), ...kindEdgeIds(next, "wall")]);
      const probe = completeRoadRouter(
        next,
        routingPlan,
        faceIdOf,
        nearestVertexLookup(next.mesh, Math.max(1, source.frame.blockSizeMeters)),
        preliminaryBans,
        !program.walls,
        urbanRegions
      );
      const approaches = plan.roads.length - plan.streets.length;
      if (plan.roads.some((line, i) => i < plan.gates.length * 2 && !probe(line, i < approaches).length)) {
        next = connectDryCellInteriors(next);
      }
    }
    mesh = next.mesh;
    const nearestAfter = nearestVertexLookup(mesh, Math.max(1, source.frame.blockSizeMeters));
    const plazaFaces = new Set(next.elements.find(e => e.kind === "plaza")?.faceIds ?? []);
    const internalPlazaEdges = Object.values(mesh.edges)
      .filter(e => e.leftFace && e.rightFace && plazaFaces.has(e.leftFace) && plazaFaces.has(e.rightFace))
      .map(e => e.id);
    const templeElem = next.elements.find(e => e.kind === "temple");
    const templeFaces = new Set(templeElem?.faceIds ?? []);
    const internalTempleEdges = Object.values(mesh.edges)
      .filter(e => e.leftFace && e.rightFace && templeFaces.has(e.leftFace) && templeFaces.has(e.rightFace))
      .map(e => e.id);
    const templeNave = templeElem?.point
      ? templeRectForElement(templeElem.point, templeElem.sizeMeters, templeElem.rotation, next.frame.extentMeters)
      : null;
    const templeBlockedEdges = new Set<Id>(internalTempleEdges);
    if (templeNave) {
      for (const edge of Object.values(mesh.edges)) {
        const pa = mesh.vertices[edge.a]?.point;
        const pb = mesh.vertices[edge.b]?.point;
        if (!pa || !pb) continue;
        if (orientedRectPolylineDistance(templeNave, [pa, pb]) <= 0) {
          templeBlockedEdges.add(edge.id);
        }
      }
    }
    const channelEdges = Object.values(mesh.edges)
      .filter(edge => lineHitsWater([mesh.vertices[edge.a].point, mesh.vertices[edge.b].point], waterPolygons(next)))
      .map(edge => edge.id);
    const banned = new Set<Id>([
      ...channelEdges,
      ...kindEdgeIds(next, "river"),
      ...kindEdgeIds(next, "wall"),
      ...internalPlazaEdges,
      ...templeBlockedEdges
    ]);
    const banReasons = new Map<Id, string[]>();
    const recordBans = (ids: Iterable<Id>, reason: string) => {
      for (const id of ids) banReasons.set(id, [...(banReasons.get(id) ?? []), reason]);
    };
    recordBans(channelEdges, "water-area: 連続した水路内の辺");
    recordBans(kindEdgeIds(next, "river"), "river-edge: 川の辺");
    recordBans(kindEdgeIds(next, "wall"), "wall-edge: 城壁の辺");
    recordBans(internalPlazaEdges, "plaza-interior: 広場の内部辺");
    recordBans(templeBlockedEdges, "temple: 寺院の内部・身廊");
    const layout = plan.layout ?? source.layout;
    if (layout === "bram") {
      const plazaElem = next.elements.find(e => e.kind === "plaza");
      const hub: Point = plazaElem?.point ?? [0, 0];
      const banRadius = bramRoadBanRadiusMeters(bramCoreRadiusForCity(source.frame.cityRadiusMeters, program.walls));
      for (const e of Object.values(mesh.edges)) {
        const pa = mesh.vertices[e.a]?.point;
        const pb = mesh.vertices[e.b]?.point;
        if (
          pa &&
          pb &&
          (Math.hypot(pa[0] - hub[0], pa[1] - hub[1]) < banRadius ||
            Math.hypot(pb[0] - hub[0], pb[1] - hub[1]) < banRadius)
        ) {
          banned.add(e.id);
          recordBans([e.id], "bram-core: Bram中心部の道路禁止半径内");
        }
      }
    }
    const routeComplete = completeRoadRouter(
      next,
      routingPlan,
      faceIdOf,
      nearestAfter,
      banned,
      !program.walls,
      urbanRegions,
      banReasons
    );
    // A complete city supplies one approach road and one interior street for
    // every planned gate. Gate placement is allowed to fail (for example when
    // the matching wall run was removed at the coast), so never materialize
    // either route for a gate that did not actually make it onto the mesh.
    const approachRoadCount = plan.roads.length - plan.streets.length;
    plan.roads.forEach((polyline, i) => {
      const isApproach = i < approachRoadCount;
      // Approaches and the matching gate-to-plaza streets share a gate index.
      // Later streets are extras and are not paired with a planned gate.
      const gateIndex = isApproach ? i : i - approachRoadCount;
      const gateExists = townGates(next).some(gate => gate.id === `${GEN_PREFIX}gate-${gateIndex}`);
      if (complete && program.walls && gateIndex >= 0 && gateIndex < approachRoadCount && !gateExists) return;
      const segments = routeComplete(polyline, isApproach, false, trace => {
        trace.routeId = `${GEN_PREFIX}road-${i}`;
        const id = `${GEN_PREFIX}gate-${gateIndex}`;
        gateRouting.set(id, [...(gateRouting.get(id) ?? []), trace]);
      });
      if (segments.length < 1) return;
      if (!isApproach && program.walls) {
        const wallEdges = kindEdgeIds(next, "wall");
        const wallVertices = new Set([...wallEdges].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
        const gateVertices = new Set(townGates(next).map(g => g.vertexId));
        const segStart = (seg: (typeof segments)[0]) => {
          const e = mesh.edges[seg.edgeId];
          return seg.forward ? e.a : e.b;
        };
        const segEnd = (seg: (typeof segments)[0]) => {
          const e = mesh.edges[seg.edgeId];
          return seg.forward ? e.b : e.a;
        };
        while (segments.length > 1) {
          const startV = segStart(segments[0]);
          if (wallVertices.has(startV) && !gateVertices.has(startV)) {
            segments.shift();
          } else {
            break;
          }
        }
        while (segments.length > 1) {
          const endV = segEnd(segments[segments.length - 1]);
          if (wallVertices.has(endV) && !gateVertices.has(endV)) {
            segments.pop();
          } else {
            break;
          }
        }
        if (segments.length === 1) {
          const startV = segStart(segments[0]);
          const endV = segEnd(segments[0]);
          if (
            (wallVertices.has(startV) && !gateVertices.has(startV)) ||
            (wallVertices.has(endV) && !gateVertices.has(endV))
          ) {
            return;
          }
        }
      }
      appendGeneratedGroup({
        id: `${GEN_PREFIX}road-${i}`,
        kind: "road",
        name: `Road ${i + 1}`,
        ...(isApproach && plan.importedRoads && plan.gates[gateIndex]?.roadIndex !== undefined
          ? {
              sourceRoad: {
                index: plan.importedRoads[plan.gates[gateIndex].roadIndex!].sourceIndex,
                routeId: plan.importedRoads[plan.gates[gateIndex].roadIndex!].routeId
              }
            }
          : {}),
        segments,
        style: { widthMeters: defaultRoadWidthMeters(source.frame.extentMeters), color: "#735238" },
        locked: false
      });
    });
    if (complete && plan.importedRoads === undefined) {
      // Far-bank FMG roads must cross the entire span before entering town.
      // An exterior-only gate route can otherwise skirt the river instead.
      const plaza = plan.precincts.find(p => p.kind === "plaza");
      for (const bridge of next.featureGroups.filter(
        g => g.kind === "road" && g.id.startsWith(`${GEN_PREFIX}bridgeApproach-`)
      )) {
        const vertices = featureGroupVertices(next, bridge);
        const bankA = mesh.vertices[vertices[0]].point;
        const bankB = mesh.vertices[vertices.at(-1)!].point;
        const river = next.featureGroups.find(g => g.kind === "river" && g.vertices.some(id => vertices.includes(id)));
        if (river?.kind !== "river") continue;
        const riverPoints = river.vertices.map(id => mesh.vertices[id].point);
        for (const [i, line] of (plan.roadPaths ?? []).entries()) {
          if (!line.slice(1).some((point, j) => polylineCrossesSegment(riverPoints, line[j], point))) continue;
          const end = line.at(-1)!;
          const half = source.frame.extentMeters / 2;
          const scale = half / Math.max(Math.abs(end[0]), Math.abs(end[1]), 1);
          const far: Point = [end[0] * scale, end[1] * scale];
          const nearA =
            Math.hypot(far[0] - bankA[0], far[1] - bankA[1]) < Math.hypot(far[0] - bankB[0], far[1] - bankB[1]);
          const entry = nearA ? bankA : bankB,
            exit = nearA ? bankB : bankA;
          const target = plazaApproachPoint(cells, plaza, exit);
          if (!target) continue;
          const approach = routeComplete([far, entry], false, true);
          const street = routeComplete([exit, target], false, true);
          if (!approach.length || !street.length || bridge.kind !== "road") continue;
          const span = nearA
            ? bridge.segments
            : bridge.segments
                .slice()
                .reverse()
                .map(ref => ({
                  edgeId: ref.edgeId,
                  forward: !ref.forward
                }));
          const segments = [...approach, ...span, ...street];
          appendGeneratedGroup({
            id: `${bridge.id.replace("bridgeApproach-", "riverRoad-")}-${i}`,
            kind: "road",
            name: "Cross-river road",
            segments,
            style: { widthMeters: defaultRoadWidthMeters(source.frame.extentMeters), color: "#735238" },
            locked: false
          });
        }
      }
    }
    next = complete ? straightenBridges(next) : openGeneratedPassages(next);
    mesh = next.mesh;
    if (!complete) {
      // A diagnostic route may reach a river where a passage cannot be opened.
      // Keep its longest safe run instead of leaving a false river junction.
      const roadVertices = new Set(
        next.featureGroups.flatMap(group =>
          group.kind === "road"
            ? group.segments.flatMap(ref => [mesh.edges[ref.edgeId].a, mesh.edges[ref.edgeId].b])
            : []
        )
      );
      const blockedVertices = new Set(
        next.featureGroups
          .flatMap(group => (group.kind === "river" ? group.vertices : []))
          .filter(id => roadVertices.has(id) && !vertexHasKindPassage(next, id, "river"))
      );
      const blockedEdges = new Set(
        Object.values(mesh.edges)
          .filter(edge => blockedVertices.has(edge.a) || blockedVertices.has(edge.b))
          .map(edge => edge.id)
      );
      next.featureGroups = next.featureGroups.flatMap(group => {
        if (group.locked || group.kind !== "road" || !group.id.startsWith(GEN_PREFIX)) return [group];
        const segments = longestUnbannedRun(group.segments, blockedEdges);
        return segments.length ? [{ ...group, segments }] : [];
      });
    }
  }

  if (stageStep >= 5) {
    next = shortcutExteriorRoads(next, true);
    mesh = next.mesh;
  }

  mark("route-junctions");
  // Accepted gates are an invariant. Never make an incomplete route look
  // successful by deleting its gate (and then deleting its paired roads).
  const disconnected = townGates(next).filter(
    gate =>
      !gate.locked &&
      gate.id.startsWith(GEN_PREFIX) &&
      (!vertexHasKindPassage(next, gate.vertexId, "wall") ||
        ((complete || stageStep >= 6) && !vertexHasCrossing(next, gate.vertexId, "wall", "road")))
  );
  if (disconnected.length) {
    return reject(
      "gate-routing",
      "unconnected-gates",
      `門 ${disconnected.length} 箇所の道路接続を確保できない`,
      { gates: townGates(next).length, disconnected: disconnected.length },
      disconnected.flatMap(gate => [
        `${gate.id}: ${gate.vertexId}`,
        `門 ${gate.vertexId}: wall-passage=${vertexHasKindPassage(next, gate.vertexId, "wall")}, wall-road-crossing=${vertexHasCrossing(next, gate.vertexId, "wall", "road")}`,
        `門 ${gate.vertexId} の道路辺: ${
          next.featureGroups
            .flatMap(group =>
              group.kind === "road"
                ? group.segments
                    .filter(ref => {
                      const edge = mesh.edges[ref.edgeId];
                      return edge.a === gate.vertexId || edge.b === gate.vertexId;
                    })
                    .map(ref => ref.edgeId)
                : []
            )
            .join(", ") || "なし"
        }`
      ]),
      disconnected.flatMap(gate => gateRouting.get(gate.id) ?? [])
    );
  }

  // Trim or remove any road endpoints that terminate on curtain wall vertices without a gate.
  if (complete && program.walls) {
    const wallEdges = kindEdgeIds(next, "wall");
    const wallVertices = new Set([...wallEdges].flatMap(id => [next.mesh.edges[id].a, next.mesh.edges[id].b]));
    const gateVertices = new Set(townGates(next).map(g => g.vertexId));

    next.featureGroups = next.featureGroups.flatMap(group => {
      if (group.locked || group.kind !== "road" || !group.id.startsWith(GEN_PREFIX)) return [group];
      const segments = [...group.segments];
      const segStart = (seg: (typeof segments)[0]) => {
        const e = next.mesh.edges[seg.edgeId];
        return seg.forward ? e.a : e.b;
      };
      const segEnd = (seg: (typeof segments)[0]) => {
        const e = next.mesh.edges[seg.edgeId];
        return seg.forward ? e.b : e.a;
      };
      while (segments.length > 0) {
        const startV = segStart(segments[0]);
        if (wallVertices.has(startV) && !gateVertices.has(startV)) {
          segments.shift();
        } else {
          break;
        }
      }
      while (segments.length > 0) {
        const endV = segEnd(segments[segments.length - 1]);
        if (wallVertices.has(endV) && !gateVertices.has(endV)) {
          segments.pop();
        } else {
          break;
        }
      }
      return segments.length > 0 ? [{ ...group, segments }] : [];
    });
  }

  // Keep connected suburban districts, including those reached through local
  // lanes. Requiring every face to touch a major road would erase the outer
  // residential belt before buildLocalFabric can create its access network.
  if (complete && program.walls && next.featureGroups.some(g => g.kind === "wall")) {
    const activeGateVertices = new Set(townGates(next).map(gate => gate.vertexId));
    const roadEdges = new Set(
      next.featureGroups.flatMap(g => (g.kind === "road" ? g.segments.map(s => s.edgeId) : []))
    );
    const reachable = new Set<Id>();
    if (next.gridKind === "evolution") {
      const barriers = new Set([...kindEdgeIds(next, "wall"), ...kindEdgeIds(next, "river")]);
      const land = new Set(
        Object.values(mesh.faces)
          .filter(f => f.properties.water === "land" && f.properties.buildable && f.properties.ward !== "farm")
          .map(f => f.id)
      );
      const queue = [...land].filter(id =>
        mesh.faces[id].boundary.some(ref => roadEdges.has(ref.edgeId) && !barriers.has(ref.edgeId))
      );
      for (const id of queue) reachable.add(id);
      for (let i = 0; i < queue.length; i++) {
        const face = mesh.faces[queue[i]];
        for (const ref of face.boundary) {
          const edge = mesh.edges[ref.edgeId];
          const other = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
          if (
            !other ||
            !land.has(other) ||
            reachable.has(other) ||
            barriers.has(edge.id) ||
            edge.locked ||
            face.properties.locked ||
            mesh.faces[other].properties.locked
          )
            continue;
          reachable.add(other);
          queue.push(other);
        }
      }
    }
    for (let cellId = 0; cellId < cells.length; cellId++) {
      if (plan.urban.has(cellId)) continue;
      const face = faceFor(cellId);
      if (!face || face.properties.locked || face.properties.water !== "land" || reservedCastleFaces(next).has(face.id))
        continue;
      if (
        !face.properties.ward ||
        face.properties.ward === "empty" ||
        face.properties.ward === "park" ||
        face.properties.ward === "farm" ||
        face.properties.ward === "cemetery"
      )
        continue;

      const hasRoad = face.boundary.some(b => roadEdges.has(b.edgeId));
      const hasGate = face.boundary.some(b => {
        const edge = next.mesh.edges[b.edgeId];
        return edge && (activeGateVertices.has(edge.a) || activeGateVertices.has(edge.b));
      });
      if (!hasRoad && !hasGate && !reachable.has(face.id)) {
        face.properties.ward = "empty";
        face.properties.buildable = false;
      }
    }
  }

  if (stageStep >= 6) settleTempleOnDocument(next);
  if (stageStep >= 5 && next.castles?.length && !finalizeCastles(next, true)) {
    return reject("castle", "castle-no-access", "城門から市街への支線を確保できません");
  }

  const errors = validate(next);
  mark("apply-validation", { errors: errors.length });
  if (errors.length) {
    return reject(
      "apply-validation",
      "invalid-mesh",
      `メッシュ検証が ${errors.length} 件のエラーで失敗`,
      { errors: errors.length },
      errors.slice(0, 20)
    );
  }
  if (stageStep >= 6) {
    syncDocumentCemeteries(next);
  }
  return next;
}

/** Re-route against the topology AFTER gates have been opened. Snapping each
 * old Voronoi hop independently can leave a road ending beside its own gate. */
export function completeRoadRouter(
  document: CityDocument,
  plan: Plan,
  faceIdOf: string[],
  nearest: NearestVertex,
  banned: Set<Id>,
  openRim = false,
  urbanRegions: Point[][] = [],
  banReasons: Map<Id, string[]> = new Map()
): (
  polyline: Point[],
  outside: boolean,
  acrossBanks?: boolean,
  onTrace?: (trace: RoadRoutingTrace) => void
) => EdgeRef[] {
  const { mesh } = document;
  const ids = Object.keys(mesh.vertices);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const graph: EdgeGraph = { points: ids.map(id => mesh.vertices[id].point), adjacency: ids.map(() => []) };
  const edgeFor = new Map<string, (typeof mesh.edges)[string]>();
  for (const edge of Object.values(mesh.edges)) {
    const a = indexOf.get(edge.a)!;
    const b = indexOf.get(edge.b)!;
    const p = graph.points[a];
    const q = graph.points[b];
    const w = Math.hypot(q[0] - p[0], q[1] - p[1]);
    graph.adjacency[a].push({ to: b, w });
    graph.adjacency[b].push({ to: a, w });
    edgeFor.set(`${Math.min(a, b)},${Math.max(a, b)}`, edge);
  }
  const urban = new Set([...plan.urban].map(i => faceIdOf[i]));
  // Passage splitting inherits the parent region, including newly allocated faces.
  const originalFaces = new Set(faceIdOf);
  for (const face of Object.values(mesh.faces)) {
    if (originalFaces.has(face.id)) continue;
    const center = polygonCentroid(facePoints(mesh, face));
    if (urbanRegions.some(region => pointInPolygon(center, region))) urban.add(face.id);
  }
  // Membership can become stale when a gate passage or a citadel cuts the
  // curtain into several groups. A face is inside when every path to the map
  // frame crosses a wall, including a castle curtain that replaced a town arc.
  // An open sea wall still reaches the burg, and that flood is not used.
  let curtainInterior: Set<Id> | undefined;
  const barrierWalls = kindEdgeIds(document, "wall");
  const barrierVertices = new Set([...barrierWalls].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
  const wallDegree = new Map<Id, number>();
  for (const id of barrierWalls) {
    const edge = mesh.edges[id];
    for (const vertex of [edge.a, edge.b]) wallDegree.set(vertex, (wallDegree.get(vertex) ?? 0) + 1);
  }
  // A citadel spur or an open sea wall is not a closed curtain. Degree 2 keeps
  // the previous route classification for those towns.
  if (!openRim && barrierWalls.size && [...wallDegree.values()].every(degree => degree === 2)) {
    const exterior = new Set<Id>();
    const queue: Id[] = [];
    for (const edge of Object.values(mesh.edges)) {
      if (edge.leftFace && edge.rightFace) continue;
      for (const id of [edge.leftFace, edge.rightFace]) {
        if (id && !barrierWalls.has(edge.id) && !exterior.has(id)) {
          exterior.add(id);
          queue.push(id);
        }
      }
    }
    for (const id of queue) {
      for (const ref of mesh.faces[id].boundary) {
        if (barrierWalls.has(ref.edgeId)) continue;
        const edge = mesh.edges[ref.edgeId];
        const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
        if (other && !exterior.has(other)) {
          exterior.add(other);
          queue.push(other);
        }
      }
    }
    const originFace = Object.values(mesh.faces).find(face => pointInPolygon([0, 0], facePoints(mesh, face)));
    if (
      exterior.size > 0 &&
      exterior.size < Object.keys(mesh.faces).length &&
      originFace &&
      !exterior.has(originFace.id)
    ) {
      curtainInterior = new Set(Object.keys(mesh.faces).filter(id => !exterior.has(id)));
    }
  }
  const restricted = new Map<Id, Set<Id>>();
  for (const kind of ["wall", "river"] as const) {
    const edges = kindEdgeIds(document, kind);
    const vertices = new Set([...edges].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
    for (const id of vertices) {
      const allowed = new Set(throughEdgesAt(document, id, kind, kind === "river").map(e => e.id));
      const previous = restricted.get(id);
      restricted.set(id, previous ? new Set([...allowed].filter(e => previous.has(e))) : allowed);
    }
  }
  const bridgeEdges = new Set(
    document.featureGroups.flatMap(g =>
      g.kind === "road" && g.id.startsWith(`${GEN_PREFIX}bridgeApproach-`) ? g.segments.map(ref => ref.edgeId) : []
    )
  );
  const bridgeInterior = new Map<Id, Set<Id>>();
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || !group.id.startsWith(`${GEN_PREFIX}bridgeApproach-`)) continue;
    const vertices = featureGroupVertices(document, group);
    for (const id of vertices.slice(1, -1))
      bridgeInterior.set(
        id,
        new Set(
          group.segments
            .filter(ref => {
              const edge = mesh.edges[ref.edgeId];
              return edge.a === id || edge.b === id;
            })
            .map(ref => ref.edgeId)
        )
      );
  }
  const moat = new MoatReservation(document, defaultRoadWidthMeters(document.frame.extentMeters) / 2 + 1);
  const castleBlocked = new Set(
    Object.values(mesh.edges)
      .filter(edge => !castleRoadEdgeAllowed(document, edge.id, defaultRoadWidthMeters(document.frame.extentMeters)))
      .map(edge => edge.id)
  );
  const moatBlocked = new Set(
    Object.values(mesh.edges)
      .filter(edge => !moat.roadAllowed(mesh.vertices[edge.a].point, mesh.vertices[edge.b].point))
      .map(edge => edge.id)
  );
  const gateIds = new Set(townGates(document).map(g => g.vertexId));
  const plazaFaces = new Set(document.elements.find(e => e.kind === "plaza")?.faceIds ?? []);
  const internalPlazaEdges = new Set(
    Object.values(mesh.edges)
      .filter(e => e.leftFace && e.rightFace && plazaFaces.has(e.leftFace) && plazaFaces.has(e.rightFace))
      .map(e => e.id)
  );
  const riverRouteVertices = new Set<Id>();
  for (const group of document.featureGroups)
    if (group.kind === "river") for (const id of group.vertices) riverRouteVertices.add(id);
  const endpoint = (p: Point): Id | null => {
    const plannedIndex = plan.gates.findIndex(g => Math.hypot(g.point[0] - p[0], g.point[1] - p[1]) < 0.01);
    if (plannedIndex >= 0) {
      const placed = townGates(document).find(g => g.id === `${GEN_PREFIX}gate-${plannedIndex}`);
      if (placed) return placed.vertexId;
    }
    const gate = nearest(p, gateIds);
    if (gate) {
      const q = mesh.vertices[gate].point;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < document.frame.blockSizeMeters * 0.8) return gate;
    }
    return nearest(p);
  };
  return (polyline, outside, acrossBanks = false, onTrace) => {
    const searches: RoadRoutingTrace["searches"] = [];
    if (polyline.length < 2) {
      onTrace?.({
        outside,
        plannedPoints: polyline,
        waypoints: [],
        status: "failed",
        path: [],
        searches,
        reason: "予定経路の座標が2点未満"
      });
      return [];
    }
    const snap = (p: Point, gateEnd: boolean) => (gateEnd ? endpoint(p) : nearest(p));
    const sampled: Point[] = [];
    const stride = Math.max(1, Math.ceil((polyline.length - 1) / 8));
    for (let i = 0; i < polyline.length; i += stride) sampled.push(polyline[i]);
    if (sampled.at(-1) !== polyline.at(-1)) sampled.push(polyline[polyline.length - 1]);
    const waypoints: number[] = [];
    for (let i = 0; i < sampled.length; i++) {
      const onFrame =
        acrossBanks && i === 0 && sampled[i].some(value => Math.abs(value) >= document.frame.extentMeters / 2 - 0.01)
          ? new Set(
              ids.filter(id =>
                mesh.vertices[id].point.some(value => Math.abs(value) >= document.frame.extentMeters / 2 - 0.01)
              )
            )
          : undefined;
      let id = onFrame ? nearest(sampled[i], onFrame) : snap(sampled[i], outside ? i === sampled.length - 1 : i === 0);
      // The nearest plaza corner is often a curtain vertex. An interior street
      // has to end on a town vertex or its only hops are the wall itself.
      const gateEnd = outside ? i === sampled.length - 1 : i === 0;
      if (
        !outside &&
        !gateEnd &&
        id &&
        barrierVertices.has(id) &&
        !gateIds.has(id) &&
        (plan.layout ?? document.layout) !== "bram"
      ) {
        const point = sampled[i];
        const host = Object.values(mesh.faces).find(
          face => (curtainInterior?.has(face.id) || urban.has(face.id)) && pointInPolygon(point, facePoints(mesh, face))
        );
        const pool = host
          ? faceVertices(mesh, host)
          : [...(curtainInterior ?? urban)].flatMap(fid =>
              mesh.faces[fid] ? faceVertices(mesh, mesh.faces[fid]) : []
            );
        let best: Id | undefined;
        let bestDist = Infinity;
        for (const vertexId of pool) {
          if (barrierVertices.has(vertexId) || gateIds.has(vertexId)) continue;
          const at = mesh.vertices[vertexId]?.point;
          if (!at) continue;
          const dist = Math.hypot(at[0] - point[0], at[1] - point[1]);
          if (dist < bestDist) {
            bestDist = dist;
            best = vertexId;
          }
        }
        if (best) id = best;
      }
      const idx = id ? indexOf.get(id) : undefined;
      if (idx === undefined || waypoints.at(-1) === idx) continue;
      waypoints.push(idx);
    }
    // A hamlet plaza can snap onto the gate vertex. One inward passage arm
    // still has to exist or the gate has no town-side road.
    if (!outside && waypoints.length === 1 && gateIds.has(ids[waypoints[0]])) {
      const vertexId = ids[waypoints[0]];
      const inward = throughEdgesAt(document, vertexId, "wall").find(edge =>
        [edge.leftFace, edge.rightFace].some(id => !!id && (curtainInterior?.has(id) || urban.has(id)))
      );
      const other = inward ? (inward.a === vertexId ? inward.b : inward.a) : undefined;
      const otherIndex = other ? indexOf.get(other) : undefined;
      if (otherIndex !== undefined && otherIndex !== waypoints[0]) waypoints.push(otherIndex);
    }
    if (!waypoints.length || (!outside && waypoints.length < 2)) {
      onTrace?.({
        outside,
        plannedPoints: polyline,
        waypoints: waypoints.map(i => ids[i]),
        status: "failed",
        path: [],
        searches,
        reason: "スナップ後の経由頂点が不足（頂点なし、または始点と終点が同一）"
      });
      return [];
    }
    const hopEndOf = waypoints[waypoints.length - 1];
    let useCurrentCurtain = false;
    let blocked: RoadRoutingTrace["searches"][number]["blocked"] = [];
    const weight = (a: number, b: number, w: number, hopEnd: number) => {
      const edge = edgeFor.get(`${Math.min(a, b)},${Math.max(a, b)}`)!;
      const rejectEdge = (reason: string) => {
        if (onTrace) blocked.push({ edge: edge.id, from: ids[a], to: ids[b], reason });
        return Infinity;
      };
      if (castleBlocked.has(edge.id)) return rejectEdge("castle: 城・城壁の禁止領域");
      if (moatBlocked.has(edge.id)) return rejectEdge("moat: 門の通路以外で堀に進入");
      for (const id of [edge.a, edge.b])
        if (bridgeInterior.has(id) && !gateIds.has(id) && !bridgeInterior.get(id)!.has(edge.id))
          return rejectEdge(`bridge-interior: 橋の途中 ${id} から分岐`);
      if (banned.has(edge.id)) {
        const canUsePlazaEdge =
          !outside &&
          internalPlazaEdges.has(edge.id) &&
          (gateIds.has(edge.a) || gateIds.has(edge.b) || a === hopEnd || b === hopEnd);
        if (!canUsePlazaEdge) return rejectEdge(banReasons.get(edge.id)?.join("; ") ?? "banned-edge: 道路探索の禁止辺");
      }
      if (riverRouteVertices.has(edge.a) && riverRouteVertices.has(edge.b))
        return rejectEdge("river-bank: 両端が川の頂点");
      for (const id of [edge.a, edge.b]) {
        if (restricted.has(id) && !restricted.get(id)!.has(edge.id))
          return rejectEdge(
            `barrier-passage: ${id} で川・壁を通り抜ける腕ではない（許可辺: ${[...restricted.get(id)!].join(", ") || "なし"}）`
          );
      }
      const faces = [edge.leftFace, edge.rightFace].filter((id): id is Id => id !== null);
      if (plan.avoidSea && faces.some(id => mesh.faces[id].properties.water !== "land"))
        return rejectEdge("water-face: 水面に接する辺");
      const inTown = faces.some(id => (useCurrentCurtain ? curtainInterior! : urban).has(id));
      if (!acrossBanks && outside === inTown && !bridgeEdges.has(edge.id)) {
        if (outside && openRim && (a === hopEnd || b === hopEnd)) return w;
        return rejectEdge(
          outside
            ? `town-interior: 城外道路が城内セルに接する (${faces.filter(id => (useCurrentCurtain ? curtainInterior! : urban).has(id)).join(", ")})`
            : `town-exterior: 城内道路が城外セルに接する (${faces.join(", ")})`
        );
      }
      return w;
    };
    const stitch = (points: number[]): number[] | null => {
      const nodes: number[] = [points[0]];
      for (let i = 0; i < points.length - 1; i++) {
        const hopEnd = points[i + 1];
        blocked = [];
        const start = nodes.at(-1)!;
        const hop = aStar(
          graph,
          start,
          hopEnd,
          (a, b, w) => weight(a, b, w, hopEnd),
          onTrace
            ? (partial, reached) => {
                const visited = new Set(reached.map(i => ids[i]));
                const partialPath = [...nodes.slice(0, -1), ...partial];
                searches.push({
                  start: ids[start],
                  end: ids[hopEnd],
                  classification: useCurrentCurtain ? "current-curtain" : "planned",
                  reachedCount: reached.length,
                  partialPath: partialPath.map(i => ids[i]),
                  partialEdges: partialPath.slice(1).map((v, i) => {
                    return edgeFor.get(`${Math.min(partialPath[i], v)},${Math.max(partialPath[i], v)}`)!.id;
                  }),
                  blocked: blocked.filter(block => !visited.has(block.to))
                });
              }
            : undefined
        );
        if (!hop || hop.length < 2) return null;
        nodes.push(...hop.slice(1));
      }
      return nodes.length >= 2 ? nodes : null;
    };
    let nodes = stitch(waypoints) ?? stitch([waypoints[0], hopEndOf]);
    // Passage splits and a citadel can leave the planned urban ids behind the
    // curtain that was actually built. Retry a failed interior street on that
    // curtain; a route that already succeeded keeps its planned membership.
    if (!nodes && !outside && curtainInterior) {
      useCurrentCurtain = true;
      nodes = stitch(waypoints) ?? stitch([waypoints[0], hopEndOf]);
      if (!nodes) useCurrentCurtain = false;
    }
    // Keep successful planned routes unchanged. Only retry a failed exterior
    // approach against the repaired closed curtain.
    for (let pass = 0; outside && pass < (curtainInterior ? 2 : 1); pass++) {
      if (pass > 0) {
        useCurrentCurtain = true;
        const retried = stitch(waypoints) ?? stitch([waypoints[0], hopEndOf]);
        if (retried) nodes = retried;
        else useCurrentCurtain = false;
      }
      if (
        outside &&
        (!nodes || graph.points[nodes[0]].every(value => Math.abs(value) < document.frame.extentMeters / 2 - 0.01))
      ) {
        // The bearing can snap to an unusable river mouth. Search dry frame
        // exits in bearing order before giving up the already placed gate.
        const half = document.frame.extentMeters / 2;
        const target = graph.points[waypoints[0]];
        const exits = ids.map((_, i) => i).filter(i => graph.points[i].some(v => Math.abs(v) >= half - 0.01));
        exits.sort(
          (a, b) =>
            Math.hypot(graph.points[a][0] - target[0], graph.points[a][1] - target[1]) -
            Math.hypot(graph.points[b][0] - target[0], graph.points[b][1] - target[1])
        );
        for (const exit of exits) {
          const extended = stitch([exit, hopEndOf]);
          if (extended) {
            nodes = extended;
            break;
          }
        }
      }
      if (nodes && graph.points[nodes[0]].some(value => Math.abs(value) >= document.frame.extentMeters / 2 - 0.01))
        break;
    }
    if (!nodes && !outside && gateIds.has(ids[waypoints[0]])) {
      // A coastal plaza corner may itself touch water or a wall. Connect to
      // another vertex of the same square instead of dropping the gate road.
      const plaza = document.elements.find(element => element.kind === "plaza");
      const targets = new Set(
        (plaza?.faceIds ?? []).flatMap(id =>
          (mesh.faces[id]?.boundary ?? []).flatMap(ref => {
            const edge = mesh.edges[ref.edgeId];
            return [indexOf.get(edge.a)!, indexOf.get(edge.b)!];
          })
        )
      );
      // Polygonal plazas (circulade/bram) have no face IDs. Their nearest
      // corner can snap into a temple footprint; try the other plaza corners
      // rather than treating that blocked snap as an unreachable gate.
      if (!plaza?.faceIds.length) {
        const precinct = plan.precincts.find(p => p.kind === "plaza");
        for (const point of precinct?.polygon ?? []) {
          const id = nearest(point);
          const index = id ? indexOf.get(id) : undefined;
          if (index !== undefined) targets.add(index);
        }
      }
      if ((plan.layout ?? document.layout) === "bram") {
        // A spoke ends outside the reserved core, but its nearest mesh vertex
        // can lie inside it. Try nearby exterior vertices before rejecting the
        // gate; all wall, river, sea, castle and moat restrictions still apply.
        const hub = plan.precincts.find(p => p.kind === "plaza")?.anchor ?? [0, 0];
        const core = bramCoreRadiusForCity(document.frame.cityRadiusMeters, !openRim);
        const minimumRadius = bramRoadBanRadiusMeters(core);
        const aim = polyline.at(-1)!;
        for (const [index, point] of graph.points.entries()) {
          if (
            Math.hypot(point[0] - hub[0], point[1] - hub[1]) >= minimumRadius &&
            Math.hypot(point[0] - aim[0], point[1] - aim[1]) <= document.frame.blockSizeMeters
          )
            targets.add(index);
        }
      }
      const target = graph.points[hopEndOf];
      const candidates = [...targets].sort(
        (a, b) =>
          Math.hypot(graph.points[a][0] - target[0], graph.points[a][1] - target[1]) -
          Math.hypot(graph.points[b][0] - target[0], graph.points[b][1] - target[1])
      );
      for (const candidate of candidates) {
        nodes = stitch([waypoints[0], candidate]);
        if (nodes) break;
      }
    }
    const emitTrace = () =>
      onTrace?.({
        outside,
        plannedPoints: polyline,
        waypoints: waypoints.map(i => ids[i]),
        status: nodes ? "connected" : "failed",
        path: nodes?.map(i => ids[i]) ?? [],
        edges:
          nodes?.slice(1).map((b, i) => edgeFor.get(`${Math.min(nodes![i], b)},${Math.max(nodes![i], b)}`)!.id) ?? [],
        searches
      });
    if (!nodes) {
      emitTrace();
      return [];
    }
    if (outside) {
      const half = document.frame.extentMeters / 2;
      const onFrame = (node: number) => graph.points[node].some(value => Math.abs(value) >= half - 0.01);
      // Routes are stored frame → town. Keep the first frame contact seen
      // from town, even when the discarded tail briefly returns inland.
      const firstContactFromTown = nodes.findLastIndex(onFrame);
      if (firstContactFromTown >= 0) nodes = nodes.slice(firstContactFromTown);
    }
    emitTrace();
    return nodes.slice(1).map((b, i) => {
      const edge = edgeFor.get(`${Math.min(nodes[i], b)},${Math.max(nodes[i], b)}`)!;
      return { edgeId: edge.id, forward: edge.a === ids[nodes[i]] };
    });
  };
}

// --- mesh ⇆ Cell[] & polyline snapping --------------------------------------

function cellsFromMesh(mesh: Mesh, half: number): { cells: Cell[]; faceIdOf: string[] } {
  const faces = Object.values(mesh.faces);
  const indexOf = new Map<string, number>();
  faces.forEach((face, i) => {
    indexOf.set(face.id, i);
  });
  const rect = { minX: -half, minY: -half, maxX: half, maxY: half };
  const cells: Cell[] = faces.map((face, i) => {
    const polygon = facePoints(mesh, face).map(p => [p[0], p[1]] as Point);
    const centroid = polygonCentroid(polygon);
    return {
      id: i,
      site: face.site ? [face.site[0], face.site[1]] : centroid,
      polygon,
      centroid,
      neighbors: faceNeighbors(mesh, face.id)
        .map(fid => indexOf.get(fid))
        .filter((n): n is number => n !== undefined && n !== i),
      onBorder: polygonTouchesRectEdge(polygon, rect, Math.max(0.5, half * 1e-4))
    };
  });
  return { cells, faceIdOf: faces.map(f => f.id) };
}

function borderLoopsForFaces(mesh: Mesh, urbanFaces: Set<Id>, cellIdOf?: Map<string, number>): MeshBorderLoop[] {
  if (!urbanFaces.size) return [];

  const seen = new Set<Id>();
  const loops: MeshBorderLoop[] = [];
  for (const start of urbanFaces) {
    if (seen.has(start)) continue;
    const component = new Set<Id>([start]);
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const fid = queue.pop() as Id;
      for (const nfid of faceNeighbors(mesh, fid)) {
        if (urbanFaces.has(nfid) && !component.has(nfid)) {
          component.add(nfid);
          seen.add(nfid);
          queue.push(nfid);
        }
      }
    }
    const boundary: EdgeRef[] = [];
    for (const fid of component) {
      const face = mesh.faces[fid];
      for (const ref of face.boundary) {
        const edge = mesh.edges[ref.edgeId];
        const other = edge.leftFace === fid ? edge.rightFace : edge.leftFace;
        if (!other || !component.has(other)) boundary.push(ref);
      }
    }
    const ordered = traceBoundaryLoops(mesh, boundary);
    if (!ordered.length) continue;
    const outer = ordered.reduce((a, b) => (loopArea(mesh, a) >= loopArea(mesh, b) ? a : b));
    loops.push({
      segments: outer,
      points: loopPoints(mesh, outer),
      cellIds: cellIdOf ? [...component].map(fid => cellIdOf.get(fid)).filter((n): n is number => n !== undefined) : []
    });
  }
  return loops;
}

/** Component border loops on the mesh edges bounding each connected urban blob
 * (the largest loop — the outer circumference). No mesh mutation. */
function componentBorderLoops(mesh: Mesh, faceIdOf: string[], urbanCellIds: Set<number>): MeshBorderLoop[] {
  const cellIdOf = new Map(faceIdOf.map((fid, i) => [fid, i]));
  const urbanFaces = new Set<Id>();
  for (const id of urbanCellIds) if (faceIdOf[id]) urbanFaces.add(faceIdOf[id]);
  return borderLoopsForFaces(mesh, urbanFaces, cellIdOf);
}

/** `orderedBoundaryLoops`, but tolerant of pinch vertices (a boundary vertex with
 * >2 incident boundary edges, common when a fine mesh's urban blob has a thin
 * tentacle): follow the directed edges greedily, taking the smallest left turn so
 * the urban material stays on the left, and keep whatever closed loops emerge. */
function traceBoundaryLoops(mesh: Mesh, boundary: EdgeRef[]): EdgeRef[][] {
  const clean = orderedBoundaryLoops(mesh, boundary);
  if (clean?.length) return clean;

  const remaining = new Set(boundary);
  const byStart = new Map<Id, EdgeRef[]>();
  const startOf = (ref: EdgeRef): Id => {
    const e = mesh.edges[ref.edgeId];
    return ref.forward ? e.a : e.b;
  };
  const dir = (ref: EdgeRef): number => {
    const e = mesh.edges[ref.edgeId];
    const a = mesh.vertices[ref.forward ? e.a : e.b].point;
    const b = mesh.vertices[ref.forward ? e.b : e.a].point;
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  for (const ref of boundary) (byStart.get(startOf(ref)) ?? byStart.set(startOf(ref), []).get(startOf(ref))!).push(ref);

  const loops: EdgeRef[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as EdgeRef;
    const start = startOf(first);
    const loop = [first];
    remaining.delete(first);
    let end = edgeEnd(mesh, first);
    let incoming = dir(first);
    let guard = boundary.length + 4;
    while (end !== start && guard-- > 0) {
      const choices = (byStart.get(end) ?? []).filter(r => remaining.has(r));
      if (!choices.length) break;
      const next = choices.sort((a, b) => leftTurn(incoming, dir(a)) - leftTurn(incoming, dir(b)))[0];
      loop.push(next);
      remaining.delete(next);
      incoming = dir(next);
      end = edgeEnd(mesh, next);
    }
    if (loop.length >= 3 && end === start) loops.push(loop);
  }
  return loops;
}

function leftTurn(from: number, to: number): number {
  return (to - from + Math.PI * 2) % (Math.PI * 2);
}

function loopPoints(mesh: Mesh, refs: EdgeRef[]): Point[] {
  return refs.map(ref => {
    const edge = mesh.edges[ref.edgeId];
    const v = mesh.vertices[ref.forward ? edge.a : edge.b];
    return [v.point[0], v.point[1]] as Point;
  });
}

function loopArea(mesh: Mesh, refs: EdgeRef[]): number {
  const pts = loopPoints(mesh, refs);
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

type NearestVertex = (p: Point, among?: ReadonlySet<Id>) => Id | null;

function nearestVertexLookup(mesh: Mesh, bucket: number): NearestVertex {
  const B = Math.max(1, bucket);
  const grid = new Map<string, Id[]>();
  const key = (x: number, y: number): string => `${Math.round(x / B)},${Math.round(y / B)}`;
  for (const vertex of Object.values(mesh.vertices)) {
    const k = key(vertex.point[0], vertex.point[1]);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(vertex.id);
  }
  return (p, among) => {
    const gx = Math.round(p[0] / B);
    const gy = Math.round(p[1] / B);
    let best: Id | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (let x = gx - 2; x <= gx + 2; x++) {
      for (let y = gy - 2; y <= gy + 2; y++) {
        for (const id of grid.get(`${x},${y}`) ?? []) {
          if (among && !among.has(id)) continue;
          const v = mesh.vertices[id];
          const d = Math.hypot(v.point[0] - p[0], v.point[1] - p[1]);
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
      }
    }
    if (best) return best;
    // Widen once for a constrained search (e.g. gate → wall vertex).
    for (const id of among ?? Object.keys(mesh.vertices)) {
      const v = mesh.vertices[id];
      if (!v) continue;
      const d = Math.hypot(v.point[0] - p[0], v.point[1] - p[1]);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };
}

/** Generator polyline → a contiguous list of mesh vertex ids (for a river). */
function polylineToVertexPath(
  mesh: Mesh,
  polyline: Point[],
  nearest: NearestVertex,
  againstFlow: ReadonlySet<string> = new Set()
): Id[] {
  const raw: Id[] = [];
  for (const p of polyline) {
    const id = nearest(p);
    if (id && raw.at(-1) !== id) raw.push(id);
  }
  if (raw.length < 2) return raw;
  const out: Id[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const a = out.at(-1) as Id;
    const b = raw[i];
    if (a === b) continue;
    if (edgeBetween(mesh, a, b) && !againstFlow.has(`${a}>${b}`)) {
      out.push(b);
      continue;
    }
    const bridge = againstFlow.size
      ? shortestPathWithFlow(mesh, a, b, againstFlow, new Set(out.slice(0, -1)))
      : shortestPath(mesh, a, b);
    if (!bridge) return []; // Never emit a river that ends at an interior gap.
    out.push(...bridge.slice(1));
  }
  // Snapping the resolved walk back to mesh vertices can revisit a vertex even
  // when the geometric walk has no loop (for example A → B → A). Remove the
  // closed span so the emitted river cannot double back over its own edge.
  const simple: Id[] = [];
  const index = new Map<Id, number>();
  for (const id of out) {
    const previous = index.get(id);
    if (previous !== undefined) {
      for (const removed of simple.splice(previous + 1)) index.delete(removed);
    } else {
      index.set(id, simple.length);
      simple.push(id);
    }
  }
  return simple;
}

/** Bridge a graph-walk gap without reversing an already emitted river edge. */
function shortestPathWithFlow(
  mesh: Mesh,
  from: Id,
  to: Id,
  againstFlow: ReadonlySet<string>,
  visited: ReadonlySet<Id>
): Id[] | null {
  const adjacent = new Map<Id, Id[]>();
  for (const edge of Object.values(mesh.edges)) {
    (adjacent.get(edge.a) ?? adjacent.set(edge.a, []).get(edge.a)!).push(edge.b);
    (adjacent.get(edge.b) ?? adjacent.set(edge.b, []).get(edge.b)!).push(edge.a);
  }
  for (const neighbors of adjacent.values()) neighbors.sort();
  const previous = new Map<Id, Id | null>([[from, null]]);
  const queue = [from];
  for (let i = 0; i < queue.length && !previous.has(to); i++) {
    const id = queue[i];
    for (const neighbor of adjacent.get(id) ?? []) {
      if (previous.has(neighbor) || (visited.has(neighbor) && neighbor !== to)) continue;
      if (againstFlow.has(`${id}>${neighbor}`)) continue;
      previous.set(neighbor, id);
      queue.push(neighbor);
    }
  }
  if (!previous.has(to)) return null;
  const path: Id[] = [];
  for (let id: Id | null = to; id; id = previous.get(id) ?? null) path.push(id);
  return path.reverse();
}

/** Push the temple nave off finished roads, rivers and walls, then re-align it. */
function settleTempleOnDocument(document: CityDocument): void {
  const temple = document.elements.find(element => element.kind === "temple" && element.point);
  if (!temple?.point) return;
  const roads: Point[][] = [];
  const rivers: Point[][] = [];
  const hazards: { points: Point[]; clearance: number }[] = [];
  const walls: { points: Point[]; clearance: number }[] = [];
  for (const group of document.featureGroups) {
    if (group.kind === "wall") {
      const points = featureGroupVertices(document, group)
        .map(id => document.mesh.vertices[id]?.point)
        .filter((p): p is Point => !!p);
      if (points.length >= 2) {
        const wall = { points, clearance: group.style.widthMeters / 2 + 4 };
        walls.push(wall);
        hazards.push(wall);
      }
    } else if (group.kind === "road") {
      const points = featureGroupVertices(document, group)
        .map(id => document.mesh.vertices[id]?.point)
        .filter((p): p is Point => !!p);
      if (points.length < 2) continue;
      roads.push(points);
      hazards.push({ points, clearance: Math.max(group.style.widthMeters / 2 + 2.2, 10.2) });
    } else if (group.kind === "river") {
      const points = group.vertices.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
      if (points.length < 2) continue;
      rivers.push(points);
      hazards.push({ points, clearance: Math.max(group.style.widthMeters / 2 + 2, 10.2) });
    }
  }
  const land: Point[][] = [];
  const water: Point[][] = [];
  for (const face of Object.values(document.mesh.faces)) {
    (face.properties.water === "land" ? land : water).push(facePoints(document.mesh, face));
  }
  // Coast and map boundaries prevent the clearance nudge from escaping dry land.
  for (const edge of Object.values(document.mesh.edges)) {
    const left = edge.leftFace ? document.mesh.faces[edge.leftFace] : undefined;
    const right = edge.rightFace ? document.mesh.faces[edge.rightFace] : undefined;
    if ((left?.properties.water === "land") === (right?.properties.water === "land")) continue;
    hazards.push({
      points: [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point],
      clearance: 2
    });
  }
  // The rendered beach occupies roughly 17 m inland from an ocean edge.
  // Give a cathedral at least the same inland setback as ordinary buildings.
  for (const [a, b] of oceanShoreSegments(document)) {
    hazards.push({ points: [a, b], clearance: COASTAL_BUILDING_SETBACK_METERS });
  }
  const plazaGuides: Point[][] = [];
  const plaza = document.elements.find(element => element.kind === "plaza");
  if (plaza) {
    for (const id of plaza.faceIds) {
      const face = document.mesh.faces[id];
      if (!face) continue;
      const ring = facePoints(document.mesh, face);
      if (ring.length >= 3) plazaGuides.push([...ring, ring[0]]);
    }
  }
  const guides = [...roads, ...plazaGuides];
  const parkPlots = Object.values(document.mesh.faces)
    .filter(face => face.properties.ward === "park" || face.properties.ward === "cemetery")
    .map(face => facePoints(document.mesh, face));
  let rect = placeAndClearTempleRect(
    temple.point,
    document.frame.extentMeters,
    guides,
    hazards.length ? hazards : templeHazards(roads, rivers, document.frame.extentMeters)
  );
  const validSite = (candidate: typeof rect): boolean =>
    hazards.every(hazard => orientedRectPolylineDistance(candidate, hazard.points) >= hazard.clearance - 0.2) &&
    !parkPlots.some(plot => polygonHitsOrientedRect(plot, candidate)) &&
    templeFitsLand(candidate, land, water);
  if (!validSite(rect)) {
    const candidates = Object.values(document.mesh.faces)
      .filter(
        face =>
          face.properties.settlement === "core" && face.properties.water === "land" && face.properties.ward !== "park"
      )
      .map(face => polygonCentroid(facePoints(document.mesh, face)))
      .sort(
        (a, b) =>
          Math.hypot(a[0] - temple.point![0], a[1] - temple.point![1]) -
          Math.hypot(b[0] - temple.point![0], b[1] - temple.point![1])
      );
    for (const center of candidates) {
      const candidate = placeAndClearTempleRect(center, document.frame.extentMeters, guides, hazards);
      if (!validSite(candidate)) continue;
      rect = candidate;
      break;
    }
    // A cramped town may have no site large enough for the nave and its clearance.
    if (!validSite(rect)) {
      document.elements = document.elements.filter(element => element !== temple);
      return;
    }
  }
  const plazaCenter = plaza?.point ?? (plazaGuides.length ? polygonCentroid(plazaGuides[0]) : undefined);
  temple.point = rect.center;
  temple.rotation = orientTempleHybrid(rect.center, rect.rotation, plazaCenter, document.historicalPeriod);

  const nave = templeRectForElement(temple.point, temple.sizeMeters, temple.rotation, document.frame.extentMeters);
  const hitFaces = Object.values(document.mesh.faces).filter(face => {
    const poly = facePoints(document.mesh, face);
    return pointInPolygon(temple.point!, poly) || polygonHitsOrientedRect(poly, nave);
  });
  if (hitFaces.length) {
    temple.faceIds = hitFaces.map(f => f.id);
  }
}

/** A plaza-outline vertex, so gate→plaza streets meet the square instead of cutting through it. */
function plazaApproachPoint(cells: Cell[], plaza: Precinct | undefined, from?: Point): Point | null {
  if (!plaza) return null;
  if (!plaza.cellIds?.length) {
    if (plaza.polygon?.length && from) {
      let bestDist = Infinity;
      let bestPt: Point | null = null;
      for (const p of plaza.polygon) {
        const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
        if (d < 1) continue;
        if (d < bestDist) {
          bestDist = d;
          bestPt = p;
        }
      }
      if (bestPt) return bestPt;
    }
    return plaza.anchor ?? null;
  }
  const byId = new Map(cells.map(c => [c.id, c]));
  const members = plaza.cellIds.map(id => byId.get(id)).filter((c): c is Cell => !!c);
  if (!members.length) return plaza.anchor ?? null;
  const memberSet = new Set(members.map(m => m.id));

  const isShared = (u: Point, v: Point, currentCell: Cell): boolean => {
    for (const otherId of currentCell.neighbors) {
      if (!memberSet.has(otherId)) continue;
      const other = byId.get(otherId);
      if (!other) return false;
      const m = other.polygon.length;
      for (let j = 0; j < m; j++) {
        const pu = other.polygon[j];
        const pv = other.polygon[(j + 1) % m];
        if (
          (Math.hypot(u[0] - pu[0], u[1] - pu[1]) < 0.1 && Math.hypot(v[0] - pv[0], v[1] - pv[1]) < 0.1) ||
          (Math.hypot(u[0] - pv[0], u[1] - pv[1]) < 0.1 && Math.hypot(v[0] - pu[0], v[1] - pu[1]) < 0.1)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const perimeterVertices: Point[] = [];
  for (const cell of members) {
    const n = cell.polygon.length;
    for (let i = 0; i < n; i++) {
      const a = cell.polygon[i];
      const b = cell.polygon[(i + 1) % n];
      if (!isShared(a, b, cell)) {
        perimeterVertices.push(a, b);
      }
    }
  }
  if (!perimeterVertices.length) return plaza.anchor;

  let best: Point | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of perimeterVertices) {
    const d = from ? Math.hypot(p[0] - from[0], p[1] - from[1]) : Math.hypot(p[0], p[1]);
    if (from && d < 1) continue;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best ?? plaza.anchor;
}

/** Keep the longest contiguous run whose `edgeId`s are not in `banned`. */
function longestUnbannedRun(segments: EdgeRef[], banned: Set<Id>): EdgeRef[] {
  if (banned.size === 0) return segments;
  let best: EdgeRef[] = [];
  let current: EdgeRef[] = [];
  for (const segment of segments) {
    if (banned.has(segment.edgeId)) {
      if (current.length > best.length) best = current;
      current = [];
    } else current.push(segment);
  }
  return current.length > best.length ? current : best;
}

/**
 * One sea-wall gap, centred on the shore edge nearest the harbour. Grows along
 * neighbouring sea edges only until the gap is wide enough for a boat (~16 m).
 */
function seaOpeningEdgeIds(
  mesh: Mesh,
  loops: MeshBorderLoop[],
  waterPolygon: Point[] | null,
  anchor: Point | null
): Set<Id> {
  const open = new Set<Id>();
  interface SeaEdge {
    id: Id;
    mid: Point;
    length: number;
  }
  const seaEdges: SeaEdge[] = [];
  for (const loop of loops) {
    const runs =
      waterPolygon && waterPolygon.length >= 3
        ? splitDryWallRuns(loop.points, loop.segments, waterPolygon)
        : [loop.segments];
    for (const run of runs) {
      for (const segment of run) {
        const edge = mesh.edges[segment.edgeId];
        if (!edge) continue;
        const waters = [edge.leftFace, edge.rightFace]
          .filter((id): id is Id => !!id)
          .map(id => mesh.faces[id]?.properties.water);
        if (!waters.includes("sea") || !waters.includes("land")) continue;
        const a = mesh.vertices[edge.a]?.point;
        const b = mesh.vertices[edge.b]?.point;
        if (!a || !b) continue;
        seaEdges.push({
          id: segment.edgeId,
          mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          length: Math.hypot(b[0] - a[0], b[1] - a[1])
        });
      }
    }
  }
  if (!seaEdges.length) return open;
  const target = anchor ?? [0, 0];
  const distanceTo = (edge: SeaEdge) => Math.hypot(edge.mid[0] - target[0], edge.mid[1] - target[1]);
  seaEdges.sort((a, b) => distanceTo(a) - distanceTo(b) || a.id.localeCompare(b.id));
  const seed = seaEdges[0];
  const byId = new Map(seaEdges.map(edge => [edge.id, edge]));
  const atVertex = new Map<Id, Id[]>();
  for (const seaEdge of seaEdges) {
    const edge = mesh.edges[seaEdge.id];
    for (const vertexId of [edge.a, edge.b]) {
      const list = atVertex.get(vertexId) ?? [];
      list.push(seaEdge.id);
      atVertex.set(vertexId, list);
    }
  }
  const MIN_GAP = 16;
  open.add(seed.id);
  let length = seed.length;
  while (length < MIN_GAP) {
    const frontier: Id[] = [];
    for (const id of open) {
      const edge = mesh.edges[id];
      for (const vertexId of [edge.a, edge.b]) {
        for (const next of atVertex.get(vertexId) ?? []) {
          if (!open.has(next)) frontier.push(next);
        }
      }
    }
    const next = [...new Set(frontier)].sort(
      (a, b) => distanceTo(byId.get(a)!) - distanceTo(byId.get(b)!) || a.localeCompare(b)
    )[0];
    if (!next) break;
    open.add(next);
    length += byId.get(next)!.length;
  }
  return open;
}

function unbannedRuns(segments: EdgeRef[], banned: Set<Id>): EdgeRef[][] {
  const runs: EdgeRef[][] = [];
  let current: EdgeRef[] = [];
  for (const segment of segments) {
    if (banned.has(segment.edgeId)) {
      if (current.length) runs.push(current);
      current = [];
    } else current.push(segment);
  }
  if (current.length) runs.push(current);
  return runs;
}

// --- misc -------------------------------------------------------------------

function toGeneratorBorder(loop: MeshBorderLoop): {
  points: Point[];
  segments: WallSegmentKind[];
  urbanCellIds: number[];
} {
  return {
    points: loop.points.map(p => [p[0], p[1]] as Point),
    segments: loop.points.map(() => "land" as WallSegmentKind),
    urbanCellIds: loop.cellIds
  };
}

function editorWard(
  kind: WardKind
):
  | "market"
  | "castle"
  | "merchant"
  | "craftsmen"
  | "patriciate"
  | "harbor"
  | "park"
  | "farm"
  | "cemetery"
  | "empty"
  | null {
  switch (kind) {
    case "market":
    case "castle":
    case "merchant":
    case "craftsmen":
    case "patriciate":
    case "harbor":
    case "park":
    case "farm":
    case "cemetery":
    case "empty":
      return kind;
    case "slum":
    case "gate":
      return "empty";
    default:
      return null;
  }
}
