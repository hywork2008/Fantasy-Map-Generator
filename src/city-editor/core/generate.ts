import {
  placeAndClearTempleRect,
  polygonHitsOrientedRect,
  templeHazards,
  templeRectForElement
} from "./gen/civicPlacement";
import { createFabricPlan } from "./gen/fabricDistricts";
import { plazaFootprintMeters, templeFootprintMeters } from "./gen/housing";
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

import { featureGroupVertices, orderedBoundaryLoops, shortestPath } from "./features";
import { classifyRiver } from "./gen/classifyRiver";
import { type CoastResult, classifyCoast } from "./gen/classifySea";
import { classifyUrban } from "./gen/classifyUrban";
import { aStar, buildEdgeGraph, type EdgeGraph } from "./gen/edgeGraph";
import { finishCityGeometry } from "./gen/finishCityGeometry";
import { isSimplePolygon, pointInPolygon, polygonArea, polygonCentroid, polygonTouchesRectEdge } from "./gen/geom";
import { markSeaSurroundedGates, markWaterGate, placeGates, placePrecincts } from "./gen/interior";
import { shortcutMajorRoads } from "./gen/majorRoadShortcuts";
import {
  clipPolylinesToLand,
  majorityLandGatesUnserved,
  remakeUnreachableLandGates,
  splitDryWallRuns
} from "./gen/plausibility";
import { makeRng } from "./gen/prng";
import { isHexagonalDocument, rectifyHexBlocks } from "./gen/rectifyHexBlocks";
import { rectifyVoronoiBlocks } from "./gen/rectifyVoronoiBlocks";
import { type RoutedRiver, walkRiver } from "./gen/riverPath";
import {
  MIN_SETTLEMENT_AREA_SHARE,
  minExternalRoadsForExtent,
  resolveWalledAreaShare,
  splitUrbanCore
} from "./gen/settlementExtent";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { DEFAULT_SITE_CONFIG, FEATURE_KEYS, randomSiteConfig, type SiteConfig } from "./gen/site/siteConfig";
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
import { assignWards } from "./gen/wards";
import {
  type GenerationObserver,
  type GenerationSample,
  generationTimer,
  logGenerationFailures,
  reportGenerationFailure
} from "./generationDiagnostics";
import { clone, edgeBetween, edgeEnd, edgeRefFor, faceNeighbors, facePoints, validate } from "./mesh";
import {
  addBridge,
  explainGeneratedCrossingFailures,
  joinWallRiverCrossings,
  kindEdgeIds,
  openBarrierPassage,
  openGeneratedPassages,
  straightenBridges,
  throughEdgesAt,
  vertexHasCrossing,
  vertexHasKindPassage
} from "./passages";
import type { CityDocument, EdgeRef, FeatureGroup, Id, Mesh, Point } from "./types";

export type { CityFeatureSet, SiteConfig } from "./gen/site/siteConfig";
export type { FarNodeMode };
export { FEATURE_KEYS };

/** All feature groups / gates / elements this module owns carry this id prefix,
 * so a re-press can clear exactly its own output and leave hand-drawn work. */
const GEN_PREFIX = "gc:";

/** Population is only a wall-pattern nudge here (features come from the panel), so
 * a fixed nominal preset is fine — the real scale is the document's frame. */
const NOMINAL_PRESET = "largeTown" as const;

/** One runnable process, in order. `step` is the S-index it recomputes up to;
 * the grid step (S0) is intentionally absent — the mesh is the Document panel's. */
export interface GenerationStage {
  id: "coast" | "river" | "urban" | "walls" | "streets" | "wards";
  step: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  hint: string;
}

export const GENERATION_STAGES: GenerationStage[] = [
  { id: "coast", step: 1, label: "① 海岸線と海", hint: "Tag sea cells along a coastline walk" },
  { id: "river", step: 2, label: "② 河川", hint: "Route a river along the existing cell edges" },
  { id: "urban", step: 3, label: "③ 市街地コア", hint: "Mark the built-up cells" },
  {
    id: "walls",
    step: 4,
    label: "④ 城壁・門・城郭",
    hint: "Wall the urban outline, place gates, plaza & citadel (needs Walls)"
  },
  { id: "streets", step: 5, label: "⑤ 街路", hint: "Approach roads to the gates" },
  { id: "wards", step: 6, label: "⑥ 地区割り当て", hint: "Assign a district type to each urban cell" }
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
  config: SiteConfig;
  /** Approximate fraction of built-up area enclosed by the main wall (0.05–1).
   * Unset: tiny/small 100%, medium 45%, large 20%. Ignored when walls are disabled. */
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
  const geo = siteToGeography(descriptor);
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
  stageStep: number
): CityDocument | null {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) {
    reportGenerationFailure(undefined, 1, "prepare", "too-few-faces", `格子の面が3未満 (${faces.length})`, {
      faces: faces.length,
      stageStep
    });
    return null;
  }

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, settings, stageStep);
  return applyPlan(document, cells, faceIdOf, plan, program, stageStep);
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
  observer?: GenerationObserver
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
  for (let attempt = 0; attempt < COMPLETE_CITY_ATTEMPTS; attempt++) {
    const result = generateCityAttempt(
      document,
      settings,
      attempt ? `${seed}:junction-retry:${attempt}` : seed,
      observe,
      attempt + 1
    );
    if (result) {
      if (result.fabric) {
        const input = clone(document);
        delete input.fabric;
        result.fabric.generation = {
          algorithm: "evolution-city-v3",
          seed,
          settings: {
            ...structuredClone(settings),
            walledAreaShare: resolveWalledAreaShare(settings.walledAreaShare, document.frame.extentMeters)
          },
          input
        };
      }
      return result;
    }
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

function generateCityAttempt(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  observer?: GenerationObserver,
  attempt = 1
): CityDocument | null {
  const mark = generationTimer(observer, attempt);
  const reject = (
    phase: string,
    reason: string,
    message: string,
    counts?: Record<string, number>,
    details?: string[]
  ): null => {
    reportGenerationFailure(observer, attempt, phase, reason, message, counts, [`seed=${seed}`, ...(details ?? [])]);
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
    attempt
  );
  mark("plan-total");
  // Do not save a nominally successful town when imported water has consumed
  // its centre. Measure the flood-fill settlement, not the walled core — wall
  // capacity (Medium 45% / Large 20%) is a later split of the same fill.
  const targetArea = Math.PI * params.cityRadiusMeters ** 2;
  const minimumUrbanArea = targetArea * MIN_SETTLEMENT_AREA_SHARE;
  const settlementArea = cells
    .filter(cell => plan.builtUp.has(cell.id))
    .reduce((sum, cell) => sum + Math.abs(polygonArea(cell.polygon)), 0);
  if (settlementArea < minimumUrbanArea) {
    const walledShare = program.walls ? resolveWalledAreaShare(settings.walledAreaShare, params.extentMeters) : 1;
    const walledArea = cells
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
  const wards = new Map(plan.wards);
  for (const [id, kind] of wards) {
    if (["slum", "gate", "shanty", "military"].includes(kind)) wards.set(id, "craftsmen");
    if (["patriciate", "administration"].includes(kind)) wards.set(id, "merchant");
  }
  const streetOptions = resolveStreetSettings(settings);
  const plaza = plan.precincts.find(p => p.kind === "plaza");
  const star = plan.gates.map(
    g => [g.point, plazaApproachPoint(cells, plaza, g.point) ?? plaza?.anchor ?? [0, 0]] as Point[]
  );
  const sameEnd = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 8;
  const extras = plan.streets.filter(line => {
    const a = line[0],
      b = line[line.length - 1];
    return !star.some(s => (sameEnd(s[0], a) && sameEnd(s[1], b)) || (sameEnd(s[0], b) && sameEnd(s[1], a)));
  });
  const streets = [...star, ...extras];
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
    cells,
    faceIdOf,
    { ...plan, wards, streets, roads: [...roads, ...streets] },
    program,
    6,
    true,
    observer,
    attempt
  );
  mark("apply-total");
  if (!next) return null;
  const minRoads = requiredExternalRoads(settings, document.frame.extentMeters);
  const roadsBeforeFinish = countExternalApproachRoads(next);
  if (minRoads > 0 && roadsBeforeFinish < minRoads)
    return reject(
      "street-plan",
      "too-few-external-roads",
      `仕上げ前の外縁道路が ${roadsBeforeFinish} 本で、最低 ${minRoads} 本に届かない`,
      { roads: roadsBeforeFinish, minRoads, gates: next.gates.length }
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
  const shaped = hexagonal || coarse ? finished : rectifyVoronoiBlocks(finished, seed, rectified);
  mark("rectify-voronoi");
  const settled = straightenBridges(shaped);
  settleTempleOnDocument(settled);
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
      { issues: crossingDetails.length, gates: settled.gates.length, roads: roadsAfterFinish },
      crossingDetails.slice(0, 20)
    );
  if (minRoads > 0 && roadsAfterFinish < minRoads)
    return reject(
      "crossing-validation",
      "too-few-external-roads",
      `仕上げ後の外縁道路が ${roadsAfterFinish} 本で、最低 ${minRoads} 本に届かない`,
      { roads: roadsAfterFinish, minRoads, gates: settled.gates.length }
    );
  if (tangled.length)
    return reject(
      "crossing-validation",
      "self-intersecting-faces",
      `evolution格子に自己交差する街区が ${tangled.length} 面ある`,
      { faces: tangled.length },
      tangled.slice(0, 12)
    );
  if (coarse) settled.fabric = createFabricPlan(settled, seed);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, settings, 3);
  const total = plan.urbanStages.length;
  if (total === 0) {
    return { document: applyPlan(document, cells, faceIdOf, plan, program, 3), total: 0, index: -1, cellId: null };
  }
  const index = Math.max(0, Math.min(stepIndex, total - 1));
  const stage = plan.urbanStages[index];
  const stepped: Plan = {
    ...plan,
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, settings, 1);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, settings, 2);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, settings, 4);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, settings, 5);
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

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, settings, 6);
  const total = plan.wardOrder.length;
  if (total === 0) {
    return { document: applyPlan(document, cells, faceIdOf, plan, program, 6), total: 0, index: -1, detail: null };
  }
  const index = Math.max(0, Math.min(stepIndex, total - 1));
  const prefix = plan.wardOrder.slice(0, index + 1);
  const stepped: Plan = { ...plan, wards: new Map(prefix.map(w => [w.cellId, w.kind])) };
  const last = prefix[index];
  return {
    document: applyPlan(document, cells, faceIdOf, stepped, program, 6),
    total,
    index,
    detail: `${last.kind} · cell #${last.cellId} — ${index + 1}/${total}`
  };
}

// --- classifier chain (a trimmed pipeline.ts, no mesh-mutating steps) ---------

interface Plan {
  sea: Set<number>;
  /** S1's raw graph walk (upstream → downstream), before it is closed into
   * `sea`'s water polygon. Empty before S1 runs. See `generateCoastWalkStep`. */
  coastPath: Point[];
  /** Closed water polygon from S1, or null when landlocked. Used by the G2
   * plausibility filter in `applyPlan` (wet wall edges) and tests. */
  waterPolygon: Point[] | null;
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
  roads: Point[][];
  streets: Point[][];
  wards: Map<number, WardKind>;
  /** `wards`' source data, in decision order rather than sorted by cell id. Empty
   * before S6 runs. See `generateWardStep`. */
  wardOrder: WardAssignment[];
  templeHarbor: Precinct[];
}

/** An urban-component outline: the exact mesh edges (for a Wall group) and their
 * vertex coordinates (for the generator's BorderLoop shape). */
interface MeshBorderLoop {
  segments: EdgeRef[];
  points: Point[];
  cellIds: number[];
}

function runPlan(
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
  attempt = 1
): Plan {
  const mark = generationTimer(observer, attempt);
  const streetOpts = resolveStreetSettings(settings);
  const empty: Plan = {
    sea: new Set(),
    coastPath: [],
    waterPolygon: null,
    avoidSea: streetOpts.avoidSea,
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
  const coasts = waterInputs
    .map((water, i) =>
      classifyCoast(graph, water.corridor, water.waterAzimuthDeg, cells, half, cellSize, makeRng(`${seed}:water:${i}`))
    )
    .filter((c): c is CoastResult => c !== null);
  const coast = coasts[0] ?? null;
  const coastPath = coast?.shoreline ?? [];
  const waterPolygon = coast?.waterPolygon ?? null;
  const sea = new Set<number>(coasts.flatMap(c => [...c.sea]));
  mark("coast");
  if (stageStep < 2) return { ...empty, sea, coastPath, waterPolygon };

  // S2 — river along the cell-edge graph (no fold-back into the mesh).
  const rivers = geo.rivers
    .map((r, i) =>
      walkRiver(
        graph,
        r.corridor,
        r.widths,
        coast?.waterPolygon ?? null,
        coast?.shoreline ?? null,
        cellSize,
        half,
        makeRng(`${seed}:river:${i}`),
        r.bridgeAllowed
      )
    )
    .filter(band => !band.fallback && band.edgePoints.length >= 2);
  const river = classifyRiver(
    cells,
    sea,
    rivers.map(band => ({ edgePoints: band.edgePoints }))
  );
  mark("river");
  if (stageStep < 3) return { ...empty, sea, coastPath, waterPolygon, rivers };

  // S3 — urban core. `params.urbanNPatches` (debug/tuning override) caps the
  // fill to a fixed cell count; otherwise accumulate actual area up to π R².
  // `urbanStages` records each admitted cell in fill order for
  // `generateUrbanPatchStep`'s per-loop scrub.
  const shoreTangent = coast ? shorelineTangentAt(coast.shoreline) : null;
  const urbanRadius = program.walls ? params.cityRadiusMeters * 0.92 : params.cityRadiusMeters;
  const urbanBearings = program.port && geo.coast ? [...geo.roadBearings, geo.coast.waterAzimuthDeg] : geo.roadBearings;
  const classification = classifyUrban(
    cells,
    { sea, bank: complete ? new Map() : river.bank },
    urbanBearings,
    urbanRadius,
    complete ? null : shoreTangent,
    params.urbanNPatches ?? null,
    params.cellSizeMeters,
    !complete && stageStep === 3
  );
  // City extent and wall capacity are independent. The outer residential
  // belt retains the rest of the same flood-fill, including its connectivity.
  const { urban, residentialOutskirts } = splitUrbanCore(
    cells,
    classification.urban,
    program.walls ? resolveWalledAreaShare(settings.walledAreaShare, params.extentMeters) : 1
  );
  const outskirts = new Set([...classification.outskirts, ...residentialOutskirts]);
  const urbanStages = classification.stages.filter(stage => urban.has(stage.cellId));
  const builtUp = classification.urban;
  mark("urban", { urbanFaces: urban.size, recordedStages: urbanStages.length, builtUpFaces: builtUp.size });
  if (stageStep < 4) return { ...empty, sea, coastPath, waterPolygon, rivers, urban, outskirts, urbanStages, builtUp };

  // S4 — outline the urban blob along real mesh edges, gates, plaza & citadel.
  const riverLines = rivers.map(band => band.smoothPoints);
  const borderLoops = componentBorderLoops(mesh, faceIdOf, urban);
  const genBorders = borderLoops.map(loop => toGeneratorBorder(loop));
  const precincts = placePrecincts(cells, urban, sea, genBorders, geo, params, program, riverLines);
  const citadel = precincts.find(p => p.kind === "citadel");
  const citadelOutline = citadel
    ? (componentBorderLoops(mesh, faceIdOf, new Set(citadel.cellIds))[0]?.points ?? null)
    : null;
  const placed = markWaterGate(
    placeGates(cells, urban, genBorders, geo),
    genBorders,
    coast?.shoreline ?? null,
    program.port
  );
  const gates = streetOpts.avoidSea ? markSeaSurroundedGates(placed, waterPolygon, cellSize) : placed;
  mark("wall-plan");
  if (stageStep < 5) {
    return {
      ...empty,
      sea,
      coastPath,
      waterPolygon,
      rivers,
      urban,
      outskirts,
      urbanStages,
      builtUp,
      borderLoops,
      gates,
      precincts,
      citadelOutline
    };
  }

  // S5 — approach roads (raw A* on the same graph; not smoothed into the mesh).
  const streetInput = {
    cells,
    urban,
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
    roads = clipPolylinesToLand(roads, waterPolygon);
    streetResult = {
      ...streetResult,
      roads,
      arteries: clipPolylinesToLand(streetResult.arteries, waterPolygon)
    };
    routedGates = remakeUnreachableLandGates(routedGates, roads, cellSize);
  }
  mark("street-plan");
  if (stageStep < 6) {
    return {
      ...empty,
      sea,
      coastPath,
      waterPolygon,
      rivers,
      urban,
      outskirts,
      urbanStages,
      builtUp,
      borderLoops,
      gates: routedGates,
      precincts,
      citadelOutline,
      roads,
      streets: streetResult.streets
    };
  }

  // S6 — wards.
  const warded = assignWards({
    cells,
    urban,
    outskirts,
    residentialOutskirts,
    sea,
    borders: genBorders,
    gates: routedGates,
    precincts,
    geo: streetGeo,
    params,
    program,
    shoreline: coast?.shoreline ?? null,
    waterPolygon,
    streets: [...streetResult.streets, ...roads],
    rivers: rivers.map(band => band.edgePoints)
  });
  mark("wards");
  return {
    sea,
    coastPath,
    waterPolygon,
    avoidSea: streetOpts.avoidSea,
    rivers,
    urban,
    outskirts,
    urbanStages,
    builtUp,
    borderLoops,
    gates: routedGates,
    precincts,
    citadelOutline,
    roads,
    streets: streetResult.streets,
    wards: new Map(warded.wards.map(w => [w.cellId, w.kind])),
    wardOrder: warded.assignmentOrder,
    templeHarbor: warded.precincts
  };
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
  attempt = 1
): CityDocument | null {
  const mark = generationTimer(observer, attempt);
  let next = clone(source);
  delete next.appearance;
  let mesh = next.mesh;

  // Clear this module's previous output + every non-locked face tag, so the
  // stages read as a scrub through the process rather than an accumulation.
  next.featureGroups = next.featureGroups.filter(group => group.locked || !group.id.startsWith(GEN_PREFIX));
  next.gates = (next.gates ?? []).filter(gate => gate.locked || !gate.id.startsWith(GEN_PREFIX));
  next.elements = next.elements.filter(element => element.locked || !element.id.startsWith(GEN_PREFIX));
  for (const face of Object.values(mesh.faces)) {
    if (face.properties.locked) continue;
    face.properties.water = "land";
    if (face.properties.elevation <= 0) face.properties.elevation = 1;
    face.properties.buildable = true;
    face.properties.ward = null;
    delete face.properties.settlement;
  }

  const appendGeneratedGroup = (group: FeatureGroup) => {
    if (!next.featureGroups.some(existing => existing.id === group.id && existing.locked))
      next.featureGroups.push(group);
  };

  const faceFor = (cellId: number): (typeof mesh.faces)[string] | undefined => mesh.faces[faceIdOf[cellId]];
  const nearest = nearestVertexLookup(mesh, Math.max(1, source.frame.blockSizeMeters));

  // ① sea
  for (const cellId of plan.sea) {
    const face = faceFor(cellId);
    if (face && !face.properties.locked) {
      face.properties.water = "sea";
      face.properties.elevation = 0;
      face.properties.buildable = false;
    }
  }

  // ③ built-up cells (buildable). Non-urban land is not buildable.
  if (stageStep >= 3) {
    const built = new Set<number>([...plan.urban, ...plan.outskirts]);
    for (let id = 0; id < cells.length; id++) {
      const face = faceFor(id);
      if (face && !face.properties.locked && face.properties.water === "land") {
        face.properties.buildable = built.has(id);
        if (source.gridKind === "evolution" && built.has(id))
          face.properties.settlement = plan.urban.has(id) ? "core" : "outskirts";
      }
    }
  }

  // ② river feature groups
  if (stageStep >= 2) {
    plan.rivers.forEach((band, i) => {
      const vertices = polylineToVertexPath(mesh, band.edgePoints, nearest);
      if (vertices.length < 2) return;
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

  mark("apply-terrain");
  // ④ walls + gates + plaza / citadel. When avoidSea is on, drop edges whose
  // midpoint sits in the water so the sea side is left open (§3.E.2), splitting
  // the remainder into contiguous runs (`validate` requires that).
  if (stageStep >= 4 && program.walls) {
    let wallIndex = 0;
    const openEdges = new Set<Id>();
    if (complete) {
      if (plan.avoidSea && program.wallPlan?.coast !== "seaWall") {
        for (const edge of Object.values(mesh.edges)) {
          if ([edge.leftFace, edge.rightFace].some(id => id && mesh.faces[id].properties.water !== "land"))
            openEdges.add(edge.id);
        }
      }
    }
    plan.borderLoops.forEach(loop => {
      const runs =
        plan.avoidSea && plan.waterPolygon
          ? splitDryWallRuns(loop.points, loop.segments, plan.waterPolygon)
          : [loop.segments];
      for (const segments of runs.flatMap(run => unbannedRuns(run, openEdges))) {
        if (segments.length < 1) continue;
        appendGeneratedGroup({
          id: `${GEN_PREFIX}wall-${wallIndex}`,
          kind: "wall",
          name: `Wall ${wallIndex + 1}`,
          segments,
          style: { widthMeters: Math.max(4, source.frame.blockSizeMeters * 0.14), color: "#41382e" },
          locked: false
        });
        wallIndex++;
      }
    });
  }
  if (stageStep >= 4) {
    if (complete) {
      next = joinWallRiverCrossings(next);
      mesh = next.mesh;
    }
    const wallVertices = new Set<Id>();
    for (const group of next.featureGroups) {
      if (group.kind !== "wall") continue;
      for (const segment of group.segments) {
        const edge = mesh.edges[segment.edgeId];
        if (edge) wallVertices.add(edge.a).add(edge.b);
      }
    }
    plan.gates.forEach((gate, i) => {
      if (next.gates.some(g => g.id === `${GEN_PREFIX}gate-${i}` && g.locked)) return;
      const vertexId = nearestVertexLookup(next.mesh, Math.max(1, source.frame.blockSizeMeters))(
        gate.point,
        wallVertices
      );
      if (complete && vertexId) {
        const point = mesh.vertices[vertexId].point;
        if (Math.hypot(point[0] - gate.point[0], point[1] - gate.point[1]) > 0.1) return;
      }
      if (vertexId) {
        const opened = openBarrierPassage(next, vertexId, "wall");
        if (!opened) return;
        next = opened;
        mesh = next.mesh;
        next.gates.push({ id: `${GEN_PREFIX}gate-${i}`, vertexId, locked: false });
      }
    });
    // Reserved precinct landmarks as point-anchored elements.
    for (const precinct of [...plan.precincts, ...plan.templeHarbor]) {
      if (!["plaza", "citadel", "temple", "harbor"].includes(precinct.kind)) continue;
      if (next.elements.some(e => e.id === `${GEN_PREFIX}${precinct.kind}` && e.locked)) continue;
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
        rotation: precinct.rotation,
        locked: false
      });
    }
  }

  mark("wall-junctions");
  // ⑤ roads. First open 4-way wall passages at gates (merge nearest wall
  // neighbour or split a cell) so a road can pass through on opposite edges.
  // Then snap roads, never onto a river or wall edge. Finally open river
  // bridges at remaining road–river meetings and thread the road through.
  if (stageStep >= 5) {
    if (complete) {
      // Open a real crossing before routing, keeping roads off river edges.
      const rivers = next.featureGroups.filter(g => g.kind === "river");
      const center = plan.precincts.find(p => p.kind === "plaza")?.anchor ?? [0, 0];
      for (const [riverIndex, river] of rivers.entries()) {
        if (
          river.kind !== "river" ||
          !plan.rivers[riverIndex]?.bridgeAllowed ||
          next.featureGroups.some(g => g.id === `${GEN_PREFIX}bridge-${riverIndex}` && g.locked)
        )
          continue;
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
        candidates.sort((a, b) => {
          const p = next.mesh.vertices[a].point;
          const q = next.mesh.vertices[b].point;
          return Math.hypot(p[0] - center[0], p[1] - center[1]) - Math.hypot(q[0] - center[0], q[1] - center[1]);
        });
        for (const id of candidates) {
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
    for (const gate of next.gates ?? []) {
      if (gate.locked) continue;
      const opened = openBarrierPassage(next, gate.vertexId, "wall");
      if (opened) next = opened;
    }
    mesh = next.mesh;
    const nearestAfter = nearestVertexLookup(mesh, Math.max(1, source.frame.blockSizeMeters));
    const plazaFaces = new Set(next.elements.find(e => e.kind === "plaza")?.faceIds ?? []);
    const internalPlazaEdges = Object.values(mesh.edges)
      .filter(e => e.leftFace && e.rightFace && plazaFaces.has(e.leftFace) && plazaFaces.has(e.rightFace))
      .map(e => e.id);
    const banned = new Set<Id>([...kindEdgeIds(next, "river"), ...kindEdgeIds(next, "wall"), ...internalPlazaEdges]);
    const routeComplete = complete
      ? completeRoadRouter(next, plan, faceIdOf, nearestAfter, banned, !program.walls)
      : null;
    // A complete city supplies one approach road and one interior street for
    // every planned gate. Gate placement is allowed to fail (for example when
    // the matching wall run was removed at the coast), so never materialize
    // either route for a gate that did not actually make it onto the mesh.
    const approachRoadCount = plan.roads.length - plan.streets.length;
    plan.roads.forEach((polyline, i) => {
      const isApproach = i < approachRoadCount;
      if (isApproach) {
        // Walled towns drop a route whose gate never made it onto the mesh.
        // Unwalled towns have no gates; still draw the planned approach roads.
        if (complete && program.walls && !next.gates.some(gate => gate.id === `${GEN_PREFIX}gate-${i}`)) return;
      }
      const segments = routeComplete
        ? routeComplete(polyline, isApproach)
        : longestUnbannedRun(polylineToEdgeRefs(mesh, polyline, nearestAfter), banned);
      if (segments.length < 1) return;
      if (!isApproach && program.walls) {
        const wallEdges = kindEdgeIds(next, "wall");
        const wallVertices = new Set([...wallEdges].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
        const gateVertices = new Set(next.gates.map(g => g.vertexId));
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
        segments,
        style: { widthMeters: Math.max(4, source.frame.blockSizeMeters * 0.16), color: "#735238" },
        locked: false
      });
    });
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

  // ⑥ wards
  if (stageStep >= 6) {
    for (const [cellId, kind] of plan.wards) {
      const face = faceFor(cellId);
      const editor = kind === "farm" && next.gridKind === "evolution" ? "farm" : editorWard(kind);
      if (face && !face.properties.locked && editor) face.properties.ward = editor;
    }
  }

  mark("route-junctions");
  // A gate must sit on a drawn wall — drop any that no longer does.
  next.gates = next.gates.filter(gate => {
    if (gate.locked) return true;
    if (gate.id.startsWith(GEN_PREFIX) && !vertexHasKindPassage(next, gate.vertexId, "wall")) return false;
    if (complete && gate.id.startsWith(GEN_PREFIX) && !vertexHasCrossing(next, gate.vertexId, "wall", "road"))
      return false;
    const point = mesh.vertices[gate.vertexId]?.point;
    if (!point) return false;
    return next.featureGroups.some(
      group =>
        group.kind === "wall" &&
        group.segments.some(segment => {
          const edge = mesh.edges[segment.edgeId];
          return edge && (edge.a === gate.vertexId || edge.b === gate.vertexId);
        })
    );
  });

  // A route can still fail after its gate was placed (for instance when A* has
  // no legal approach through the post-junction topology). Remove its paired
  // route as well; otherwise the road visibly terminates at a closed wall.
  if (complete && plan.gates.length && program.walls) {
    const activeGateIds = new Set(next.gates.filter(gate => gate.id.startsWith(GEN_PREFIX)).map(gate => gate.id));
    next.featureGroups = next.featureGroups.filter(group => {
      if (group.locked || group.kind !== "road" || !group.id.startsWith(`${GEN_PREFIX}road-`)) return true;
      const routeIndex = Number(group.id.slice(`${GEN_PREFIX}road-`.length));
      if (!Number.isInteger(routeIndex)) return true;
      if (routeIndex < plan.gates.length * 2) {
        return activeGateIds.has(`${GEN_PREFIX}gate-${routeIndex % plan.gates.length}`);
      }
      return true;
    });
  }

  // Trim or remove any road endpoints that terminate on curtain wall vertices without a gate.
  if (complete && program.walls) {
    const wallEdges = kindEdgeIds(next, "wall");
    const wallVertices = new Set([...wallEdges].flatMap(id => [next.mesh.edges[id].a, next.mesh.edges[id].b]));
    const gateVertices = new Set(next.gates.map(g => g.vertexId));

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
    const activeGateVertices = new Set(next.gates.map(gate => gate.vertexId));
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
      if (!face || face.properties.locked || face.properties.water !== "land") continue;
      if (
        !face.properties.ward ||
        face.properties.ward === "empty" ||
        face.properties.ward === "park" ||
        face.properties.ward === "farm"
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

  const errors = validate(next);
  mark("apply-validation", { errors: errors.length });
  if (errors.length) {
    reportGenerationFailure(
      observer,
      attempt,
      "apply-validation",
      "invalid-mesh",
      `メッシュ検証が ${errors.length} 件のエラーで失敗`,
      { errors: errors.length },
      errors.slice(0, 20)
    );
    return null;
  }
  return next;
}

/** Re-route against the topology AFTER gates have been opened. Snapping each
 * old Voronoi hop independently can leave a road ending beside its own gate. */
function completeRoadRouter(
  document: CityDocument,
  plan: Plan,
  faceIdOf: string[],
  nearest: NearestVertex,
  banned: Set<Id>,
  openRim = false
): (polyline: Point[], outside: boolean) => EdgeRef[] {
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
  const restricted = new Map<Id, Set<Id>>();
  for (const kind of ["wall", "river"] as const) {
    const edges = kindEdgeIds(document, kind);
    const vertices = new Set([...edges].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
    for (const id of vertices) {
      const allowed = new Set(throughEdgesAt(document, id, kind).map(e => e.id));
      const previous = restricted.get(id);
      restricted.set(id, previous ? new Set([...allowed].filter(e => previous.has(e))) : allowed);
    }
  }
  const gateIds = new Set(document.gates.map(g => g.vertexId));
  const endpoint = (p: Point): Id | null => {
    const gate = nearest(p, gateIds);
    if (gate) {
      const q = mesh.vertices[gate].point;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < document.frame.blockSizeMeters * 0.8) return gate;
    }
    return nearest(p);
  };
  return (polyline, outside) => {
    if (polyline.length < 2) return [];
    const snap = (p: Point, end: boolean) => (end ? endpoint(p) : nearest(p));
    const sampled: Point[] = [];
    const stride = Math.max(1, Math.ceil((polyline.length - 1) / 8));
    for (let i = 0; i < polyline.length; i += stride) sampled.push(polyline[i]);
    if (sampled.at(-1) !== polyline.at(-1)) sampled.push(polyline[polyline.length - 1]);
    const waypoints: number[] = [];
    for (let i = 0; i < sampled.length; i++) {
      const id = snap(sampled[i], i === 0 || i === sampled.length - 1);
      const idx = id ? indexOf.get(id) : undefined;
      if (idx === undefined || waypoints.at(-1) === idx) continue;
      waypoints.push(idx);
    }
    if (waypoints.length < 2) return [];
    const hopEndOf = waypoints[waypoints.length - 1];
    const weight = (a: number, b: number, w: number, hopEnd: number) => {
      const edge = edgeFor.get(`${Math.min(a, b)},${Math.max(a, b)}`)!;
      if (banned.has(edge.id)) return Infinity;
      for (const id of [edge.a, edge.b]) if (restricted.has(id) && !restricted.get(id)!.has(edge.id)) return Infinity;
      const faces = [edge.leftFace, edge.rightFace].filter((id): id is Id => id !== null);
      if (plan.avoidSea && faces.some(id => mesh.faces[id].properties.water !== "land")) return Infinity;
      const inTown = faces.some(id => urban.has(id));
      if (outside === inTown) {
        // Unwalled towns have no gate passage; allow the last hop onto the rim.
        if (outside && openRim && (a === hopEnd || b === hopEnd)) return w;
        return Infinity;
      }
      return w;
    };
    const stitch = (points: number[]): number[] | null => {
      const nodes: number[] = [points[0]];
      for (let i = 0; i < points.length - 1; i++) {
        const hopEnd = points[i + 1];
        const hop = aStar(graph, nodes.at(-1)!, hopEnd, (a, b, w) => weight(a, b, w, hopEnd));
        if (!hop || hop.length < 2) return null;
        nodes.push(...hop.slice(1));
      }
      return nodes.length >= 2 ? nodes : null;
    };
    const nodes = stitch(waypoints) ?? stitch([waypoints[0], hopEndOf]);
    if (!nodes) return [];
    if (outside) {
      const half = document.frame.extentMeters / 2;
      const onFrame = (node: number) => graph.points[node].some(value => Math.abs(value) >= half - 0.01);
      while (nodes.length > 2 && onFrame(nodes[0]) && onFrame(nodes[1])) nodes.shift();
    }
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

/** Connected components of urban faces, each outlined along its own mesh edges
 * (the largest loop — the outer circumference). No mesh mutation. */
function componentBorderLoops(mesh: Mesh, faceIdOf: string[], urbanCellIds: Set<number>): MeshBorderLoop[] {
  const cellIdOf = new Map(faceIdOf.map((fid, i) => [fid, i]));
  const urbanFaces = new Set<Id>();
  for (const id of urbanCellIds) if (faceIdOf[id]) urbanFaces.add(faceIdOf[id]);
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
      cellIds: [...component].map(fid => cellIdOf.get(fid)).filter((n): n is number => n !== undefined)
    });
  }
  return loops;
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
function polylineToVertexPath(mesh: Mesh, polyline: Point[], nearest: NearestVertex): Id[] {
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
    if (edgeBetween(mesh, a, b)) {
      out.push(b);
      continue;
    }
    const bridge = shortestPath(mesh, a, b);
    if (bridge && bridge.length <= 6) out.push(...bridge.slice(1));
    else break; // give up cleanly at the first unbridgeable gap
  }
  return out;
}

/** Push the temple nave off finished roads and rivers, then re-align it. */
function settleTempleOnDocument(document: CityDocument): void {
  const temple = document.elements.find(element => element.kind === "temple" && element.point);
  if (!temple?.point) return;
  const roads: Point[][] = [];
  const rivers: Point[][] = [];
  const hazards: { points: Point[]; clearance: number }[] = [];
  for (const group of document.featureGroups) {
    if (group.kind === "road") {
      const points = featureGroupVertices(document, group)
        .map(id => document.mesh.vertices[id]?.point)
        .filter((p): p is Point => !!p);
      if (points.length < 2) continue;
      roads.push(points);
      hazards.push({ points, clearance: group.style.widthMeters / 2 + 2.2 });
    } else if (group.kind === "river") {
      const points = group.vertices.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
      if (points.length < 2) continue;
      rivers.push(points);
      hazards.push({ points, clearance: group.style.widthMeters / 2 + 2 });
    }
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
  const rect = placeAndClearTempleRect(
    temple.point,
    document.frame.extentMeters,
    guides,
    hazards.length ? hazards : templeHazards(roads, rivers, document.frame.extentMeters)
  );
  temple.point = rect.center;
  temple.rotation = rect.rotation;

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
  const byId = new Map(cells.map(c => [c.id, c]));
  const members = plaza.cellIds.map(id => byId.get(id)).filter((c): c is Cell => !!c);
  if (!members.length) return null;
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

/** Generator polyline → contiguous mesh EdgeRefs (for a road). Truncates at the
 * first gap that cannot be bridged in a few hops rather than failing. */
function polylineToEdgeRefs(mesh: Mesh, polyline: Point[], nearest: NearestVertex): EdgeRef[] {
  const path = polylineToVertexPath(mesh, polyline, nearest);
  const refs: EdgeRef[] = [];
  for (let i = 1; i < path.length; i++) {
    const edge = edgeBetween(mesh, path[i - 1], path[i]);
    if (!edge) break;
    const ref = edgeRefFor(mesh, edge.id, path[i - 1]);
    if (!ref) break;
    refs.push(ref);
  }
  return refs;
}

// --- misc -------------------------------------------------------------------

function shorelineTangentAt(shoreline: Point[]): Point {
  let bestI = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < shoreline.length - 1; i++) {
    const d = Math.hypot(shoreline[i][0], shoreline[i][1]);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  const a = shoreline[bestI];
  const b = shoreline[Math.min(bestI + 1, shoreline.length - 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

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
): "market" | "castle" | "merchant" | "craftsmen" | "harbor" | "park" | "empty" | null {
  switch (kind) {
    case "market":
    case "castle":
    case "merchant":
    case "craftsmen":
    case "harbor":
    case "park":
    case "empty":
      return kind;
    case "farm":
    case "slum":
    case "gate":
      return "empty";
    default:
      return null;
  }
}
