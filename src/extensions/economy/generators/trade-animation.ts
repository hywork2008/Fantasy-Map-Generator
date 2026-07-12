import FlatQueue from "flatqueue";
import type { Point } from "../../hostCore";
import { getWorldContext } from "../economyContext";

type DrawFn = () => Promise<void>;
type ClearFn = () => void;

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

  private WATER_COST = 1;
  private LAND_COST = 5;
  private SWITCH_COST = 20;

  findRoutePath(startCell: number, endCell: number) {
    if (startCell === endCell) return null;

    const cellRoutes = getWorldContext().pack.cells.routes;
    const startNeighbors = cellRoutes[startCell];
    if (!startNeighbors) return null;

    const isWaterRoute = new Map<number, boolean>();
    for (const route of getWorldContext().pack.routes) {
      isWaterRoute.set(route.i, route.group === "searoutes");
    }

    // State encoding: stateId = cell * 2 + (isWater ? 1 : 0)
    const maxState = getWorldContext().pack.cells.h.length * 2;
    const distArr = new Float64Array(maxState).fill(Infinity);
    const prevCellArr = new Int32Array(maxState).fill(-1);
    const prevStateArr = new Int32Array(maxState).fill(-1); // -1 = came directly from startCell

    // Prevent startCell from ever being re-enqueued.
    distArr[startCell * 2] = 0;
    distArr[startCell * 2 + 1] = 0;

    const queue = new FlatQueue<number>();
    for (const nextStr of Object.keys(startNeighbors)) {
      const next = Number(nextStr);
      const water = isWaterRoute.get(startNeighbors[next]) ?? false;
      const cost = water ? this.WATER_COST : this.LAND_COST;
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
        const water = isWaterRoute.get(neighbors[next]) ?? false;
        const isSwitch = water !== wasWater;

        const edgeCost = isSwitch ? this.SWITCH_COST : water ? this.WATER_COST : this.LAND_COST;
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

  private buildPathResult(
    terminalState: number,
    prevCellArr: Int32Array,
    prevStateArr: Int32Array
  ): { points: Point[]; segments: { type: "land" | "water"; points: Point[] }[] } {
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

    type Segment = "land" | "water";

    if (cells.length < 2) return { points: [], segments: [] };

    // Build a fast routeId→route lookup to avoid repeated linear scans.
    const routeById = new Map<number, { points: number[][] }>();
    for (const route of getWorldContext().pack.routes) routeById.set(route.i, route);

    const segments: { type: Segment; points: Point[] }[] = [];
    let currentType: Segment = waterEdges[0] ? "water" : "land";

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
      const type: Segment = waterEdges[i] ? "water" : "land";

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
    routeById: Map<number, { points: number[][] }>
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
