import { editorText } from "../../../i18n/editorMessages";
import type { CityDocument, Id } from "../../types/document";
import type { GenerationSettings, GenerationStepResult, StageCheckpoint, UrbanPatchStep } from "../../types/generation";
import type { WardAssignment } from "../../types/geometry";
import { tagExternalGateRoads } from "../approachBeyond";
import { planBastionedCity } from "../bastionedTown/plan";
import { syncDocumentCemeteries } from "../cemeteryLayout";
import { captureGenerationDebugPreview, type GenerationDebugObserver } from "../generationDebug";
import { type GenerationObserver, reportGenerationFailure } from "../generationDiagnostics";
import { pointInPolygon, polygonCentroid } from "../geom";
import { spawnHarborShips } from "../harborShips";
import { clone, facePoints } from "../mesh";
import { preparePopulationGeneration } from "../populationGeneration";
import { cultivateRoadside } from "../roadsideFarms";
import { generateRuralFieldStage } from "../ruralFieldStage";
import { townExtentMeters } from "../settlementExtent";
import { applyPlan } from "./assembly/applyPlan";
import type { Plan } from "./contracts";
import { planningDebugDocument } from "./debugPreview";
import { generateCityAttempt, generateCityOnDocument } from "./generateCity";
import { runPlan } from "./pipeline";
import { prepareRun } from "./prepareRun";
import { resolveEffectiveLayout } from "./settings";
import { generateSkeletonPreview } from "./skeleton/previews";
import { planSkeletonCity } from "./skeleton/toPlan";
import { applyImportedWaterAccess } from "./waterAccess";

interface WardStepCache {
  key: string;
  document: CityDocument | null;
  order: WardAssignment[];
  stepOfFace: Map<Id, number>;
}

// One content-keyed entry, weakly owned by the latest source document. Neither
// the source nor its derived document remains alive through this module alone.
let wardStepCacheOwner: WeakRef<CityDocument> | null = null;
let wardStepCaches = new WeakMap<CityDocument, WardStepCache>();

/** Release previews on source/settings replacement or when a caller ends its session. */
export function clearGenerationPreviewCache(): void {
  wardStepCacheOwner = null;
  wardStepCaches = new WeakMap();
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
  wallCheckpoint?: StageCheckpoint,
  observer?: GenerationObserver
): CityDocument | null {
  try {
    ({ document, settings } = preparePopulationGeneration(document, settings, seed));
  } catch {
    return null;
  }
  if (settings.generationMethod === "skeleton-first" && stageStep < 0)
    return generateSkeletonPreview(document, settings, seed, -stageStep, observer).document;
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) {
    const sample = reportGenerationFailure(
      observer,
      1,
      "prepare",
      "too-few-faces",
      editorText("cityEditor.messages.gridHasFewerThanThreeFaces", { value0: faces.length }),
      {
        faces: faces.length,
        stageStep
      }
    );
    if (onRejected) onRejected(captureGenerationDebugPreview(document, sample, seed));
    return null;
  }

  if (stageStep >= 7) {
    const stopAfter =
      stageStep === 7 &&
      (wallCheckpoint === "streets" ||
        wallCheckpoint === "innerWall" ||
        wallCheckpoint === "innerGates" ||
        wallCheckpoint === "firstInnerGates")
        ? wallCheckpoint
        : undefined;
    // Farmland replays the finished town, including appearance and housing fitting.
    const full =
      stageStep >= 10
        ? generateCityOnDocument(document, settings, seed, observer, onRejected)
        : (generateCityAttempt(document, settings, seed, observer, 1, onRejected, undefined, stopAfter) ??
          (onRejected
            ? null
            : generateCityOnDocument(document, settings, seed, observer, undefined, undefined, stopAfter)));
    if (!full) return null;
    if (stageStep === 7) {
      const res = clone(full);
      delete res.appearance;
      delete res.fabric;
      delete res.ruralFieldSnapshot;
      syncDocumentCemeteries(res);
      res.generationSeed = full.generationSeed ?? seed;
      return res;
    }
    if (stageStep === 8) {
      const res = clone(full);
      delete res.ruralFieldSnapshot;
      syncDocumentCemeteries(res);
      res.generationSeed = full.generationSeed ?? seed;
      return res;
    }
    if (stageStep >= 10) return generateRuralFieldStage(full);
    delete full.ruralFieldSnapshot;
    return full;
  }

  const skeletonRun =
    settings.generationMethod === "skeleton-first"
      ? settings.townFortification
        ? planBastionedCity(document, settings, seed, observer)
        : planSkeletonCity(document, settings, seed, observer)
      : null;
  if (settings.generationMethod === "skeleton-first" && !skeletonRun) return null;
  const { cells, faceIdOf, geo, program, params, half, cellSize } =
    skeletonRun?.prepared ?? prepareRun(document, settings, seed);
  const fullPlan =
    skeletonRun?.plan ??
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
      stageStep,
      false,
      observer,
      1,
      true,
      document.gridKind,
      document
    );
  // The district stage shows wards alone; the gate-to-centre streets are the next stage's.
  const plan: Plan =
    wallCheckpoint === "wards"
      ? {
          ...fullPlan,
          roads: fullPlan.roads.slice(0, fullPlan.roads.length - fullPlan.streets.length),
          streets: [],
          wardsOnly: true
        }
      : fullPlan;
  const applyCheckpoint = wallCheckpoint === "wards" ? undefined : wallCheckpoint;
  if (plan.castleFailure && (onRejected || observer) && !applyCheckpoint) {
    const sample = reportGenerationFailure(
      observer,
      1,
      "castle",
      plan.castleFailure,
      editorText("cityEditor.messages.noLocationSatisfiesTheRequestedCastlePlacementSettings"),
      undefined,
      plan.castleFailureDetails
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
    applyCheckpoint as "walls" | "riverPassages" | "passages" | undefined
  );
  if (res) {
    res.farmlandAreaHectares = settings.descriptor
      ? settings.descriptor.farmlandAreaHectares
      : document.farmlandAreaHectares;
    res.layout = resolveEffectiveLayout(
      settings.layout ?? settings.config?.layout,
      townExtentMeters(document.frame),
      seed
    );
    res.generationSeed = seed;
    if (stageStep >= 5) tagExternalGateRoads(res, seed, settings.descriptor);
    if (stageStep >= 6) cultivateRoadside(res);
    applyImportedWaterAccess(res, settings);
    if (stageStep >= 6) spawnHarborShips(res, seed);
  }
  return res;
}

/** One ③ urban-core flood-fill iteration, as shown on the document's mesh. */
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
  try {
    ({ document, settings } = preparePopulationGeneration(document, settings, seed));
  } catch {
    return { document: null, total: 0, index: -1, cellId: null };
  }
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
  try {
    ({ document, settings } = preparePopulationGeneration(document, settings, seed));
  } catch {
    return { document: null, total: 0, index: -1, detail: null };
  }
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
  try {
    ({ document, settings } = preparePopulationGeneration(document, settings, seed));
  } catch {
    return { document: null, total: 0, index: -1, detail: null };
  }
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
  try {
    ({ document, settings } = preparePopulationGeneration(document, settings, seed));
  } catch {
    return { document: null, total: 0, index: -1, detail: null };
  }
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
  try {
    ({ document, settings } = preparePopulationGeneration(document, settings, seed));
  } catch {
    return { document: null, total: 0, index: -1, detail: null };
  }
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
  try {
    ({ document, settings } = preparePopulationGeneration(document, settings, seed));
  } catch {
    return { document: null, total: 0, index: -1, detail: null };
  }
  const faces = Object.values(document.mesh.faces);
  if (faces.length < 3) return { document: null, total: 0, index: -1, detail: null };

  // Scrubbing wards changes only their visibility. Keep the repaired road
  // topology fixed instead of rebuilding gates and splitting cells per click.
  // A content key also invalidates this bounded cache after in-place edits.
  const key = JSON.stringify([document, settings, seed]);
  const previousOwner = wardStepCacheOwner?.deref();
  let wardStepCache = previousOwner ? wardStepCaches.get(previousOwner) : undefined;
  if (wardStepCache?.key !== key) {
    clearGenerationPreviewCache();
    const skeletonRun =
      settings.generationMethod === "skeleton-first"
        ? settings.townFortification
          ? planBastionedCity(document, settings, seed)
          : planSkeletonCity(document, settings, seed)
        : null;
    if (settings.generationMethod === "skeleton-first" && !skeletonRun)
      return { document: null, total: 0, index: -1, detail: null };
    const { cells, faceIdOf, geo, program, params, half, cellSize } =
      skeletonRun?.prepared ?? prepareRun(document, settings, seed);
    const plan =
      skeletonRun?.plan ??
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
        false,
        undefined,
        1,
        true,
        document.gridKind,
        document
      );
    const wardsOnly: Plan = {
      ...plan,
      roads: plan.roads.slice(0, plan.roads.length - plan.streets.length),
      streets: [],
      wardsOnly: true
    };
    const result = applyPlan(document, cells, faceIdOf, wardsOnly, program, 6);
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
  // Transfer an equivalent cached result to the latest source without another
  // planning pass. Replacing the WeakMap keeps this cache bounded to one entry.
  wardStepCaches = new WeakMap([[document, wardStepCache]]);
  wardStepCacheOwner = new WeakRef(document);
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
