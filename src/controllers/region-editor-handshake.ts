import { worldContext } from "../context/worldContext";
import { estimateWorldLandUse, usesFantasyForestDefaults } from "../generators/landUse";
import { Rivers } from "../generators/river-generator";
import { calculateBuiltAreaHa, resolveLandUseProfile } from "../generators/settlementClearance";
import type { Point, RegionSiteCell, RegionSiteDescriptor } from "../region-editor/core/types";
import { REGION_SITE_VERSION } from "../region-editor/core/types";
import { saveRegionSite } from "../region-editor/io/siteStore";
import { getBurgSiteDescriptor } from "../services/burgSiteDescriptor";
import { tip } from "../services/tooltipService";
import { useOptionsState } from "../store/optionsState";
import type { Province, River, Route } from "../types/models";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import { precipitationProxyToMillimeters } from "../utils/unitUtils";

/**
 * FMG の指定された Province（または State）から RegionSiteDescriptor を構築する
 */
export function buildRegionSiteDescriptor(
  provinceId: number,
  options: { freshLandUse?: boolean } = {}
): RegionSiteDescriptor | null {
  const { pack, seed, distanceScale, biomesData } = worldContext;
  // freshLandUse: 保存済みの pack.landUse を使わず、現行ロジックで土地利用ジオメトリを再計算する（pack は変更しない）
  const landUse =
    (options.freshLandUse ? undefined : pack.landUse) ??
    estimateWorldLandUse(worldContext, useOptionsState.getState().year);
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

  // 3. 範囲内の Burgs を抽出（CE連携用サイト記述子も保持）
  const regionBurgs: RegionSiteDescriptor["burgs"] = [];
  for (const b of pack.burgs) {
    if (!b?.i || b.removed) continue;
    if (b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY) {
      let siteDescriptor: unknown;
      try {
        siteDescriptor = getBurgSiteDescriptor(b.i);
      } catch (err) {
        console.warn(`Could not build site descriptor for burg ${b.i}:`, err);
      }
      regionBurgs.push({
        id: b.i,
        name: b.name || "Unnamed",
        point: [b.x, b.y],
        population: Math.max(0, b.population ?? 0) * worldContext.populationRate * worldContext.urbanization,
        cultureId: b.culture,
        raceKey: pack.cultures?.[b.culture ?? 0]?.raceKey,
        landUseProfile: resolveLandUseProfile({
          explicit: b.landUseProfile,
          cultural: pack.cultures?.[b.culture ?? 0]?.landUseProfile,
          raceKey: pack.cultures?.[b.culture ?? 0]?.raceKey,
          fantasy: usesFantasyForestDefaults(worldContext)
        }),
        builtAreaHa: calculateBuiltAreaHa(
          Math.max(0, b.population ?? 0) * worldContext.populationRate * worldContext.urbanization,
          resolveLandUseProfile({
            explicit: b.landUseProfile,
            cultural: pack.cultures?.[b.culture ?? 0]?.landUseProfile,
            raceKey: pack.cultures?.[b.culture ?? 0]?.raceKey,
            fantasy: usesFantasyForestDefaults(worldContext)
          })
        ),
        capital: Boolean(b.capital),
        port: Boolean(b.port),
        walls: Boolean(b.walls),
        citadel: Boolean(b.citadel),
        group: b.group || (b.capital ? "capital" : b.population && b.population > 5 ? "city" : "town"),
        siteDescriptor
      });
    }
  }

  // 4. 範囲内の河川を抽出（FMGの物理水理計算に基づく蛇行と川幅）
  const regionRivers: RegionSiteDescriptor["rivers"] = [];
  if (pack.rivers) {
    if (!Rivers.worldContext) {
      Rivers.worldContext = worldContext;
    }
    for (const r of pack.rivers as River[]) {
      if (!r?.i || !r.cells || r.cells.length < 2) continue;

      let meanderedPoints: Point[] = [];
      let meanderedWidths: number[] = [];

      const hasHydrology = cells.fl && cells.h && cells.p;
      if (hasHydrology) {
        try {
          const validPoints = r.points && r.points.length === r.cells.length ? r.points : null;
          const pts = Rivers.addMeandering(r.cells, validPoints);
          if (pts.length >= 2) {
            const banks = Rivers.getRiverBanks(pts, r.widthFactor ?? 1, r.sourceWidth ?? 0.1);
            meanderedPoints = pts.map(p => [p[0], p[1]] as Point);
            meanderedWidths = pts.map((_, idx) => {
              const halfOffset = banks.widths[idx] ? banks.widths[idx] / 2 : (r.width || 2) / 2;
              const trueWidthMapUnits = Rivers.getWidth(halfOffset);
              return Math.max(Math.round(trueWidthMapUnits * metersPerMapUnit), 8);
            });
          }
        } catch {
          // 水理計算エラー時はフォールバック
        }
      }

      // フォールバック（fl や h が未定義のテストケース等）
      if (meanderedPoints.length < 2) {
        const baseWidth = Math.max((r.width || 4) * metersPerMapUnit * 0.05, 12);
        const pts: Point[] = [];
        const wds: number[] = [];
        r.cells.forEach((c, idx) => {
          const pt = cells.p[c];
          if (pt) {
            pts.push([pt[0], pt[1]]);
            const prog = idx / (r.cells.length - 1 || 1);
            wds.push(Math.max(Math.round(baseWidth * (0.3 + 0.7 * prog)), 8));
          }
        });
        meanderedPoints = pts;
        meanderedWidths = wds;
      }

      if (meanderedPoints.length < 2) continue;

      // 領域バウンディングボックス [minX, minY, maxX, maxY] と交差するセグメントを抽出
      const inBox = (p: Point) => p[0] >= minX - 10 && p[0] <= maxX + 10 && p[1] >= minY - 10 && p[1] <= maxY + 10;
      const strictlyIn = (p: Point) => p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY;

      let segPoints: Point[] = [];
      let segWidths: number[] = [];
      let hasStrictlyIn = false;
      let segmentCounter = 0;

      for (let i = 0; i < meanderedPoints.length; i++) {
        const pt = meanderedPoints[i];
        const w = meanderedWidths[i] ?? meanderedWidths[0] ?? 20;

        if (inBox(pt)) {
          if (segPoints.length === 0 && i > 0) {
            segPoints.push(meanderedPoints[i - 1]);
            segWidths.push(meanderedWidths[i - 1]);
          }
          segPoints.push(pt);
          segWidths.push(w);
          if (strictlyIn(pt)) hasStrictlyIn = true;
        } else {
          if (segPoints.length > 0) {
            segPoints.push(pt);
            segWidths.push(w);
            if (segPoints.length >= 2 && hasStrictlyIn) {
              const segId = segmentCounter === 0 ? r.i : r.i * 1000 + segmentCounter;
              segmentCounter++;
              const avgWidth = Math.round(segWidths.reduce((a, b) => a + b, 0) / segWidths.length);
              regionRivers.push({
                id: segId,
                sourceRiverId: r.i,
                name: r.name || `River ${r.i}`,
                points: segPoints,
                widthMeters: avgWidth,
                widthsMeters: segWidths,
                dischargeM3s: Math.max(0, r.discharge ?? 0)
              });
            }
            segPoints = [];
            segWidths = [];
            hasStrictlyIn = false;
          }
        }
      }

      if (segPoints.length >= 2 && hasStrictlyIn) {
        const segId = segmentCounter === 0 ? r.i : r.i * 1000 + segmentCounter;
        const avgWidth = Math.round(segWidths.reduce((a, b) => a + b, 0) / segWidths.length);
        regionRivers.push({
          id: segId,
          sourceRiverId: r.i,
          name: r.name || `River ${r.i}`,
          points: segPoints,
          widthMeters: avgWidth,
          widthsMeters: segWidths,
          dischargeM3s: Math.max(0, r.discharge ?? 0)
        });
      }
    }
  }

  // 5. 範囲内の都市間街道（Routes）を抽出
  const regionRoads: RegionSiteDescriptor["roads"] = [];
  if (pack.routes) {
    const capitalBurgCells = new Set<number>();
    const cityBurgCells = new Set<number>();
    if (pack.burgs) {
      for (const b of pack.burgs) {
        if (!b?.i || b.removed) continue;
        if (b.capital) {
          capitalBurgCells.add(b.cell);
        }
        if ((b.population && b.population > 8) || b.group === "city" || b.group === "metropolis" || b.capital) {
          cityBurgCells.add(b.cell);
        }
      }
    }

    for (const route of pack.routes as Route[]) {
      if (!route?.i || !route.points || route.points.length < 2) continue;
      if (route.group === "searoutes") continue; // 海上航路は除外（陸上街道を対象）

      let type: "highway" | "road" | "trail" = "road";
      if (route.group === "highways" || route.group === "highway") {
        type = "highway";
      } else if (route.group === "trails" || route.group === "trail") {
        type = "trail";
      } else {
        // "roads" または未分類街道: 首都や主要都市と接続していれば highway、それ以外は road
        const touchesCapital =
          route.points.some(p => p[2] !== undefined && capitalBurgCells.has(p[2])) ||
          (route.cells && route.cells.some(c => capitalBurgCells.has(c)));
        const touchesCity =
          route.points.some(p => p[2] !== undefined && cityBurgCells.has(p[2])) ||
          (route.cells && route.cells.some(c => cityBurgCells.has(c)));
        type = touchesCapital || touchesCity ? "highway" : "road";
      }

      const pts = route.points;
      const inBox = (p: [number, number, ...number[]]) =>
        p[0] >= minX - 10 && p[0] <= maxX + 10 && p[1] >= minY - 10 && p[1] <= maxY + 10;
      const strictlyIn = (p: [number, number, ...number[]]) =>
        p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY;

      let currentSeg: Point[] = [];
      let hasStrictlyIn = false;
      let segmentCounter = 0;

      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (inBox(pt)) {
          if (currentSeg.length === 0 && i > 0) {
            currentSeg.push([pts[i - 1][0], pts[i - 1][1]]);
          }
          currentSeg.push([pt[0], pt[1]]);
          if (strictlyIn(pt)) hasStrictlyIn = true;
        } else {
          if (currentSeg.length > 0) {
            currentSeg.push([pt[0], pt[1]]);
            if (currentSeg.length >= 2 && hasStrictlyIn) {
              const segId = segmentCounter === 0 ? route.i : route.i * 1000 + segmentCounter;
              segmentCounter++;
              regionRoads.push({
                routeId: segId,
                name: route.name,
                type,
                points: currentSeg
              });
            }
            currentSeg = [];
            hasStrictlyIn = false;
          }
        }
      }

      if (currentSeg.length >= 2 && hasStrictlyIn) {
        const segId = segmentCounter === 0 ? route.i : route.i * 1000 + segmentCounter;
        regionRoads.push({
          routeId: segId,
          name: route.name,
          type,
          points: currentSeg
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
      coastalHabitat: cells.coastalHabitat?.[cid] ?? 0,
      sourceCellId: cid,
      cultureId: cells.culture?.[cid],
      physicalLandAreaHa: landUse.cells[cid]?.physicalLandAreaHa,
      ruralPeople: Math.max(0, cells.pop?.[cid] ?? 0) * worldContext.populationRate,
      forestCover: cells.forestCover?.[cid],
      forestStock: cells.forestStock?.[cid],
      forestCondition: cells.forestCondition?.[cid],
      canopy: cells.canopy?.[cid],
      specialFeature: cells.specialFeature?.[cid],
      landUse: landUse.cells[cid],
      point: [pt[0], pt[1]],
      elevationMeters,
      height,
      inProvince: cells.province[cid] === provinceId,
      provinceId: cells.province[cid],
      annualPrecipitationMm: precipitationProxyToMillimeters(worldContext.grid?.cells?.prec?.[cells.g?.[cid]] ?? 45),
      annualTemperatureC: worldContext.grid?.cells?.temp?.[cells.g?.[cid]],
      biomeDefinition: biomesData.definitionsByKey?.[biomesData.keys?.[biomeId]],
      biomeId,
      biomeName,
      biomeColor: biomesData.color?.[biomeId],
      polygon,
      isWater
    });
  }

  // Preserve the actual land/ocean edges and their land-side habitat.
  const coastalHabitats: NonNullable<RegionSiteDescriptor["coastalHabitats"]> = [];
  for (const cid of collectedCellSet) {
    if (cells.h[cid] < 20) continue;
    const vertices = cells.v?.[cid];
    if (!vertices || !pack.vertices?.p) continue;
    const oceanNeighbors = (cells.c[cid] ?? []).filter(
      nid => cells.h[nid] < 20 && pack.features?.[cells.f?.[nid]]?.type === "ocean"
    );
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      if (!oceanNeighbors.some(nid => cells.v?.[nid]?.includes(a) && cells.v[nid].includes(b))) continue;
      const start = pack.vertices.p[a];
      const end = pack.vertices.p[b];
      if (!start || !end) continue;
      coastalHabitats.push({
        points: [
          [start[0], start[1]],
          [end[0], end[1]]
        ],
        landPolygon: vertices.map(vid => pack.vertices.p[vid]),
        coastalHabitat: cells.coastalHabitat?.[cid] ?? 0
      });
    }
  }

  const descriptor: RegionSiteDescriptor = {
    version: REGION_SITE_VERSION,
    landUse: {
      modelVersion: landUse.modelVersion,
      revision: landUse.revision,
      year: landUse.year,
      seed: landUse.seed,
      provenance: landUse.provenance
    },
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
    coastlines: coastalHabitats.map(segment => segment.points),
    coastalHabitats,
    lakes: [],
    rivers: regionRivers,
    burgs: regionBurgs,
    roads: regionRoads,
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
export async function openRegionEditor(provinceId: number, options: { freshLandUse?: boolean } = {}): Promise<void> {
  const descriptor = buildRegionSiteDescriptor(provinceId, options);
  if (!descriptor) {
    tip("この地域（Province）のデータを構築できませんでした", false, "error");
    return;
  }
  try {
    await saveRegionSite(descriptor);
    window.open(`${import.meta.env.BASE_URL}region-editor/`, "_blank");
  } catch (err) {
    console.error("Failed to open Region Editor:", err);
    tip("Region Editor を起動できませんでした", false, "error");
  }
}
