import { range } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { rn } from "../utils";

type ScaleBarSelection = d3.Selection<SVGGElement, unknown, HTMLElement | null, unknown>;

export const drawScaleBar = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  scaleBar: ScaleBarSelection,
  scaleLevel: number
): void => {
  if (!scaleBar.size() || scaleBar.style("display") === "none") return;
  const { distanceScale } = worldContext;

  const unit = distanceUnitInput.value;
  const size = +scaleBar.attr("data-bar-size");

  const length = getLength(worldContext, scaleBar, scaleLevel);
  scaleBar.select("#scaleBarContent").remove(); // redraw content every time
  const content = scaleBar.append("g").attr("id", "scaleBarContent");

  const lines = content.append("g");
  lines
    .append("line")
    .attr("x1", 0.5)
    .attr("y1", 0)
    .attr("x2", length + size - 0.5)
    .attr("y2", 0)
    .attr("stroke-width", size)
    .attr("stroke", "white");
  lines
    .append("line")
    .attr("x1", 0)
    .attr("y1", size)
    .attr("x2", length + size)
    .attr("y2", size)
    .attr("stroke-width", size)
    .attr("stroke", "#3d3d3d");
  lines
    .append("line")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", length + size)
    .attr("y2", 0)
    .attr("stroke-width", rn(size * 3, 2))
    .attr("stroke-dasharray", `${size} ${rn(length / 5 - size, 2)}`)
    .attr("stroke", "#3d3d3d");

  const texts = content.append("g").attr("text-anchor", "middle").attr("font-family", "var(--serif)");
  texts
    .selectAll("text")
    .data(range(0, 6))
    .enter()
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .attr("x", (d: number) => rn((d * length) / 5, 2))
    .attr("y", 0)
    .attr("dy", "-.6em")
    .text((d: number) => rn((((d * length) / 5) * distanceScale) / scaleLevel) + (d < 5 ? "" : ` ${unit}`));

  const label = scaleBar.attr("data-label");
  if (label) {
    texts
      .append("text")
      .attr("text-rendering", "optimizeSpeed")
      .attr("x", (length + 1) / 2)
      .attr("dy", ".6em")
      .attr("dominant-baseline", "text-before-edge")
      .text(label);
  }

  const scaleBarBack = scaleBar.select<SVGRectElement>("#scaleBarBack");
  if (scaleBarBack.size()) {
    const bbox = (content.node() as SVGGElement).getBBox();
    const paddingTop = +scaleBarBack.attr("data-top") || 0;
    const paddingLeft = +scaleBarBack.attr("data-left") || 0;
    const paddingRight = +scaleBarBack.attr("data-right") || 0;
    const paddingBottom = +scaleBarBack.attr("data-bottom") || 0;

    scaleBar
      .select("#scaleBarBack")
      .attr("x", -paddingLeft)
      .attr("y", -paddingTop)
      .attr("width", bbox.width + paddingRight)
      .attr("height", bbox.height + paddingBottom);
  }
};

function getLength(_worldContext: Readonly<WorldContext>, _scaleBar: ScaleBarSelection, scaleLevel: number): number {
  const init = 100;
  const { distanceScale } = _worldContext;

  const size = +_scaleBar.attr("data-bar-size");
  let val = (init * size * distanceScale) / scaleLevel; // bar length in distance unit
  if (val > 900)
    val = rn(val, -3); // round to 1000
  else if (val > 90)
    val = rn(val, -2); // round to 100
  else if (val > 9)
    val = rn(val, -1); // round to 10
  else val = rn(val); // round to 1
  const length = (val * scaleLevel) / distanceScale; // actual length in pixels on this scale
  return length;
}

export const fitScaleBar = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  scaleBar: ScaleBarSelection,
  fullWidth: number,
  fullHeight: number
): void => {
  if (!scaleBar.select("rect").size() || scaleBar.style("display") === "none") return;

  const posX = +scaleBar.attr("data-x") || 99;
  const posY = +scaleBar.attr("data-y") || 99;
  const bbox = (scaleBar.select("rect").node() as SVGRectElement).getBBox();

  const x = rn((fullWidth * posX) / 100 - bbox.width + 10);
  const y = rn((fullHeight * posY) / 100 - bbox.height + 20);
  scaleBar.attr("transform", `translate(${x},${y})`);
};
