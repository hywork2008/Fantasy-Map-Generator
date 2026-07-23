import FlatQueue from "flatqueue";
import type { Point } from "../../hostCore";
import { getWorldContext } from "../economyContext";
import { CaravanMovement } from "./caravanMovement";
import { PORT_TRANSFER_PENALTY_DAYS } from "./tradeRouteDuration";

type DrawFn = () => Promise<void>;
type ClearFn = () => void;
type RouteSegmentType = "land" | "water";
type RoutePath = { points: Point[]; segments: { type: RouteSegmentType; points: Point[] }[] };
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
  // 2x cell count) — expensive on real maps, and callers (Shipbuilding's daily procurement
  // demand, Caravans, market trade-opportunity scans) repeatedly ask for the same
  // (startCell, endCell) pairs every simulated day. The route network only changes on map
  // (re)generation or a caravan-speed setting change, so cache results between those points
  // instead of re-running the search for every call. See clearRouteCache().
  private routePathCache = new Map<string, RoutePath | null>();
  private routeLookupCache: { isWaterRoute: Map<number, boolean>; routeById: Map<number, RouteGeometry> } | null = null;

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

    const cacheKey = `${startCell}:${endCell}`;
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
   * land/sea speed ratio changes — either can change which path is shortest.
   */
  clearRouteCache(): void {
    this.routePathCache.clear();
    this.routeLookupCache = null;
  }

  private getRouteLookup(): { isWaterRoute: Map<number, boolean>; routeById: Map<number, RouteGeometry> } {
    if (this.routeLookupCache) return this.routeLookupCache;
    const isWaterRoute = new Map<number, boolean>();
    const routeById = new Map<number, RouteGeometry>();
    for (const route of getWorldContext().pack.routes) {
      isWaterRoute.set(route.i, route.group === "searoutes");
      routeById.set(route.i, route);
    }
    this.routeLookupCache = { isWaterRoute, routeById };
    return this.routeLookupCache;
  }

  private findRoutePathWithAllowedEdges(startCell: number, endCell: number, waterOnly: boolean): RoutePath | null {
    const world = getWorldContext();
    const { cells } = world.pack;
    const cellRoutes = cells.routes;
    const startNeighbors = cellRoutes[startCell];
    if (!startNeighbors) return null;

    const { isWaterRoute, routeById } = this.getRouteLookup();

    // State encoding: stateId = cell * 2 + (isWater ? 1 : 0)
    const maxState = cells.h.length * 2;
    const distArr = new Float64Array(maxState).fill(Infinity);
    const prevCellArr = new Int32Array(maxState).fill(-1);
    const prevStateArr = new Int32Array(maxState).fill(-1); // -1 = came directly from startCell

    // Prevent startCell from ever being re-enqueued.
    distArr[startCell * 2] = 0;
    distArr[startCell * 2 + 1] = 0;

    const queue = new FlatQueue<number>();
    for (const nextStr of Object.keys(startNeighbors)) {
      const next = Number(nextStr);
      const routeId = startNeighbors[next];
      const water = isWaterRoute.get(routeId) ?? false;
      if (waterOnly && !water) continue;

      const cost = this.getEdgeTravelDays(startCell, next, routeId, water, undefined, routeById);
      const state = next * 2 + (water ? 1 : 0);
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

      const cell = stateId >> 1;
      const wasWater = (stateId & 1) === 1;

      if (cell === endCell) return this.buildPathResult(stateId, prevCellArr, prevStateArr);

      const neighbors = cellRoutes[cell];
      if (!neighbors) continue;

      for (const nextStr of Object.keys(neighbors)) {
        const next = Number(nextStr);
        const routeId = neighbors[next];
        const water = isWaterRoute.get(routeId) ?? false;
        if (waterOnly && !water) continue;

        const edgeCost = this.getEdgeTravelDays(cell, next, routeId, water, wasWater, routeById);
        const newCost = cost + edgeCost;
        const nextState = next * 2 + (water ? 1 : 0);

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

  /**
   * Dijkstra costs are journey days, matching the duration model used for deal eligibility.
   * Route geometry is used where available so winding roads and sea lanes retain their real
   * relative cost; a straight cell-to-cell edge is a safe fallback for incomplete route data.
   */
  private getEdgeTravelDays(
    fromCell: number,
    toCell: number,
    routeId: number | undefined,
    water: boolean,
    previousWasWater: boolean | undefined,
    routeById: Map<number, RouteGeometry>
  ): number {
    const world = getWorldContext();
    const movement = CaravanMovement.getOptions();
    const speed = water ? movement.seaKmPerDay : movement.landKmPerDay;
    if (speed <= 0) return Infinity;

    const points = this.extractEdgePoints(fromCell, toCell, routeId, routeById);
    let distanceMapUnits = 0;
    for (let index = 0; index < points.length - 1; index++) {
      distanceMapUnits += Math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1]);
    }

    const transferDays = previousWasWater !== undefined && previousWasWater !== water ? PORT_TRANSFER_PENALTY_DAYS : 0;
    return (distanceMapUnits * world.distanceScale) / speed + transferDays;
  }

  private buildPathResult(terminalState: number, prevCellArr: Int32Array, prevStateArr: Int32Array): RoutePath {
    const cells: number[] = [terminalState >> 1]; // endCell
    const waterEdges: boolean[] = [];
    let state = terminalState;
    while (prevStateArr[state] !== -1) {
      waterEdges.push((state & 1) === 1);
      cells.push(prevCellArr[state]);
      state = prevStateArr[state];
    }
    waterEdges.push((state & 1) === 1); // first hop from startCell
    cells.push(prevCellArr[state]); // startCell
    cells.reverse();
    waterEdges.reverse();

    if (cells.length < 2) return { points: [], segments: [] };

    const { routeById } = this.getRouteLookup();

    const segments: { type: RouteSegmentType; points: Point[] }[] = [];
    let currentType: RouteSegmentType = waterEdges[0] ? "water" : "land";

    const firstEdge = this.extractEdgePoints(
      cells[0],
      cells[1],
      getWorldContext().pack.cells.routes[cells[0]]?.[cells[1]],
      routeById
    );
    let currentPoints: Point[] = firstEdge.map(p => [p[0], p[1]] as Point);

    for (let i = 1; i < cells.length - 1; i++) {
      const fromCell = cells[i];
      const toCell = cells[i + 1];
      const type: RouteSegmentType = waterEdges[i] ? "water" : "land";

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
      for (; k < edgePoints.length; k++) currentPoints.push([edgePoints[k][0], edgePoints[k][1]]);
    }
    segments.push({ type: currentType, points: currentPoints });

    const firstSeg = segments[0].points;
    const lastSeg = segments[segments.length - 1].points;
    firstSeg[0] = this.getCellPoint(cells[0]);
    lastSeg[lastSeg.length - 1] = this.getCellPoint(cells[cells.length - 1]);

    const points: Point[] = [];
    for (let si = 0; si < segments.length; si++) {
      for (let pk = 0; pk < segments[si].points.length; pk++) {
        if (pk === 0 && si > 0) continue;
        points.push(segments[si].points[pk]);
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
