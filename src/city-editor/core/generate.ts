// Step-by-step random city generation for the City Editor.
//
// This runs a City-Editor-local generation engine (./gen/ — a vendored MIT copy
// of the former src/city-generator/core, see ./gen/LICENSE-NOTE.md) — classifiers
// and builders run ON THE DOCUMENT'S EXISTING MESH; it never rebuilds the block
// grid (that is the Document panel's job) and never resizes the map. Each stage
// button recomputes
// the plan up to its own process from an internal random seed and writes only the
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
// read as a scrub through the drawing process. The seed is internal (never shown
// or persisted); "🎲 新しい都市" rolls a new one. Coast / Rivers / Features are
// the deliberate inputs and are kept across presses.

import { orderedBoundaryLoops, shortestPath } from "./features";
import { classifyRiver } from "./gen/classifyRiver";
import { type CoastResult, classifyCoast } from "./gen/classifySea";
import { classifyUrban } from "./gen/classifyUrban";
import { buildEdgeGraph } from "./gen/edgeGraph";
import { polygonCentroid, polygonTouchesRectEdge } from "./gen/geom";
import { markSeaSurroundedGates, markWaterGate, placeGates, placePrecincts } from "./gen/interior";
import { makeRng } from "./gen/prng";
import { type RoutedRiver, walkRiver } from "./gen/riverPath";
import { DEFAULT_SITE_CONFIG, FEATURE_KEYS, randomSiteConfig, type SiteConfig } from "./gen/site/siteConfig";
import { resolveWallPlan, siteToGeography, siteToProgram } from "./gen/site/siteInput";
import { synthSite } from "./gen/site/synthSite";
import { buildStreets } from "./gen/streets";
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
import { clone, edgeBetween, edgeEnd, edgeRefFor, faceNeighbors, facePoints, validate } from "./mesh";
import type { CityDocument, EdgeRef, Id, Mesh, Point } from "./types";

export type { CityFeatureSet, SiteConfig } from "./gen/site/siteConfig";
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
export interface GenerationSettings {
  config: SiteConfig;
  /**
   * Debug/tuning override for the ③ urban-core stage: cap its flood-fill to the
   * first N cells in ascending-cost fill order (TownGeneratorTS-style "first
   * nPatches") instead of stopping at the radius. Unset = the normal radius
   * cutoff. See docs/city-generator/towngen-comparison.md §2.1.
   */
  urbanNPatches?: number;
}

/** A random internal seed for one town. Never shown, typed, or persisted. */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

export function defaultGenerationSettings(): GenerationSettings {
  return { config: structuredClone(DEFAULT_SITE_CONFIG) };
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
  const descriptor = synthSite(NOMINAL_PRESET, settings.config, seed, {
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
    cityRadiusMeters: frame.cityRadiusMeters,
    cellSizeMeters: cellSize,
    lloydPasses: 1,
    urbanNPatches: settings.urbanNPatches
  };
  const { cells, faceIdOf } = cellsFromMesh(document.mesh, half);
  return { cells, faceIdOf, geo, program, params, half, cellSize };
}

/**
 * Recompute the plan up to `stageStep` on `document`'s own mesh and return a new
 * document with the result written in — the mesh (vertices / edges / faces
 * topology and geometry) and the map frame are left untouched. `null` if the
 * result fails the editor's document validation. Deterministic in
 * `(document, settings, seed, stageStep)`, so re-pressing a stage is a no-op.
 */
export function generateStageOnDocument(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stageStep: number
): CityDocument | null {
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) return null;

  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepareRun(document, settings, seed);
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, stageStep);
  return applyPlan(document, cells, faceIdOf, plan, program, stageStep);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, 3);
  const total = plan.urbanStages.length;
  if (total === 0) {
    return { document: applyPlan(document, cells, faceIdOf, plan, program, 3), total: 0, index: -1, cellId: null };
  }
  const index = Math.max(0, Math.min(stepIndex, total - 1));
  const stage = plan.urbanStages[index];
  const stepped: Plan = { ...plan, urban: new Set(stage.urban), outskirts: new Set() };
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, 1);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, 2);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, 4);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, 5);
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
  const plan = runPlan(document.mesh, faceIdOf, cells, geo, program, params, seed, half, cellSize, 6);
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
  rivers: RoutedRiver[];
  urban: Set<number>;
  outskirts: Set<number>;
  /** S3 flood-fill in fill order, one entry per cell admitted to `urban`. Empty
   * before S3 runs. See `UrbanPatchStep`. */
  urbanStages: UrbanStage[];
  borderLoops: MeshBorderLoop[];
  gates: Gate[];
  precincts: Precinct[];
  citadelOutline: Point[] | null;
  roads: Point[][];
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
  stageStep: number
): Plan {
  const empty: Plan = {
    sea: new Set(),
    coastPath: [],
    rivers: [],
    urban: new Set(),
    outskirts: new Set(),
    urbanStages: [],
    borderLoops: [],
    gates: [],
    precincts: [],
    citadelOutline: null,
    roads: [],
    wards: new Map(),
    wardOrder: [],
    templeHarbor: []
  };
  if (!cells.length) return empty;
  const graph = buildEdgeGraph(cells);
  if (!graph.points.length) return empty;

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
  const sea = new Set<number>(coasts.flatMap(c => [...c.sea]));
  if (stageStep < 2) return { ...empty, sea, coastPath };

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
        makeRng(`${seed}:river:${i}`)
      )
    )
    .filter(band => !band.fallback && band.edgePoints.length >= 2);
  const river = classifyRiver(
    cells,
    sea,
    rivers.map(band => ({ edgePoints: band.edgePoints }))
  );
  if (stageStep < 3) return { ...empty, sea, coastPath, rivers };

  // S3 — urban core. `params.urbanNPatches` (debug/tuning override) caps the
  // fill to a fixed cell count instead of the radius; `urbanStages` records each
  // admitted cell in fill order for `generateUrbanPatchStep`'s per-loop scrub.
  const shoreTangent = coast ? shorelineTangentAt(coast.shoreline) : null;
  const urbanRadius = program.walls ? params.cityRadiusMeters * 0.92 : params.cityRadiusMeters;
  const urbanBearings = program.port && geo.coast ? [...geo.roadBearings, geo.coast.waterAzimuthDeg] : geo.roadBearings;
  const {
    urban,
    outskirts,
    stages: urbanStages
  } = classifyUrban(
    cells,
    { sea, bank: river.bank },
    urbanBearings,
    urbanRadius,
    shoreTangent,
    params.urbanNPatches ?? null,
    params.cellSizeMeters
  );
  if (stageStep < 4) return { ...empty, sea, coastPath, rivers, urban, outskirts, urbanStages };

  // S4 — outline the urban blob along real mesh edges, gates, plaza & citadel.
  const riverLines = rivers.map(band => band.smoothPoints);
  const borderLoops = componentBorderLoops(mesh, faceIdOf, urban);
  const genBorders = borderLoops.map(loop => toGeneratorBorder(loop));
  const precincts = placePrecincts(cells, urban, sea, genBorders, geo, params, program, riverLines);
  const citadel = precincts.find(p => p.kind === "citadel");
  const citadelOutline = citadel
    ? (componentBorderLoops(mesh, faceIdOf, new Set(citadel.cellIds))[0]?.points ?? null)
    : null;
  const gates = markSeaSurroundedGates(
    markWaterGate(placeGates(cells, urban, genBorders, geo), genBorders, coast?.shoreline ?? null, program.port),
    coast?.waterPolygon ?? null,
    cellSize
  );
  if (stageStep < 5) {
    return {
      ...empty,
      sea,
      coastPath,
      rivers,
      urban,
      outskirts,
      urbanStages,
      borderLoops,
      gates,
      precincts,
      citadelOutline
    };
  }

  // S5 — approach roads (raw A* on the same graph; not smoothed into the mesh).
  const streetResult = buildStreets({
    cells,
    urban,
    sea,
    waterPolygon: coast?.waterPolygon ?? null,
    borders: genBorders,
    gates,
    precincts,
    citadelOutline,
    geo,
    cellSizeMeters: cellSize,
    halfExtentMeters: half
  });
  const roads = streetResult.roads;
  if (stageStep < 6) {
    return {
      ...empty,
      sea,
      coastPath,
      rivers,
      urban,
      outskirts,
      urbanStages,
      borderLoops,
      gates,
      precincts,
      citadelOutline,
      roads
    };
  }

  // S6 — wards.
  const warded = assignWards({
    cells,
    urban,
    outskirts,
    sea,
    borders: genBorders,
    gates,
    precincts,
    geo,
    params,
    program,
    shoreline: coast?.shoreline ?? null,
    waterPolygon: coast?.waterPolygon ?? null
  });
  return {
    sea,
    coastPath,
    rivers,
    urban,
    outskirts,
    urbanStages,
    borderLoops,
    gates,
    precincts,
    citadelOutline,
    roads,
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
  stageStep: number
): CityDocument | null {
  const next = clone(source);
  const mesh = next.mesh;

  // Clear this module's previous output + every non-locked face tag, so the
  // stages read as a scrub through the process rather than an accumulation.
  next.featureGroups = next.featureGroups.filter(group => !group.id.startsWith(GEN_PREFIX));
  next.gates = (next.gates ?? []).filter(gate => !gate.id.startsWith(GEN_PREFIX));
  next.elements = next.elements.filter(element => !element.id.startsWith(GEN_PREFIX));
  for (const face of Object.values(mesh.faces)) {
    if (face.properties.locked) continue;
    face.properties.water = "land";
    if (face.properties.elevation <= 0) face.properties.elevation = 1;
    face.properties.buildable = true;
    face.properties.ward = null;
  }

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
      }
    }
  }

  // ② river feature groups
  if (stageStep >= 2) {
    plan.rivers.forEach((band, i) => {
      const vertices = polylineToVertexPath(mesh, band.edgePoints, nearest);
      if (vertices.length < 2) return;
      const width = band.widths.length ? band.widths.reduce((s, w) => s + w, 0) / band.widths.length : 12;
      next.featureGroups.push({
        id: `${GEN_PREFIX}river-${i}`,
        kind: "river",
        name: `River ${i + 1}`,
        vertices,
        source: null,
        mouth: null,
        style: { widthMeters: Math.max(6, width), color: "#4f8aad" },
        locked: false
      });
    });
  }

  // ④ walls + gates + plaza / citadel
  if (stageStep >= 4 && program.walls) {
    plan.borderLoops.forEach((loop, i) => {
      if (loop.segments.length < 3) return;
      next.featureGroups.push({
        id: `${GEN_PREFIX}wall-${i}`,
        kind: "wall",
        name: `Wall ${i + 1}`,
        segments: loop.segments,
        style: { widthMeters: Math.max(4, source.frame.blockSizeMeters * 0.14), color: "#41382e" },
        locked: false
      });
    });
  }
  if (stageStep >= 4) {
    const wallVertices = new Set<Id>();
    for (const group of next.featureGroups) {
      if (group.kind !== "wall") continue;
      for (const segment of group.segments) {
        const edge = mesh.edges[segment.edgeId];
        if (edge) wallVertices.add(edge.a).add(edge.b);
      }
    }
    plan.gates.forEach((gate, i) => {
      const vertexId = nearest(gate.point, wallVertices);
      if (vertexId) next.gates.push({ id: `${GEN_PREFIX}gate-${i}`, vertexId, locked: false });
    });
    // Reserved precinct landmarks as point-anchored elements.
    for (const precinct of [...plan.precincts, ...plan.templeHarbor]) {
      if (!["plaza", "citadel", "temple", "harbor"].includes(precinct.kind)) continue;
      next.elements.push({
        id: `${GEN_PREFIX}${precinct.kind}`,
        kind: precinct.kind as "plaza" | "citadel" | "temple" | "harbor",
        faceIds: precinct.cellIds.map(id => faceIdOf[id]).filter(Boolean),
        point: [precinct.anchor[0], precinct.anchor[1]],
        locked: false
      });
    }
  }

  // ⑤ roads
  if (stageStep >= 5) {
    plan.roads.forEach((polyline, i) => {
      const segments = polylineToEdgeRefs(mesh, polyline, nearest);
      if (segments.length < 1) return;
      next.featureGroups.push({
        id: `${GEN_PREFIX}road-${i}`,
        kind: "road",
        name: `Road ${i + 1}`,
        segments,
        style: { widthMeters: Math.max(4, source.frame.blockSizeMeters * 0.16), color: "#735238" },
        locked: false
      });
    });
  }

  // ⑥ wards
  if (stageStep >= 6) {
    for (const [cellId, kind] of plan.wards) {
      const face = faceFor(cellId);
      const editor = editorWard(kind);
      if (face && !face.properties.locked && editor) face.properties.ward = editor;
    }
  }

  // A gate must sit on a drawn wall — drop any that no longer does.
  next.gates = next.gates.filter(gate => {
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

  return validate(next).length === 0 ? next : null;
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
    if (best || !among) return best;
    // Widen once for a constrained search (e.g. gate → wall vertex).
    for (const id of among) {
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
