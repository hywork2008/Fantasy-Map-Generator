import { curveCatmullRom, line } from "d3";
import Delaunator from "delaunator";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";

import type { Burg, LandRouteGenerationMode, Route, SeaRouteGenerationMode } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "../types/WorldState";
import {
  distanceSquared,
  findClosestCell,
  findPath,
  getAdjective,
  getPortAnchorPosition,
  ra,
  rn,
  round,
  rw
} from "../utils";
import { TIME } from "../utils/debug";
import { isLand } from "../utils/graphUtils";
import { MIN_NAVIGABLE_FLUX, Rivers } from "./river-generator";
import type { Point } from "./voronoi";

const ROUTES_SHARP_ANGLE = 135;
const ROUTES_VERY_SHARP_ANGLE = 115;

// Hoisted out of getPath(), which is called once per route on every redraw.
const ROUTE_CURVES: Record<string, import("d3").CurveFactory | import("d3").CurveFactoryLineOnly> = {
  roads: curveCatmullRom.alpha(0.1),
  trails: curveCatmullRom.alpha(0.1),
  searoutes: curveCatmullRom.alpha(0.5),
  default: curveCatmullRom.alpha(0.1)
};

const MIN_PASSABLE_SEA_TEMP = -4;
const ROUTE_TYPE_MODIFIERS: Record<string, number> = {
  "-1": 1, // coastline
  "-2": 1.8, // sea
  "-3": 4, // open sea
  "-4": 6, // ocean
  default: 8 // far ocean
};

/**
 * Land-route pathfinding elevation aversion (docs/plan/land-route-elevation-cost.md §2.2).
 *
 * Goals (default aversion = 1):
 * - Mild hills / short mid-ridge (~h 50, ~500 m) may stay if far shorter than a valley loop.
 * - High peaks (h ≥ ~52, ≳600 m; e.g. 1227 m cells) lose to longer lowland corridors.
 * - Sole mountain passes still connect (cost is large but finite).
 *
 * Peak term is uncapped so a single 1000 m+ cell can outweigh a long planar detour.
 */
export type LandRouteMode = "roads" | "trails";

/** Soft height bias starts above this pack height index (~116 m at exp 1.8). */
const LAND_ROUTE_ELEVATION_H0 = 32;
const LAND_ROUTE_HEIGHT_SOFT = 1.2;
/** Climb (Δh) scale. */
const LAND_ROUTE_SLOPE_S = 1.4;
const LAND_ROUTE_SLOPE_DH_REF = 12;
const LAND_ROUTE_SLOPE_Q = 1.3;
/**
 * Hard peak barrier starts strictly above this height. At heightExponent 1.8:
 * h=55 ≈665 m is still allowed as a short local ridge (Nesia 5100–5101–5102–5272);
 * h=70 ≈1227 m (cell 5271) is heavily penalized so it is not used as a shortcut.
 */
const LAND_ROUTE_PEAK_H0 = 55;
const LAND_ROUTE_PEAK_K = 20;
const LAND_ROUTE_PEAK_REF = 10;
const LAND_ROUTE_PEAK_P = 2.5;
/** Trails tolerate steeper / higher ground better than roads. */
const LAND_ROUTE_TRAILS_SENSITIVITY = 0.6;

/**
 * Clamp generation aversion strength. 0 disables height/slope penalties;
 * 1 matches the plan defaults; values above 1 amplify them.
 */
export function clampLandRouteElevationAversion(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 1;
  return Math.min(3, Math.max(0, raw));
}

/** Soft absolute-height factor (exported for unit tests). */
export function landRouteElevationModifier(h: number, sensitivity = 1, aversion = 1): number {
  const span = 100 - LAND_ROUTE_ELEVATION_H0;
  const base = Math.max(0, h - LAND_ROUTE_ELEVATION_H0) / span;
  return 1 + LAND_ROUTE_HEIGHT_SOFT * sensitivity * aversion * base;
}

/** Climb-only slope multiplier (descents do not get a bonus or extra penalty). */
export function landRouteSlopeModifier(hFrom: number, hTo: number, sensitivity = 1, aversion = 1): number {
  const dh = Math.max(0, hTo - hFrom);
  if (dh === 0) return 1;
  return 1 + LAND_ROUTE_SLOPE_S * sensitivity * aversion * (dh / LAND_ROUTE_SLOPE_DH_REF) ** LAND_ROUTE_SLOPE_Q;
}

/** Uncapped peak multiplier for heights above LAND_ROUTE_PEAK_H0. */
export function landRoutePeakMultiplier(hTo: number, sensitivity = 1, aversion = 1): number {
  const peak = Math.max(0, hTo - LAND_ROUTE_PEAK_H0);
  if (peak === 0) return 1;
  return 1 + LAND_ROUTE_PEAK_K * sensitivity * aversion * (peak / LAND_ROUTE_PEAK_REF) ** LAND_ROUTE_PEAK_P;
}

/** Combined terrain multiplier (no low cap — high peaks may be arbitrarily expensive). */
export function landRouteTerrainMultiplier(hFrom: number, hTo: number, sensitivity = 1, aversion = 1): number {
  return (
    landRouteElevationModifier(hTo, sensitivity, aversion) *
    landRouteSlopeModifier(hFrom, hTo, sensitivity, aversion) *
    landRoutePeakMultiplier(hTo, sensitivity, aversion)
  );
}

function landRouteSensitivity(mode: LandRouteMode): number {
  return mode === "trails" ? LAND_ROUTE_TRAILS_SENSITIVITY : 1;
}

type RouteGraphEdge = { from: number; to: number; triangleIndex: number };
type PortEdge = [number, number];
type StateFeatureBurgGroup = { feature: number; stateId: number; burgs: Burg[] };
type FeatureBurgGroup = { feature: number; burgs: Burg[] };

// name generator data
const models: Record<string, Record<string, number>> = {
  roads: {
    burg_suffix: 3,
    prefix_suffix: 6,
    the_descriptor_prefix_suffix: 2,
    the_descriptor_burg_suffix: 1
  },
  trails: { burg_suffix: 8, prefix_suffix: 1, the_descriptor_burg_suffix: 1 },
  searoutes: {
    burg_suffix: 4,
    prefix_suffix: 2,
    the_descriptor_prefix_suffix: 1
  }
};

const prefixes: string[] = [
  "King",
  "Queen",
  "Military",
  "Old",
  "New",
  "Ancient",
  "Royal",
  "Imperial",
  "Great",
  "Grand",
  "High",
  "Silver",
  "Dragon",
  "Shadow",
  "Star",
  "Mystic",
  "Whisper",
  "Eagle",
  "Golden",
  "Crystal",
  "Enchanted",
  "Frost",
  "Moon",
  "Sun",
  "Thunder",
  "Phoenix",
  "Sapphire",
  "Celestial",
  "Wandering",
  "Echo",
  "Twilight",
  "Crimson",
  "Serpent",
  "Iron",
  "Forest",
  "Flower",
  "Whispering",
  "Eternal",
  "Frozen",
  "Rain",
  "Luminous",
  "Stardust",
  "Arcane",
  "Glimmering",
  "Jade",
  "Ember",
  "Azure",
  "Gilded",
  "Divine",
  "Shadowed",
  "Cursed",
  "Moonlit",
  "Sable",
  "Everlasting",
  "Amber",
  "Nightshade",
  "Wraith",
  "Scarlet",
  "Platinum",
  "Whirlwind",
  "Obsidian",
  "Ethereal",
  "Ghost",
  "Spike",
  "Dusk",
  "Raven",
  "Spectral",
  "Burning",
  "Verdant",
  "Copper",
  "Velvet",
  "Falcon",
  "Enigma",
  "Glowing",
  "Silvered",
  "Molten",
  "Radiant",
  "Astral",
  "Wild",
  "Flame",
  "Amethyst",
  "Aurora",
  "Shadowy",
  "Solar",
  "Lunar",
  "Whisperwind",
  "Fading",
  "Titan",
  "Dawn",
  "Crystalline",
  "Jeweled",
  "Sylvan",
  "Twisted",
  "Ebon",
  "Thorn",
  "Cerulean",
  "Halcyon",
  "Infernal",
  "Storm",
  "Eldritch",
  "Sapphire",
  "Crimson",
  "Tranquil",
  "Paved"
];

const descriptors = [
  "Great",
  "Shrouded",
  "Sacred",
  "Fabled",
  "Frosty",
  "Winding",
  "Echoing",
  "Serpentine",
  "Breezy",
  "Misty",
  "Rustic",
  "Silent",
  "Cobbled",
  "Cracked",
  "Shaky",
  "Obscure"
];

const suffixes: Record<string, Record<string, number>> = {
  roads: { road: 7, route: 3, way: 2, highway: 1 },
  trails: { trail: 4, path: 1, track: 1, pass: 1 },
  searoutes: { "sea route": 5, lane: 2, passage: 1, seaway: 1 }
};

class RoutesModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;

  private riverAdjacency = new Set<string>();
  private riverPolygons = new Map<number, [number, number, number][]>();
  private cellPolygonIndex = new Map<number, { riverId: number; polygonIdx: number }>();

  sync(): void {
    const { pack } = this.worldContext;
    this.riverAdjacency.clear();
    this.riverPolygons.clear();
    this.cellPolygonIndex.clear();

    for (const river of pack.rivers ?? []) {
      if (!river) continue;

      for (let seqIdx = 0; seqIdx < river.cells.length; seqIdx++) {
        const cell = river.cells[seqIdx];
        if (cell < 0) continue;
        if (seqIdx + 1 < river.cells.length) {
          const nextCell = river.cells[seqIdx + 1];
          this.riverAdjacency.add(`${cell}-${nextCell}`);
          if (nextCell >= 0) this.riverAdjacency.add(`${nextCell}-${cell}`);
        }
      }

      const polygon = Rivers.addMeandering(river.cells);
      this.riverPolygons.set(river.i, polygon);

      let cursor = 0;
      for (const cell of river.cells) {
        if (cell < 0) continue;
        const [cx, cy] = pack.cells.p[cell];
        while (cursor < polygon.length && (polygon[cursor][0] !== cx || polygon[cursor][1] !== cy)) {
          cursor++;
        }
        if (cursor < polygon.length) {
          this.cellPolygonIndex.set(cell, { riverId: river.i, polygonIdx: cursor });
          cursor++;
        }
      }
    }
  }

  getWaterPathCost(current: number, next: number): number {
    const { pack } = this.worldContext;
    const { h } = pack.cells;
    const haven = pack.cells.haven as typeof pack.cells.haven | undefined;

    const currentIsWater = h[current] < 20;
    const nextIsWater = h[next] < 20;

    // Sea routes enter and leave land only through an official haven. River
    // navigation is modeled by RiverNavigationGraph, not this bidirectional
    // sea-route evaluator.
    if (!currentIsWater && nextIsWater && haven?.[current] === next) {
      return distanceSquared(pack.cells.p[current], pack.cells.p[next]);
    }

    if (currentIsWater && !nextIsWater && haven?.[next] === current) {
      return distanceSquared(pack.cells.p[current], pack.cells.p[next]);
    }

    if (currentIsWater && nextIsWater) {
      return distanceSquared(pack.cells.p[current], pack.cells.p[next]);
    }

    return Infinity;
  }

  addMeandering(cells: number[], anchors: [number, number][]): [number, number, number][] {
    const result: [number, number, number][] = [];
    let i = 0;

    while (i < cells.length) {
      const cell = cells[i];
      const polyInfo = this.cellPolygonIndex.get(cell);

      if (!polyInfo) {
        const [ax, ay] = anchors[i];
        result.push([ax, ay, cell]);
        i++;
        continue;
      }

      const riverId = polyInfo.riverId;
      let runEnd = i + 1;
      while (runEnd < cells.length) {
        const nextInfo = this.cellPolygonIndex.get(cells[runEnd]);
        if (!nextInfo || nextInfo.riverId !== riverId) break;
        runEnd++;
      }

      const polygon = this.riverPolygons.get(riverId)!;
      const runCells = cells.slice(i, runEnd);
      const startPolyIdx = this.cellPolygonIndex.get(runCells[0])!.polygonIdx;
      const endPolyIdx = this.cellPolygonIndex.get(runCells[runCells.length - 1])!.polygonIdx;
      const isUpstream = startPolyIdx > endPolyIdx;

      const fromIdx = Math.min(startPolyIdx, endPolyIdx);
      const toIdx = Math.max(startPolyIdx, endPolyIdx);
      const rawSlice = polygon.slice(fromIdx, toIdx + 1);
      const orderedSlice = isUpstream ? rawSlice.slice().reverse() : rawSlice;

      const anchorSlicePos = new Map<number, number>();
      for (let ci = 0; ci < runCells.length; ci++) {
        const pIdx = this.cellPolygonIndex.get(runCells[ci])!.polygonIdx;
        const slicePos = isUpstream ? startPolyIdx - pIdx : pIdx - startPolyIdx;
        anchorSlicePos.set(slicePos, ci);
      }

      let cellRunIdx = 0;
      for (let k = 0; k < orderedSlice.length; k++) {
        const anchor = anchorSlicePos.get(k);
        if (anchor !== undefined) cellRunIdx = anchor;
        result.push([orderedSlice[k][0], orderedSlice[k][1], runCells[cellRunIdx]]);
      }

      i = runEnd;
    }

    return result;
  }

  buildLinks(routes: Route[]): Record<number, Record<number, number>> {
    const links: Record<number, Record<number, number>> = {};

    for (const { points, i: routeId } of routes) {
      const cells = points.map(p => p[2]);

      for (let i = 0; i < cells.length - 1; i++) {
        const cellId = cells[i];
        const nextCellId = cells[i + 1];

        if (cellId !== nextCellId) {
          if (!links[cellId]) links[cellId] = {};
          links[cellId][nextCellId] = routeId;

          if (!links[nextCellId]) links[nextCellId] = {};
          links[nextCellId][cellId] = routeId;
        }
      }
    }

    return links;
  }

  private sortBurgsByStateAndFeature(burgs: Burg[]) {
    const burgsByStateFeature = new Map<string, StateFeatureBurgGroup>();
    const capitalsByStateFeature = new Map<string, StateFeatureBurgGroup>();
    const portsByStateFeature = new Map<string, StateFeatureBurgGroup>();

    const addBurg = (collection: Map<string, StateFeatureBurgGroup>, feature: number, stateId: number, burg: Burg) => {
      const key = `${stateId}:${feature}`;
      const group = collection.get(key);
      if (group) {
        group.burgs.push(burg);
        return;
      }
      collection.set(key, { feature, stateId, burgs: [burg] });
    };

    for (const burg of burgs) {
      if (!burg.i || burg.removed || !burg.state) continue;
      const { feature, capital, port, state } = burg;
      addBurg(burgsByStateFeature, feature as number, state, burg);
      if (capital) addBurg(capitalsByStateFeature, feature as number, state, burg);
      if (port) addBurg(portsByStateFeature, port as number, state, burg);
    }

    return {
      burgsByStateFeature: [...burgsByStateFeature.values()],
      capitalsByStateFeature: [...capitalsByStateFeature.values()],
      portsByStateFeature: [...portsByStateFeature.values()]
    };
  }

  /**
   * Sea access is intentionally separate from land infrastructure. Standard
   * maps retain their historical international sea lanes; frontier settlement
   * patterns retain same-State access only.
   */
  private allowsInternationalSeaRoutes(): boolean {
    return this.worldContext.options.initialSettlementPattern === "standard";
  }

  /**
   * Standard maps model a small number of pre-existing cross-border paths as
   * trade / pilgrimage trails. They are not State-built capital roads.
   */
  private allowsInternationalTrails(): boolean {
    return this.worldContext.options.initialSettlementPattern === "standard";
  }

  /** Groups burgs by land / water feature without imposing a State boundary. */
  private sortBurgsByFeature(burgs: Burg[]) {
    const burgsByFeature = new Map<number, FeatureBurgGroup>();
    const capitalsByFeature = new Map<number, FeatureBurgGroup>();
    const portsByFeature = new Map<number, FeatureBurgGroup>();

    const addBurg = (collection: Map<number, FeatureBurgGroup>, feature: number, burg: Burg) => {
      const group = collection.get(feature);
      if (group) {
        group.burgs.push(burg);
        return;
      }
      collection.set(feature, { feature, burgs: [burg] });
    };

    for (const burg of burgs) {
      if (!burg.i || burg.removed || !burg.state) continue;
      addBurg(burgsByFeature, burg.feature as number, burg);
      if (burg.capital) addBurg(capitalsByFeature, burg.feature as number, burg);
      if (burg.port) addBurg(portsByFeature, burg.port as number, burg);
    }

    return {
      burgsByFeature: [...burgsByFeature.values()],
      capitalsByFeature: [...capitalsByFeature.values()],
      portsByFeature: [...portsByFeature.values()]
    };
  }

  // Urquhart graph is obtained by removing the longest edge from each triangle in the Delaunay triangulation
  // this gives us an aproximation of a desired road network, i.e. connections between burgs
  // code from https://observablehq.com/@mbostock/urquhart-graph
  private calculateUrquhartEdges(points: Point[]): PortEdge[] {
    if (points.length < 2) return []; // No connection for less than 2 points
    if (points.length === 2) return [[0, 1]]; // Direct connection for exactly two points

    const { edges, removed } = this.calculateDelaunayEdges(points);
    return edges.filter(edge => !removed[edge.triangleIndex]).map(({ from, to }) => [from, to]);
  }

  /**
   * Retains the sparse Urquhart network and restores each port's closest
   * Delaunay neighbour that the Urquhart pass removed. This is deliberately
   * not the absolute nearest neighbour: Urquhart already retains those edges.
   */
  private calculateAugmentedEdges(points: Point[]): PortEdge[] {
    if (points.length < 2) return []; // No connection for less than 2 points
    if (points.length === 2) return [[0, 1]]; // Direct connection for exactly two points

    const { edges, removed } = this.calculateDelaunayEdges(points);
    const selectedEdges = new Map<string, PortEdge>();
    const closestRemovedEdge = Array.from({ length: points.length }, () => ({
      edge: undefined as RouteGraphEdge | undefined,
      distance: Infinity
    }));

    for (const edge of edges) {
      if (!removed[edge.triangleIndex]) {
        selectedEdges.set(this.getRouteEdgeKey(edge.from, edge.to), [edge.from, edge.to]);
        continue;
      }

      const distance = distanceSquared(points[edge.from], points[edge.to]);
      for (const portId of [edge.from, edge.to]) {
        if (distance < closestRemovedEdge[portId].distance) {
          closestRemovedEdge[portId] = { edge, distance };
        }
      }
    }

    for (const { edge } of closestRemovedEdge) {
      if (!edge) continue;
      selectedEdges.set(this.getRouteEdgeKey(edge.from, edge.to), [edge.from, edge.to]);
    }

    return [...selectedEdges.values()];
  }

  private calculateDelaunayEdges(points: Point[]) {
    const score = (p0: number, p1: number) => distanceSquared(points[p0], points[p1]);

    const { halfedges, triangles } = Delaunator.from(points);
    const n = triangles.length;

    const removed = new Uint8Array(n);

    for (let e = 0; e < n; e += 3) {
      const p0 = triangles[e],
        p1 = triangles[e + 1],
        p2 = triangles[e + 2];

      const p01 = score(p0, p1),
        p12 = score(p1, p2),
        p20 = score(p2, p0);

      removed[
        p20 > p01 && p20 > p12
          ? Math.max(e + 2, halfedges[e + 2])
          : p12 > p01 && p12 > p20
            ? Math.max(e + 1, halfedges[e + 1])
            : Math.max(e, halfedges[e])
      ] = 1;
    }

    const edges: RouteGraphEdge[] = [];
    for (let e = 0; e < n; ++e) {
      if (e > halfedges[e]) {
        const t0 = triangles[e];
        const t1 = triangles[e % 3 === 2 ? e - 2 : e + 1];
        edges.push({ from: t0, to: t1, triangleIndex: e });
      }
    }

    return { edges, removed };
  }

  private getRouteEdgeKey(from: number, to: number): string {
    return from < to ? `${from}-${to}` : `${to}-${from}`;
  }

  /**
   * Preserve a coastal sea-lane backbone even when navigable river ports alter
   * the all-port Delaunay graph. River ports still contribute to `portEdges`;
   * this only adds missing edges between ports that have a direct sea haven.
   */
  private addCoastalBackboneEdges(points: Point[], portEdges: PortEdge[], coastalPortIndices: number[]): PortEdge[] {
    if (coastalPortIndices.length < 2) return portEdges;

    const mergedEdges = new Map<string, PortEdge>();
    for (const edge of portEdges) mergedEdges.set(this.getRouteEdgeKey(...edge), edge);

    const coastalPoints = coastalPortIndices.map(index => points[index]);
    for (const [fromId, toId] of this.calculateUrquhartEdges(coastalPoints)) {
      const edge: PortEdge = [coastalPortIndices[fromId], coastalPortIndices[toId]];
      mergedEdges.set(this.getRouteEdgeKey(...edge), edge);
    }

    return [...mergedEdges.values()];
  }

  private createCostEvaluator({
    isWater,
    connections,
    seaRouteGenerationMode,
    landMode = "roads",
    landRouteGenerationMode
  }: {
    isWater: boolean;
    connections: Map<string, boolean>;
    seaRouteGenerationMode?: SeaRouteGenerationMode;
    /** Only used when isWater is false. Roads avoid high ground more than trails. */
    landMode?: LandRouteMode;
    /**
     * Which land cost formula to use. Defaults to the map's persisted option, then
     * elevationAware for new generation.
     */
    landRouteGenerationMode?: LandRouteGenerationMode;
  }) {
    const { pack, biomesData, grid } = this.worldContext;
    const sensitivity = landRouteSensitivity(landMode);
    const resolvedLandGenerationMode: LandRouteGenerationMode =
      landRouteGenerationMode ?? this.worldContext.options.landRouteGenerationMode ?? "elevationAware";
    const aversion = clampLandRouteElevationAversion(this.worldContext.options.landRouteElevationAversion);
    const isNavigableRiverLeg = (current: number, next: number): boolean => {
      const riverIds = pack.cells.r as Uint16Array | number[] | undefined;
      const flux = pack.cells.fl as Uint16Array | number[] | undefined;
      if (!riverIds || !flux) return false;
      const riverId = riverIds[current];
      return (
        riverId !== 0 &&
        riverId === riverIds[next] &&
        flux[current] >= MIN_NAVIGABLE_FLUX &&
        flux[next] >= MIN_NAVIGABLE_FLUX &&
        this.riverAdjacency.has(`${current}-${next}`)
      );
    };

    function getLandPathCost(current: number, next: number) {
      if (pack.cells.h[next] < 20) return Infinity; // ignore water cells
      // A route may reach a river port or cross one river cell, but it must
      // never use the navigable channel itself as a longitudinal road.
      if (isNavigableRiverLeg(current, next)) return Infinity;

      const habitability = biomesData.habitability[pack.cells.biomeCode[next]];
      if (!habitability) return Infinity; // inhabitable cells are not passable (e.g. glacier)

      const habitabilityModifier = 1 + Math.max(100 - habitability, 0) / 1000; // [1, 1.1];
      const connectionModifier = connections.has(`${current}-${next}`) ? 0.5 : 1;
      const burgModifier = pack.cells.burg[next] ? 1 : 3;
      const [x1, y1] = pack.cells.p[current];
      const [x2, y2] = pack.cells.p[next];

      if (resolvedLandGenerationMode === "legacy") {
        // Pre-elevation-aware formula: distanceSquared + weak absolute-height only.
        const distanceCost = distanceSquared(pack.cells.p[current], pack.cells.p[next]);
        const heightModifier = 1 + Math.max(pack.cells.h[next] - 25, 25) / 25;
        return distanceCost * habitabilityModifier * heightModifier * connectionModifier * burgModifier;
      }

      // Linear planar length so multi-hop valleys are not artificially cheap vs few edges
      // (sum of squared lengths under-penalizes many short steps). Terrain mult is capped.
      // Aversion is set from Tools → Regenerate routes. See land-route-elevation-cost.md.
      const run = Math.hypot(x2 - x1, y2 - y1);
      const terrain = landRouteTerrainMultiplier(pack.cells.h[current], pack.cells.h[next], sensitivity, aversion);
      return run * habitabilityModifier * terrain * connectionModifier * burgModifier;
    }

    const getLegacyWaterPathCost = (current: number, next: number) => {
      const currentIsWater = pack.cells.h[current] < 20;
      const nextIsWater = pack.cells.h[next] < 20;

      if (!currentIsWater && !nextIsWater) return Infinity;

      if (!currentIsWater) {
        // A coastal port has one official sea entrance: its haven cell.
        if (pack.cells.haven[current] !== next) return Infinity;
      } else if (!nextIsWater) {
        // The same restriction applies when arriving at the destination port.
        if (pack.cells.haven[next] !== current) return Infinity;
      }

      const waterCell = nextIsWater ? next : current;
      if (grid.cells.temp[pack.cells.g[waterCell]] < MIN_PASSABLE_SEA_TEMP) return Infinity; // ignore too cold cells

      const distanceCost = distanceSquared(pack.cells.p[current], pack.cells.p[next]);
      const typeModifier = nextIsWater ? (ROUTE_TYPE_MODIFIERS[pack.cells.t[next]] ?? ROUTE_TYPE_MODIFIERS.default) : 1;
      const connectionModifier = connections.has(`${current}-${next}`) ? 0.5 : 1;
      return distanceCost * typeModifier * connectionModifier;
    };

    const getAugmentedWaterPathCost = (current: number, next: number) => {
      const nextIsWater = pack.cells.h[next] < 20;
      if (nextIsWater && grid.cells.temp[pack.cells.g[next]] < MIN_PASSABLE_SEA_TEMP) return Infinity; // ignore too cold cells

      const distanceCost = this.getWaterPathCost(current, next);
      if (distanceCost === Infinity) return Infinity;

      const typeModifier = nextIsWater ? (ROUTE_TYPE_MODIFIERS[pack.cells.t[next]] ?? ROUTE_TYPE_MODIFIERS.default) : 1;
      const connectionModifier = connections.has(`${current}-${next}`) ? 0.5 : 1;

      const pathCost = distanceCost * typeModifier * connectionModifier;
      return pathCost;
    };
    if (!isWater) return getLandPathCost;
    return seaRouteGenerationMode === "legacy" ? getLegacyWaterPathCost : getAugmentedWaterPathCost;
  }

  private getRouteSegments(pathCells: number[], connections: Map<string, boolean>) {
    const segments = [];
    let segment = [];

    for (let i = 0; i < pathCells.length; i++) {
      const cellId = pathCells[i];
      const nextCellId = pathCells[i + 1];
      const isConnected = connections.has(`${cellId}-${nextCellId}`) || connections.has(`${nextCellId}-${cellId}`);

      if (isConnected) {
        if (segment.length) {
          // segment stepped into existing segment
          segment.push(pathCells[i]);
          segments.push(segment);
          segment = [];
        }
        continue;
      }

      segment.push(pathCells[i]);
    }

    if (segment.length > 1) segments.push(segment);

    return segments;
  }

  private getGroupConnections(group: Route["group"]): Map<string, boolean> {
    const connections = new Map<string, boolean>();
    for (const route of this.worldContext.pack.routes) {
      if (route.group !== group) continue;
      this.addConnections(
        route.points.map(point => point[2]),
        connections
      );
    }
    return connections;
  }

  private findPathSegments({
    isWater,
    connections,
    start,
    exit,
    stateId,
    allowedStateIds,
    seaRouteGenerationMode,
    landMode,
    landRouteGenerationMode
  }: {
    isWater: boolean;
    connections: Map<string, boolean>;
    start: number;
    exit: number;
    stateId?: number;
    /** Non-zero State ids permitted for a cross-border trail. Unclaimed cells remain traversable. */
    allowedStateIds?: ReadonlySet<number>;
    seaRouteGenerationMode?: SeaRouteGenerationMode;
    landMode?: LandRouteMode;
    landRouteGenerationMode?: LandRouteGenerationMode;
  }) {
    const { pack } = this.worldContext;
    const baseCost = this.createCostEvaluator({
      isWater,
      connections,
      seaRouteGenerationMode,
      landMode,
      landRouteGenerationMode
    });
    const getCost = (from: number, to: number) => {
      if (stateId && pack.cells.state[to] !== 0 && pack.cells.state[to] !== stateId) return Infinity;
      if (allowedStateIds && pack.cells.state[to] !== 0 && !allowedStateIds.has(pack.cells.state[to])) return Infinity;
      return baseCost(from, to);
    };
    const pathCells = findPath(start, current => current === exit, getCost, pack);
    if (!pathCells) return [];
    const segments = this.getRouteSegments(pathCells, connections);
    return segments;
  }

  private generateMainRoads(connections: Map<string, boolean>) {
    const { pack } = this.worldContext;
    TIME && console.time("generateMainRoads");
    const { burgsByStateFeature } = this.sortBurgsByStateAndFeature(pack.burgs);
    const mainRoads: Route[] = [];

    for (const { feature, stateId, burgs: featureBurgs } of burgsByStateFeature) {
      const roadHubs = this.getDomesticRoadHubs(featureBurgs);
      const points = roadHubs.map(burg => [burg.x, burg.y] as Point);
      const urquhartEdges = this.calculateUrquhartEdges(points);
      urquhartEdges.forEach(([fromId, toId]) => {
        const start = roadHubs[fromId].cell;
        const exit = roadHubs[toId].cell;

        const segments = this.findPathSegments({
          isWater: false,
          connections,
          start,
          exit,
          stateId,
          landMode: "roads"
        });
        for (const segment of segments) {
          this.addConnections(segment, connections);
          mainRoads.push({ feature, cells: segment } as Route);
        }
      });
    }

    TIME && console.timeEnd("generateMainRoads");
    return mainRoads;
  }

  /**
   * State-funded roads join a capital to a deliberately small set of domestic
   * hubs. Ports rank first, then the most populous burgs; this avoids treating
   * every settlement trail as a maintained highway.
   */
  private getDomesticRoadHubs(burgs: Burg[]): Burg[] {
    const capital = burgs.find(burg => burg.capital);
    if (!capital) return burgs;

    const candidates = burgs
      .filter(burg => burg !== capital)
      .sort(
        (a, b) =>
          Number(Boolean(b.port)) - Number(Boolean(a.port)) ||
          (b.population ?? 0) - (a.population ?? 0) ||
          (a.i ?? 0) - (b.i ?? 0)
      );
    const hubCount = Math.min(3, Math.max(1, Math.floor(Math.sqrt(candidates.length))));
    return [capital, ...candidates.slice(0, hubCount)];
  }

  private addConnections(segment: number[], connections: Map<string, boolean>) {
    for (let i = 0; i < segment.length; i++) {
      const cellId = segment[i];
      const nextCellId = segment[i + 1];
      if (nextCellId !== undefined) {
        connections.set(`${cellId}-${nextCellId}`, true);
        connections.set(`${nextCellId}-${cellId}`, true);
      }
    }
  }

  private generateTrails(connections: Map<string, boolean>) {
    const { pack } = this.worldContext;
    TIME && console.time("generateTrails");
    const { burgsByStateFeature } = this.sortBurgsByStateAndFeature(pack.burgs);
    const trails: Route[] = [];

    for (const { feature, stateId, burgs: featureBurgs } of burgsByStateFeature) {
      const points = featureBurgs.map(burg => [burg.x, burg.y] as Point);
      const urquhartEdges = this.calculateUrquhartEdges(points);
      urquhartEdges.forEach(([fromId, toId]) => {
        const start = featureBurgs[fromId].cell;
        const exit = featureBurgs[toId].cell;

        const segments = this.findPathSegments({
          isWater: false,
          connections,
          start,
          exit,
          stateId,
          landMode: "trails"
        });
        for (const segment of segments) {
          this.addConnections(segment, connections);
          trails.push({ feature, cells: segment } as Route);
        }
      });
    }

    TIME && console.timeEnd("generateTrails");
    return trails;
  }

  /**
   * Adds sparse cross-border trails between geometrically neighbouring burgs.
   * Unlike main roads, capitals receive no special treatment. The path may use
   * either endpoint State and unclaimed land, but cannot become a shortcut
   * across a third State.
   */
  private generateInternationalTrails(connections: Map<string, boolean>) {
    if (!this.allowsInternationalTrails()) return [];

    const { pack } = this.worldContext;
    TIME && console.time("generateInternationalTrails");
    const { burgsByFeature } = this.sortBurgsByFeature(pack.burgs);
    const internationalTrails: Route[] = [];

    for (const { feature, burgs } of burgsByFeature) {
      const points = burgs.map(burg => [burg.x, burg.y] as Point);
      for (const [fromId, toId] of this.calculateUrquhartEdges(points)) {
        const from = burgs[fromId];
        const to = burgs[toId];
        if (from.state === to.state || !from.state || !to.state) continue;

        const segments = this.findPathSegments({
          isWater: false,
          connections,
          start: from.cell,
          exit: to.cell,
          allowedStateIds: new Set([from.state, to.state]),
          landMode: "trails"
        });
        for (const segment of segments) {
          this.addConnections(segment, connections);
          internationalTrails.push({ feature, cells: segment, international: true } as Route);
        }
      }
    }

    TIME && console.timeEnd("generateInternationalTrails");
    return internationalTrails;
  }

  private generateSeaRoutes(connections: Map<string, boolean>, seaRouteGenerationMode: SeaRouteGenerationMode) {
    const { pack } = this.worldContext;
    TIME && console.time("generateSeaRoutes");
    const international = this.allowsInternationalSeaRoutes();
    const portGroups: Array<FeatureBurgGroup & Partial<Pick<StateFeatureBurgGroup, "stateId">>> = international
      ? this.sortBurgsByFeature(pack.burgs).portsByFeature
      : this.sortBurgsByStateAndFeature(pack.burgs).portsByStateFeature;
    const seaRoutes: Route[] = [];

    for (const portGroup of portGroups) {
      const { feature } = portGroup;
      // A river burg retains `port` for existing settlement / drain metadata, but it is
      // not a sea port unless it has a haven cell. Do not let its shared feature create
      // a bidirectional sea lane along the river channel.
      const featurePorts = portGroup.burgs.filter(burg => Boolean(pack.cells.haven[burg.cell]));
      if (featurePorts.length < 2) continue;
      const points = featurePorts.map(burg => [burg.x, burg.y] as Point);
      const allPortEdges =
        seaRouteGenerationMode === "augmented"
          ? this.calculateAugmentedEdges(points)
          : this.calculateUrquhartEdges(points);
      const coastalPortIndices = featurePorts.map((_, index) => index);
      const portEdges =
        seaRouteGenerationMode === "augmented"
          ? this.addCoastalBackboneEdges(points, allPortEdges, coastalPortIndices)
          : allPortEdges;

      portEdges.forEach(([fromId, toId]) => {
        const start = featurePorts[fromId].cell;
        const exit = featurePorts[toId].cell;
        const segments = this.findPathSegments({
          isWater: true,
          connections,
          start,
          exit,
          stateId: international ? undefined : portGroup.stateId,
          seaRouteGenerationMode
        });
        for (const segment of segments) {
          this.addConnections(segment, connections);
          seaRoutes.push({
            feature,
            cells: segment
          } as Route);
        }
      });
    }

    TIME && console.timeEnd("generateSeaRoutes");
    return seaRoutes;
  }

  private preparePointsArray(): Point[] {
    const { pack } = this.worldContext;
    const { cells, burgs } = pack;
    return cells.p.map(([x, y], cellId) => {
      const burgId = cells.burg[cellId];
      if (burgId) return [burgs[burgId].x, burgs[burgId].y];
      return [x, y];
    });
  }

  private getPoints(group: string, cells: number[], points: Point[]): [number, number, number][] {
    const { pack } = this.worldContext;
    const data: [number, number, number][] = cells.map(cellId => {
      const burg = pack.burgs[pack.cells.burg[cellId]];
      const position = group === "searoutes" && burg?.port ? getPortAnchorPosition(pack, burg) : points[cellId];
      return [...position, cellId] as [number, number, number];
    });

    // resolve sharp angles
    if (group !== "searoutes") {
      for (let i = 1; i < cells.length - 1; i++) {
        const cellId = cells[i];
        if (pack.cells.burg[cellId]) continue;

        const [prevX, prevY] = data[i - 1];
        const [currX, currY] = data[i];
        const [nextX, nextY] = data[i + 1];

        const dAx = prevX - currX;
        const dAy = prevY - currY;
        const dBx = nextX - currX;
        const dBy = nextY - currY;
        const angle = Math.abs((Math.atan2(dAx * dBy - dAy * dBx, dAx * dBx + dAy * dBy) * 180) / Math.PI);

        if (angle < ROUTES_SHARP_ANGLE) {
          const middleX = (prevX + nextX) / 2;
          const middleY = (prevY + nextY) / 2;
          let newX: number, newY: number;

          if (angle < ROUTES_VERY_SHARP_ANGLE) {
            newX = rn((currX + middleX * 2) / 3, 2);
            newY = rn((currY + middleY * 2) / 3, 2);
          } else {
            newX = rn((currX + middleX) / 2, 2);
            newY = rn((currY + middleY) / 2, 2);
          }

          if (findClosestCell(newX, newY, undefined, pack) === cellId) {
            // Local only — do NOT write back into the shared points[] array.
            // Mutating the shared array made later routes freeze different coords for the
            // same cell than earlier routes, so stub trails failed to meet the main path
            // at junctions (e.g. Nesia route 151 end vs 166 at cell 3652, ~5 map units apart).
            data[i] = [newX, newY, cellId];
          }
        }
      }
    }

    // Keep one control point per cell. Peak-clip avoidance is applied only when
    // rendering (getPath → densifyLandRoutePoints) so stored geometry stays smooth.
    return data; // [[x, y, cell], [x, y, cell]];
  }

  // merge routes so that the last cell of one route is the first cell of the next route
  private mergeRoutes(routes: Route[]): Route[] {
    let routesMerged = 0;

    for (let i = 0; i < routes.length; i++) {
      const thisRoute = routes[i];
      if (thisRoute.merged) continue;

      for (let j = i + 1; j < routes.length; j++) {
        const nextRoute = routes[j];
        if (nextRoute.merged) continue;

        if (nextRoute.cells!.at(0) === thisRoute.cells!.at(-1)) {
          routesMerged++;
          thisRoute.cells = thisRoute.cells!.concat(nextRoute.cells!.slice(1));
          nextRoute.merged = true;
        }
      }
    }

    return routesMerged > 1 ? this.mergeRoutes(routes) : routes;
  }
  private createRoutesData(routes: Route[], seaRouteGenerationMode: SeaRouteGenerationMode) {
    // Land and water are separate networks. A road at a river port must not
    // cause the river voyage to be treated as already materialized, or vice
    // versa. Locked routes seed only their own network.
    const landConnections = new Map<string, boolean>();
    const waterConnections = new Map<string, boolean>();
    for (const route of routes) {
      this.addConnections(
        route.points.map(point => point[2]),
        route.group === "searoutes" ? waterConnections : landConnections
      );
    }

    // Settlement-plan nodes and frontier outposts are population sites, not
    // route endpoints. Every generated network is based on actual burgs.
    const mainRoads = this.generateMainRoads(landConnections);
    const trails = this.generateTrails(landConnections);
    const internationalTrails = this.generateInternationalTrails(landConnections);
    const seaRoutes = this.generateSeaRoutes(waterConnections, seaRouteGenerationMode);
    const pointsArray = this.preparePointsArray();

    for (const { feature, cells, merged } of this.mergeRoutes(mainRoads)) {
      if (merged) continue;
      const points = this.getPoints("roads", cells!, pointsArray);
      routes.push({ i: routes.length, group: "roads", feature, points, cells: cells! });
    }

    for (const { feature, cells, merged } of this.mergeRoutes(trails)) {
      if (merged) continue;
      const points = this.getPoints("trails", cells!, pointsArray);
      routes.push({ i: routes.length, group: "trails", feature, points, cells: cells! });
    }

    for (const { feature, cells, merged } of this.mergeRoutes(internationalTrails)) {
      if (merged) continue;
      const points = this.getPoints("trails", cells!, pointsArray);
      routes.push({ i: routes.length, group: "trails", feature, points, cells: cells!, international: true });
    }

    for (const { feature, cells, merged } of this.mergeRoutes(seaRoutes)) {
      if (merged) continue;
      const points = this.getPoints("searoutes", cells!, pointsArray);
      routes.push({ i: routes.length, group: "searoutes", feature, points, cells: cells! });
    }

    return routes;
  }

  generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState,
    lockedRoutes: Route[] = [],
    seaRouteGenerationMode?: SeaRouteGenerationMode,
    landRouteGenerationMode?: LandRouteGenerationMode
  ) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack } = state;
    const resolvedSeaRouteGenerationMode =
      seaRouteGenerationMode ?? worldContext.options.seaRouteGenerationMode ?? "augmented";
    const resolvedLandRouteGenerationMode =
      landRouteGenerationMode ?? worldContext.options.landRouteGenerationMode ?? "elevationAware";
    const resolvedLandRouteElevationAversion = clampLandRouteElevationAversion(
      worldContext.options.landRouteElevationAversion
    );
    // Both land and water pathfinders need current river adjacency: water uses
    // it to sail navigable channels, while land uses it to avoid following one.
    this.sync();
    worldContext.options.seaRouteGenerationMode = resolvedSeaRouteGenerationMode;
    worldContext.options.landRouteGenerationMode = resolvedLandRouteGenerationMode;
    worldContext.options.landRouteElevationAversion = resolvedLandRouteElevationAversion;
    pack.routes = this.createRoutesData(lockedRoutes, resolvedSeaRouteGenerationMode);
    pack.cells.routes = this.buildLinks(pack.routes);
  }

  // utility functions
  isConnected(cellId: number): boolean {
    const { pack } = this.worldContext;
    const routes = pack.cells.routes;
    return routes[cellId] && Object.keys(routes[cellId]).length > 0;
  }

  getNextId() {
    const { pack } = this.worldContext;
    return pack.routes.length ? Math.max(...pack.routes.map(r => r.i)) + 1 : 0;
  }

  // connect cell with routes system by land
  connect(cellId: number): Route | undefined {
    return this.connectToNetwork(
      cellId,
      () => true,
      c =>
        c !== cellId &&
        isLand(c, this.worldContext.pack) &&
        (this.isConnected(c) || !!this.worldContext.pack.cells.burg[c])
    );
  }

  /**
   * Extends one State's movement network into unclaimed land without using a
   * foreign State as a shortcut. Frontier Expansion owns the political choice;
   * this generator only materializes the approved supply trail.
   */
  connectFrontier(cellId: number, stateId: number): Route | undefined {
    const { pack } = this.worldContext;
    return this.connectToNetwork(
      cellId,
      c => !pack.cells.state[c] || pack.cells.state[c] === stateId,
      c =>
        c !== cellId &&
        isLand(c, pack) &&
        pack.cells.state[c] === stateId &&
        (this.isConnected(c) || pack.burgs[pack.cells.burg[c]]?.state === stateId)
    );
  }

  /**
   * Joins a port over its navigable river or sea feature. Standard maps permit
   * international sea access; Frontier maps retain same-State access. This is
   * intentionally separate from `connectFrontier`: a supply trail stays on land.
   */
  connectPort(cellId: number, stateId: number): Route | undefined {
    const { pack } = this.worldContext;
    const source = pack.burgs[pack.cells.burg[cellId]];
    if (!source?.port || source.state !== stateId || !pack.cells.haven[cellId]) return;
    const international = this.allowsInternationalSeaRoutes();

    const targetCells = new Set(
      pack.burgs
        .filter(
          burg =>
            burg?.i &&
            !burg.removed &&
            burg.i !== source.i &&
            (international || burg.state === stateId) &&
            burg.port === source.port &&
            Boolean(pack.cells.haven[burg.cell])
        )
        .map(burg => burg.cell)
    );
    if (!targetCells.size) return;

    this.sync();
    const baseCost = this.createCostEvaluator({
      isWater: true,
      connections: new Map(),
      seaRouteGenerationMode: this.worldContext.options.seaRouteGenerationMode ?? "augmented"
    });
    const getCost = (from: number, to: number) =>
      !international && pack.cells.state[to] !== 0 && pack.cells.state[to] !== stateId ? Infinity : baseCost(from, to);
    const pathCells = findPath(cellId, cell => cell !== cellId && targetCells.has(cell), getCost, pack);
    if (!pathCells) return;

    const newSegments = this.getRouteSegments(pathCells, this.getGroupConnections("searoutes"));
    // A port founded directly on an existing sea lane is already connected;
    // do not add a duplicate land trail or a second copy of that lane.
    const sourceSegment = newSegments.find(segment => segment[0] === cellId);
    if (!sourceSegment) return;

    return this.appendRoute("searoutes", source.port, sourceSegment);
  }

  hasSeaRoute(cellId: number): boolean {
    const { pack } = this.worldContext;
    return Object.values(pack.cells.routes[cellId] ?? {}).some(routeId =>
      pack.routes.some(route => route.i === routeId && route.group === "searoutes")
    );
  }

  private connectToNetwork(
    cellId: number,
    canTraverse: (cellId: number) => boolean,
    isExit: (cellId: number) => boolean
  ): Route | undefined {
    const { pack } = this.worldContext;
    const baseCost = this.createCostEvaluator({
      isWater: false,
      connections: new Map(),
      landMode: "trails"
    });
    const getCost = (from: number, to: number) => (canTraverse(to) ? baseCost(from, to) : Infinity);
    const pathCells = findPath(cellId, isExit, getCost, pack);
    if (!pathCells) return;

    return this.appendRoute("trails", pack.cells.f[cellId], pathCells);
  }

  private appendRoute(group: "trails" | "searoutes", feature: number, pathCells: number[]): Route {
    const { pack } = this.worldContext;
    const pointsArray = this.preparePointsArray();
    const points = this.getPoints(group, pathCells, pointsArray);
    const routeId = this.getNextId();
    // Keep the source cells for focused SVG and WebGL rendering. Generated
    // routes used to have only points, so a focus scope omitted valid geometry.
    const newRoute = { i: routeId, group, feature, points, cells: pathCells };
    pack.routes.push(newRoute as Route);

    const addConnection = (from: number, to: number, routeId: number) => {
      const routes = pack.cells.routes;

      if (!routes[from]) routes[from] = {};
      routes[from][to] = routeId;

      if (!routes[to]) routes[to] = {};
      routes[to][from] = routeId;
    };

    for (let i = 0; i < pathCells.length; i++) {
      const currentCell = pathCells[i];
      const nextCellId = pathCells[i + 1];
      if (nextCellId !== undefined) addConnection(currentCell, nextCellId, routeId);
    }

    return newRoute as Route;
  }

  areConnected(from: number, to: number): boolean {
    const { pack } = this.worldContext;
    const routeId = pack.cells.routes[from]?.[to];
    return routeId !== undefined;
  }

  getRoute(from: number, to: number) {
    const { pack } = this.worldContext;
    const routeId = pack.cells.routes[from]?.[to];
    if (routeId === undefined) return null;

    const route = pack.routes.find(route => route.i === routeId);
    if (!route) return null;

    return route;
  }

  hasRoad(cellId: number): boolean {
    const { pack } = this.worldContext;
    const connections = pack.cells.routes[cellId];
    if (!connections) return false;

    return Object.values(connections).some(routeId => {
      const route = pack.routes.find(route => route.i === routeId);
      if (!route) return false;
      return route.group === "roads";
    });
  }

  isCrossroad(cellId: number): boolean {
    const { pack } = this.worldContext;
    const connections = pack.cells.routes[cellId];
    if (!connections) return false;
    if (Object.keys(connections).length > 3) return true;
    const roadConnections = Object.values(connections).filter(routeId => {
      const route = pack.routes.find(route => route.i === routeId);
      return route?.group === "roads";
    });
    return roadConnections.length > 2;
  }

  remove(route: Route) {
    const { pack } = this.worldContext;
    const routes = pack.cells.routes;

    for (const point of route.points) {
      const from = point[2];
      if (!routes[from]) continue;

      for (const [to, routeId] of Object.entries(routes[from])) {
        if (routeId === route.i) {
          delete routes[from][parseInt(to, 10)];
          delete routes[parseInt(to, 10)][from];
        }
      }
    }

    pack.routes = pack.routes.filter(r => r.i !== route.i);
  }

  getConnectivityRate(cellId: number): number {
    const { pack } = this.worldContext;
    const connections = pack.cells.routes[cellId];
    if (!connections) return 0;

    const connectivityRateMap: Record<string, number> = {
      roads: 0.2,
      trails: 0.1,
      searoutes: 0.2,
      default: 0.1
    };

    const connectivity = Object.values(connections).reduce((acc, routeId) => {
      const route = pack.routes.find(route => route.i === routeId);
      if (!route) return acc;
      const rate = connectivityRateMap[route.group] ?? connectivityRateMap.default;
      return acc + rate;
    }, 0.8);

    return connectivity;
  }

  generateName({ group, points }: { group: string; points: number[][] }): string {
    const { pack } = this.worldContext;
    if (points.length < 4) return "Unnamed route segment";

    function getBurgName() {
      const priority = [points.at(-1), points.at(0), points.slice(1, -1).reverse()];
      for (const [_x, _y, cellId] of priority as [number, number, number][]) {
        const burgId = pack.cells.burg[cellId as number];
        if (burgId) return getAdjective(pack.burgs[burgId].name!);
      }
      return null;
    }

    const model = rw(models[group]);
    const suffix = rw(suffixes[group]);

    const burgName = getBurgName();
    if (model === "burg_suffix" && burgName) return `${burgName} ${suffix}`;
    if (model === "prefix_suffix") return `${ra(prefixes)} ${suffix}`;
    if (model === "the_descriptor_prefix_suffix") return `The ${ra(descriptors)} ${ra(prefixes)} ${suffix}`;
    if (model === "the_descriptor_burg_suffix" && burgName) return `The ${ra(descriptors)} ${burgName} ${suffix}`;
    return "Unnamed route";
  }

  /**
   * Midpoint of the shared Voronoi edge between two adjacent cells (average of the
   * two vertices that bound the shared face). May sit off the center–center chord;
   * only insert when that chord would clip a higher third cell (see densifyLandRoutePoints).
   */
  private getSharedEdgeMidpoint(cell1: number, cell2: number, pack: PackedGraph): Point | null {
    const { cells, vertices } = pack;
    if (!cells.v?.[cell1] || !vertices?.p || !vertices?.c) return null;
    const common = cells.v[cell1].filter((vertex: number) =>
      vertices.c[vertex]?.some((cellId: number) => cellId === cell2)
    );
    if (common.length < 2) return null;
    const p0 = vertices.p[common[0]];
    const p1 = vertices.p[common[1]];
    if (!p0 || !p1) return null;
    return [rn((p0[0] + p1[0]) / 2, 2), rn((p0[1] + p1[1]) / 2, 2)];
  }

  private distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /**
   * True when the center–center chord of cellA–cellB passes near a neighbouring cell
   * that is meaningfully higher (peak clip risk, e.g. 5102→5272 near 5271).
   */
  private centerChordClipsHigherNeighbour(cellA: number, cellB: number, pack: PackedGraph): boolean {
    const { cells } = pack;
    const pa = cells.p[cellA];
    const pb = cells.p[cellB];
    if (!pa || !pb) return false;
    const hCap = Math.max(cells.h[cellA] ?? 0, cells.h[cellB] ?? 0);
    const neighbours = new Set<number>([...(cells.c[cellA] ?? []), ...(cells.c[cellB] ?? [])]);
    neighbours.delete(cellA);
    neighbours.delete(cellB);
    // How close a third cell center must be to the chord to count as a clip (map units).
    const near = Math.max(4, Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * 0.35);
    for (const n of neighbours) {
      const pn = cells.p[n];
      if (!pn || (cells.h[n] ?? 0) < 20) continue;
      // Only detour for clearly higher ground (local ridge/peak), not equal foothills.
      if ((cells.h[n] ?? 0) < hCap + 8) continue;
      if (this.distPointToSegment(pn[0], pn[1], pa[0], pa[1], pb[0], pb[1]) <= near) return true;
    }
    return false;
  }

  /**
   * Collapse center/mid/center artifacts from an earlier always-on densify (same cell id
   * twice in a row): keep the point closer to the cell generator.
   */
  private collapseRedundantCellPoints(points: number[][], pack: PackedGraph): number[][] {
    const { cells } = pack;
    const out: number[][] = [];
    for (const p of points) {
      const cellId = p[2];
      if (out.length && out[out.length - 1][2] === cellId && cellId !== undefined) {
        const center = cells.p?.[cellId];
        if (center) {
          const prev = out[out.length - 1];
          const dPrev = Math.hypot(prev[0] - center[0], prev[1] - center[1]);
          const dNew = Math.hypot(p[0] - center[0], p[1] - center[1]);
          if (dNew < dPrev) out[out.length - 1] = p;
          continue;
        }
      }
      out.push(p);
    }
    return out;
  }

  /** Canonical map position for a pack cell (burg anchor if present, else cell generator). */
  private cellAnchor(cellId: number, pack: PackedGraph): Point | null {
    const burgId = pack.cells.burg?.[cellId];
    if (burgId) {
      const burg = pack.burgs[burgId];
      if (burg && Number.isFinite(burg.x) && Number.isFinite(burg.y)) return [burg.x, burg.y];
    }
    const p = pack.cells.p?.[cellId];
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) return [p[0], p[1]];
    return null;
  }

  /**
   * Snap every control point to the cell's canonical anchor so two routes that share a
   * cell always meet. Per-route sharp-angle offsets previously left stub trails visually
   * short of the main path (Nesia 151 @ 3652 vs 166 @ 3652 ≈ 5.4 map units apart).
   */
  private snapRoutePointsToCellAnchors(points: number[][], pack: PackedGraph): number[][] {
    return points.map(p => {
      const cellId = p[2];
      if (cellId === undefined) return p;
      const anchor = this.cellAnchor(cellId, pack);
      return anchor ? [anchor[0], anchor[1], cellId] : p;
    });
  }

  /**
   * For land-route rendering only: between consecutive cells, insert a shared-edge
   * midpoint **only** when the center–center chord would clip a higher neighbour.
   * Always-on insertion caused needless zigzags (Ondrepieds route 151 through 4702/4913).
   */
  densifyLandRoutePoints(points: number[][], pack: PackedGraph = this.worldContext.pack): number[][] {
    if (points.length < 2) return points;
    if (!pack?.cells?.p) return points;
    const collapsed = this.collapseRedundantCellPoints(points, pack);
    const snapped = this.snapRoutePointsToCellAnchors(collapsed, pack);
    if (snapped.length < 2) return snapped;

    const densified: number[][] = [];
    for (let i = 0; i < snapped.length; i++) {
      densified.push(snapped[i]);
      if (i >= snapped.length - 1) continue;
      const cellA = snapped[i][2];
      const cellB = snapped[i + 1][2];
      if (cellA === undefined || cellB === undefined || cellA === cellB) continue;
      if (!this.centerChordClipsHigherNeighbour(cellA, cellB, pack)) continue;
      const mid = this.getSharedEdgeMidpoint(cellA, cellB, pack);
      if (!mid) continue;
      densified.push([mid[0], mid[1], cellA]);
    }
    return densified;
  }

  /**
   * Control points used for SVG/WebGL rendering. Land routes snap each cell to a
   * shared anchor and optionally densify peak-clipping hops; searoutes pass through.
   *
   * Renderers must pass the `pack` they were handed rather than letting this fall back to
   * the module singleton's world — the WebGL route adapter is given a `Readonly<WorldContext>`
   * and has to read cell geometry out of that one.
   */
  getRenderPoints(route: { group: string; points: number[][] }, pack?: PackedGraph): number[][] {
    if (route.group === "searoutes") return route.points;
    return this.densifyLandRoutePoints(route.points, pack ?? this.worldContext.pack);
  }

  getPath({ group, points }: { group: string; points: number[][] }, pack?: PackedGraph): string {
    const lineGen = line().curve(ROUTE_CURVES[group] ?? ROUTE_CURVES.default);
    const renderPoints = this.getRenderPoints({ group, points }, pack);
    const path = round(lineGen(renderPoints.map(p => [p[0], p[1]])) as string, 1);
    return path;
  }

  // An approximation that's a few percent too low
  getLength(routeId: number): number {
    const route = this.worldContext.pack.routes.find(r => r.i === routeId);
    if (!route?.points || route.points.length < 2) return 0;

    let length = 0;
    for (let i = 1; i < route.points.length; i++) {
      const [x1, y1] = route.points[i - 1];
      const [x2, y2] = route.points[i];
      length += Math.hypot(x2 - x1, y2 - y1);
    }
    return length;
  }
}

export const Routes = new RoutesModule();
