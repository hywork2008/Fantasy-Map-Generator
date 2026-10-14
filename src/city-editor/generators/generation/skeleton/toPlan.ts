// K7 adapter: retain K6 topology and exact line ownership, reuse road/ward planning.
import type { CityDocument, Point } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import type { Gate, Precinct } from "../../../types/geometry";
import { resolveWallMaterial } from "../../features";
import { type GenerationObserver, generationTimer, reportGenerationFailure } from "../../generationDiagnostics";
import { pointInPolygon, polygonArea } from "../../geom";
import type { RoutedRiver } from "../../riverPath";
import type { Plan } from "../contracts";
import { cellsFromMesh } from "../meshGeometry";
import { outerFrameRoads } from "../planning/roadGeometry";
import { planRoads } from "../planning/roads";
import { planWards } from "../planning/wards";
import { prepareRun } from "../prepareRun";
import { resolveStreetSettings, skeletonUnsupportedSettings } from "../settings";
import { buildConformingMesh } from "./conformingMesh";
import type { Skeleton, SkeletonInputs, SkeletonMeshChain } from "./contracts";
import { buildSkeletonInputs } from "./inputs";
import { planSkeleton } from "./pipeline";

export interface SkeletonPlanData {
  inputs: SkeletonInputs;
  skeleton: Skeleton;
  lines: SkeletonMeshChain[];
}

/** Shared K1 preparation for complete and vector-only previews. */
export function prepareSkeletonRun(document: CityDocument, settings: GenerationSettings, seed: string) {
  const unsupported = skeletonUnsupportedSettings(settings);
  if (unsupported.length) throw new Error(`Skeleton-first does not support: ${unsupported.join(", ")}`);
  const prepared = prepareRun(document, settings, seed, false);
  const { geo, program } = prepared;
  let params = prepared.params;
  let inputs = buildSkeletonInputs({ geo, program, params, settings });
  // A historic hamlet curtain can enclose less than four of the source grid's
  // blocks. Refine the new mesh rather than ignoring its requested wall share
  // or weakening K5's minimum enclosure test.
  if (program.walls) {
    const spacing = Math.sqrt((Math.PI * inputs.cityRadius ** 2 * inputs.walledAreaShare) / 5);
    if (spacing < inputs.cellSize) {
      params = { ...params, cellSizeMeters: Math.max(1, spacing) };
      inputs = buildSkeletonInputs({ geo, program, params, settings });
    }
  }
  return { prepared: { ...prepared, params, cellSize: inputs.cellSize }, inputs };
}

export function planSkeletonCity(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  observer?: GenerationObserver,
  attempt = 1
) {
  const mark = generationTimer(observer, attempt);
  const { prepared, inputs } = prepareSkeletonRun(document, settings, seed);
  const { geo, program, params } = prepared;
  mark("skeletonInputs");
  const result = planSkeleton(inputs, settings, seed);
  for (const failure of result.failures)
    reportGenerationFailure(
      observer,
      attempt,
      "skeletonCheck",
      failure.reason,
      failure.message,
      { skeletonAttempt: failure.attempt + 1 },
      failure.details
    );
  if (!result.skeleton) return null;
  const skeleton = result.skeleton;
  mark("skeletonCheck", { skeletonAttempts: skeleton.attempt + 1 });
  const conforming = buildConformingMesh(inputs, skeleton, seed);
  mark("conformingMesh", { faces: Object.keys(conforming.mesh.faces).length, ...conforming.diagnostics });
  const { mesh, lines } = conforming;
  const { cells, faceIdOf } = cellsFromMesh(mesh, inputs.half);
  const sea = new Set(cells.filter(c => inputs.water.some(w => pointInPolygon(c.centroid, w.polygon))).map(c => c.id));
  const ocean = new Set(
    cells.filter(c => inputs.water.some(w => w.kind === "sea" && pointInPolygon(c.centroid, w.polygon))).map(c => c.id)
  );
  const builtUp = new Set(
    cells.filter(c => !sea.has(c.id) && pointInPolygon(c.centroid, skeleton.core.urban)).map(c => c.id)
  );
  const urban = new Set(
    cells
      .filter(c => builtUp.has(c.id) && (!skeleton.wall || pointInPolygon(c.centroid, skeleton.wall.polygon)))
      .map(c => c.id)
  );
  const outskirts = new Set([...builtUp].filter(id => !urban.has(id)));
  const waterPolygon = inputs.water.find(w => w.kind === "sea")?.polygon ?? inputs.water[0]?.polygon ?? null;
  const coasts = inputs.water.map(w => ({
    sea: new Set(cells.filter(c => pointInPolygon(c.centroid, w.polygon)).map(c => c.id)),
    shoreline: w.polygon,
    waterPolygon: w.polygon
  }));
  const coast = coasts[0] ?? null;
  const rivers: RoutedRiver[] = inputs.rivers.map(r => {
    const chain = lines.find(l => l.id === `river:${r.index}`)!;
    const points = chain.edges.map(ref => {
      const e = mesh.edges[ref.edgeId];
      return mesh.vertices[ref.forward ? e.a : e.b].point;
    });
    const last = chain.edges.at(-1);
    if (last) {
      const e = mesh.edges[last.edgeId];
      points.push(mesh.vertices[last.forward ? e.b : e.a].point);
    }
    return {
      edgePoints: points,
      resolvedEdgePoints: points,
      smoothPoints: points,
      foldedPoints: points,
      widths: points.map(() => r.halfWidth * 2),
      fallback: false,
      bridgeAllowed: true
    };
  });
  const wall = lines.find(l => l.id === "wall");
  const wallPoints =
    wall?.edges.map(ref => {
      const e = mesh.edges[ref.edgeId];
      return mesh.vertices[ref.forward ? e.a : e.b].point;
    }) ?? [];
  const borderLoops = wall ? [{ segments: wall.edges, points: wallPoints, cellIds: [...urban] }] : [];
  const genBorders = borderLoops.map(loop => ({
    points: loop.points,
    segments: loop.segments.map(() => "land" as const),
    urbanCellIds: loop.cellIds
  }));
  const gates: Gate[] = skeleton.gates.map(g => ({
    point: g.point,
    borderIndex: 0,
    water: false,
    ...(geo.importedRoads ? { roadIndex: inputs.roads.find(r => r.id === g.roadIds[0])?.sourceRoadIndex } : {})
  }));
  const eligible = cells.filter(c => urban.has(c.id) && Math.abs(polygonArea(c.polygon)) >= 1);
  const central = [...eligible].sort(
    (a, b) =>
      Math.hypot(a.centroid[0] - skeleton.core.core[0], a.centroid[1] - skeleton.core.core[1]) -
      Math.hypot(b.centroid[0] - skeleton.core.core[0], b.centroid[1] - skeleton.core.core[1])
  )[0];
  const precincts: Precinct[] =
    program.plaza && central ? [{ kind: "plaza", anchor: central.centroid, cellIds: [central.id] }] : [];
  const streetOpts = resolveStreetSettings(settings);
  const plannedRoads = planRoads({
    currentCells: cells,
    currentUrban: urban,
    sea,
    waterPolygon,
    coast,
    genBorders,
    gates,
    precincts,
    citadelOutline: null,
    geo,
    cellSize: inputs.cellSize,
    half: inputs.half,
    rivers,
    streetOpts,
    canPlaceTownGate: p => gates.some(g => Math.hypot(p[0] - g.point[0], p[1] - g.point[1]) < 1),
    settings,
    params,
    seed: `${seed}:skeleton:${skeleton.attempt}:roads`,
    coasts,
    appliedChannels: [],
    streetHub: () => skeleton.core.core
  });
  mark("street-plan");
  // The provisional external planner must not replace the certified K4 routes.
  const roads: Point[][] = skeleton.routes.filter(r => !r.dropped).map(r => r.path);
  const coastalWater = sea;
  const { warded, fmgElevations } = planWards({
    settings,
    sourceDocument: document,
    seed: `${seed}:skeleton:${skeleton.attempt}:wards`,
    half: inputs.half,
    params,
    currentCells: cells,
    currentUrban: urban,
    currentOutskirts: outskirts,
    residentialOutskirts: outskirts,
    sea,
    coastalWater,
    genBorders,
    routedGates: gates,
    precincts,
    streetGeo: geo,
    program,
    coast,
    classified: inputs.water.map((w, i) => ({
      kind: w.kind === "sea" ? ("ocean" as const) : w.kind === "lake" ? ("lake" as const) : ("river" as const),
      coast: coasts[i],
      regionalShore: undefined,
      extraShores: undefined
    })),
    waterPolygon,
    streetResult: plannedRoads.streetResult,
    roads,
    rivers,
    geo,
    currentFaceIdOf: faceIdOf
  });
  mark("wards");
  const plan: Plan = {
    skeleton: { inputs, skeleton, lines },
    mesh,
    cells,
    faceIdOf,
    layout: settings.layout === "classic" ? "classic" : "organic",
    urbanCoreMode: "compact",
    burialProfile: settings.burialProfile ?? settings.descriptor?.burialProfile ?? document.burialProfile,
    sea,
    ocean,
    coastPath: coast?.shoreline ?? [],
    waterPolygon,
    avoidSea: true,
    channelPolygons: inputs.water.filter(w => w.kind === "channel").map(w => w.polygon),
    regionalWater: document.regionalWaterAreas,
    regionalSurface: settings.descriptor?.regionalSurface,
    fixedCrossings: settings.descriptor?.fixedCrossings,
    replaceFixedCrossings: !!settings.descriptor,
    wallMaterial: resolveWallMaterial(document, {
      choice: settings.config.wall?.material,
      descriptor: settings.descriptor
    }),
    rivers,
    urban,
    outskirts,
    builtUp,
    urbanStages: [],
    borderLoops,
    gates,
    precincts,
    citadelOutline: null,
    roads,
    streets: plannedRoads.streetResult.streets,
    importedRoads: geo.importedRoads,
    frameRoads: outerFrameRoads(settings.descriptor),
    riverPort: geo.riverPort,
    wards: new Map(warded.wards.map(w => [w.cellId, w.kind])),
    wardOrder: warded.assignmentOrder,
    templeHarbor: warded.precincts,
    fmgElevations
  };
  return { plan, prepared: { ...prepared, params, cells, faceIdOf, cellSize: inputs.cellSize, half: inputs.half } };
}
