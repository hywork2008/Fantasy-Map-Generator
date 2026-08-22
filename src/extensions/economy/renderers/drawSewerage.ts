import { getSewerageLayer, getUrbanWaterSystems, getWorldContext } from "../economyContext";
import { raceKeyForBurgState } from "../generators/resolveBurgCulture";
import { buildInheritedSewerRoutes, type InheritedSewerRoute } from "../generators/urbanSewerage";
import { getSeasonalColdBurgIds } from "../generators/urbanWaterClimate";

const OUTER_STROKE = "#d7c8ba";
const SEWER_STROKE = "#59475f";

/** Draw Giant inherited trunk sewers separately from rivers and aqueducts. */
export function drawSewerage(): void {
  const layer = getSewerageLayer();
  if (!layer) return;

  const world = getWorldContext();
  const { pack } = world;
  const systems = getUrbanWaterSystems();
  const routes = buildInheritedSewerRoutes({
    burgs: pack.burgs,
    cells: pack.cells,
    rivers: pack.rivers,
    climate: {
      seasonalColdBurgIds: getSeasonalColdBurgIds(
        world,
        pack.burgs,
        systems
          .filter(system => {
            const burg = pack.burgs[system.burgId];
            return Boolean(burg?.i && raceKeyForBurgState(burg) === "giant");
          })
          .map(system => system.burgId)
      ),
      features: pack.features
    },
    systems
  });
  layer.html(
    routes.map(route => routeMarkup(route, pack.burgs[route.burgId]?.name ?? `Burg ${route.burgId}`)).join("")
  );
  layer.style("display", null);
}

function routeMarkup(route: InheritedSewerRoute, burgName: string): string {
  const path = sewerPath(route);
  const [dx, dy] = route.destination;
  const destinationLabel =
    route.outfallKind === "storage" ? "seasonal storage and infiltration" : `${route.outfallKind} outfall`;
  const title = escapeHtml(`Roman trunk sewer: ${burgName} → ${destinationLabel}`);
  return (
    `<g id="${route.id}" data-burg-id="${route.burgId}" data-outfall-cell="${route.outfallCell}">` +
    `<title>${title}</title>` +
    `<path d="${path}" fill="none" stroke="${OUTER_STROKE}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="${path}" fill="none" stroke="${SEWER_STROKE}" stroke-width="1.15" stroke-dasharray="2 2" stroke-linecap="round"/>` +
    (route.joinsRouteId
      ? ""
      : route.outfallKind === "storage"
        ? `<rect x="${dx - 2.5}" y="${dy - 2.5}" width="5" height="5" rx="0.8" fill="#9bb58d" stroke="${SEWER_STROKE}" stroke-width="0.7"/>`
        : `<path d="M ${dx - 2.4},${dy - 2} L ${dx + 2.4},${dy} L ${dx - 2.4},${dy + 2} Z" fill="#b18461" stroke="${SEWER_STROKE}" stroke-width="0.7"/>`) +
    `</g>`
  );
}

function sewerPath(route: InheritedSewerRoute): string {
  const [sx, sy] = route.source;
  const [dx, dy] = route.destination;
  return `M ${sx},${sy} L ${dx},${dy}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}
