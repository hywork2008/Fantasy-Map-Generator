import type { Burg } from "../../hostTypes";
import { getSewerageLayer, getUrbanWaterSystems, getWorldContext } from "../economyContext";
import { raceKeyForBurgState } from "../generators/resolveBurgCulture";
import { buildInheritedSewerRoutes, type InheritedSewerRoute } from "../generators/urbanSewerage";
import { getSeasonalColdBurgIds } from "../generators/urbanWaterClimate";
import type { UrbanWaterSystem, WaterSanitationTier } from "../generators/urbanWaterTypes";

const OUTER_STROKE = "#d7c8ba";
const SEWER_STROKE = "#59475f";

/**
 * Modern Phase 5 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §16): a small plant
 * marker at every ordinary (non-Giant-route) Burg with wastewaterTreatmentTier >= 1, styled by
 * tier. Deliberately scoped narrower than a full RegionalWaterScheme-style negotiated network (no
 * such multi-Burg sewer authority exists yet — §16.5) — this only visualizes each Burg's own
 * treatment plant status, which is what §9.1's toggleSewerage row actually names
 * ("sewage treatment plant…outfall"), not a shared trunk network.
 */
const TREATMENT_ICON_BY_TIER: Partial<Record<WaterSanitationTier, string>> = {
  1: "🪣",
  2: "🌾",
  3: "⚙️"
};
const TREATMENT_LABEL_BY_TIER: Partial<Record<WaterSanitationTier, string>> = {
  1: "primary settling",
  2: "trickling filter / biological treatment",
  3: "activated sludge"
};

/** Draw Giant inherited trunk sewers, then every other Burg's own treatment-plant status. */
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
  const routedBurgIds = new Set(routes.map(route => route.burgId));
  let html = routes.map(route => routeMarkup(route, pack.burgs[route.burgId]?.name ?? `Burg ${route.burgId}`)).join("");
  html += treatmentPlantMarkup(pack.burgs, systems, routedBurgIds);
  layer.html(html);
  layer.style("display", null);
}

function treatmentPlantMarkup(
  burgs: readonly (Burg | undefined)[],
  systems: readonly UrbanWaterSystem[],
  routedBurgIds: ReadonlySet<number>
): string {
  let html = "";
  for (const system of systems) {
    const tier = system.wastewaterTreatmentTier ?? 0;
    if (tier < 1 || routedBurgIds.has(system.burgId)) continue;
    const burg = burgs[system.burgId];
    if (!burg?.i || burg.removed) continue;

    const backlog = tier >= 2 ? Math.max(0, Math.min(1, system.sludgeBacklog ?? 0)) : 0;
    const opacity = 1 - Math.min(0.5, backlog * 0.5);
    const icon = TREATMENT_ICON_BY_TIER[tier as WaterSanitationTier] ?? "🪣";
    const backlogNote = tier >= 2 ? `, sludge backlog ${Math.round(backlog * 100)}%` : "";
    const title = escapeHtml(
      `${burg.name ?? `Burg ${burg.i}`}: wastewater treatment — ${TREATMENT_LABEL_BY_TIER[tier as WaterSanitationTier] ?? `Tier ${tier}`}${backlogNote}`
    );
    html +=
      `<g data-burg-id="${burg.i}" opacity="${opacity}">` +
      `<title>${title}</title>` +
      `<circle cx="${burg.x}" cy="${burg.y}" r="2.6" fill="#e8ded1" stroke="${SEWER_STROKE}" stroke-width="0.6"/>` +
      `<text x="${burg.x}" y="${(burg.y ?? 0) + 1.1}" font-size="3.4px" text-anchor="middle">${icon}</text>` +
      `</g>`;
  }
  return html;
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
  return route.points.map(([x, y], index) => `${index ? "L" : "M"} ${x},${y}`).join(" ");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}
