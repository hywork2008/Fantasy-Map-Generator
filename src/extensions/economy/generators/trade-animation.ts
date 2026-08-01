import FlatQueue from "flatqueue";
import { calculateLandTravelDays } from "../../../services/routeGrade";
import { normalizeHeightExponent } from "../../../utils/height";
import { buildRiverNavigationGraph, type Point, useOptionsState } from "../../hostCore";
import { getWorldContext } from "../economyContext";
import { CaravanMovement, getDraftAnimalType } from "./caravanMovement";
import type { TradeRoutePoint } from "./marketTypes";
import { PORT_TRANSFER_PENALTY_DAYS } from "./tradeRouteDuration";

type DrawFn = () => Promise<void>;
type ClearFn = () => void;
type RouteSegmentType = "land" | "sea" | "river";
type RoutePath = { points: Point[]; segments: { type: RouteSegmentType; points: TradeRoutePoint[] }[] };
type RouteGeometry = { points: number[][] };

export type TradeAnimationOptions = {
  displayType: string;
  concurrent: number;
  duration: number;
  landDurationModifier: number;
  segmentChangePause: number;
  markerSize: number;
};

const DEFAULT_OPTIONS: TradeAnimationOptions = {
  displayType: "both",
  concurrent: 30,
  duration: 250,
  landDurationModifier: 5,
  segmentChangePause: 1000,
  markerSize: 4
};

export class TradeAnimationModule {
  private options: TradeAnimationOptions = { ...DEFAULT_OPTIONS };
  private drawFn: DrawFn | null = null;
  private clearFn: ClearFn | null = null;
  private isLayerOnFn: (() => boolean) | null = null;

  // findRoutePath() runs a full Dijkstra search over the cell graph (state arrays sized
  // 3x cell count) — expensive on real maps, and callers (Shipbuilding's daily procurement
  // demand, Caravans, market trade-opportunity scans) repeatedly ask for the same
  // (startCell, endCell) pairs every simulated day. The route network only changes on map
  // (re)generation or a caravan-speed / grade setting change, so cache results between those
  // points instead of re-running the search for every call. See clearRouteCache().
  private routePathCache = new Map<string, RoutePath | null>();
  private routeLookupCache: { isSeaRoute: Map<number, boolean>; routeById: Map<number, RouteGeometry> } | null = null;

  bind(deps: { draw: DrawFn; clear: ClearFn; isLayerOn: () => boolean }): void {
    this.drawFn = deps.draw;
    this.clearFn = deps.clear;
    this.isLayerOnFn = deps.isLayerOn;
  }

  constructor() {
    try {
      const stored = localStorage.getItem("trade-animation");
      if (stored) {
        this.options = { ...DEFAULT_OPTIONS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn("Failed to load trade-animation options from localStorage", e);
    }
  }

  start(): void {
    if (!this.isLayerOnFn?.()) return;
    this.drawFn?.();
  }

  stop(): void {
    this.clearFn?.();
  }

  restart(): void {
    this.stop();
    this.start();
  }

  sync(): void {
    if (this.isLayerOnFn?.()) this.start();
    else this.stop();
  }

  configure(opts: Partial<TradeAnimationOptions>): void {
    this.options = { ...this.options, ...opts };
    this.sync();
  }

  getOptions(): Readonly<TradeAnimationOptions> {
    return this.options;
  }

  findRoutePath(startCell: number, endCell: number): RoutePath | null {
    if (startCell === endCell) return null;

    const movement = CaravanMovement.getOptions();
    const cacheKey = [
      startCell,
      endCell,
      movement.landKmPerDay,
      movement.seaKmPerDay,
      movement.riverKmPerDay,
      movement.gradeEffectStrength,
      movement.merchantRoutePreference
    ].join(":");
    const cached = this.routePathCache.get(cacheKey);
    if (cached !== undefined) return cached;

    // A sea-only connection is intentionally chosen even when a mixed route is shorter. Ports
    // should use their established sea lane instead of needlessly unloading cargo inland.
    const result =
      this.findRoutePathWithAllowedEdges(startCell, endCell, true) ??
      this.findRoutePathWithAllowedEdges(startCell, endCell, false);
    this.routePathCache.set(cacheKey, result);
    return result;
  }

  /**
   * Clears cached pathfinding results. Call whenever the route network or the caravan
   * land/sea/river speed or grade preference changes — either can change which path is shortest.
   */
  clearRouteCache(): void {
    this.routePathCache.clear();
    this.routeLookupCache = null;
  }

  private getRouteLookup(): { isSeaRoute: Map<number, boolean>; routeById: Map<number, RouteGeometry> } {
    if (this.routeLookupCache) return this.routeLookupCache;
    const isSeaRoute = new Map<number, boolean>();
    const routeById = new Map<number, RouteGeometry>();
    for (const route of getWorldContext().pack.routes) {
      isSeaRoute.set(route.i, route.group === "searoutes");
      routeById.set(route.i, route);
    }
    this.routeLookupCache = { isSeaRoute, routeById };
    return this.routeLookupCache;
  }

  private findRoutePathWithAllowedEdges(startCell: number, endCell: number, seaOnly: boolean): RoutePath | null {
    const world = getWorldContext();
    const { cells } = world.pack;
    const cellRoutes = cells.routes ?? {};
    const { isSeaRoute, routeById } = this.getRouteLookup();
    const riverGraph = buildRiverNavigationGraph(world.pack);

    // State encoding: stateId = cell * 3 + mode index. Retaining the prior mode makes the
    // port transfer penalty apply correctly to land/sea/river changes.
    const maxState = cells.h.length * 3;
    const distArr = new Float64Array(maxState).fill(Infinity);
    const prevCellArr = new Int32Array(maxState).fill(-1);
    const prevStateArr = new Int32Array(maxState).fill(-1); // -1 = came directly from startCell

    // Prevent startCell from ever being re-enqueued.
    for (let modeIndex = 0; modeIndex < 3; modeIndex++) distArr[startCell * 3 + modeIndex] = 0;

    const queue = new FlatQueue<number>();
    for (const edge of this.getOutgoingEdges(startCell, cellRoutes, isSeaRoute, riverGraph)) {
      if (seaOnly && edge.type !== "sea") continue;
      const cost = this.getEdgeTravelDays(startCell, edge.toCell, edge.routeId, edge.type, undefined, routeById);
      const state = edge.toCell * 3 + this.getModeIndex(edge.type);
      if (cost < distArr[state]) {
        distArr[state] = cost;
        prevCellArr[state] = startCell;
        queue.push(state, cost);
      }
    }

    while (queue.length) {
      const cost: number = queue.peekValue()!;
      const stateId: number = queue.pop()!;
      if (cost > distArr[stateId]) continue;

      const cell = Math.floor(stateId / 3);
      const previousType = this.getModeType(stateId % 3);

      if (cell === endCell) return this.buildPathResult(stateId, prevCellArr, prevStateArr);

      for (const edge of this.getOutgoingEdges(cell, cellRoutes, isSeaRoute, riverGraph)) {
        if (seaOnly && edge.type !== "sea") continue;
        const edgeCost = this.getEdgeTravelDays(cell, edge.toCell, edge.routeId, edge.type, previousType, routeById);
        const newCost = cost + edgeCost;
        const nextState = edge.toCell * 3 + this.getModeIndex(edge.type);

        if (newCost < distArr[nextState]) {
          distArr[nextState] = newCost;
          prevCellArr[nextState] = cell;
          prevStateArr[nextState] = stateId;
          queue.push(nextState, newCost);
        }
      }
    }

    return null;
  }

  private getOutgoingEdges(
    cell: number,
    cellRoutes: Record<number, Record<number, number>>,
    isSeaRoute: Map<number, boolean>,
    riverGraph: ReturnType<typeof buildRiverNavigationGraph>
  ): { toCell: number; routeId?: number; type: RouteSegmentType }[] {
    const edges: { toCell: number; routeId?: number; type: RouteSegmentType }[] = [];
    for (const [toCell, routeId] of Object.entries(cellRoutes[cell] ?? {})) {
      edges.push({ toCell: Number(toCell), routeId, type: isSeaRoute.get(routeId) ? "sea" : "land" });
    }
    for (const edge of riverGraph.getOutgoing(cell)) edges.push({ toCell: edge.toCellId, type: "river" });
    return edges;
  }

  private getModeIndex(type: RouteSegmentType): number {
    return type === "land" ? 0 : type === "sea" ? 1 : 2;
  }

  private getModeType(index: number): RouteSegmentType {
    return index === 0 ? "land" : index === 1 ? "sea" : "river";
  }

  /**
   * Dijkstra costs are journey days, matching the duration model used for deal eligibility.
   * Route geometry is used where available so winding roads and sea lanes retain their real
   * relative cost; a straight cell-to-cell edge is a safe fallback for incomplete route data.
   * Land edges apply grade multipliers (and optional avoidHardPass pathfinding penalty).
   */
  private getEdgeTravelDays(
    fromCell: number,
    toCell: number,
    routeId: number | undefined,
    type: RouteSegmentType,
    previousType: RouteSegmentType | undefined,
    routeById: Map<number, RouteGeometry>
  ): number {
    const world = getWorldContext();
    const movement = CaravanMovement.getOptions();
    const points = this.extractEdgePoints(fromCell, toCell, routeId, routeById);
    const transferDays = previousType !== undefined && previousType !== type ? PORT_TRANSFER_PENALTY_DAYS : 0;

    if (type === "sea" || type === "river") {
      const speed = type === "river" ? movement.riverKmPerDay : movement.seaKmPerDay;
      if (speed <= 0) return Infinity;
      let distanceMapUnits = 0;
      for (let index = 0; index < points.length - 1; index++) {
        distanceMapUnits += Math.hypot(
          points[index + 1][0] - points[index][0],
          points[index + 1][1] - points[index][1]
        );
      }
      return (distanceMapUnits * world.distanceScale) / speed + transferDays;
    }

    if (movement.landKmPerDay <= 0) return Infinity;
    const animal = getDraftAnimalType(undefined);
    const heightExponent = normalizeHeightExponent(useOptionsState.getState().heightExponent);
    const days = calculateLandTravelDays(points, {
      distanceScale: world.distanceScale,
      heightExponent,
      heights: world.pack.cells.h,
      landKmPerDay: movement.landKmPerDay,
      draftSpeedMultiplier: animal.speedMultiplier,
      gradeEffectStrength: movement.gradeEffectStrength,
      sensitivity: animal.gradeSensitivity,
      routePreference: movement.merchantRoutePreference
    });
    if (!Number.isFinite(days)) return Infinity;
    return days + transferDays;
  }

  private buildPathResult(terminalState: number, prevCellArr: Int32Array, prevStateArr: Int32Array): RoutePath {
    const cells: number[] = [Math.floor(terminalState / 3)]; // endCell
    const edgeTypes: RouteSegmentType[] = [];
    let state = terminalState;
    while (prevStateArr[state] !== -1) {
      edgeTypes.push(this.getModeType(state % 3));
      cells.push(prevCellArr[state]);
      state = prevStateArr[state];
    }
    edgeTypes.push(this.getModeType(state % 3)); // first hop from startCell
    cells.push(prevCellArr[state]); // startCell
    cells.reverse();
    edgeTypes.reverse();

    if (cells.length < 2) return { points: [], segments: [] };

    const { routeById } = this.getRouteLookup();

    const segments: { type: RouteSegmentType; points: TradeRoutePoint[] }[] = [];
    let currentType: RouteSegmentType = edgeTypes[0];

    const firstEdge = this.extractEdgePoints(
      cells[0],
      cells[1],
      getWorldContext().pack.cells.routes[cells[0]]?.[cells[1]],
      routeById
    );
    let currentPoints: TradeRoutePoint[] = firstEdge.map(p => [p[0], p[1], p[2]] as TradeRoutePoint);

    for (let i = 1; i < cells.length - 1; i++) {
      const fromCell = cells[i];
      const toCell = cells[i + 1];
      const type: RouteSegmentType = edgeTypes[i];

      if (type !== currentType) {
        segments.push({ type: currentType, points: currentPoints });
        currentPoints = [currentPoints[currentPoints.length - 1]];
        currentType = type;
      }

      const edgePoints = this.extractEdgePoints(
        fromCell,
        toCell,
        getWorldContext().pack.cells.routes[fromCell]?.[toCell],
        routeById
      );

      let k = 0;
      while (k < edgePoints.length && edgePoints[k][2] === fromCell) k++;
      if (k === 0) k = 1;
      else if (k >= edgePoints.length) k = edgePoints.length - 1;
      for (; k < edgePoints.length; k++) {
        currentPoints.push([edgePoints[k][0], edgePoints[k][1], edgePoints[k][2]]);
      }
    }
    segments.push({ type: currentType, points: currentPoints });

    const firstSeg = segments[0].points;
    const lastSeg = segments[segments.length - 1].points;
    const startPt = this.getCellPoint(cells[0]);
    const endPt = this.getCellPoint(cells[cells.length - 1]);
    firstSeg[0] = [startPt[0], startPt[1], cells[0]];
    lastSeg[lastSeg.length - 1] = [endPt[0], endPt[1], cells[cells.length - 1]];

    const points: Point[] = [];
    for (let si = 0; si < segments.length; si++) {
      for (let pk = 0; pk < segments[si].points.length; pk++) {
        if (pk === 0 && si > 0) continue;
        const p = segments[si].points[pk];
        points.push([p[0], p[1]]);
      }
    }

    return { points, segments };
  }

  private extractEdgePoints(
    fromCell: number,
    toCell: number,
    routeId: number | undefined,
    routeById: Map<number, RouteGeometry>
  ): [number, number, number][] {
    const fallback = (): [number, number, number][] => [
      [...this.getCellPoint(fromCell), fromCell] as [number, number, number],
      [...this.getCellPoint(toCell), toCell] as [number, number, number]
    ];

    if (routeId === undefined) return fallback();
    const route = routeById.get(routeId);
    if (!route) return fallback();

    const pts = route.points;
    if (!pts) return fallback();

    for (let i = 0; i < pts.length - 1; i++) {
      const cellA = pts[i][2];
      const cellB = pts[i + 1][2];

      if (cellA === fromCell && cellB === toCell) {
        let start = i;
        while (start > 0 && pts[start - 1][2] === fromCell) start--;
        let end = i + 1;
        while (end + 1 < pts.length && pts[end + 1][2] === toCell) end++;
        return pts.slice(start, end + 1).map(p => [p[0], p[1], p[2]] as [number, number, number]);
      }

      if (cellA === toCell && cellB === fromCell) {
        let start = i;
        while (start > 0 && pts[start - 1][2] === toCell) start--;
        let end = i + 1;
        while (end + 1 < pts.length && pts[end + 1][2] === fromCell) end++;
        return pts
          .slice(start, end + 1)
          .reverse()
          .map(p => [p[0], p[1], p[2]] as [number, number, number]);
      }
    }

    return fallback();
  }

  private getCellPoint(cellId: number): Point {
    const burgId = getWorldContext().pack.cells.burg[cellId];
    const burg = burgId ? getWorldContext().pack.burgs[burgId] : null;
    return burg ? [burg.x, burg.y] : getWorldContext().pack.cells.p[cellId];
  }

  getDefaultOptions() {
    return DEFAULT_OPTIONS;
  }
}

export const TradeAnimation = new TradeAnimationModule();
