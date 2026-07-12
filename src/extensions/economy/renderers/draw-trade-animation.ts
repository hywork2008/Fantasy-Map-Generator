import { curveCatmullRom, easeLinear, line, select } from "d3";
import type { Point } from "../../hostCore";
import { minmax } from "../../hostUtils";
import { getTradeAnimLayer, getWorldContext } from "../economyContext";
import type { Caravan } from "../generators/marketTypes";
import { TradeAnimation } from "../generators/trade-animation";

const lineGen = line<Point>().curve(curveCatmullRom.alpha(0.1));

const MARKER_SYMBOLS = {
  water: { id: "trade-marker-water", src: "./images/markers/ship.svg" },
  land: { id: "trade-marker-land", src: "./images/markers/wagon.svg" }
} as const;

let symbolsReady: Promise<void> | null = null;

function getOrCreateDefs(): Element {
  const layer = getTradeAnimLayer();
  if (!layer) return document.createElementNS("http://www.w3.org/2000/svg", "g"); // fallback
  const existing = layer.select<Element>("#trade-markers").node();
  if (existing) return existing;
  return layer.append<SVGGElement>("g").attr("id", "trade-markers").node()!;
}

function ensureSymbols(): Promise<void> {
  if (symbolsReady) return symbolsReady;
  symbolsReady = (async () => {
    const defs = getOrCreateDefs();
    await Promise.all(
      Object.values(MARKER_SYMBOLS).map(async ({ id, src }) => {
        if (defs.querySelector(`#${id}`)) return;
        const text = await fetch(src).then(r => r.text());
        const svgNode = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
        const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
        symbol.id = id;
        const vb = svgNode.getAttribute("viewBox");
        if (vb) symbol.setAttribute("viewBox", vb);
        while (svgNode.firstChild) symbol.appendChild(svgNode.firstChild);
        defs.appendChild(symbol);
      })
    );
  })();
  return symbolsReady;
}

export function getCaravanPosition(caravan: Caravan): { x: number; y: number; angle: number; type: "land" | "water" } {
  const segments = caravan.routeSegments;
  if (!segments || segments.length === 0) return { x: 0, y: 0, angle: 0, type: "land" };

  const targetDistance = caravan.currentDistance / getWorldContext().distanceScale;
  let currentDist = 0;

  for (const seg of segments) {
    const points = seg.points;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const dist = Math.hypot(x2 - x1, y2 - y1);

      if (currentDist + dist >= targetDistance) {
        const frac = dist > 0 ? (targetDistance - currentDist) / dist : 0;
        const clampedFrac = Math.max(0, Math.min(1, frac));
        const x = x1 + (x2 - x1) * clampedFrac;
        const y = y1 + (y2 - y1) * clampedFrac;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        return { x, y, angle, type: seg.type };
      }
      currentDist += dist;
    }
  }

  const lastSeg = segments[segments.length - 1];
  const lastPoint = lastSeg.points[lastSeg.points.length - 1];
  return { x: lastPoint[0], y: lastPoint[1], angle: 0, type: lastSeg.type };
}

export async function draw(): Promise<void> {
  const layer = getTradeAnimLayer();
  if (!layer) return;

  const world = getWorldContext();
  const caravans = (world.pack.caravans || []).filter(c => c.state === "transit");

  if (caravans.length === 0) {
    layer.selectAll("g.caravan").remove();
    return;
  }

  await ensureSymbols();

  const animOptions = TradeAnimation.getOptions();
  const size = animOptions.markerSize;

  const groups = layer.selectAll<SVGGElement, Caravan>("g.caravan").data(caravans, c => c.i);

  groups.exit().transition().duration(500).style("opacity", 0).remove();

  const enter = groups.enter().append("g").attr("class", "caravan");

  enter.append("use").attr("pointer-events", "none");

  enter
    .append("circle")
    .attr("r", minmax(size, 2, 6))
    .attr("fill", "none")
    .attr("stroke", "none")
    .attr("pointer-events", "all")
    .style("cursor", "pointer")
    .on("pointerdown", (e: PointerEvent) => e.stopPropagation())
    .on("pointerup", (e: PointerEvent) => e.stopPropagation())
    .on("click", (e: MouseEvent, d) => {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent("trade:showDetails", { detail: { caravan: d } }));
    });

  const update = enter.merge(groups);

  update.each(function (d) {
    const group = select(this);
    const { x, y, angle, type } = getCaravanPosition(d);

    const imgSize = type === "land" ? size / 1.6 : size;
    group
      .select("use")
      .attr("href", `#trade-marker-${type}`)
      .attr("width", imgSize)
      .attr("height", imgSize)
      .attr("x", -imgSize / 2)
      .attr("y", -imgSize / 2);

    group.select("circle").attr("r", minmax(size, 2, 6));

    const transform = `translate(${x}, ${y}) rotate(${(angle * 180) / Math.PI})`;

    if (this.getAttribute("data-initialized")) {
      // Smooth interpolation to new position
      group.transition().duration(800).ease(easeLinear).attr("transform", transform);
    } else {
      group.attr("transform", transform);
      this.setAttribute("data-initialized", "true");
    }
  });
}

export function clear(): void {
  getTradeAnimLayer()?.selectAll("g.caravan").interrupt().remove();
}

export function highlight(points: Point[]): void {
  const anim = getTradeAnimLayer();
  if (!anim) return;
  anim.selectAll("path.highlight").remove();
  anim.style("display", null);
  anim
    .append("path")
    .attr("class", "highlight")
    .attr("d", lineGen(points) || "")
    .attr("fill", "none")
    .attr("stroke", "red")
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.7)
    .attr("stroke-dasharray", "none")
    .attr("stroke-linecap", "round");
}

export function clearHighlight(): void {
  getTradeAnimLayer()?.selectAll("path.highlight").remove();
}

export function getCaravansAtPoint(mapPoint: Point, padding: number): Caravan[] {
  const world = getWorldContext();
  if (!world.pack.caravans?.length) return [];
  const animOptions = TradeAnimation.getOptions();
  const displayLimit = Math.min(world.pack.caravans.length, animOptions.concurrent);
  const activeCaravans = world.pack.caravans.slice(0, displayLimit);

  const [x, y] = mapPoint;
  const threshold = padding + animOptions.markerSize;

  return activeCaravans.filter(c => {
    const pos = getCaravanPosition(c);
    return Math.hypot(pos.x - x, pos.y - y) <= threshold;
  });
}
