import { getSegmentId, last, rn, round, si } from "../utils";

// ─── Rulers container ─────────────────────────────────────────────────────────

class Rulers {
  data: Measurer[];

  constructor() {
    this.data = [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create<T>(Type: new (points: [number, number][]) => T, points: [number, number][]): T {
    const measurer = new Type(points);
    this.data.push(measurer as unknown as Measurer);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: any;

  constructor(points: [number, number][]) {
    this.points = points;
    this.id = rulers.data.length;
  }

  toString(): string {
    return `${this.constructor.name}: ${this.points.join(" ")}`;
  }

  getSize(): number {
    return rn((1 / scale ** 0.3) * 2, 2);
  }

  getDash(): number {
    return rn(30 / distanceScale, 2);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drag(this: Element): void {
    const tr = parseTransform(this.getAttribute("transform") ?? "");
    const x = +tr[0] - (d3 as any).event.x;
    const y = +tr[1] - (d3 as any).event.y;

    (d3 as any).event.on("drag", function (this: Element) {
      const transform = `translate(${x + (d3 as any).event.x},${y + (d3 as any).event.y})`;
      this.setAttribute("transform", transform);
    });
  }

  addPoint(point: [number, number]): void {
    const MIN_DIST = (d3 as any).event.sourceEvent.shiftKey ? 9 : 100;
    const prev = last(this.points);
    point = [point[0] | 0, point[1] | 0];
    const dist2 = (prev[0] - point[0]) ** 2 + (prev[1] - point[1]) ** 2;
    if (dist2 < MIN_DIST) return;
    this.points.push(point);
    this.updateCurve();
    this.updateLabel();
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

  draw(): this {
    if (this.el) this.el.selectAll("*").remove();
    const points = this.getPointsString();
    const size = this.getSize();
    const dash = this.getDash();

    this.el = ruler
      .append("g")
      .attr("class", "ruler")
      .call((d3 as any).drag().on("start", this.drag))
      .attr("font-size", 10 * size);
    const el = this.el;
    el.append("polyline")
      .attr("points", points)
      .attr("class", "white")
      .attr("stroke-width", size)
      .call((d3 as any).drag().on("start", () => this.addControl(this)));
    el.append("polyline")
      .attr("points", points)
      .attr("class", "gray")
      .attr("stroke-width", rn(size * 1.2, 2))
      .attr("stroke-dasharray", dash);
    el.append("g")
      .attr("class", "rulerPoints")
      .attr("stroke-width", 0.5 * size)
      .attr("font-size", 2 * size);
    el.append("text")
      .attr("dx", ".35em")
      .attr("dy", "-.45em")
      .on("click", () => rulers.remove(this.id));
    this.drawPoints(el);
    this.updateLabel();
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawPoints(el: any): void {
    const g = el.select(".rulerPoints");
    g.selectAll("circle").remove();

    for (let i = 0; i < this.points.length; i++) {
      const [x, y] = this.points[i];
      this.drawPoint(g, x, y, i);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawPoint(el: any, x: number, y: number, i: number): void {
    el.append("circle")
      .attr("r", "1em")
      .attr("cx", x)
      .attr("cy", y)
      .attr("class", this.isEdge(i) ? "edge" : "control")
      .on("click", () => {
        this.removePoint(this, i);
      })
      .call(
        (d3 as any)
          .drag()
          .clickDistance(3)
          .on("start", () => {
            this.dragControl(this, i);
          })
      );
  }

  isEdge(i: number): boolean {
    return i === 0 || i === this.points.length - 1;
  }

  updateCurve(): void {
    // Ruler has no curve — line is updated via drawPoints/getPointsString
  }

  updateLabel(): void {
    const length = this.getLength();
    const text = `${rn(length * distanceScale)} ${distanceUnitInput.value}`;
    const [x, y] = last(this.points);
    this.el.select("text").attr("x", x).attr("y", y).text(text);
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

  dragControl(context: Ruler, pointId: number): void {
    let addPoint = context.isEdge(pointId) && (d3 as any).event.sourceEvent.ctrlKey;
    let circle = context.el.select(`circle:nth-child(${pointId + 1})`);
    const line = context.el.selectAll("polyline");

    let x0 = rn((d3 as any).event.x, 1);
    let y0 = rn((d3 as any).event.y, 1);
    let axis: "x" | "y" | null = null;

    (d3 as any).event.on("drag", () => {
      if (addPoint) {
        if ((d3 as any).event.dx < 0.1 && (d3 as any).event.dy < 0.1) return;
        context.pushPoint(pointId);
        context.drawPoints(context.el);
        if (pointId) pointId++;
        circle = context.el.select(`circle:nth-child(${pointId + 1})`);
        addPoint = false;
      }

      const shiftPressed = (d3 as any).event.sourceEvent.shiftKey;
      if (shiftPressed && !axis) axis = Math.abs((d3 as any).event.dx) > Math.abs((d3 as any).event.dy) ? "x" : "y";

      const x = axis === "y" ? x0 : rn((d3 as any).event.x, 1);
      const y = axis === "x" ? y0 : rn((d3 as any).event.y, 1);

      if (!shiftPressed) {
        axis = null;
        x0 = x;
        y0 = y;
      }

      context.updatePoint(pointId, x, y);
      line.attr("points", context.getPointsString());
      circle.attr("cx", x).attr("cy", y);
      context.updateLabel();
    });
  }

  addControl(context: Ruler): void {
    const x = rn((d3 as any).event.x, 1);
    const y = rn((d3 as any).event.y, 1);
    const pointId = getSegmentId(context.points, [x, y]);

    context.points.splice(pointId, 0, [x, y]);
    context.drawPoints(context.el);
    context.dragControl(context, pointId);
  }

  removePoint(context: Ruler, pointId: number): void {
    if (this.points.length < 3) return;
    this.points.splice(pointId, 1);
    context.draw();
  }
}

// ─── Opisometer (curved path measurer) ───────────────────────────────────────

class Opisometer extends Measurer {
  draw(): this {
    if (this.el) this.el.selectAll("*").remove();
    const size = this.getSize();
    const dash = this.getDash();

    this.el = ruler
      .append("g")
      .attr("class", "opisometer")
      .call((d3 as any).drag().on("start", this.drag))
      .attr("font-size", 10 * size);
    const el = this.el;
    el.append("path").attr("class", "white").attr("stroke-width", size);
    el.append("path").attr("class", "gray").attr("stroke-width", size).attr("stroke-dasharray", dash);
    const rulerPoints = el
      .append("g")
      .attr("class", "rulerPoints")
      .attr("stroke-width", 0.5 * size)
      .attr("font-size", 2 * size);
    rulerPoints
      .append("circle")
      .attr("r", "1em")
      .call(
        (d3 as any).drag().on("start", () => {
          this.dragControl(this, 0);
        })
      );
    rulerPoints
      .append("circle")
      .attr("r", "1em")
      .call(
        (d3 as any).drag().on("start", () => {
          this.dragControl(this, 1);
        })
      );
    el.append("text")
      .attr("dx", ".35em")
      .attr("dy", "-.45em")
      .on("click", () => rulers.remove(this.id));

    this.updateCurve();
    this.updateLabel();
    return this;
  }

  updateCurve(): void {
    lineGen.curve((d3 as any).curveCatmullRom.alpha(0.5));
    const path = round(lineGen(this.points));
    this.el.selectAll("path").attr("d", path);

    const left = this.points[0];
    const right = last(this.points);
    this.el.select(".rulerPoints > circle:first-child").attr("cx", left[0]).attr("cy", left[1]);
    this.el.select(".rulerPoints > circle:last-child").attr("cx", right[0]).attr("cy", right[1]);
  }

  updateLabel(): void {
    const length = this.el.select("path").node().getTotalLength();
    const text = `${rn(length * distanceScale)} ${distanceUnitInput.value}`;
    const [x, y] = last(this.points);
    this.el.select("text").attr("x", x).attr("y", y).text(text);
  }

  dragControl(context: Opisometer, right: number): void {
    const MIN_DIST = (d3 as any).event.sourceEvent.shiftKey ? 9 : 100;
    let prev = right ? last(context.points) : context.points[0];

    (d3 as any).event.on("drag", () => {
      const point: [number, number] = [(d3 as any).event.x | 0, (d3 as any).event.y | 0];

      const dist2 = (prev[0] - point[0]) ** 2 + (prev[1] - point[1]) ** 2;
      if (dist2 < MIN_DIST) return;

      right ? context.points.push(point) : context.points.unshift(point);
      prev = point;

      context.updateCurve();
      context.updateLabel();
    });

    (d3 as any).event.on("end", () => {
      if (!(d3 as any).event.sourceEvent.shiftKey) context.optimize();
    });
  }
}

// ─── Route opisometer (snaps to routes) ──────────────────────────────────────

class RouteOpisometer extends Measurer {
  cellStops: number[] | null;

  constructor(points: [number, number][]) {
    super(points);
    if (pack.cells) {
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

  trackCell(cell: number, right: number): void {
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
    const cells = pack.cells;
    const burgs = pack.burgs;
    const b = cells.burg[c];
    const x = b ? burgs[b].x : cells.p[c][0];
    const y = b ? burgs[b].y : cells.p[c][1];
    return [x, y];
  }

  draw(): this {
    if (this.el) this.el.selectAll("*").remove();
    const size = this.getSize();
    const dash = this.getDash();

    this.el = ruler
      .append("g")
      .attr("class", "opisometer")
      .attr("font-size", 10 * size);
    const el = this.el;
    el.append("path").attr("class", "white").attr("stroke-width", size);
    el.append("path").attr("class", "gray").attr("stroke-width", size).attr("stroke-dasharray", dash);
    const rulerPoints = el
      .append("g")
      .attr("class", "rulerPoints")
      .attr("stroke-width", 0.5 * size)
      .attr("font-size", 2 * size);
    rulerPoints
      .append("circle")
      .attr("r", "1em")
      .call(
        (d3 as any).drag().on("start", () => {
          this.dragControl(this, 0);
        })
      );
    rulerPoints
      .append("circle")
      .attr("r", "1em")
      .call(
        (d3 as any).drag().on("start", () => {
          this.dragControl(this, 1);
        })
      );
    el.append("text")
      .attr("dx", ".35em")
      .attr("dy", "-.45em")
      .on("click", () => rulers.remove(this.id));

    this.updateCurve();
    this.updateLabel();
    return this;
  }

  updateCurve(): void {
    lineGen.curve((d3 as any).curveCatmullRom.alpha(0.5));
    const path = round(lineGen(this.points));
    this.el.selectAll("path").attr("d", path);

    const left = this.points[0];
    const right = last(this.points);
    this.el.select(".rulerPoints > circle:first-child").attr("cx", left[0]).attr("cy", left[1]);
    this.el.select(".rulerPoints > circle:last-child").attr("cx", right[0]).attr("cy", right[1]);
  }

  updateLabel(): void {
    const length = this.el.select("path").node().getTotalLength();
    const text = `${rn(length * distanceScale)} ${distanceUnitInput.value}`;
    const [x, y] = last(this.points);
    this.el.select("text").attr("x", x).attr("y", y).text(text);
  }

  dragControl(context: RouteOpisometer, right: number): void {
    (d3 as any).event.on("drag", () => {
      const mousePoint: [number, number] = [(d3 as any).event.x | 0, (d3 as any).event.y | 0];

      const c = findCell(mousePoint[0], mousePoint[1]);
      if (!Routes.isConnected(c) && !(d3 as any).event.sourceEvent.shiftKey) return;

      context.trackCell(c, right);
    });
  }
}

// ─── Planimeter (area measurer) ───────────────────────────────────────────────

class Planimeter extends Measurer {
  draw(): this {
    if (this.el) this.el.selectAll("*").remove();
    const size = this.getSize();

    this.el = ruler
      .append("g")
      .attr("class", "planimeter")
      .call((d3 as any).drag().on("start", this.drag))
      .attr("font-size", 10 * size);
    const el = this.el;
    el.append("path").attr("class", "planimeter").attr("stroke-width", size);
    el.append("text").on("click", () => rulers.remove(this.id));

    this.updateCurve();
    this.updateLabel();
    return this;
  }

  updateCurve(): void {
    lineGen.curve((d3 as any).curveCatmullRomClosed.alpha(0.5));
    const path = round(lineGen(this.points));
    this.el.selectAll("path").attr("d", path);
  }

  updateLabel(): void {
    if (this.points.length < 3) return;

    const polygonArea = rn(Math.abs((d3 as any).polygonArea(this.points)));
    const area = `${si(getArea(polygonArea))} ${getAreaUnit()}`;
    const c = polylabel([this.points], 1.0) as [number, number];
    this.el.select("text").attr("x", c[0]).attr("y", c[1]).text(area);
  }
}

// ─── Factory function ─────────────────────────────────────────────────────────

function createDefaultRuler(): void {
  TIME && console.time("createDefaultRuler");
  const { features, vertices } = pack;

  const areas = features.map(f => (f.land ? f.area || 0 : -Infinity));
  const largestLand = areas.indexOf(Math.max(...areas));
  const featureVertices = features[largestLand].vertices;

  const MIN_X = 100;
  const MAX_X = graphWidth - 100;
  const MIN_Y = 100;
  const MAX_Y = graphHeight - 100;

  let leftmostVertex: [number, number] = [graphWidth - MIN_X, graphHeight / 2];
  let rightmostVertex: [number, number] = [MIN_X, graphHeight / 2];

  for (const vertex of featureVertices) {
    const [x, y] = vertices.p[vertex] as [number, number];
    if (y < MIN_Y || y > MAX_Y) continue;
    if (x < leftmostVertex[0] && x >= MIN_X) leftmostVertex = [x, y];
    if (x > rightmostVertex[0] && x <= MAX_X) rightmostVertex = [x, y];
  }

  rulers = new Rulers();
  rulers.create(Ruler, [leftmostVertex, rightmostVertex]);

  TIME && console.timeEnd("createDefaultRuler");
}

// ─── Global exports ───────────────────────────────────────────────────────────

window.Rulers = Rulers;
window.Ruler = Ruler;
window.Opisometer = Opisometer;
window.RouteOpisometer = RouteOpisometer;
window.Planimeter = Planimeter;
window.createDefaultRuler = createDefaultRuler;

// ─── Legacy globals (from non-migrated JS files) ──────────────────────────────

declare const d3: Record<string, unknown>;
declare const lineGen: { (points: [number, number][]): string; curve: (curve: unknown) => typeof lineGen };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const polylabel: (polygon: any, precision?: number) => [number, number];
declare const parseTransform: (transform: string) => number[];
declare const getArea: (area: number) => number;
declare const getAreaUnit: () => string;
declare const Routes: { isConnected: (cell: number) => boolean };
