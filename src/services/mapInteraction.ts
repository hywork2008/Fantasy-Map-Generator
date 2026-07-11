import * as d3 from "d3";
import { worldContext } from "../context/worldContext";
import { useToastStore } from "../store/toastStore";
import type { WebglPickCandidatesDetail, WebglPickDetail } from "../types/webglPicking";
import { debounce } from "../utils/commonUtils";
import { isDialogVisible } from "../utils/domUtils";
import { findCell, findGridCell } from "../utils/graphUtils";
import { convertTemperature } from "../utils/unitUtils";
import {
  getCellPoliticalSummary,
  getFriendlyHeight,
  getFriendlyPrecipitation,
  getPopulationTip,
  getProvinceName,
  getStateName,
  updateCellInfo
} from "./cellInfoService";
import { showMainTip, showMapTooltip, showNotes, tip } from "./tooltipService";

const PICK_CHOOSER_ID = "mapPickChooser";
const PICK_CHOOSER_CLICK_SUPPRESSION_MS = 500;
const PICK_CHOOSER_CLICK_SUPPRESSION_DISTANCE = 4;
// These kinds are picked implicitly under almost every click (the land cell, its owning state,
// its border) and would otherwise dominate the chooser list with entries the user rarely wants
// to disambiguate on.
const PICK_CHOOSER_HIDDEN_KINDS = new Set<WebglPickDetail["kind"]>(["land", "state", "border"]);
let suppressedChooserClick: { clientX: number; clientY: number; expiresAt: number } | null = null;

export const onMouseMove = debounce(handleMouseMove as (event: MouseEvent) => void, 100);
export function handleMouseMove(this: Element, event: MouseEvent): void {
  const point = d3.pointer(event, this) as [number, number];
  const i = findCell(point[0], point[1]);
  if (i === undefined) return;

  showNotes(event);
  const gridCell = findGridCell(point[0], point[1], worldContext.grid);
  const store = useToastStore.getState();
  const hasMainToast = store.getMainToast() !== null;

  if (hasMainToast) showMainTip();
  else showMapTooltip(point, event, i, gridCell);

  if (isDialogVisible("cellInfo")) {
    const cellInfoEl = document.getElementById("cellInfo") as HTMLElement | null;
    if (cellInfoEl) updateCellInfo(point, i, gridCell);
  }
}

document.addEventListener("fmg:webgl-map-hover", (event: CustomEvent<WebglPickDetail | null>) => {
  const detail = event.detail;
  if (!detail) return tip("");
  tip(formatWebglPickTooltip(detail));
});

document.addEventListener("fmg:webgl-map-pick", (event: CustomEvent<WebglPickDetail | null>) => {
  drawWebglSelectionHighlight(event.detail);
});

document.addEventListener("fmg:webgl-map-pick-candidates", (event: CustomEvent<WebglPickCandidatesDetail>) => {
  const { primary, candidates, clientX, clientY } = event.detail;
  const chooserCandidates =
    candidates.length > 1
      ? dedupePickCandidates(candidates.filter(candidate => !PICK_CHOOSER_HIDDEN_KINDS.has(candidate.kind)))
      : [];
  if (chooserCandidates.length > 0) {
    suppressNextChooserClick(clientX, clientY);
    showPickChooser(chooserCandidates, clientX, clientY);
  } else {
    suppressedChooserClick = null;
    hidePickChooser();
    if (primary && isSingleClickEditablePick(primary)) {
      suppressNextChooserClick(clientX, clientY);
      document.dispatchEvent(
        new CustomEvent<WebglPickDetail>("fmg:webgl-map-pick-candidate-selected", { detail: primary })
      );
    }
  }
});

export function shouldSuppressWebglPickChooserClick(event: MouseEvent): boolean {
  if (!suppressedChooserClick) return false;
  if (performance.now() > suppressedChooserClick.expiresAt) {
    suppressedChooserClick = null;
    return false;
  }

  const distance = Math.hypot(
    event.clientX - suppressedChooserClick.clientX,
    event.clientY - suppressedChooserClick.clientY
  );
  if (distance > PICK_CHOOSER_CLICK_SUPPRESSION_DISTANCE) return false;

  suppressedChooserClick = null;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function suppressNextChooserClick(clientX: number, clientY: number): void {
  suppressedChooserClick = {
    clientX,
    clientY,
    expiresAt: performance.now() + PICK_CHOOSER_CLICK_SUPPRESSION_MS
  };
}

function isSingleClickEditablePick(detail: WebglPickDetail): boolean {
  return (
    detail.kind === "burgIcon" ||
    detail.kind === "marker" ||
    detail.kind === "military" ||
    detail.kind === "river" ||
    detail.kind === "route" ||
    detail.kind === "lake" ||
    detail.kind === "coastline" ||
    detail.kind === "ice"
  );
}

/**
 * Collapses candidates that resolve to the same editable entity so the chooser doesn't list it
 * twice. Rivers are picked per bank-to-bank segment (`river-segment-{index}-{river.i}`, see
 * buildRiverPolygons in deckDataAdapters.ts), so a single click can return several segments of
 * the same river; they all open the same River Editor, so only the first is kept.
 */
function dedupePickCandidates(candidates: WebglPickDetail[]): WebglPickDetail[] {
  const seen = new Set<string>();
  const result: WebglPickDetail[] = [];
  for (const candidate of candidates) {
    const key = pickCandidateEntityKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function pickCandidateEntityKey(candidate: WebglPickDetail): string {
  if (candidate.kind === "river") {
    const riverId = parseTrailingNumber(candidate.id);
    if (riverId !== null) return `river-${riverId}`;
  }
  return `${candidate.kind}-${candidate.id}`;
}

function formatWebglPickTooltip(detail: WebglPickDetail): string {
  if (detail.kind === "background") return "Ocean";
  if (detail.kind === "river") return formatRiverTooltip(detail.id);
  if (detail.kind === "route") return formatRouteTooltip(detail.id);
  if (detail.kind === "lake") return formatFeatureTooltip(detail.id, "Lake");
  if (detail.kind === "coastline") return formatFeatureTooltip(detail.id, "Coastline");
  if (detail.kind === "ice") return detail.id.startsWith("glacier-") ? "Glacier" : "Iceberg";
  if (detail.kind === "emblem") return formatEmblemTooltip(detail.id);
  if (detail.kind === "burgIcon") return formatBurgIconTooltip(detail.id);
  if (detail.kind === "marker") return formatMarkerTooltip(detail.id);
  if (detail.kind === "military") return formatMilitaryTooltip(detail.id);
  if (detail.kind === "label") return formatLabelTooltip(detail.id);
  if (detail.kind === "border") return formatBorderTooltip(detail);

  const cellId = detail.cellId;
  if (cellId === null) return getFallbackPickTooltip(detail);

  switch (detail.kind) {
    case "land":
      return getCellPoliticalSummary(cellId) || "Land";
    case "height": {
      const point = getPickPoint(detail, cellId);
      return `Height: ${getFriendlyHeight(point)}`;
    }
    case "biome":
      return formatBiomeTooltip(cellId);
    case "culture":
      return formatCultureTooltip(cellId);
    case "religion":
      return formatReligionTooltip(cellId);
    case "state":
    case "province":
      return getCellPoliticalSummary(cellId) || getFallbackPickTooltip(detail);
    case "temperature": {
      const gridCell = worldContext.pack.cells.g[cellId];
      return `Temperature: ${convertTemperature(worldContext.grid.cells.temp[gridCell])}`;
    }
    case "population":
      return getPopulationTip(cellId);
    case "precipitation":
      return `Annual Precipitation: ${getFriendlyPrecipitation(cellId)}`;
    case "danger":
      return `Danger: ${worldContext.pack.cells.danger[cellId] ?? 0}`;
    case "cell":
    case "grid":
      return getCellPoliticalSummary(cellId) || `Cell ${cellId}`;
    case "zone":
      return formatZoneTooltip(cellId);
    default:
      return getFallbackPickTooltip(detail);
  }
}

function formatFeatureTooltip(id: string, fallback: string): string {
  const featureId = parseTrailingNumber(id);
  const feature = featureId === null ? undefined : worldContext.pack.features[featureId];
  if (!feature) return fallback;
  return feature.name ? `${feature.name} ${feature.type}` : `${capitalize(feature.group || feature.type)} ${feature.i}`;
}

function formatRiverTooltip(id: string): string {
  const riverId = parseTrailingNumber(id);
  const river = riverId === null ? undefined : worldContext.pack.rivers.find(item => item.i === riverId);
  if (!river) return "River";
  return `${river.name} ${river.type}. Click to inspect`;
}

function formatRouteTooltip(id: string): string {
  const routeId = parseTrailingNumber(id);
  const route = routeId === null ? undefined : worldContext.pack.routes.find(item => item.i === routeId);
  if (!route) return "Route";
  return route.name
    ? `${route.name}. Click to inspect the route`
    : `${capitalize(route.group)} route. Click to inspect`;
}

function formatBorderTooltip(detail: WebglPickDetail): string {
  const cells = parseCellPair(detail.id);
  if (!cells) return detail.cellId === null ? "Border" : getCellPoliticalSummary(detail.cellId) || "Border";

  const [fromCell, toCell] = cells;
  const fromStateId = worldContext.pack.cells.state[fromCell];
  const toStateId = worldContext.pack.cells.state[toCell];
  if (fromStateId && toStateId && fromStateId !== toStateId) {
    return `State border: ${getStateName(fromStateId)} / ${getStateName(toStateId)}`;
  }

  const fromProvinceId = worldContext.pack.cells.province[fromCell];
  const toProvinceId = worldContext.pack.cells.province[toCell];
  if (fromProvinceId && toProvinceId && fromProvinceId !== toProvinceId) {
    return `Province border: ${getProvinceName(fromProvinceId)} / ${getProvinceName(toProvinceId)}`;
  }

  return detail.cellId === null ? "Border" : getCellPoliticalSummary(detail.cellId) || "Border";
}

function formatEmblemTooltip(id: string): string {
  const emblem = parseTypedId(id);
  if (!emblem) return "Emblem";
  const [type, itemId] = emblem;
  if (type === "burg") return worldContext.pack.burgs[itemId]?.name ?? `Burg ${itemId}`;
  if (type === "province") return getProvinceName(itemId);
  if (type === "state") return getStateName(itemId);
  return "Emblem";
}

function formatBurgIconTooltip(id: string): string {
  const [, itemId] = parseTypedId(id) ?? [];
  if (!itemId) return "Burg";
  const burg = worldContext.pack.burgs[itemId];
  if (!burg) return `Burg ${itemId}`;
  const name = burg.name ?? `Burg ${itemId}`;
  return id.startsWith("anchor-") ? `${name} port` : name;
}

function formatMarkerTooltip(id: string): string {
  const markerId = parseTrailingNumber(id);
  const marker = markerId === null ? undefined : worldContext.pack.markers.find(item => item.i === markerId);
  if (!marker) return "Marker";
  const note = worldContext.notes.find(item => item.id === `marker${marker.i}`);
  return note?.name || marker.type || `Marker ${marker.i}`;
}

function formatMilitaryTooltip(id: string): string {
  const parts = id.split("-");
  const stateId = Number(parts[1]);
  const regimentId = Number(parts[2]);
  if (!Number.isFinite(stateId) || !Number.isFinite(regimentId)) return "Regiment";
  const regiment = worldContext.pack.states[stateId]?.military?.find(item => item.i === regimentId);
  return regiment?.name ?? `Regiment ${regimentId}`;
}

function formatLabelTooltip(id: string): string {
  const label = parseTypedId(id.replace("-label-", "-"));
  if (!label) return "Label";
  const [type, itemId] = label;
  if (type === "state") return getStateName(itemId);
  if (type === "burg") return worldContext.pack.burgs[itemId]?.name ?? `Burg ${itemId}`;
  return "Label";
}

function parseTypedId(id: string): [string, number] | null {
  const [type, rawId] = id.split("-");
  const itemId = Number(rawId);
  return type && Number.isFinite(itemId) ? [type, itemId] : null;
}

function formatBiomeTooltip(cellId: number): string {
  const biomeId = worldContext.pack.cells.biome[cellId];
  const name = worldContext.biomesData.name[biomeId] ?? `Biome ${biomeId}`;
  return `Biome: ${name}`;
}

function formatCultureTooltip(cellId: number): string {
  const cultureId = worldContext.pack.cells.culture[cellId];
  const culture = worldContext.pack.cultures[cultureId];
  return culture?.name ? `Culture: ${culture.name}` : `Culture ${cultureId}`;
}

function formatReligionTooltip(cellId: number): string {
  const religionId = worldContext.pack.cells.religion[cellId];
  const religion = worldContext.pack.religions[religionId];
  if (!religion) return `Religion ${religionId}`;
  const type = religion.type === "Cult" || religion.type === "Heresy" ? religion.type : `${religion.type} religion`;
  return `${type}: ${religion.name}`;
}

function formatZoneTooltip(cellId: number): string {
  const zone = worldContext.pack.zones.find(item => !item.hidden && item.cells.includes(cellId));
  return zone?.name ?? "Zone";
}

function getFallbackPickTooltip(detail: WebglPickDetail): string {
  const suffix = detail.cellId === null ? "" : ` cell ${detail.cellId}`;
  return `${capitalize(detail.kind)} ${detail.id}${suffix}`;
}

function getPickPoint(detail: WebglPickDetail, cellId: number): [number, number] {
  if (detail.coordinate) return [detail.coordinate[0], detail.coordinate[1]];
  return worldContext.pack.cells.p[cellId] ?? [0, 0];
}

function drawWebglSelectionHighlight(detail: WebglPickDetail | null): void {
  d3.select("#debug").selectAll(".webgl-selected").remove();
  if (!detail || detail.cellId === null) return;

  const vertexIds = worldContext.pack.cells.v[detail.cellId] ?? [];
  const points = vertexIds
    .map(vertexId => worldContext.pack.vertices.p[vertexId])
    .filter((point): point is [number, number] => Boolean(point))
    .map(point => point.join(","))
    .join(" ");
  if (!points) return;

  // Styling (stroke/fill) comes from `#debug polygon.webgl-selected` in public/index.css, the same
  // rule used by the SVG province selection highlight (`#debug path.selected` in draw-provinces.ts)
  // so WebGL pick selection reads as the same visual language, not a separate debug-only marker.
  d3.select("#debug")
    .append("polygon")
    .attr("class", "webgl-selected")
    .attr("points", points)
    .attr("vector-effect", "non-scaling-stroke")
    .attr("pointer-events", "none");
}

function showPickChooser(candidates: WebglPickDetail[], clientX: number, clientY: number): void {
  const chooser = getOrCreatePickChooser();
  chooser.replaceChildren();

  const header = document.createElement("div");
  header.className = "map-pick-chooser__header";
  header.textContent = `${candidates.length} selectable objects`;
  chooser.append(header);

  const list = document.createElement("div");
  list.className = "map-pick-chooser__list";
  chooser.append(list);

  for (const candidate of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-pick-chooser__item";
    button.dataset.kind = candidate.kind;
    button.dataset.pickId = candidate.id;

    const title = document.createElement("span");
    title.className = "map-pick-chooser__title";
    title.textContent = formatWebglPickTooltip(candidate);

    const meta = document.createElement("span");
    meta.className = "map-pick-chooser__meta";
    meta.textContent = `${candidate.kind} · ${candidate.id}`;

    button.append(title, meta);
    button.addEventListener("click", event => {
      event.stopPropagation();
      hidePickChooser();
      drawWebglSelectionHighlight(candidate);
      document.dispatchEvent(
        new CustomEvent<WebglPickDetail>("fmg:webgl-map-pick-candidate-selected", { detail: candidate })
      );
    });
    list.append(button);
  }

  document.addEventListener("keydown", handlePickChooserKeydown);
  document.addEventListener("pointerdown", handleOutsidePickChooserPointerDown);
  positionPickChooser(chooser, clientX, clientY);
}

function getOrCreatePickChooser(): HTMLDivElement {
  const existing = document.getElementById(PICK_CHOOSER_ID);
  if (existing instanceof HTMLDivElement) {
    existing.hidden = false;
    return existing;
  }

  const chooser = document.createElement("div");
  chooser.id = PICK_CHOOSER_ID;
  chooser.className = "map-pick-chooser";
  chooser.hidden = false;
  document.body.append(chooser);
  return chooser;
}

function positionPickChooser(chooser: HTMLDivElement, clientX: number, clientY: number): void {
  chooser.style.left = "0px";
  chooser.style.top = "0px";
  const margin = 8;
  const offset = 12;
  const rect = chooser.getBoundingClientRect();
  const left = Math.min(Math.max(clientX + offset, margin), window.innerWidth - rect.width - margin);
  const top = Math.min(Math.max(clientY + offset, margin), window.innerHeight - rect.height - margin);
  chooser.style.left = `${Math.round(left)}px`;
  chooser.style.top = `${Math.round(top)}px`;
}

function hidePickChooser(): void {
  const chooser = document.getElementById(PICK_CHOOSER_ID);
  if (chooser) chooser.hidden = true;
  document.removeEventListener("keydown", handlePickChooserKeydown);
  document.removeEventListener("pointerdown", handleOutsidePickChooserPointerDown);
}

function handlePickChooserKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") hidePickChooser();
}

function handleOutsidePickChooserPointerDown(event: PointerEvent): void {
  const chooser = document.getElementById(PICK_CHOOSER_ID);
  if (!chooser || chooser.hidden || chooser.contains(event.target as Node | null)) return;
  hidePickChooser();
}

function parseTrailingNumber(id: string): number | null {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function parseCellPair(id: string): [number, number] | null {
  const match = id.match(/(\d+)-(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
