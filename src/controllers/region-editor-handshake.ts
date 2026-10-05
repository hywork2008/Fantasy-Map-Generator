import { worldContext } from "../context/worldContext";
import type { Point, RegionSiteDescriptor } from "../region-editor/core/types";
import { REGION_SITE_KEY, REGION_SITE_VERSION } from "../region-editor/core/types";
import { tip } from "../services/tooltipService";
import type { Province, River } from "../types/models";

/**
 * FMG の指定された Province（または State）から RegionSiteDescriptor を構築する
 */
export function buildRegionSiteDescriptor(provinceId: number): RegionSiteDescriptor | null {
  const { pack, seed, distanceScale, biomesData } = worldContext;
  const province = pack.provinces[provinceId] as Province | undefined;
  if (!province || province.removed) {
    return null;
  }

  const state = pack.states[province.state];
  const { cells } = pack;

  // 1. 対象 Province に所属するセルを抽出
  const provinceCellIds: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const i of cells.i) {
    if (cells.province[i] === provinceId) {
      provinceCellIds.push(i);
      const [x, y] = cells.p[i];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (provinceCellIds.length === 0) return null;

  // 15% のマージンを付加
  const dx = maxX - minX;
  const dy = maxY - minY;
  const marginX = Math.max(dx * 0.15, 20);
  const marginY = Math.max(dy * 0.15, 20);

  minX = Math.max(0, minX - marginX);
  minY = Math.max(0, minY - marginY);
  maxX = Math.min(worldContext.graphWidth || 1000, maxX + marginX);
  maxY = Math.min(worldContext.graphHeight || 1000, maxY + marginY);

  const extentWidth = maxX - minX;
  const extentHeight = maxY - minY;

  // 距離スケール（km / mapUnit -> メートル換算）
  const metersPerMapUnit = (distanceScale || 1) * 1000;

  // 2. 範囲内の Burgs を抽出
  const regionBurgs: RegionSiteDescriptor["burgs"] = [];
  for (const b of pack.burgs) {
    if (!b?.i || b.removed) continue;
    if (b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY) {
      regionBurgs.push({
        id: b.i,
        name: b.name || "Unnamed",
        point: [b.x, b.y],
        population: b.population ?? 1000,
        capital: Boolean(b.capital),
        port: Boolean(b.port),
        walls: Boolean(b.walls),
        citadel: Boolean(b.citadel)
      });
    }
  }

  // 3. 範囲内の河川を抽出
  const regionRivers: RegionSiteDescriptor["rivers"] = [];
  if (pack.rivers) {
    for (const r of pack.rivers as River[]) {
      if (!r?.i) continue;
      // セル座標から流路ポイントを抽出
      const riverPoints: Point[] = [];
      if (r.cells) {
        for (const c of r.cells) {
          const pt = cells.p[c];
          if (pt && pt[0] >= minX - 10 && pt[0] <= maxX + 10 && pt[1] >= minY - 10 && pt[1] <= maxY + 10) {
            riverPoints.push([pt[0], pt[1]]);
          }
        }
      }
      if (riverPoints.length >= 2) {
        regionRivers.push({
          id: r.i,
          name: r.name || `River ${r.i}`,
          points: riverPoints,
          widthMeters: Math.max(r.width || 4, 1) * 40,
          dischargeM3s: r.discharge || 50
        });
      }
    }
  }

  // 4. セルのサンプリング（標高・バイオーム）
  const sampledCells: RegionSiteDescriptor["cells"] = [];
  for (const cid of provinceCellIds) {
    const pt = cells.p[cid];
    const biomeId = cells.biomeCode ? cells.biomeCode[cid] : 1;
    const biomeName = biomesData.name[biomeId] || "Grassland";
    const height = cells.h[cid]; // 0 - 100
    // 標高メートル換算（FMG標準: height 20が海水面、1単位あたりおよそ45m）
    const elevationMeters = Math.max(0, (height - 20) * 45);

    sampledCells.push({
      point: [pt[0], pt[1]],
      elevationMeters,
      biomeId,
      biomeName
    });
  }

  const descriptor: RegionSiteDescriptor = {
    version: REGION_SITE_VERSION,
    sourceSeed: seed,
    provinceId: province.i,
    provinceName: province.name,
    stateId: state?.i,
    stateName: state?.name,
    boundsMapUnits: [minX, minY, maxX, maxY],
    metersPerMapUnit,
    extentMeters: {
      width: extentWidth * metersPerMapUnit,
      height: extentHeight * metersPerMapUnit
    },
    coastlines: [],
    lakes: [],
    rivers: regionRivers,
    burgs: regionBurgs,
    roads: [],
    cells: sampledCells
  };

  return descriptor;
}

/**
 * 対象の Province を Region Editor (RE) で開く
 */
export function openRegionEditor(provinceId: number): void {
  const descriptor = buildRegionSiteDescriptor(provinceId);
  if (!descriptor) {
    tip("この地域（Province）のデータを構築できませんでした", false, "error");
    return;
  }
  try {
    sessionStorage.setItem(REGION_SITE_KEY, JSON.stringify(descriptor));
    window.open(`${import.meta.env.BASE_URL}region-editor/`, "_blank");
  } catch (err) {
    console.error("Failed to open Region Editor:", err);
    tip("Region Editor を起動できませんでした", false, "error");
  }
}
