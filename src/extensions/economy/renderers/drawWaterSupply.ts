import type { Burg } from "../../hostTypes";
import { getRegionalWaterSchemes, getUrbanWaterSystems, getWaterSupplyLayer, getWorldContext } from "../economyContext";
import { raceKeyForBurgState } from "../generators/resolveBurgCulture";
import { getSeasonalColdBurgIds } from "../generators/urbanWaterClimate";
import {
  buildAqueductTree,
  buildInheritedWaterSupplyRoutes,
  type InheritedWaterSupplyRoute
} from "../generators/urbanWaterSupply";
import type { RegionalWaterScheme } from "../generators/urbanWaterTypes";

const OUTER_STROKE = "#f5e6b3";
const WATER_STROKE = "#1677a8";

/**
 * Visual state per §9.1's table (計画中は細い破線、建設中は点線、停止中は灰色、正常は実線) — the
 * doc's 4-bucket display maps onto RegionalWaterScheme's finer 8-status lifecycle as: proposed/
 * surveying/negotiating/funded → planned, building/commissioning → building, operating → normal,
 * suspended → gray. docs/plan/modern-urban-water-treatment-and-governance.md §9.1, §14.
 */
const SCHEME_ROUTE_STYLE_BY_STATUS: Record<
  RegionalWaterScheme["status"],
  { stroke: string; dash: string; width: number; opacity: number; label: string }
> = {
  proposed: { stroke: "#4a90b8", dash: "1 3", width: 0.7, opacity: 0.45, label: "proposed" },
  surveying: { stroke: "#4a90b8", dash: "1 3", width: 0.7, opacity: 0.5, label: "surveying" },
  negotiating: { stroke: "#4a90b8", dash: "1 3", width: 0.85, opacity: 0.6, label: "negotiating" },
  funded: { stroke: "#2f7aa8", dash: "1 3", width: 0.85, opacity: 0.7, label: "funded, awaiting construction" },
  building: { stroke: "#2f7aa8", dash: "2 1.5", width: 1, opacity: 0.85, label: "under construction" },
  commissioning: { stroke: "#2f7aa8", dash: "2 1.5", width: 1, opacity: 0.9, label: "commissioning / trial run" },
  operating: { stroke: WATER_STROKE, dash: "", width: 1.15, opacity: 1, label: "operating" },
  suspended: { stroke: "#8a8a8a", dash: "1 2", width: 0.85, opacity: 0.5, label: "suspended" }
};

/** Draw schematic, inherited Roman aqueducts and negotiated RegionalWaterSchemes separately from
 *  natural rivers. */
export function drawWaterSupply(): void {
  const layer = getWaterSupplyLayer();
  if (!layer) return;

  const world = getWorldContext();
  const { pack } = world;
  const systems = getUrbanWaterSystems();
  const routes = buildInheritedWaterSupplyRoutes({
    burgs: pack.burgs,
    cells: pack.cells,
    rivers: pack.rivers,
    sewerClimate: {
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
  let html = routes.map(route => routeMarkup(route, pack.burgs[route.burgId]?.name ?? `Burg ${route.burgId}`)).join("");
  html += schemeRoutesMarkup(pack.burgs, pack.cells);
  layer.html(html);
  layer.style("display", null);
}

/**
 * RegionalWaterScheme routes are not persisted point-by-point (routeCellIds is a deduped trunk-cell
 * set, matching §9.4's "幹線のみ" interface exactly) — the exact branch geometry is recomputed here
 * from the persisted `sourceCellId`/`memberBurgIds` via the same buildAqueductTree() Giants use,
 * deterministic for unchanged inputs, same "recompute at draw time" shape as the Giant routes above.
 */
function schemeRoutesMarkup(
  burgs: readonly (Burg | undefined)[],
  cells: Parameters<typeof buildAqueductTree>[2]
): string {
  let html = "";
  for (const scheme of getRegionalWaterSchemes()) {
    if (scheme.sourceCellId < 0) continue; // not yet surveyed (proposed/surveying-that-hasn't-run)
    const memberBurgs = scheme.memberBurgIds
      .map(id => burgs[id])
      .filter((burg): burg is Burg & { i: number } => Boolean(burg?.i && !burg.removed));
    if (!memberBurgs.length) continue;

    const routes = buildAqueductTree(memberBurgs, scheme.sourceCellId, cells, new Set());
    const style = SCHEME_ROUTE_STYLE_BY_STATUS[scheme.status];
    for (const route of routes) {
      html += schemeRouteMarkup(route, scheme, style, burgs[route.burgId]?.name ?? `Burg ${route.burgId}`);
    }
  }
  return html;
}

function schemeRouteMarkup(
  route: InheritedWaterSupplyRoute,
  scheme: RegionalWaterScheme,
  style: (typeof SCHEME_ROUTE_STYLE_BY_STATUS)[RegionalWaterScheme["status"]],
  burgName: string
): string {
  const path = aqueductPath(route);
  const title = escapeHtml(`Regional water scheme #${scheme.id} (${style.label}) → ${burgName}`);
  const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : "";
  return (
    `<g id="scheme-${scheme.id}-${route.id}" data-scheme-id="${scheme.id}" data-scheme-status="${scheme.status}" data-burg-id="${route.burgId}" opacity="${style.opacity}">` +
    `<title>${title}</title>` +
    `<path d="${path}" fill="none" stroke="${style.stroke}" stroke-width="${style.width}"${dash} stroke-linecap="round"/>` +
    `</g>`
  );
}

function routeMarkup(route: InheritedWaterSupplyRoute, burgName: string): string {
  const [sx, sy] = route.source;
  const [dx, dy] = route.destination;
  const path = aqueductPath(route);
  const isIntakeSegment = route.sourceCell === route.intakeCell;
  const title = escapeHtml(
    `${isIntakeSegment ? "Protected Roman headwater intake" : "Roman aqueduct branch"}${route.requiresWinterCistern ? " (covered winter conduit and cistern)" : ""} → ${burgName}`
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
    (route.requiresWinterCistern
      ? `<rect x="${dx - 2.3}" y="${dy - 2.3}" width="4.6" height="4.6" rx="0.8" fill="#d9f2ff" stroke="#0b4f6c" stroke-width="0.8"/>`
      : "") +
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
