import type { Selection } from "d3";
import * as d3 from "d3";

export type DragEv = d3.D3DragEvent<SVGGElement | SVGCircleElement | SVGPolylineElement, unknown, unknown>;
export type MeasurerSel = Selection<SVGGElement, unknown, d3.BaseType, unknown>;

export interface MeasurerCallbacks {
  onDragStart: (this: SVGGElement, e: DragEv) => void;
  onPointDragStart: (i: number, e: DragEv) => void;
  onLineDragStart: (e: DragEv) => void;
  onRemoveClick: () => void;
  onPointClick: (i: number) => void;
}

export const MeasurersRenderer = {
  drawRuler(
    // biome-ignore lint/suspicious/noExplicitAny: D3 container type workaround
    container: any,
    id: number,
    pointsStr: string,
    points: [number, number][],
    size: number,
    dash: number,
    callbacks: MeasurerCallbacks
  ): MeasurerSel {
    const el = container
      .append("g")
      .attr("class", `ruler measurer-${id}`)
      .call(d3.drag<SVGGElement, unknown>().on("start", callbacks.onDragStart))
      .attr("font-size", 10 * size);

    el.append("polyline")
      .attr("points", pointsStr)
      .attr("class", "white")
      .attr("stroke-width", size)
      .call(d3.drag<SVGPolylineElement, unknown>().on("start", callbacks.onLineDragStart));

    el.append("polyline")
      .attr("points", pointsStr)
      .attr("class", "gray")
      .attr("stroke-width", size * 1.2)
      .attr("stroke-dasharray", dash);

    el.append("g")
      .attr("class", "rulerPoints")
      .attr("stroke-width", 0.5 * size)
      .attr("font-size", 2 * size);

    el.append("text").attr("dx", ".35em").attr("dy", "-.45em").on("click", callbacks.onRemoveClick);

    this.drawRulerPoints(el, points, callbacks);

    return el;
  },

  drawRulerPoints(el: MeasurerSel, points: [number, number][], callbacks: MeasurerCallbacks): void {
    const g = el.select<SVGGElement>(".rulerPoints");
    g.selectAll("circle").remove();

    for (let i = 0; i < points.length; i++) {
      const isEdge = i === 0 || i === points.length - 1;
      const [x, y] = points[i];
      g.append("circle")
        .attr("r", "1em")
        .attr("cx", x)
        .attr("cy", y)
        .attr("class", isEdge ? "edge" : "control")
        .on("click", () => callbacks.onPointClick(i))
        .call(
          d3
            .drag<SVGCircleElement, unknown>()
            .clickDistance(3)
            .on("start", e => callbacks.onPointDragStart(i, e))
        );
    }
  },

  updateRulerDrag(el: MeasurerSel, pointsStr: string, pointId: number, x: number, y: number): void {
    const lines = el.selectAll("polyline");
    lines.attr("points", pointsStr);
    const circle = el.select(`circle:nth-child(${pointId + 1})`);
    circle.attr("cx", x).attr("cy", y);
  },

  drawOpisometer(
    // biome-ignore lint/suspicious/noExplicitAny: D3 container type workaround
    container: any,
    id: number,
    size: number,
    dash: number,
    callbacks: MeasurerCallbacks
  ): MeasurerSel {
    const el = container
      .append("g")
      .attr("class", `opisometer measurer-${id}`)
      .call(d3.drag<SVGGElement, unknown>().on("start", callbacks.onDragStart))
      .attr("font-size", 10 * size);

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
      .call(d3.drag<SVGCircleElement, unknown>().on("start", e => callbacks.onPointDragStart(0, e)));

    rulerPoints
      .append("circle")
      .attr("r", "1em")
      .call(d3.drag<SVGCircleElement, unknown>().on("start", e => callbacks.onPointDragStart(1, e)));

    el.append("text").attr("dx", ".35em").attr("dy", "-.45em").on("click", callbacks.onRemoveClick);

    return el;
  },

  updateOpisometerCurve(el: MeasurerSel, path: string, left: [number, number], right: [number, number]): void {
    el.selectAll("path").attr("d", path);
    el.select(".rulerPoints > circle:first-child").attr("cx", left[0]).attr("cy", left[1]);
    el.select(".rulerPoints > circle:last-child").attr("cx", right[0]).attr("cy", right[1]);
  },

  drawPlanimeter(
    // biome-ignore lint/suspicious/noExplicitAny: D3 container type workaround
    container: any,
    id: number,
    size: number,
    callbacks: MeasurerCallbacks
  ): MeasurerSel {
    const el = container
      .append("g")
      .attr("class", `planimeter measurer-${id}`)
      .call(d3.drag<SVGGElement, unknown>().on("start", callbacks.onDragStart))
      .attr("font-size", 10 * size);

    el.append("path").attr("class", "planimeter").attr("stroke-width", size);
    el.append("text").on("click", callbacks.onRemoveClick);

    return el;
  },

  updatePlanimeterCurve(el: MeasurerSel, path: string): void {
    el.selectAll("path").attr("d", path);
  },

  updateLabel(el: MeasurerSel, text: string, x: number, y: number): void {
    el.select("text").attr("x", x).attr("y", y).text(text);
  }
};
