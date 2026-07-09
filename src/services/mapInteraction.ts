import * as d3 from "d3";
import { worldContext } from "../context/worldContext";
import { useToastStore } from "../store/toastStore";
import type { WebglPickDetail } from "../types/webglPicking";
import { debounce } from "../utils/commonUtils";
import { isDialogVisible } from "../utils/domUtils";
import { findCell, findGridCell } from "../utils/graphUtils";
import { convertTemperature } from "../utils/unitUtils";
import { getFriendlyHeight, getFriendlyPrecipitation, getPopulationTip, updateCellInfo } from "./cellInfoService";
import { showMainTip, showMapTooltip, showNotes, tip } from "./tooltipService";

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

function formatWebglPickTooltip(detail: WebglPickDetail): string {
  if (detail.kind === "background") return "Ocean";
  if (detail.kind === "river") return formatRiverTooltip(detail.id);
  if (detail.kind === "route") return formatRouteTooltip(detail.id);
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

function getCellPoliticalSummary(cellId: number): string {
  const stateId = worldContext.pack.cells.state[cellId];
  if (!stateId) return "";

  const stateName = getStateName(stateId);
  const provinceId = worldContext.pack.cells.province[cellId];
  if (!provinceId) return stateName;
  return `${getProvinceName(provinceId)}, ${stateName}`;
}

function getStateName(stateId: number): string {
  const state = worldContext.pack.states[stateId];
  return state?.fullName || state?.name || `State ${stateId}`;
}

function getProvinceName(provinceId: number): string {
  const province = worldContext.pack.provinces[provinceId];
  return province?.fullName || province?.name || `Province ${provinceId}`;
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

  d3.select("#debug")
    .append("polygon")
    .attr("class", "webgl-selected")
    .attr("points", points)
    .attr("fill", "none")
    .attr("stroke", "#d0240f")
    .attr("stroke-width", 1.25)
    .attr("vector-effect", "non-scaling-stroke")
    .attr("pointer-events", "none");
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
