import { editorText } from "../../i18n/editorMessages";
import type { GridEvolutionStage } from "../types/contracts/gridEvolution";
// Step-by-step capture of `buildPatchCells` (patches.ts) for the Document
// panel's "Grid evolution" slider — one stage per scatter point and per relax
// pass, so the cell-shaping algorithm can be inspected "one for-loop iteration
// at a time" (docs/city-editor/改善計画.md). Each stage also carries the
// Delaunay edges and raw sites for the "2.1 Delaunay / Voronoi" overlay.
//
// The rng is consumed exactly as `buildPatchCells` consumes it (all of it, up
// front, by `scatterPatchSites`), and the relax/clip primitives are the same
// exported functions, so `buildGridEvolution(...).at(-1).cells` is byte-identical
// to `buildPatchCells(...)` for the same params + seed.
//
// See docs/city-editor/実装計画.md Phase G1.

import type { PatchParams } from "../types/contracts/patches";
import type { Point } from "../types/geometry";
import type { Rect } from "./geom";
import { clipPatchCells, guardRing, relaxCentralSites, scatterPatchSites } from "./patches";
import type { Rng } from "./prng";
import { computeDelaunayEdges } from "./voronoi";

/** Scatter capture is throttled to at most this many stages (per-point below it). */
const MAX_SCATTER_STAGES = 120;

export function buildGridEvolution(params: PatchParams, rng: Rng): GridEvolutionStage[] {
  const half = params.extentMeters / 2;
  const win: Rect = { minX: -half, minY: -half, maxX: half, maxY: half };
  const guard = guardRing(win, params.extentMeters / 10);

  // Consume the whole rng stream once, exactly like buildPatchCells.
  const allSites = scatterPatchSites(params.nPatches, params.extentMeters, rng, params.rimGrowthPercent);
  const total = allSites.length;
  const relaxCount = Math.max(0, Math.min(Math.round(params.relaxCount), total));
  const relaxPasses = Math.max(0, Math.round(params.relaxPasses));

  const snapshot = (label: string, sites: Point[]): GridEvolutionStage => ({
    label,
    sites: sites.map(p => [p[0], p[1]] as Point),
    delaunay: delaunayEdges(sites, guard),
    cells: clipPatchCells(sites, guard, win, params.extentMeters)
  });

  const stages: GridEvolutionStage[] = [];

  // --- scatter: one stage per point, throttled for large nPatches ---
  const stride = Math.max(1, Math.ceil(total / MAX_SCATTER_STAGES));
  for (let k = 1; k <= total; k++) {
    if (k !== total && (k - 1) % stride !== 0) continue;
    stages.push(
      snapshot(editorText("cityEditor.messages.scatter", { value0: k, value1: total }), allSites.slice(0, k))
    );
  }

  // --- relax: one stage per pass over the centre-most `relaxCount` sites ---
  let sites = allSites;
  for (let pass = 1; pass <= relaxPasses && relaxCount > 0; pass++) {
    sites = relaxCentralSites(sites, guard, win, relaxCount);
    stages.push(
      snapshot(
        editorText("cityEditor.messages.relaxPassK", { value0: pass, value1: relaxPasses, value2: relaxCount }),
        sites
      )
    );
  }

  stages.push(snapshot(editorText("cityEditor.messages.final"), sites));
  return stages;
}

/** Delaunay edges among the real sites only (drop any edge touching the guard). */
function delaunayEdges(sites: Point[], guard: Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (const [a, b] of computeDelaunayEdges([...sites, ...guard])) {
    if (a >= sites.length || b >= sites.length) continue;
    out.push([
      [sites[a][0], sites[a][1]],
      [sites[b][0], sites[b][1]]
    ]);
  }
  return out;
}
