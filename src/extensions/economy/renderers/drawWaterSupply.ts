import type { Burg } from "../../hostTypes";
import { getRegionalWaterSchemes, getUrbanWaterSystems, getWaterSupplyLayer, getWorldContext } from "../economyContext";
import { raceKeyForBurgState } from "../generators/resolveBurgCulture";
import { getSeasonalColdBurgIds } from "../generators/urbanWaterClimate";
import { SOURCE_PROTECTION_MIN_FOR_FILTRATION } from "../generators/urbanWaterModernTreatment";
import {
  buildAqueductTree,
  buildInheritedWaterSupplyRoutes,
  type InheritedWaterSupplyRoute
} from "../generators/urbanWaterSupply";
import type { RegionalWaterScheme, UrbanWaterSystem, WaterSanitationTier } from "../generators/urbanWaterTypes";

const OUTER_STROKE = "#f5e6b3";
const WATER_STROKE = "#1677a8";
const INTAKE_STROKE = "#0b4f6c";

/**
 * Modern Phase 2/4 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §12.4, §15): the
 * drinking-water counterpart of drawSewerage.ts's treatmentPlantMarkup() — a small marker at every
 * ordinary (non-Giant-route) Burg with drinkingTreatmentTier >= 1, styled by tier, plus a lighter
 * marker for a Burg that has secured `sourceProtection` (§13.1) but has not yet reached Tier 1.
 * Added §20.5 (2026-08-23): before this, drinkingTreatmentTier's generation-time/annual progress
 * had NO visual representation on the "Water and sewage" layer preset at all — only Giant aqueducts
 * and negotiated RegionalWaterSchemes drew anything on this layer, so an ordinary Burg's own
 * treatment plant was invisible regardless of its actual Tier.
 */
const DRINKING_TIER_ICON: Partial<Record<WaterSanitationTier, string>> = {
  1: "🪨",
  2: "🌀",
  3: "🧪"
};
const DRINKING_TIER_LABEL: Partial<Record<WaterSanitationTier, string>> = {
  1: "slow sand filtration",
  2: "rapid filtration / coagulation",
  3: "controlled chlorination"
};

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
  const routedBurgIds = new Set(routes.map(route => route.burgId));
  let html = routes.map(route => routeMarkup(route, pack.burgs[route.burgId]?.name ?? `Burg ${route.burgId}`)).join("");
  html += schemeRoutesMarkup(pack.burgs, pack.cells);
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
    if (routedBurgIds.has(system.burgId)) continue;
    const burg = burgs[system.burgId];
    if (!burg?.i || burg.removed) continue;

    const tier = system.drinkingTreatmentTier ?? 0;
    if (tier < 1) {
      html += protectedIntakeMarkup(burg, system);
      continue;
    }

    const funding = Math.max(0, Math.min(1, system.treatmentOperationsFunding ?? 0));
    const opacity = 1 - Math.min(0.5, (1 - funding) * 0.5);
    const icon = DRINKING_TIER_ICON[tier as WaterSanitationTier] ?? "🪨";
    const fundingNote = ` (${Math.round(funding * 100)}% funded)`;
    const title = escapeHtml(
      `${burg.name ?? `Burg ${burg.i}`}: drinking water treatment — ${DRINKING_TIER_LABEL[tier as WaterSanitationTier] ?? `Tier ${tier}`}${fundingNote}`
    );
    html +=
      `<g data-burg-id="${burg.i}" opacity="${opacity}">` +
      `<title>${title}</title>` +
      `<circle cx="${burg.x}" cy="${burg.y}" r="2.6" fill="#d9f2ff" stroke="${WATER_STROKE}" stroke-width="0.6"/>` +
      `<text x="${burg.x}" y="${(burg.y ?? 0) + 1.1}" font-size="3.4px" text-anchor="middle">${icon}</text>` +
      `</g>`;
  }
  return html;
}

/**
 * A Burg that has secured `hasUpstreamIntake` + `sourceProtection` (§13.1's own Tier 0→1
 * prerequisite threshold, SOURCE_PROTECTION_MIN_FOR_FILTRATION) but has not reached
 * drinkingTreatmentTier 1 yet — a real, valuable interim state (a protected, recorded intake earns
 * a small drinkingWaterSecurity bonus on its own) that would otherwise be entirely invisible
 * between "nothing" and the first filtration-plant marker above.
 */
function protectedIntakeMarkup(burg: Burg, system: UrbanWaterSystem): string {
  const sourceProtection = Math.max(0, Math.min(1, system.sourceProtection ?? 0));
  if (!system.hasUpstreamIntake || sourceProtection < SOURCE_PROTECTION_MIN_FOR_FILTRATION) return "";

  const title = escapeHtml(
    `${burg.name ?? `Burg ${burg.i}`}: protected intake (source protection ${Math.round(sourceProtection * 100)}%, no treatment plant yet)`
  );
  return (
    `<g data-burg-id="${burg.i}" opacity="0.75">` +
    `<title>${title}</title>` +
    `<circle cx="${burg.x}" cy="${burg.y}" r="2.2" fill="none" stroke="${INTAKE_STROKE}" stroke-width="0.6" stroke-dasharray="0.8 0.8"/>` +
    `<text x="${burg.x}" y="${(burg.y ?? 0) + 1}" font-size="2.8px" text-anchor="middle">🛡️</text>` +
    `</g>`
  );
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
