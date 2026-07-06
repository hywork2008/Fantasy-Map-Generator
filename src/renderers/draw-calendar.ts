import { simulationContext } from "../context/simulationContext";
import type { RootLayers, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

/**
 * Renders the always-visible in-world calendar readout ("1432 Hebriwavon Era") as a
 * fixed screen-space overlay (calendar is appended directly to <svg>, outside #viewbox,
 * so it never pans/zooms with the map — same convention as #legend).
 */
export function drawCalendar(
  _worldContext: Readonly<WorldContext>,
  viewContext: Readonly<RootLayers & Pick<ViewState, "svgWidth">>
): void {
  const { calendar, svgWidth } = viewContext;
  if (!calendar.size()) return;

  calendar.selectAll("*").remove();

  const text = `${simulationContext.currentYear} ${simulationContext.era}`.trim();
  if (!text) return;

  const label = calendar
    .append("text")
    .attr("font-family", "var(--serif)")
    .attr("font-size", "1em")
    .attr("fill", "#3d3d3d")
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "hanging")
    .text(text);

  const bbox = (label.node() as SVGTextElement).getBBox();
  const paddingX = 6;
  const paddingY = 3;

  calendar
    .insert("rect", "text")
    .attr("x", bbox.x - paddingX)
    .attr("y", bbox.y - paddingY)
    .attr("width", bbox.width + paddingX * 2)
    .attr("height", bbox.height + paddingY * 2)
    .attr("fill", "white")
    .attr("fill-opacity", 0.6);

  calendar.attr("transform", `translate(${svgWidth - 10}, 10)`);
}
