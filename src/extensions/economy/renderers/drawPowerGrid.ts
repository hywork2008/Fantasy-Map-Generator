import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getDams, getGasPowerStations, getPowerGridLayer, getPowerStations, getWorldContext } from "../economyContext";
import type { Dam } from "../generators/damTypes";
import type { GasPowerStation, PowerStation } from "../generators/electricalTypes";

const STATION_FILL = "#fff3cc";
const STATION_STROKE = "#8a5a00";
const LINE_STROKE = "#e0a800";
const HUB_FILL = "#fff0b3";
const INACTIVE_OPACITY = 0.4;
const TRIAL_OPACITY = 0.7;

/**
 * A generation site feeding the electricity pool: a coal PowerStation, a gas-fired
 * GasPowerStation, or an electrified, active Dam (docs/plan/electric-power-and-telegraph.md
 * §3.9-§3.10, docs/plan/natural-gas-lng-power-generation.md §3.9-§3.10 — PowerGridInvestment
 * pools all three the same way). Keyed by burgId, the same sponsor/market association the
 * simulation itself uses; a Dam's own physical siteId/location is left to the Dams layer
 * (drawDams.ts) — this layer is about grid connectivity, not restating the dam icon.
 */
interface GenerationSite {
  burgId: number;
  stateId: number;
  kind: "coal" | "gas" | "hydro";
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  generationCapacity: number;
}

/**
 * Visualizes the roadmap §9.3 "送電網・電力事業" node, which previously had no map representation:
 * a ⚡ marker at every Burg hosting an active PowerStation, GasPowerStation, or electrified Dam
 * (発電所), plus —
 * once a State's `powerGrid` technology reaches `adopted` — schematic hub-and-spoke transmission
 * lines from every active generation site to that State's capital Burg (送電網). The capital is the
 * only plausible hub to draw a line to: `PowerGridInvestment` (§3.10) has no persisted line-by-line
 * route geometry, only a per-Market/per-State capacity pool, so a single administrative hub per
 * State is the honest schematic rather than fabricating point-to-point routes the data model does
 * not have. Before `powerGrid` is adopted, PowerGridInvestment only serves a plant's own Market
 * (§3.10 "Before powerGrid: only PowerStations sharing this exact market can serve it"), so no
 * lines are drawn — the station marker alone already represents its (local-only) supply.
 */
export function drawPowerGrid(): void {
  const layer = getPowerGridLayer();
  if (!layer) return;

  const world = getWorldContext();
  const { pack } = world;
  const burgs = pack.burgs ?? [];
  const states = pack.states ?? [];

  const sites = collectGenerationSites(burgs);
  let html = transmissionLinesMarkup(sites, burgs, states);
  html += sites.map(site => stationMarkup(site, burgs[site.burgId])).join("");

  layer.html(html);
  layer.style("display", null);
}

function collectGenerationSites(burgs: readonly (Burg | undefined)[]): GenerationSite[] {
  const sites: GenerationSite[] = [];

  const fromStation = (plant: PowerStation): GenerationSite => ({
    burgId: plant.burgId,
    stateId: plant.stateId,
    kind: "coal",
    role: plant.role,
    active: plant.active,
    utilization: plant.utilization,
    generationCapacity: plant.generationCapacity
  });
  const fromGasStation = (plant: GasPowerStation): GenerationSite => ({
    burgId: plant.burgId,
    stateId: plant.stateId,
    kind: "gas",
    role: plant.role,
    active: plant.active,
    utilization: plant.utilization,
    generationCapacity: plant.generationCapacity
  });
  const fromDam = (dam: Dam): GenerationSite => ({
    burgId: dam.burgId,
    stateId: dam.stateId,
    kind: "hydro",
    role: dam.role,
    active: dam.active,
    utilization: dam.utilization,
    generationCapacity: dam.generationCapacity
  });

  for (const plant of getPowerStations()) {
    const burg = burgs[plant.burgId];
    if (!burg?.i || burg.removed) continue;
    sites.push(fromStation(plant));
  }
  for (const plant of getGasPowerStations()) {
    const burg = burgs[plant.burgId];
    if (!burg?.i || burg.removed) continue;
    sites.push(fromGasStation(plant));
  }
  for (const dam of getDams()) {
    if (!dam.electrified) continue;
    const burg = burgs[dam.burgId];
    if (!burg?.i || burg.removed) continue;
    sites.push(fromDam(dam));
  }
  return sites;
}

function siteOpacity(site: GenerationSite): number {
  if (!site.active) return INACTIVE_OPACITY;
  return site.role === "trial" ? TRIAL_OPACITY : 1;
}

function stationMarkup(site: GenerationSite, burg: Burg | undefined): string {
  if (!burg?.i) return "";
  const opacity = siteOpacity(site);
  const icon = site.kind === "hydro" ? "💧⚡" : site.kind === "gas" ? "🔥⚡" : "⚡";
  const statusLabel = !site.active ? "idle" : site.role === "trial" ? "trial" : "in service";
  const fuel = site.kind === "hydro" ? "hydroelectric" : site.kind === "gas" ? "gas-fired" : "coal-fired";
  const title = escapeHtml(
    `${burg.name ?? `Burg ${burg.i}`}: ${fuel} power station — ${statusLabel}` +
      (site.active
        ? `, ${rn(site.generationCapacity, 2)} generation capacity (${rn(site.utilization * 100, 0)}% utilization)`
        : "")
  );
  return (
    `<g data-burg-id="${burg.i}" data-kind="${site.kind}" opacity="${opacity}">` +
    `<title>${title}</title>` +
    `<circle cx="${burg.x}" cy="${burg.y}" r="2.6" fill="${STATION_FILL}" stroke="${STATION_STROKE}" stroke-width="0.6"/>` +
    `<text x="${burg.x}" y="${(burg.y ?? 0) + 1.1}" font-size="3.2px" text-anchor="middle">${icon}</text>` +
    `</g>`
  );
}

function transmissionLinesMarkup(
  sites: readonly GenerationSite[],
  burgs: readonly (Burg | undefined)[],
  states: readonly (State | undefined)[]
): string {
  const sitesByState = new Map<number, GenerationSite[]>();
  for (const site of sites) {
    if (!site.active || !site.stateId) continue;
    const bucket = sitesByState.get(site.stateId);
    if (bucket) bucket.push(site);
    else sitesByState.set(site.stateId, [site]);
  }

  let html = "";
  for (const [stateId, stateSites] of sitesByState) {
    if (!isTechnologyStageAtLeast(getTechnologyStage("powerGrid", stateId), "adopted")) continue;

    const state = states[stateId];
    const capitalId = state?.capital;
    const capitalBurg = capitalId ? burgs[capitalId] : undefined;
    if (!capitalBurg?.i || capitalBurg.removed) continue;

    const stateName = state?.name ?? `State ${stateId}`;
    const seenBurgIds = new Set<number>();
    let hasFeeder = false;
    for (const site of stateSites) {
      if (site.burgId === capitalId || seenBurgIds.has(site.burgId)) continue;
      const burg = burgs[site.burgId];
      if (!burg?.i || burg.removed) continue;
      seenBurgIds.add(site.burgId);
      hasFeeder = true;
      html += transmissionLineMarkup(burg, capitalBurg, site, stateName);
    }

    // Only mark the capital as a grid hub once it actually has at least one feeder line (or is
    // itself a generation site — then the station marker alone already conveys it).
    if (hasFeeder || stateSites.some(site => site.burgId === capitalId)) {
      html += gridHubMarkup(capitalBurg, stateName);
    }
  }
  return html;
}

function transmissionLineMarkup(burg: Burg, capitalBurg: Burg, site: GenerationSite, stateName: string): string {
  const opacity = siteOpacity(site);
  const title = escapeHtml(
    `Transmission line: ${burg.name ?? `Burg ${burg.i}`} → ${capitalBurg.name ?? `Burg ${capitalBurg.i}`} (${stateName} power grid)`
  );
  return (
    `<g data-source-burg-id="${burg.i}" data-hub-burg-id="${capitalBurg.i}" opacity="${opacity}">` +
    `<title>${title}</title>` +
    `<path d="M ${burg.x},${burg.y} L ${capitalBurg.x},${capitalBurg.y}" fill="none" stroke="${LINE_STROKE}" ` +
    `stroke-width="0.7" stroke-dasharray="1.6 1.2" stroke-linecap="round"/>` +
    `</g>`
  );
}

function gridHubMarkup(capitalBurg: Burg, stateName: string): string {
  const title = escapeHtml(`${capitalBurg.name ?? `Burg ${capitalBurg.i}`}: ${stateName} power grid hub`);
  return (
    `<g data-hub-burg-id="${capitalBurg.i}">` +
    `<title>${title}</title>` +
    `<circle cx="${capitalBurg.x}" cy="${capitalBurg.y}" r="3.6" fill="none" stroke="${LINE_STROKE}" stroke-width="0.6" stroke-dasharray="0.8 0.8"/>` +
    `<circle cx="${capitalBurg.x}" cy="${capitalBurg.y}" r="1.6" fill="${HUB_FILL}" stroke="${STATION_STROKE}" stroke-width="0.5"/>` +
    `</g>`
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}
