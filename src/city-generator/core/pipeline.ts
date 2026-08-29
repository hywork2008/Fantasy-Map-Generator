// Pipeline orchestrator: S0 grid → S1 sea/land → S2 river → S3 urban core →
// S4 perimeter → S5 streets → S6 wards.
// S1 and S2 walk the Voronoi cell-edge graph along rough corridors from the
// descriptor, so coast and river shape are graph-derived (design §4.2). Each
// stage is captured as an immutable Snapshot for the drawing-process slider.

import { classifyRiver } from "./classifyRiver";
import { type CoastResult, classifyCoast } from "./classifySea";
import { classifyUrban } from "./classifyUrban";
import { buildEdgeGraph } from "./edgeGraph";
import { azimuthToVec, nearestOnPolyline } from "./geom";
import { buildGrid } from "./grid";
import {
  buildBorders,
  classifyWallSegments,
  close,
  markWaterGate,
  optimizeJunctions,
  placeGates,
  placePrecincts,
  reachEnvelopeToShore,
  shapeEnvelope,
  wallOverlaysFor
} from "./interior";
import { makeRng } from "./prng";
import { walkRiver } from "./riverPath";
import { buildStreets } from "./streets";
import type {
  Cell,
  CellTag,
  CityGeography,
  CityParams,
  CityProgram,
  GenerationResult,
  Overlay,
  Point,
  RiverPath,
  Snapshot,
  WardKind
} from "./types";
import { DEFAULT_PROGRAM, DEFAULT_WALL_PLAN } from "./types";
import { assignWards } from "./wards";

const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };

/** A walled town packs tighter than its road-signalled radius: shrink the S3
 * urban reach by this factor when `program.walls` is set (design §4.1). */
const WALLED_COMPACTION = 0.92;

/** Pure. Same `params` (seed included) + same `geo` + same `program` =>
 * structurally identical result. `program` only bites from S3 onward; with the
 * default (all false) the output is identical to omitting it. */
export function generateCity(
  params: CityParams,
  geo: CityGeography = EMPTY_GEO,
  program: CityProgram = DEFAULT_PROGRAM
): GenerationResult {
  const rng = makeRng(params.seed);
  const gridStages = buildGrid(params, rng);
  const cells = gridStages[gridStages.length - 1].cells;
  const graph = buildEdgeGraph(cells);
  const half = params.extentMeters / 2;

  // S1 — coastline walk → sea cells.
  const waterInputs =
    geo.waterAreas && geo.waterAreas.length > 0
      ? geo.waterAreas
      : geo.coast
        ? [{ ...geo.coast, kind: "ocean" as const }]
        : [];
  const coasts = waterInputs
    .map((water, i) =>
      classifyCoast(
        graph,
        water.corridor,
        water.waterAzimuthDeg,
        cells,
        half,
        params.cellSizeMeters,
        makeRng(`${params.seed}:water:${i}`)
      )
    )
    .filter((entry): entry is CoastResult => entry !== null);
  const coast = coasts[0] ?? null;
  const sea = new Set(coasts.flatMap(result => [...result.sea]));

  // S2 — walk each river along its corridor, stopping at the shoreline. A river
  // that can't be placed on the grid (entirely offshore) is dropped.
  const routed = geo.rivers
    .map((r, i) => {
      const band = walkRiver(
        graph,
        r.corridor,
        r.widths,
        coast?.waterPolygon ?? null,
        coast?.shoreline ?? null,
        params.cellSizeMeters,
        half,
        makeRng(`${params.seed}:river:${i}`)
      );
      return {
        band: band.fallback && r.joinsWater ? directJoinFallback(r.corridor, r.widths, coast?.shoreline ?? null) : band,
        cityBank: r.cityBank
      };
    })
    .filter(r => !r.band.fallback);
  const riverPaths: RiverPath[] = routed.map(r => ({
    points: r.band.smoothPoints,
    edgeTrack: r.band.edgePoints,
    widths: r.band.widths,
    cityBank: r.cityBank
  }));
  const river = classifyRiver(
    cells,
    sea,
    routed.map(r => ({ edgePoints: r.band.edgePoints }))
  );

  // Local shoreline tangent at the town — the built-up area elongates along it.
  const shoreTangent = coast ? shorelineTangent(coast.shoreline) : null;
  const urbanRadius = program.walls ? params.cityRadiusMeters * WALLED_COMPACTION : params.cityRadiusMeters;
  // A port pulls the built-up area toward the water: feed S3 an extra "sea-ward"
  // bearing alongside the roads (design §4.5).
  const urbanBearings = program.port && coast ? [...geo.roadBearings, geo.coast!.waterAzimuthDeg] : geo.roadBearings;
  const { urban, outskirts } = classifyUrban(
    cells,
    { sea, bank: river.bank },
    urbanBearings,
    urbanRadius,
    shoreTangent
  );

  const finalTag = (c: Cell): CellTag => {
    if (sea.has(c.id)) return "sea";
    if (urban.has(c.id)) return "urban";
    if (outskirts.has(c.id)) return "outskirts";
    return "rural";
  };

  const shorelineOverlay: Overlay[] = coasts.map(result => ({ kind: "shoreline" as const, points: result.shoreline }));
  const riverSnapshotPaths = riverPaths.map(p => ({ kind: "river" as const, points: p.points, widths: p.widths }));

  const steps: Snapshot[] = [
    snapshot("S0 · Grid", cells, () => "land", [], []),
    snapshot("S1 · Sea & land", cells, c => (sea.has(c.id) ? "sea" : "land"), [], shorelineOverlay),
    snapshot("S2 · River", cells, c => (sea.has(c.id) ? "sea" : "land"), riverSnapshotPaths, shorelineOverlay),
    snapshot("S3 · Urban core", cells, finalTag, riverSnapshotPaths, [
      ...shorelineOverlay,
      ...gateBearingOverlays(geo.roadBearings, params.cityRadiusMeters)
    ])
  ];

  // S4 works on a junction-cleaned copy so the pre-S4 snapshots stay faithful to
  // the exact grid classified above. The perimeter is still wholly derived from
  // that grid's shared cell edges; the wall PATTERN (which area to enclose, coast
  // treatment, line style) comes from the WallPlan — see wall-patterns.md.
  const plan = program.wallPlan ?? DEFAULT_WALL_PLAN;
  const riverLines = riverPaths.map(p => p.points);
  const interiorCells = optimizeJunctions(cells, params.cellSizeMeters);
  const traced = buildBorders(interiorCells, urban);
  const envelopes = traced.map(loop => shapeEnvelope(loop, plan, params.cellSizeMeters));
  const precincts = placePrecincts(interiorCells, urban, sea, envelopes, geo, params, program, riverLines);

  // The citadel keeps its own enceinte ring whether or not the town is walled
  // (design §4.2), derived from the same interior cell edges.
  const citadel = precincts.find(p => p.kind === "citadel");
  const citadelOutline = citadel ? (buildBorders(interiorCells, new Set(citadel.cellIds))[0]?.points ?? null) : null;

  const segCtx = {
    shoreline: coast?.shoreline ?? null,
    waterPolygon: coast?.waterPolygon ?? null,
    rivers: riverLines,
    citadelOutline
  };
  // A walled town's perimeter must REACH the water — S3 stops the urban fabric a
  // cell or two short of the sea, so without this the wall ends on open ground
  // and a `coast: open` town is joined to the outside along the beach
  // (wall-patterns.md §3.1).
  const shoreInfo =
    coast && geo.coast ? { shoreline: coast.shoreline, waterAzimuthDeg: geo.coast.waterAzimuthDeg } : null;
  const borders = (
    program.walls
      ? envelopes.map(loop => reachEnvelopeToShore(loop, shoreInfo, params.cellSizeMeters, params.cityRadiusMeters))
      : envelopes
  ).map(loop => classifyWallSegments(loop, segCtx, params.cellSizeMeters));
  const gates = markWaterGate(placeGates(borders, geo), borders, coast?.shoreline ?? null, program.port);

  const wallCtx = {
    waterPolygon: coast?.waterPolygon ?? null,
    shoreline: coast?.shoreline ?? null,
    rivers: riverLines
  };
  const wallAndTowers: Overlay[] = program.walls
    ? borders.flatMap(b => wallOverlaysFor(b, plan, gates, params.cellSizeMeters, wallCtx))
    : [];
  const citadelRing: Overlay[] = citadelOutline ? [{ kind: "citadelWall", points: close(citadelOutline) }] : [];
  const gateOverlays: Overlay[] = gates.map(gate => ({ kind: "gate", points: [gate.point], water: gate.water }));
  const s4Overlays = [...shorelineOverlay, ...wallAndTowers, ...citadelRing, ...gateOverlays];
  steps.push(
    snapshot("S4 · Inner perimeter & gates", interiorCells, finalTag, riverSnapshotPaths, s4Overlays, precincts)
  );

  // S5 — streets. Gate → plaza streets stay INSIDE the perimeter and are not
  // drawn (they surface as S7 setback gaps); only the extramural roads are shown,
  // as a double line. `arteries` is kept for the S7 setbacks. The snapshot carries
  // the S4 wall / gate / precinct furniture forward so scrubbing to S5 still shows
  // the enclosed town.
  const streets = buildStreets({
    cells: interiorCells,
    urban,
    borders,
    gates,
    precincts,
    citadelOutline,
    geo,
    cellSizeMeters: params.cellSizeMeters,
    halfExtentMeters: half
  });
  const roadPaths = streets.roads.map(points => ({ kind: "road" as const, points, widths: [] as number[] }));
  steps.push(
    snapshot("S5 · Streets", interiorCells, finalTag, [...riverSnapshotPaths, ...roadPaths], s4Overlays, precincts)
  );

  // S6 — district types. Named precincts (temple / harbour) join the S4 plaza
  // and citadel; unnamed wards live on the cells. Shanty retags 3–6 cells just
  // outside the wall. The S4 furniture and S5 roads stay visible while scrubbing.
  const warded = assignWards({
    cells: interiorCells,
    urban,
    outskirts,
    sea,
    borders,
    gates,
    precincts,
    geo,
    params,
    program,
    shoreline: coast?.shoreline ?? null,
    waterPolygon: coast?.waterPolygon ?? null
  });
  const allPrecincts = [...precincts, ...warded.precincts];
  const wardById = new Map(warded.wards.map(w => [w.cellId, w.kind]));
  const s6Tag = (c: Cell): CellTag => {
    if (warded.shanty.has(c.id)) return "shanty";
    return finalTag(c);
  };
  steps.push(
    snapshot(
      "S6 · Wards",
      interiorCells,
      s6Tag,
      [...riverSnapshotPaths, ...roadPaths],
      [...s4Overlays, ...warded.overlays],
      allPrecincts,
      wardById
    )
  );

  return {
    params,
    gridStages,
    steps,
    cells,
    riverPaths,
    shoreline: coast?.shoreline ?? null,
    waterPolygon: coast?.waterPolygon ?? null,
    borders,
    gates,
    precincts: allPrecincts,
    streets,
    wards: warded.wards
  };
}

/** A tributary whose FMG parent is an imported open-water area is already
 * topologically resolved. Keep a short direct final leg when the stochastic
 * edge walk cannot hit the exact junction; dropping it loses a real confluence. */
function directJoinFallback(corridor: Point[], widths: number[], shoreline: Point[] | null) {
  if (corridor.length < 2 || widths.length !== corridor.length) {
    return { edgePoints: [], smoothPoints: [], widths: [], fallback: true };
  }
  const points = corridor.map(p => [p[0], p[1]] as Point);
  if (shoreline && shoreline.length >= 2) {
    const first = nearestOnPolyline(points[0], shoreline);
    const last = nearestOnPolyline(points.at(-1) as Point, shoreline);
    if (first.dist < last.dist) points[0] = first.point;
    else points[points.length - 1] = last.point;
  }
  return { edgePoints: points, smoothPoints: points, widths: widths.slice(), fallback: false };
}

function snapshot(
  label: string,
  cells: Cell[],
  tag: (c: Cell) => CellTag,
  paths: Snapshot["paths"],
  overlays: Overlay[],
  precincts: Snapshot["precincts"] = [],
  wards: Map<number, WardKind> | null = null
): Snapshot {
  return {
    label,
    cells: cells.map(c => ({ ...c, tag: tag(c), ward: wards?.get(c.id) ?? null })),
    paths,
    overlays,
    precincts
  };
}

/** Unit tangent of the shoreline at its closest point to the town centre. */
function shorelineTangent(shoreline: Point[]): Point {
  const hit = nearestOnPolyline([0, 0], shoreline);
  const a = shoreline[hit.segIndex];
  const b = shoreline[Math.min(hit.segIndex + 1, shoreline.length - 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

function gateBearingOverlays(bearings: number[], cityRadiusMeters: number): Overlay[] {
  return bearings.map(deg => {
    const v = azimuthToVec(deg);
    return {
      kind: "gateBearing" as const,
      points: [
        [v[0] * cityRadiusMeters * 0.85, v[1] * cityRadiusMeters * 0.85],
        [v[0] * cityRadiusMeters * 1.25, v[1] * cityRadiusMeters * 1.25]
      ] as [number, number][]
    };
  });
}
