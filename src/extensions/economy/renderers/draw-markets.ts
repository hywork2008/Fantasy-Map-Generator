import { color, curveBasisClosed, line, select } from "d3";
import { rn } from "../../../utils";
import { TIME } from "../../../utils/debug";
import { getIsolines } from "../../../utils/pathUtils";
import { getMarketsFillLayer, getMarketsLayer, getViewContext, getWorldContext } from "../economyContext";

export function drawMarketsLayer() {
  TIME && console.time("drawMarketsLayer");
  if (!getWorldContext().pack.cells.market || !getWorldContext().pack.markets?.length) return;
  const linegen = line().curve(curveBasisClosed);
  const getType = (cellId: number) => getWorldContext().pack.cells.market[cellId];
  const isolines = getIsolines(getWorldContext().pack, getType, { polygons: true });

  let fillHtml = "";
  let markersHtml = "";

  for (const market of getWorldContext().pack.markets) {
    const fillColor = market.color || "#dababf";
    const strokeColor = color(fillColor)?.darker().hex() || "#000";
    const polygons = isolines[market.i]?.polygons;
    const pathStr = polygons?.map(p => linegen(p) ?? "").join("");

    if (pathStr) {
      // Fill layer (rendered below Icons): hidden by default, animated on hover
      fillHtml += `<path id="market-fill-${market.i}" d="${pathStr}" fill="${fillColor}" fill-opacity="0" stroke="none" pointer-events="none"/>`;

      // Border in markers layer
      const clipId = `market-clip-${market.i}`;
      let markerContent = `<clipPath id="${clipId}"><path d="${pathStr}"/></clipPath>`;
      markerContent += `<path class="border" d="${pathStr}" fill="none" stroke="${strokeColor}" stroke-width="0.7" clip-path="url(#${clipId})"/>`;
      markerContent += buildCenterMarker(market.centerBurgId, fillColor, strokeColor);
      markersHtml += `<g id="market${market.i}" data-id="${market.i}">${markerContent}</g>`;
    } else {
      const centerContent = buildCenterMarker(market.centerBurgId, fillColor, strokeColor);
      markersHtml += `<g id="market${market.i}" data-id="${market.i}">${centerContent}</g>`;
    }
  }

  getMarketsFillLayer()?.html(fillHtml);
  getMarketsLayer()?.html(markersHtml);
  highlightMarketsOnHover();
  getMarketsFillLayer()?.style("display", null);
  getMarketsLayer()?.style("display", null);
  TIME && console.timeEnd("drawMarketsLayer");
}

function buildCenterMarker(burgId: number, fillColor: string, strokeColor: string): string {
  const burg = getWorldContext().pack.burgs[burgId];
  if (!burg) return "";
  const { x, y } = burg;
  const radius = Math.max(rn(3 + 1 / getViewContext().scale, 2), 2);
  const fontSize = Math.max(rn(5 + 1 / getViewContext().scale, 2), 2);
  const strokeWidth = rn(radius / 8, 2);
  return (
    `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fillColor}" fill-opacity="1" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>` +
    `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}px" fill-opacity="1">⚖️</text>`
  );
}

function highlightMarketsOnHover(): void {
  const marketsEl = getMarketsLayer();
  if (!marketsEl) return;
  select(marketsEl.node())
    .selectAll<SVGGElement, unknown>("g[data-id]")
    .on("mouseover", e => highlightMarketOn((e.currentTarget as SVGGElement).dataset.id!))
    .on("mouseout", e => highlightMarketOff((e.currentTarget as SVGGElement).dataset.id!));
}

export function highlightMarketOn(marketId: number | string): void {
  select(`#market-fill-${marketId}`).transition().duration(600).attr("fill-opacity", 0.5);
}

export function highlightMarketOff(marketId: number | string): void {
  select(`#market-fill-${marketId}`).transition().duration(400).attr("fill-opacity", 0);
}
