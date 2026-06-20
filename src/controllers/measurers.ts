import * as d3 from "d3";
import polylabel from "polylabel";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { type DragEv, type MeasurerSel, MeasurersRenderer } from "../renderers/measurers-renderer";
import { rulers, setRulers } from "../store/editorState";
import { findCell, getSegmentId, last, rn, round, si } from "../utils";
import { TIME } from "../utils/debug";
import { getAreaUnit } from "../utils/uiHelpers";

// ─── Rulers container ─────────────────────────────────────────────────────────

class Rulers {
  data: Measurer[];

  constructor() {
    this.data = [];
  }

  create<T>(Type: new (points: [number, number][]) => T, points: [number, number][]): T {
    const measurer = new Type(points);
    this.data.push(measurer as Measurer);
    return measurer;
  }

  toString(): string {
    return this.data.map(measurer => measurer.toString()).join("; ");
  }

  fromString(string: string): void {
    this.data = [];

    const typeMap: Record<string, new (points: [number, number][]) => Measurer> = {
      Ruler: Ruler,
      Opisometer: Opisometer,
      RouteOpisometer: RouteOpisometer,
      Planimeter: Planimeter
    };

    const items = string.split("; ");
    for (const rulerString of items) {
      const [type, pointsString] = rulerString.split(": ");
      if (!type || !pointsString) continue;

      const points = pointsString.split(" ").map(el => el.split(",").map(n => +n)) as [number, number][];
      this.create(typeMap[type], points);
    }
  }

  draw(): void {
    for (const measurer of this.data) measurer.draw();
  }

  undraw(): void {
    for (const measurer of this.data) measurer.undraw();
  }

  remove(id: number): void {
    if (id === undefined) return;

    const measurer = this.data.find(m => m.id === id);
    if (!measurer) return;
    measurer.undraw();
    const idx = this.data.indexOf(measurer);
    this.data.splice(idx, 1);
  }
}

// ─── Abstract measurer base ───────────────────────────────────────────────────

abstract class Measurer {
  points: [number, number][];
  id: number;
  el!: MeasurerSel;

  constructor(points: [number, number][]) {
    this.points = points;
    this.id = rulers.data.length;
  }

  toString(): string {
    return `${this.constructor.name}: ${this.points.join(" ")}`;
  }

  getSize(): number {
    return rn((1 / viewContext.scale ** 0.3) * 2, 2);
  }

  getDash(): number {
    return rn(30 / worldContext.distanceScale, 2);
  }

  drag(this: SVGGElement, startEvent: DragEv): void {
    const tr = parseTransform(this.getAttribute("transform") ?? "");
    const x = +tr[0] - startEvent.x;
    const y = +tr[1] - startEvent.y;

    startEvent.on("drag", function (this: SVGGElement, dragEvent: DragEv) {
      const transform = `translate(${x + dragEvent.x},${y + dragEvent.y})`;
      this.setAttribute("transform", transform);
    });
  }

  addPoint(dragEvent: DragEv, point: [number, number]): void {
    const MIN_DIST = dragEvent.sourceEvent.shiftKey ? 9 : 100;
    const prev = last(this.points);
    point = [point[0] | 0, point[1] | 0];
    const dist2 = (prev[0] - point[0]) ** 2 + (prev[1] - point[1]) ** 2;
    if (dist2 < MIN_DIST) return;
    this.points.push(point);
    this.updateCurve();
    this.updateLabel();
    if (this instanceof Ruler) MeasurersRenderer.drawRulerPoints(this.el, this.points, this.getCallbacks());
  }

  optimize(): void {
    const MIN_DIST2 = 900;
    const optimized: [number, number][] = [];

    for (let i = 0, p1 = this.points[0]; i < this.points.length; i++) {
      const p2 = this.points[i];
      const dist2 = !i || i === this.points.length - 1 ? Infinity : (p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2;
      if (dist2 < MIN_DIST2) continue;
      optimized.push(p2);
      p1 = p2;
    }

    this.points = optimized;
    this.updateCurve();
    this.updateLabel();
  }

  undraw(): void {
    this.el?.remove();
  }

  abstract draw(): this;
  abstract updateCurve(): void;
  abstract updateLabel(): void;
  abstract getCallbacks(): import("../renderers/measurers-renderer").MeasurerCallbacks;
}

// ─── Ruler (straight polyline measurer) ──────────────────────────────────────

class Ruler extends Measurer {
  getPointsString(): string {
    return this.points.join(" ");
  }

  updatePoint(index: number, x: number, y: number): void {
    this.points[index] = [x, y];
  }

  getPointId(x: number, y: number): number {
    return this.points.findIndex(el => el[0] === x && el[1] === y);
  }

  pushPoint(i: number): void {
    const [x, y] = this.points[i];
    i ? this.points.push([x, y]) : this.points.unshift([x, y]);
  }

  getCallbacks() {
    return {
      onDragStart: this.drag,
      onPointDragStart: (i: number, e: DragEv) => this.dragControl(this, i, e),
      onLineDragStart: (e: DragEv) => this.addControl(e, this),
      onRemoveClick: () => rulers.remove(this.id),
      onPointClick: (i: number) => this.removePoint(this, i)
    };
  }

  draw(): this {
    if (this.el) this.el.selectAll("*").remove();
    const pointsStr = this.getPointsString();
    const size = this.getSize();
    const dash = this.getDash();

    this.el = MeasurersRenderer.drawRuler(
      viewContext.ruler,
      this.id,
      pointsStr,
      this.points,
      size,
      dash,
      this.getCallbacks()
    );

    this.updateLabel();
    return this;
  }

  updateCurve(): void {
    // Ruler has no curve — line is updated via drawPoints/getPointsString
  }

  updateLabel(): void {
    const length = this.getLength();
    const text = `${rn(length * worldContext.distanceScale)} ${distanceUnitInput.value}`;
    const [x, y] = last(this.points);
    MeasurersRenderer.updateLabel(this.el, text, x, y);
  }

  getLength(): number {
    let length = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const [x1, y1] = this.points[i];
      const [x2, y2] = this.points[i + 1];
      length += Math.hypot(x1 - x2, y1 - y2);
    }
    return length;
  }

  dragControl(context: Ruler, pointId: number, startEvent: DragEv): void {
    let addPoint = (pointId === 0 || pointId === context.points.length - 1) && startEvent.sourceEvent.ctrlKey;
    let x0 = rn(startEvent.x, 1);
    let y0 = rn(startEvent.y, 1);
    let axis: "x" | "y" | null = null;

    startEvent.on("drag", (dragEvent: DragEv) => {
      if (addPoint) {
        if (dragEvent.dx < 0.1 && dragEvent.dy < 0.1) return;
        context.pushPoint(pointId);
        MeasurersRenderer.drawRulerPoints(context.el, context.points, context.getCallbacks());
        if (pointId) pointId++;
        addPoint = false;
      }

      const shiftPressed = dragEvent.sourceEvent.shiftKey;
      if (shiftPressed && !axis) axis = Math.abs(dragEvent.dx) > Math.abs(dragEvent.dy) ? "x" : "y";

      const x = axis === "y" ? x0 : rn(dragEvent.x, 1);
      const y = axis === "x" ? y0 : rn(dragEvent.y, 1);

      if (!shiftPressed) {
        axis = null;
        x0 = x;
        y0 = y;
      }

      context.updatePoint(pointId, x, y);
      MeasurersRenderer.updateRulerDrag(context.el, context.getPointsString(), pointId, x, y);
      context.updateLabel();
    });
  }

  addControl(startEvent: DragEv, context: Ruler): void {
    const x = rn(startEvent.x, 1);
    const y = rn(startEvent.y, 1);
    const pointId = getSegmentId(context.points, [x, y]);

    context.points.splice(pointId, 0, [x, y]);
    MeasurersRenderer.drawRulerPoints(context.el, context.points, context.getCallbacks());
    context.dragControl(context, pointId, startEvent);
  }

  removePoint(context: Ruler, pointId: number): void {
    this.points.splice(pointId, 1);
    context.draw();
  }
}

// ─── Opisometer (curved path measurer) ───────────────────────────────────────

class Opisometer extends Measurer {
  getCallbacks() {
    return {
      onDragStart: this.drag,
      onPointDragStart: (i: number, e: DragEv) => this.dragControl(this, i, e),
      onLineDragStart: () => {},
      onRemoveClick: () => rulers.remove(this.id),
      onPointClick: () => {}
    };
  }

  draw(): this {
    if (this.el) this.el.selectAll("*").remove();
    const size = this.getSize();
    const dash = this.getDash();

    this.el = MeasurersRenderer.drawOpisometer(viewContext.ruler, this.id, size, dash, this.getCallbacks());

    this.updateCurve();
    this.updateLabel();
    return this;
  }

  updateCurve(): void {
    lineGen.curve(d3.curveCatmullRom.alpha(0.5));
    const path = round(lineGen(this.points));
    const left = this.points[0];
    const right = last(this.points);
    MeasurersRenderer.updateOpisometerCurve(this.el, path, left, right);
  }

  updateLabel(): void {
    const length = this.el.select<SVGPathElement>("path").node()!.getTotalLength();
    const text = `${rn(length * worldContext.distanceScale)} ${distanceUnitInput.value}`;
    const [x, y] = last(this.points);
    MeasurersRenderer.updateLabel(this.el, text, x, y);
  }

  dragControl(context: Opisometer, right: number, startEvent: DragEv): void {
    const MIN_DIST = startEvent.sourceEvent.shiftKey ? 9 : 100;
    let prev = right ? last(context.points) : context.points[0];

    startEvent.on("drag", (dragEvent: DragEv) => {
      const point: [number, number] = [dragEvent.x | 0, dragEvent.y | 0];

      const dist2 = (prev[0] - point[0]) ** 2 + (prev[1] - point[1]) ** 2;
      if (dist2 < MIN_DIST) return;

      right ? context.points.push(point) : context.points.unshift(point);
      prev = point;

      context.updateCurve();
      context.updateLabel();
    });

    startEvent.on("end", (endEvent: DragEv) => {
      if (!endEvent.sourceEvent.shiftKey) context.optimize();
    });
  }
}

// ─── Route opisometer (snaps to routes) ──────────────────────────────────────

class RouteOpisometer extends Measurer {
  cellStops: number[] | null;

  constructor(points: [number, number][]) {
    super(points);
    if (worldContext.pack.cells) {
      this.cellStops = points.map(p => findCell(p[0], p[1]));
    } else {
      this.cellStops = null;
    }
  }

  checkCellStops(): void {
    if (!this.cellStops) {
      this.cellStops = this.points.map(p => findCell(p[0], p[1]));
    }
  }

  trackCell(cell: number, right: boolean | number): void {
    this.checkCellStops();
    const cellStops = this.cellStops!;
    const foundIndex = cellStops.indexOf(cell);
    if (right) {
      if (last(cellStops) === cell) {
        return;
      } else if (cellStops.length > 1 && foundIndex !== -1) {
        cellStops.splice(foundIndex + 1);
        this.points.splice(foundIndex + 1);
      } else {
        cellStops.push(cell);
        this.points.push(this.getCellRouteCoord(cell));
      }
    } else {
      if (cellStops[0] === cell) {
        return;
      } else if (cellStops.length > 1 && foundIndex !== -1) {
        cellStops.splice(0, foundIndex);
        this.points.splice(0, foundIndex);
      } else {
        cellStops.unshift(cell);
        this.points.unshift(this.getCellRouteCoord(cell));
      }
    }
    this.updateCurve();
    this.updateLabel();
  }

  getCellRouteCoord(c: number): [number, number] {
    const cells = worldContext.pack.cells;
    const burgs = worldContext.pack.burgs;
    const b = cells.burg[c];
    const x = b ? burgs[b].x : cells.p[c][0];
    const y = b ? burgs[b].y : cells.p[c][1];
    return [x, y];
  }

  getCallbacks() {
    return {
      onDragStart: this.drag,
      onPointDragStart: (i: number, e: DragEv) => this.dragControl(this, i, e),
      onLineDragStart: () => {},
      onRemoveClick: () => rulers.remove(this.id),
      onPointClick: () => {}
    };
  }

  draw(): this {
    if (this.el) this.el.selectAll("*").remove();
    const size = this.getSize();
    const dash = this.getDash();

    this.el = MeasurersRenderer.drawOpisometer(viewContext.ruler, this.id, size, dash, this.getCallbacks());

    this.updateCurve();
    this.updateLabel();
    return this;
  }

  updateCurve(): void {
    lineGen.curve(d3.curveCatmullRom.alpha(0.5));
    const path = round(lineGen(this.points));
    const left = this.points[0];
    const right = last(this.points);
    MeasurersRenderer.updateOpisometerCurve(this.el, path, left, right);
  }

  updateLabel(): void {
    const length = this.el.select<SVGPathElement>("path").node()!.getTotalLength();
    const text = `${rn(length * worldContext.distanceScale)} ${distanceUnitInput.value}`;
    const [x, y] = last(this.points);
    MeasurersRenderer.updateLabel(this.el, text, x, y);
  }

  dragControl(context: RouteOpisometer, right: boolean | number, startEvent: DragEv): void {
    startEvent.on("drag", (dragEvent: DragEv) => {
      const mousePoint: [number, number] = [dragEvent.x | 0, dragEvent.y | 0];

      const c = findCell(mousePoint[0], mousePoint[1]);
      if (!Routes.isConnected(c) && !dragEvent.sourceEvent.shiftKey) return;

      context.trackCell(c, right);
    });
  }
}

// ─── Planimeter (area measurer) ───────────────────────────────────────────────

class Planimeter extends Measurer {
  getCallbacks() {
    return {
      onDragStart: this.drag,
      onPointDragStart: () => {},
      onLineDragStart: () => {},
      onRemoveClick: () => rulers.remove(this.id),
      onPointClick: () => {}
    };
  }

  draw(): this {
    if (this.el) this.el.selectAll("*").remove();
    const size = this.getSize();

    this.el = MeasurersRenderer.drawPlanimeter(viewContext.ruler, this.id, size, this.getCallbacks());

    this.updateCurve();
    this.updateLabel();
    return this;
  }

  updateCurve(): void {
    lineGen.curve(d3.curveCatmullRomClosed.alpha(0.5));
    const path = round(lineGen(this.points));
    MeasurersRenderer.updatePlanimeterCurve(this.el, path);
  }

  updateLabel(): void {
    if (this.points.length < 3) return;

    const polygonArea = rn(Math.abs(d3.polygonArea(this.points)));
    const area = `${si(getArea(polygonArea))} ${getAreaUnit()}`;
    const [cx, cy] = polylabel([this.points], 1.0);
    MeasurersRenderer.updateLabel(this.el, area, cx, cy);
  }
}

// ─── Factory function ─────────────────────────────────────────────────────────

export function createDefaultRuler(): void {
  TIME && console.time("createDefaultRuler");
  const { features, vertices } = worldContext.pack;

  const areas = features.map(f => (f.land ? f.area || 0 : -Infinity));
  const largestLand = areas.indexOf(Math.max(...areas));
  const featureVertices = features[largestLand].vertices;

  const MIN_X = 100;
  const MAX_X = worldContext.graphWidth - 100;
  const MIN_Y = 100;
  const MAX_Y = worldContext.graphHeight - 100;

  let leftmostVertex: [number, number] = [worldContext.graphWidth - MIN_X, worldContext.graphHeight / 2];
  let rightmostVertex: [number, number] = [MIN_X, worldContext.graphHeight / 2];

  for (const vertex of featureVertices) {
    const [x, y] = vertices.p[vertex] as [number, number];
    if (y < MIN_Y || y > MAX_Y) continue;
    if (x < leftmostVertex[0] && x >= MIN_X) leftmostVertex = [x, y];
    if (x > rightmostVertex[0] && x <= MAX_X) rightmostVertex = [x, y];
  }

  setRulers(new Rulers());
  rulers.create(Ruler, [leftmostVertex, rightmostVertex]);

  TIME && console.timeEnd("createDefaultRuler");
}

export type { Opisometer, Planimeter, RouteOpisometer, Ruler };
export { Rulers };

// ─── Legacy globals (from non-migrated JS files) ──────────────────────────────

declare const lineGen: { (points: [number, number][]): string; curve: (curve: unknown) => typeof lineGen };
declare const parseTransform: (transform: string) => number[];
declare const getArea: (area: number) => number;
declare const Routes: { isConnected: (cell: number) => boolean };
