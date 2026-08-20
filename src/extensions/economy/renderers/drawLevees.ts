import { rn } from "../../hostUtils";
import { getLeveeSites, getLevees, getLeveesLayer, getWorldContext } from "../economyContext";

const STROKE_WIDTH = 3;
const INACTIVE_OPACITY = 0.45;

/**
 * Draws every levee along its real river reach (leveeSites.ts/levees.ts) as a polyline through the
 * reach's cell points — same "own SVG layer" shape as drawDams.ts, but a line instead of a point
 * icon since a levee protects a contiguous stretch of river, not a single spot. Inactive levees are
 * dimmed — same INACTIVE_OPACITY idea as drawDams.ts/drawMineralDeposits.ts.
 * Design: docs/plan/river-levee-and-flood-damage.md §3.5.
 */
export function drawLevees(): void {
  const layer = getLeveesLayer();
  if (!layer) return;

  layer.html(buildLeveesContent());
  layer.style("display", null);
}

function buildLeveesContent(): string {
  const levees = getLevees();
  if (!levees.length) return "";

  const sitesById = new Map(getLeveeSites().map(site => [site.i, site]));
  const points = getWorldContext().pack.cells.p;

  let html = "";
  for (const levee of levees) {
    const site = sitesById.get(levee.siteId);
    if (!site) continue;

    const coords = site.cells
      .map(cellId => points?.[cellId])
      .filter((point): point is [number, number] => Boolean(point));
    if (coords.length < 2) continue;

    const opacity = !levee.active ? INACTIVE_OPACITY : 1;
    const status = !levee.active ? "idle" : "active";
    const title = `Levee — ${status}, ${rn(levee.protectionRating * 100, 0)}% flood protection over ${site.cells.length} cells`;
    const pointsAttr = coords.map(([x, y]) => `${x},${y}`).join(" ");

    html +=
      `<g data-i="${levee.i}" opacity="${opacity}">` +
      `<title>${title}</title>` +
      `<polyline points="${pointsAttr}" fill="none" stroke="#8a5a2b" stroke-width="${STROKE_WIDTH}" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>` +
      `</g>`;
  }
  return html;
}
