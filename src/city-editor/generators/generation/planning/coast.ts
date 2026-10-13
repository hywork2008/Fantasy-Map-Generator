import type { Point } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import type { Cell, CityGeography } from "../../../types/geometry";
import { type CoastResult, classifyCoast, conformSeaToShore } from "../../classifySea";
import type { EdgeGraph } from "../../edgeGraph";
import { azimuthToVec, pointInPolygon } from "../../geom";
import { makeRng } from "../../prng";
import { meshShoreChain, regionalSeaPolygon, regionalShoreline } from "../../regionalCoast";
import { cellInsideWaterPolygons, fixedWaterPolygons } from "../../waterGeometry";
import type { Plan } from "../contracts";
import { applyWideChannels } from "./waterTerrain";

const SHORE_CONFORM_METERS = 40;

export interface PlanCoastInput {
  geo: CityGeography;
  cells: Cell[];
  graph: EdgeGraph;
  half: number;
  cellSize: number;
  seed: string;
  settings: Pick<GenerationSettings, "descriptor">;
}

/** Requires nonempty cells and an edge graph. Returns water classifications and frame metadata; creates no document clone. */
export function planCoast(input: PlanCoastInput) {
  const { geo, cells, graph, half, cellSize, seed, settings } = input;
  const waterMetadata: Pick<Plan, "channelPolygons" | "regionalWater" | "regionalSurface"> = {};
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
    const regionalShore = water.regionalShore;
    const extraShores = "regionalExtraShores" in water ? water.regionalExtraShores : undefined;
    if (!wetsOrigin(coast)) return { kind: water.kind, coast, regionalShore, extraShores };
    // A shore a block or so off the burg (Allavendeda: 60 m) lets the
    // wandering walk pass on the town's side. FMG's water side is right, so
    // first walk the same shore set back seaward; flipping it put the sea on
    // the landward side, and a second wet origin dropped the harbour entirely.
    const toWater = azimuthToVec(water.waterAzimuthDeg);
    for (const step of [0.5, 1, 1.5, 2]) {
      const shift = step * cellSize;
      const shifted = classifyCoast(
        graph,
        water.corridor.map(p => [p[0] + toWater[0] * shift, p[1] + toWater[1] * shift] as Point),
        water.waterAzimuthDeg,
        cells,
        half,
        cellSize,
        makeRng(`${seed}:water:${i}:seaward:${step}`)
      );
      if (shifted?.sea.size && !wetsOrigin(shifted))
        return { kind: water.kind, coast: shifted, regionalShore, extraShores };
    }
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
    return {
      kind: water.kind,
      coast: flipped && !wetsOrigin(flipped) ? flipped : null,
      regionalShore,
      extraShores
    };
  });
  // Hold the walked coast to FMG's own shore line beyond a block's width.
  for (const item of classified) {
    if (!settings.descriptor?.regionalContext || !item.coast || !item.regionalShore) continue;
    const conformed = conformSeaToShore(
      cells,
      item.coast.sea,
      item.regionalShore,
      half,
      SHORE_CONFORM_METERS,
      cell => cell.id === originCell.id
    );
    if (conformed !== item.coast.sea && !conformed.has(originCell.id)) item.coast.sea = conformed;
  }
  const coasts = classified.flatMap(item => (item.coast ? [item.coast] : []));
  let coast: CoastResult | null = coasts[0] ?? null;
  let coastPath = coast?.shoreline ?? [];
  let waterPolygon = coast?.waterPolygon ?? null;
  const sea = new Set<number>(coasts.flatMap(c => [...c.sea]));
  const coastalWater = new Set(sea);
  const ocean = new Set<number>(
    classified.flatMap(item => (item.kind === "ocean" && item.coast ? [...item.coast.sea] : []))
  );
  // Channel polygons remain authoritative; coarse cells only classify wholly wet land.
  const appliedChannels = applyWideChannels(cells, geo.channels ?? [], sea);
  // Surveyed rivers are rendered independently of the coarse editing mesh.
  // Do not plan wards, a castle or roads on cells covered by that water.
  const surveyedWater = settings.descriptor?.fixedCrossings
    ? fixedWaterPolygons(settings.descriptor.fixedCrossings)
    : [];
  for (const cell of cells) {
    if (surveyedWater.length && cellInsideWaterPolygons(cell.polygon, surveyedWater)) sea.add(cell.id);
  }
  if (!coast && appliedChannels[0]) {
    coast = {
      sea: new Set<number>(),
      shoreline: appliedChannels[0].shoreline,
      waterPolygon: appliedChannels[0].polygon
    };
    coastPath = appliedChannels[0].shoreline;
    waterPolygon = appliedChannels[0].polygon;
  }
  waterMetadata.channelPolygons = appliedChannels.map(channel => channel.polygon);
  // The town mesh stops short of the display frame; FMG's drawn ocean shore does not.
  // Even a mesh whose farthest vertex touches the frame is a rounded patch, so
  // its corners are not covered. Always carry the sea out to the frame — the
  // mesh area is subtracted at render time — or the uncovered corners fall
  // back to the burg's biome and invent land across open water.
  const frameHalf = (settings.descriptor?.regionalContext && settings.descriptor.frame.extentMeters / 2) || 0;
  if (frameHalf > 0)
    waterMetadata.regionalWater = classified.flatMap(item => {
      // A lake crossing the whole frame is open water there too (Lerona). A
      // shore that does not reach the frame on both ends closes to nothing.
      if (item.kind === "river" || !item.coast || !item.regionalShore) return [];
      const wet = [...item.coast.sea].map(id => cells[id].centroid);
      const shore = regionalShoreline(
        item.regionalShore,
        meshShoreChain(cells, item.coast.sea) ?? item.coast.shoreline,
        makeRng(`${seed}:regional-shore`)
      );
      const ring = regionalSeaPolygon(shore, frameHalf, wet);
      // Further runs of the same coast close on their FMG water side. One whose
      // closure would take in the burg is the far side of a bay looping out of
      // the frame, already covered by the main shore: skip it.
      const extras = (item.extraShores ?? []).flatMap(extra => {
        const area = regionalSeaPolygon(extra.line, frameHalf, [extra.wet]);
        return area && !pointInPolygon([0, 0], area) ? [area] : [];
      });
      return [...(ring ? [ring] : []), ...extras];
    });
  if (frameHalf > 0 && settings.descriptor?.regionalSurface)
    waterMetadata.regionalSurface = settings.descriptor.regionalSurface;
  return {
    waterMetadata,
    classified,
    coast,
    coasts,
    coastPath,
    waterPolygon,
    sea,
    coastalWater,
    ocean,
    appliedChannels
  };
}

/** Output references belong to one pipeline invocation; no cache retains them. */
export type PlanCoastResult = ReturnType<typeof planCoast>;
