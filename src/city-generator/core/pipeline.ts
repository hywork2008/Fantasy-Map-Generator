// Pipeline orchestrator: S0 grid → S1 sea/land → S2 river → S3 urban core.
// S1 and S2 walk the Voronoi cell-edge graph along rough corridors from the
// descriptor, so coast and river shape are graph-derived (design §4.2). Each
// stage is captured as an immutable Snapshot for the drawing-process slider.

import { classifyRiver } from "./classifyRiver";
import { classifyCoast } from "./classifySea";
import { classifyUrban } from "./classifyUrban";
import { buildEdgeGraph } from "./edgeGraph";
import { azimuthToVec, nearestOnPolyline } from "./geom";
import { buildGrid } from "./grid";
import { makeRng } from "./prng";
import { walkRiver } from "./riverPath";
import type {
  Cell,
  CellTag,
  CityGeography,
  CityParams,
  GenerationResult,
  Overlay,
  Point,
  RiverPath,
  Snapshot
} from "./types";

const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };

/** Pure. Same `params` (seed included) + same `geo` => structurally identical result. */
export function generateCity(params: CityParams, geo: CityGeography = EMPTY_GEO): GenerationResult {
  const rng = makeRng(params.seed);
  const gridStages = buildGrid(params, rng);
  const cells = gridStages[gridStages.length - 1].cells;
  const graph = buildEdgeGraph(cells);
  const half = params.extentMeters / 2;
  const minBand = params.cellSizeMeters * 0.5;

  // S1 — coastline walk → sea cells.
  const coast = geo.coast
    ? classifyCoast(
        graph,
        geo.coast.corridor,
        geo.coast.waterAzimuthDeg,
        cells,
        half,
        params.cellSizeMeters,
        makeRng(`${params.seed}:coast`)
      )
    : null;
  const sea = coast?.sea ?? new Set<number>();

  // S2 — walk each river along its corridor, stopping at the shoreline. A river
  // that can't be placed on the grid (entirely offshore) is dropped.
  const routed = geo.rivers
    .map((r, i) => ({
      band: walkRiver(
        graph,
        r.corridor,
        r.widths,
        coast?.waterPolygon ?? null,
        coast?.shoreline ?? null,
        params.cellSizeMeters,
        half,
        makeRng(`${params.seed}:river:${i}`)
      ),
      cityBank: r.cityBank
    }))
    .filter(r => !r.band.fallback);
  const riverPaths: RiverPath[] = routed.map(r => ({
    points: r.band.smoothPoints,
    widths: r.band.widths,
    cityBank: r.cityBank
  }));
  const river = classifyRiver(
    cells,
    sea,
    routed.map(r => ({ edgePoints: r.band.edgePoints, widths: r.band.widths, cityBank: r.cityBank })),
    minBand
  );

  // Local shoreline tangent at the town — the built-up area elongates along it.
  const shoreTangent = coast ? shorelineTangent(coast.shoreline) : null;
  const { urban, outskirts } = classifyUrban(
    cells,
    { sea, water: river.water, bank: river.bank },
    geo.roadBearings,
    params.cityRadiusMeters,
    shoreTangent
  );

  const finalTag = (c: Cell): CellTag => {
    if (sea.has(c.id)) return "sea";
    if (river.water.has(c.id)) return "water";
    if (urban.has(c.id)) return "urban";
    if (outskirts.has(c.id)) return "outskirts";
    return "rural";
  };

  const shorelineOverlay: Overlay[] = coast ? [{ kind: "shoreline", points: coast.shoreline }] : [];
  const riverSnapshotPaths = riverPaths.map(p => ({ kind: "river" as const, points: p.points, widths: p.widths }));

  const steps: Snapshot[] = [
    snapshot("S0 · Grid", cells, () => "land", [], []),
    snapshot("S1 · Sea & land", cells, c => (sea.has(c.id) ? "sea" : "land"), [], shorelineOverlay),
    snapshot(
      "S2 · River",
      cells,
      c => (sea.has(c.id) ? "sea" : river.water.has(c.id) ? "water" : "land"),
      riverSnapshotPaths,
      shorelineOverlay
    ),
    snapshot("S3 · Urban core", cells, finalTag, riverSnapshotPaths, [
      ...shorelineOverlay,
      ...gateBearingOverlays(geo.roadBearings, params.cityRadiusMeters)
    ])
  ];

  return {
    params,
    gridStages,
    steps,
    cells,
    riverPaths,
    shoreline: coast?.shoreline ?? null,
    waterPolygon: coast?.waterPolygon ?? null
  };
}

function snapshot(
  label: string,
  cells: Cell[],
  tag: (c: Cell) => CellTag,
  paths: Snapshot["paths"],
  overlays: Overlay[]
): Snapshot {
  return { label, cells: cells.map(c => ({ polygon: c.polygon, tag: tag(c) })), paths, overlays };
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
