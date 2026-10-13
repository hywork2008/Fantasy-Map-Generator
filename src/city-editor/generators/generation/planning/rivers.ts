import { sizePresetForExtent } from "../../../core/document";
import { classifyRiver } from "../../../core/gen/classifyRiver";
import type { CoastResult } from "../../../core/gen/classifySea";
import { classifyUrban } from "../../../core/gen/classifyUrban";
import { type EdgeGraph, graphEdgeKey, vertexKey } from "../../../core/gen/edgeGraph";
import { nearestOnPolyline, pointInPolygon } from "../../../core/gen/geom";
import { urbanDiskRadiusMeters } from "../../../core/gen/polygonalCirculadeLayout";
import { makeRng } from "../../../core/gen/prng";
import { type RoutedRiver, walkRiver } from "../../../core/gen/riverPath";
import {
  evolutionWallInsetRings,
  insetWalledCore,
  outerWalledAreaShare,
  splitUrbanCore
} from "../../../core/gen/settlementExtent";
import type { Cell, CityGeography, CityParams, CityProgram } from "../../../core/gen/types";
import type { Mesh, Point } from "../../../core/types";
import type { GenerationSettings } from "../../../types/generation";
import { componentBorderLoops } from "../meshGeometry";

export interface PlanRiversInput {
  cells: Cell[];
  sea: Set<number>;
  coast: CoastResult | null;
  settings: Pick<
    GenerationSettings,
    "riverPlacement" | "urbanCoreMode" | "descriptor" | "townWallRings" | "walledAreaShare"
  >;
  geo: CityGeography;
  program: CityProgram;
  params: CityParams;
  complete: boolean;
  stageStep: number;
  effectiveLayout: "organic" | "circulade" | "bram" | "classic";
  seed: string;
  gridKind: "hex" | "voronoi" | "evolution" | undefined;
  mesh: Mesh;
  faceIdOf: string[];
  cellSize: number;
  half: number;
  graph: EdgeGraph;
}

/** Requires coast classifications. Plans the wall-relative river corridor before urban growth, preserving each seeded walk and retry order. */
export function planRivers(input: PlanRiversInput) {
  const {
    cells,
    sea,
    coast,
    settings,
    geo,
    program,
    params,
    complete,
    stageStep,
    effectiveLayout,
    seed,
    gridKind,
    mesh,
    faceIdOf,
    cellSize,
    half,
    graph
  } = input;
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
  // Surveyed banks are independent of cell edges. Keep the population-scaled
  // core rather than peeling it into disconnected lobes beside the channel.
  const preserveImportedCore =
    !!settings.descriptor && (geo.rivers.length === 0 || !!settings.descriptor.fixedCrossings);
  const openCoastalCore = program.walls && program.wallPlan?.coast === "open" && sea.size > 0;
  const coreShare = program.walls ? outerWalledAreaShare(settings, params.extentMeters) : 1;
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
      outerWalledAreaShare(settings, params.extentMeters)
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
      if (r.crossing) band.crossing = r.crossing;
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
  return {
    outsideRiver,
    compactCore,
    preserveImportedCore,
    openCoastalCore,
    urbanRadius,
    urbanBearings,
    plannedUrban,
    plannedCore,
    burgCell,
    retainBurg,
    rivers,
    river
  };
}

/** Output references belong to one pipeline invocation; no cache retains them. */
export type PlanRiversResult = ReturnType<typeof planRivers>;
