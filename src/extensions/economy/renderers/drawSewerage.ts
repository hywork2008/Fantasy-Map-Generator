import { getSewerageLayer, getUrbanWaterSystems, getWorldContext } from "../economyContext";
import { buildInheritedSewerRoutes, type InheritedSewerRoute } from "../generators/urbanSewerage";

const OUTER_STROKE = "#d7c8ba";
const SEWER_STROKE = "#59475f";

/** Draw Giant inherited trunk sewers separately from rivers and aqueducts. */
export function drawSewerage(): void {
  const layer = getSewerageLayer();
  if (!layer) return;

  const { pack } = getWorldContext();
  const routes = buildInheritedSewerRoutes({
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

function routeMarkup(route: InheritedSewerRoute, burgName: string): string {
  const path = sewerPath(route);
  const [dx, dy] = route.destination;
  const title = escapeHtml(`Roman trunk sewer: ${burgName} → ${route.outfallKind} outfall`);
  return (
    `<g id="${route.id}" data-burg-id="${route.burgId}" data-outfall-cell="${route.outfallCell}">` +
    `<title>${title}</title>` +
    `<path d="${path}" fill="none" stroke="${OUTER_STROKE}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="${path}" fill="none" stroke="${SEWER_STROKE}" stroke-width="1.15" stroke-dasharray="2 2" stroke-linecap="round"/>` +
    `<path d="M ${dx - 2.4},${dy - 2} L ${dx + 2.4},${dy} L ${dx - 2.4},${dy + 2} Z" fill="#b18461" stroke="${SEWER_STROKE}" stroke-width="0.7"/>` +
    `</g>`
  );
}

function sewerPath(route: InheritedSewerRoute): string {
  const [sx, sy] = route.source;
  const [dx, dy] = route.destination;
  const vx = dx - sx;
  const vy = dy - sy;
  const length = Math.hypot(vx, vy);
  if (length < 0.1) return `M ${sx},${sy}`;
  const offset = Math.min(14, Math.max(3, length * 0.08)) * (route.burgId % 2 ? -1 : 1);
  const cx = (sx + dx) / 2 - (vy / length) * offset;
  const cy = (sy + dy) / 2 + (vx / length) * offset;
  return `M ${sx},${sy} Q ${cx},${cy} ${dx},${dy}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}
