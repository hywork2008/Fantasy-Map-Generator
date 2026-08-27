// Pipeline orchestrator. M2: S0 grid → S1 sea/land → S2 river → S3 urban core.
// Each stage is captured as an immutable Snapshot for the drawing-process slider.

import { classifyRiver } from "./classifyRiver";
import { classifySea } from "./classifySea";
import { classifyUrban } from "./classifyUrban";
import { buildEdgeGraph } from "./edgeGraph";
import { azimuthToVec } from "./geom";
import { buildGrid } from "./grid";
import { makeRng } from "./prng";
import { routeRiverAlongEdges } from "./riverPath";
import type { Cell, CellTag, CityGeography, CityParams, GenerationResult, Overlay, RiverPath, Snapshot } from "./types";

const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };

/** Pure. Same `params` (seed included) + same `geo` => structurally identical result. */
export function generateCity(params: CityParams, geo: CityGeography = EMPTY_GEO): GenerationResult {
  const rng = makeRng(params.seed);
  const gridStages = buildGrid(params, rng);
  const cells = gridStages[gridStages.length - 1].cells;

  const sea = classifySea(cells, geo.coast?.shoreline ?? null, geo.coast?.waterAzimuthDeg ?? 0);
  const minBand = params.cellSizeMeters * 0.5;

  // S2 — route each river onto the cell-edge graph, then classify against it.
  const edgeGraph = geo.rivers.length > 0 ? buildEdgeGraph(cells) : null;
  const routed = edgeGraph
    ? geo.rivers.map(r => ({
        band: routeRiverAlongEdges(edgeGraph, r.centerline, r.widths, params.cellSizeMeters),
        cityBank: r.cityBank
      }))
    : [];
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

  const { urban, outskirts } = classifyUrban(
    cells,
    { sea, water: river.water, bank: river.bank },
    geo.roadBearings,
    params.cityRadiusMeters
  );

  const finalTag = (c: Cell): CellTag => {
    if (sea.has(c.id)) return "sea";
    if (river.water.has(c.id)) return "water";
    if (urban.has(c.id)) return "urban";
    if (outskirts.has(c.id)) return "outskirts";
    return "rural";
  };

  const shorelineOverlay: Overlay[] = geo.coast ? [{ kind: "shoreline", points: geo.coast.shoreline }] : [];
  const riverSnapshotPaths = riverPaths.map(p => ({
    kind: "river" as const,
    points: p.points,
    widths: p.widths
  }));

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

  return { params, gridStages, steps, cells, riverPaths };
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
