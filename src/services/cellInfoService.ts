import { worldContext } from "../context/worldContext";
import { useCellInfoState } from "../store/cellInfoState";
import type { PackedGraphFeature } from "../types/models";
import { getLatitude, getLongitude } from "../utils/commonUtils";
import { getArea, getAreaUnit } from "../utils/domUtils";
import { findCell, findGridCell } from "../utils/graphUtils";
import { rn } from "../utils/numberUtils";
import { convertTemperature, si } from "../utils/unitUtils";
import { tooltipExtensions } from "./tooltipService";

export function updateCellInfo(point: [number, number], i: number, g: number): void {
  const cells = worldContext.pack.cells;
  const pointX = String(rn(point[0]));
  const pointY = String(rn(point[1]));

  const f = cells.f[i];

  useCellInfoState.getState().updateInfo({
    cell: String(i),
    x: pointX,
    y: pointY,
    lat: toDMS(getLatitude(+pointY, worldContext.mapCoordinates, worldContext.graphHeight, 4), "lat"),
    lon: toDMS(getLongitude(+pointX, worldContext.mapCoordinates, worldContext.graphWidth, 4), "lon"),
    geozone: getGeozone(getLatitude(+pointY, worldContext.mapCoordinates, worldContext.graphHeight, 4)),
    area: cells.area[i] ? `${si(getArea(cells.area[i]))} ${getAreaUnit()}` : "n/a",
    elevation: getElevation(worldContext.pack.features[f], worldContext.pack.cells.h[i]),
    depth: getDepth(worldContext.pack.features[f], point),
    temp: convertTemperature(worldContext.grid.cells.temp[g]),
    prec: cells.h[i] >= 20 ? getFriendlyPrecipitation(i) : "n/a",
    river: cells.h[i] >= 20 && cells.r[i] ? getRiverInfo(cells.r[i]) : "no",
    state:
      cells.h[i] >= 20
        ? cells.state[i]
          ? `${worldContext.pack.states[cells.state[i]].fullName} (${cells.state[i]})`
          : "neutral lands (0)"
        : "no",
    province: cells.province[i]
      ? `${worldContext.pack.provinces[cells.province[i]].fullName} (${cells.province[i]})`
      : "no",
    culture: cells.culture[i] ? `${worldContext.pack.cultures[cells.culture[i]].name} (${cells.culture[i]})` : "no",
    religion: cells.religion[i]
      ? `${worldContext.pack.religions[cells.religion[i]].name} (${cells.religion[i]})`
      : "no",
    population: getFriendlyPopulation(i),
    burg: cells.burg[i] ? `${worldContext.pack.burgs[cells.burg[i]].name} (${cells.burg[i]})` : "no",
    feature: f ? `${worldContext.pack.features[f].group} (${f})` : "n/a",
    biome: worldContext.biomesData.name[cells.biome[i]]
  });

  tooltipExtensions.updateCellInfo?.(point, i, g);
}
export function getGeozone(latitude: number): string {
  if (latitude > 66.5) return "Arctic";
  if (latitude > 35) return "Temperate North";
  if (latitude > 23.5) return "Subtropical North";
  if (latitude > 1) return "Tropical North";
  if (latitude > -1) return "Equatorial";
  if (latitude > -23.5) return "Tropical South";
  if (latitude > -35) return "Subtropical South";
  if (latitude > -66.5) return "Temperate South";
  return "Antarctic";
}
export function toDMS(coord: number, c: "lat" | "lon"): string {
  const degrees = Math.floor(Math.abs(coord));
  const minutesNotTruncated = (Math.abs(coord) - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = Math.floor((minutesNotTruncated - minutes) * 60);
  const cardinal = c === "lat" ? (coord >= 0 ? "N" : "S") : coord >= 0 ? "E" : "W";
  return `${degrees}°${minutes}′${seconds}″${cardinal}`;
}
export function getElevation(f: PackedGraphFeature, h: number): string {
  if (f.land) return `${getHeight(h)} (${h})`;
  if (f.border) return `0 ${heightUnit.value}`;
  if (f.type === "lake") return `${getHeight(f.height)} (${f.height})`;
  return "";
}
export function getDepth(f: PackedGraphFeature, p: [number, number]): string {
  if (f.land) return `0 ${heightUnit.value}`;

  const gridH = worldContext.grid.cells.h[findGridCell(p[0], p[1], worldContext.grid)];
  if (f.type === "lake") {
    const depth = gridH === 19 ? f.height / 2 : gridH;
    return getHeight(depth, "abs");
  }

  return getHeight(gridH, "abs");
}
export function getFriendlyHeight([x, y]: [number, number]): string {
  const packH = worldContext.pack.cells.h[findCell(x, y)];
  const gridH = worldContext.grid.cells.h[findGridCell(x, y, worldContext.grid)];
  const h = packH < 20 ? gridH : packH;
  return getHeight(h);
}
export function getHeight(h: number, abs?: string): string {
  const unit = heightUnit.value;
  let unitRatio = 3.281;
  if (unit === "m") unitRatio = 1;
  else if (unit === "f") unitRatio = 0.5468;

  let height = -990;
  if (h >= 20) height = (h - 18) ** +heightExponentInput.value;
  else if (h < 20 && h > 0) height = ((h - 20) / h) * 50;

  if (abs) height = Math.abs(height);
  return `${rn(height * unitRatio)} ${unit}`;
}
export function getPrecipitation(prec: number): string {
  return `${prec * 100} mm`;
}
export function getFriendlyPrecipitation(i: number): string {
  const prec = worldContext.grid.cells.prec[worldContext.pack.cells.g[i]];
  return getPrecipitation(prec);
}
export function getRiverInfo(id: number): string {
  const r = worldContext.pack.rivers.find(r => r.i === id);
  return r ? `${r.name} ${r.type} (${id})` : "n/a";
}
export function getCellPopulation(i: number): [number, number] {
  const rural = worldContext.pack.cells.pop[i] * worldContext.populationRate;
  const urban = worldContext.pack.cells.burg[i]
    ? (worldContext.pack.burgs[worldContext.pack.cells.burg[i]].population ?? 0) *
      worldContext.populationRate *
      worldContext.urbanization
    : 0;
  return [rural, urban];
}
export function getFriendlyPopulation(i: number): string {
  const [rural, urban] = getCellPopulation(i);
  return `${si(rural + urban)} (${si(rural)} rural, urban ${si(urban)})`;
}
export function getPopulationTip(i: number): string {
  const [rural, urban] = getCellPopulation(i);
  return `Cell population: ${si(rural + urban)}; Rural: ${si(rural)}; Urban: ${si(urban)}`;
}
