import { getUrbanWaterSystems, getWaterSupplyLayer, getWorldContext } from "../economyContext";
import { buildInheritedWaterSupplyRoutes, type InheritedWaterSupplyRoute } from "../generators/urbanWaterSupply";

const OUTER_STROKE = "#f5e6b3";
const WATER_STROKE = "#1677a8";

/** Draw schematic, inherited Roman aqueducts separately from natural rivers. */
export function drawWaterSupply(): void {
  const layer = getWaterSupplyLayer();
  if (!layer) return;

  const { pack } = getWorldContext();
  const routes = buildInheritedWaterSupplyRoutes({
    burgs: pack.burgs,
    cells: pack.cells,
    rivers: pack.rivers,
    systems: getUrbanWaterSystems()
  });
  layer.html(
    routes.map(route => routeMarkup(route, pack.burgs[route.burgId]?.name ?? `Burg ${route.burgId}`)).join("")
  );
  layer.style("display", null);
}

function routeMarkup(route: InheritedWaterSupplyRoute, burgName: string): string {
  const [sx, sy] = route.source;
  const [dx, dy] = route.destination;
  const path = aqueductPath(route);
  const isIntakeSegment = route.sourceCell === route.intakeCell;
  const title = escapeHtml(
    `${isIntakeSegment ? "Protected Roman headwater intake" : "Roman aqueduct branch"} → ${burgName}`
  );
  const branchMarker = isIntakeSegment
    ? `<circle cx="${sx}" cy="${sy}" r="4" fill="none" stroke="#0b4f6c" stroke-width="0.8" stroke-dasharray="1 1"/>` +
      `<circle cx="${sx}" cy="${sy}" r="2.4" fill="#d9f2ff" stroke="${WATER_STROKE}" stroke-width="0.8"/>`
    : `<circle cx="${sx}" cy="${sy}" r="1.8" fill="#d9f2ff" stroke="${WATER_STROKE}" stroke-width="0.8"/>`;
  return (
    `<g id="${route.id}" data-burg-id="${route.burgId}" data-source-cell="${route.sourceCell}" data-intake-cell="${route.intakeCell}">` +
    `<title>${title}</title>` +
    `<path d="${path}" fill="none" stroke="${OUTER_STROKE}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="${path}" fill="none" stroke="${WATER_STROKE}" stroke-width="1.15" stroke-dasharray="3 2" stroke-linecap="round"/>` +
    branchMarker +
    `<path d="M ${dx - 2},${dy + 2} L ${dx},${dy - 2.4} L ${dx + 2},${dy + 2} Z" fill="#d9f2ff" stroke="${WATER_STROKE}" stroke-width="0.8"/>` +
    `</g>`
  );
}

function aqueductPath(route: InheritedWaterSupplyRoute): string {
  const [first, ...rest] = route.points;
  if (!first) return "";
  return `M ${first[0]},${first[1]}${rest.map(([x, y]) => ` L ${x},${y}`).join("")}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}
