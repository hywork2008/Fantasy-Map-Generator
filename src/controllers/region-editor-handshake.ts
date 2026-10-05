import { worldContext } from "../context/worldContext";
import type { Point, RegionSiteCell, RegionSiteDescriptor } from "../region-editor/core/types";
import { REGION_SITE_KEY, REGION_SITE_VERSION } from "../region-editor/core/types";
import { tip } from "../services/tooltipService";
import { useOptionsState } from "../store/optionsState";
import type { Province, River } from "../types/models";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";

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
  const provinceCellSet = new Set<number>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let minProvinceH = Infinity;
  let maxProvinceH = -Infinity;

  for (const i of cells.i) {
    if (cells.province[i] === provinceId) {
      provinceCellIds.push(i);
      provinceCellSet.add(i);
      const [x, y] = cells.p[i];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const h = cells.h[i];
      if (h < minProvinceH) minProvinceH = h;
      if (h > maxProvinceH) maxProvinceH = h;
    }
  }

  if (provinceCellIds.length === 0) return null;

  // 2. 州境界における標高差の調査
  // 周辺セルとの標高差が大きい場合はマージンとサンプリング範囲を拡張し、
  // FMGとRE間での地形・等高線の乖離を防ぐ
  let maxBorderRelief = 0;
  for (const cid of provinceCellIds) {
    const ch = cells.h[cid];
    const neighbors = cells.c[cid];
    if (neighbors) {
      for (const nid of neighbors) {
        if (!provinceCellSet.has(nid)) {
          const diff = Math.abs(ch - cells.h[nid]);
          if (diff > maxBorderRelief) {
            maxBorderRelief = diff;
          }
        }
      }
    }
  }

  const provinceRelief = maxProvinceH - minProvinceH;
  const isHighRelief = maxBorderRelief >= 15 || provinceRelief >= 30;

  // マージンの設定（標高差が大きい場合はマージンを25%以上に拡張して山岳の連なりや急傾斜を包含）
  const dx = maxX - minX;
  const dy = maxY - minY;
  const marginRatio = isHighRelief ? 0.25 : 0.15;
  const minMarginUnits = isHighRelief ? 35 : 20;

  const marginX = Math.max(dx * marginRatio, minMarginUnits);
  const marginY = Math.max(dy * marginRatio, minMarginUnits);

  minX = Math.max(0, minX - marginX);
  minY = Math.max(0, minY - marginY);
  maxX = Math.min(worldContext.graphWidth || 1000, maxX + marginX);
  maxY = Math.min(worldContext.graphHeight || 1000, maxY + marginY);

  const extentWidth = maxX - minX;
  const extentHeight = maxY - minY;

  // 距離スケール（km / mapUnit -> メートル換算）
  const metersPerMapUnit = (distanceScale || 1) * 1000;

  // 3. 範囲内の Burgs を抽出
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

  // 4. 範囲内の河川を抽出
  const regionRivers: RegionSiteDescriptor["rivers"] = [];
  if (pack.rivers) {
    for (const r of pack.rivers as River[]) {
      if (!r?.i) continue;
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

  // 5. セルのサンプリング（対象州セル + 矩形内セル + 外周バッファセル）
  // 標高補間および等高線生成が境界で途切れないよう、周辺セルの情報まで確実に収集する
  const bufferUnits = isHighRelief ? 40 : 25;
  const sampleMinX = Math.max(0, minX - bufferUnits);
  const sampleMinY = Math.max(0, minY - bufferUnits);
  const sampleMaxX = Math.min(worldContext.graphWidth || 1000, maxX + bufferUnits);
  const sampleMaxY = Math.min(worldContext.graphHeight || 1000, maxY + bufferUnits);

  const collectedCellSet = new Set<number>(provinceCellIds);

  for (const i of cells.i) {
    const [x, y] = cells.p[i];
    if (x >= sampleMinX && x <= sampleMaxX && y >= sampleMinY && y <= sampleMaxY) {
      collectedCellSet.add(i);
    }
  }

  // 収集したセルの1次トポロジカル隣接セルも加えることで、等高線補間の外挿破綻を防ぐ
  const initialCollected = Array.from(collectedCellSet);
  for (const cid of initialCollected) {
    const neighbors = cells.c[cid];
    if (neighbors) {
      for (const nid of neighbors) {
        collectedCellSet.add(nid);
      }
    }
  }

  const exponent = normalizeHeightExponent(useOptionsState.getState().heightExponent);
  const sampledCells: RegionSiteCell[] = [];
  let minElevationMeters = Infinity;
  let maxElevationMeters = -Infinity;

  for (const cid of collectedCellSet) {
    const pt = cells.p[cid];
    if (!pt) continue;
    const biomeId = cells.biomeCode ? cells.biomeCode[cid] : 1;
    const biomeName = biomesData.name[biomeId] || "Grassland";
    const height = cells.h[cid]; // 0 - 100
    // 標高メートル換算（FMG標準 heightToMeters）
    const elevationMeters = Math.round(height >= 20 ? heightToMeters(height, exponent) : 0);

    if (elevationMeters < minElevationMeters) minElevationMeters = elevationMeters;
    if (elevationMeters > maxElevationMeters) maxElevationMeters = elevationMeters;

    const vIds = cells.v ? cells.v[cid] : undefined;
    let polygon: Point[] | undefined;
    if (vIds && pack.vertices && pack.vertices.p) {
      polygon = vIds.map(vid => pack.vertices.p[vid]).filter((p): p is Point => !!p);
    }
    const isWater =
      height < 20 ||
      biomeName.toLowerCase().includes("marine") ||
      biomeName.toLowerCase().includes("ocean") ||
      biomeName.toLowerCase().includes("water");

    sampledCells.push({
      point: [pt[0], pt[1]],
      elevationMeters,
      height,
      inProvince: cells.province[cid] === provinceId,
      provinceId: cells.province[cid],
      biomeId,
      biomeName,
      polygon,
      isWater
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
    elevationStats: {
      minElevationMeters: Number.isFinite(minElevationMeters) ? minElevationMeters : 0,
      maxElevationMeters: Number.isFinite(maxElevationMeters) ? maxElevationMeters : 0,
      maxBorderRelief
    },
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
