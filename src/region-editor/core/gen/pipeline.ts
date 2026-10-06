import { normalizeSettlementType } from "../../render/styles/settlementIcons";
import { createEmptyRegionDocument } from "../document";
import { pointInPolygon, segmentIntersection } from "../geometry";
import type {
  Point,
  RegionDocument,
  RegionGenerationSettings,
  RegionRiver,
  RegionRoute,
  RegionSiteDescriptor,
  RegionSymbol,
  SymbolType
} from "../types";
import { generateContourLines, generateHeightfieldFromCells, synthesizeHeightfield } from "./contours";
import { generateFarmland } from "./farmland";
import { buildLandscapeFromCells } from "./landscapeBiomes";
import { generatePerpendicularBridges } from "./perpendicularBridges";
import { poissonDiscSampling } from "./poissonScatter";
import { makeRng } from "./prng";

/**
 * スタンドアロンの地方地図（Region）を生成する
 */
export function generateStandaloneRegion(settings: RegionGenerationSettings): RegionDocument {
  const doc = createEmptyRegionDocument(settings);
  const rng = makeRng(settings.seed);

  const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
  const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;

  // 1. 海岸線の生成（Sword Coast スタイルの西海岸: 西側が海、東側が陸）
  const coastPoints: Point[] = [];
  const coastBaseX = widthUnits * 0.28;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const y = (heightUnits / steps) * i;
    const wobble = (rng.next() - 0.5) * widthUnits * 0.08 + Math.sin(i * 0.35) * widthUnits * 0.06;
    coastPoints.push([coastBaseX + wobble, y]);
  }

  // 任意の Y における海岸線の X 座標を正確に求める補間関数
  const getCoastX = (y: number): number => {
    if (y <= 0) return coastPoints[0][0];
    if (y >= heightUnits) return coastPoints[coastPoints.length - 1][0];
    const t = (y / heightUnits) * (coastPoints.length - 1);
    const i = Math.floor(t);
    const frac = t - i;
    const p1 = coastPoints[i];
    const p2 = coastPoints[Math.min(i + 1, coastPoints.length - 1)];
    return p1[0] + (p2[0] - p1[0]) * frac;
  };

  // 海岸線ポリゴン（西側海域）
  const seaPolygon: Point[] = [[0, 0], ...coastPoints, [0, heightUnits]];
  doc.terrain.coastlinePolygons = [coastPoints];

  // 標高グリッド（Heightfield）と等高線（Contours）の合成生成
  const heightfield = synthesizeHeightfield(widthUnits, heightUnits, coastPoints);
  const contourResult = generateContourLines(heightfield, widthUnits, heightUnits);
  doc.terrain.heightfield = heightfield;
  doc.terrain.contours = contourResult.contours;
  doc.terrain.contourIntervalMeters = contourResult.intervalMeters;
  doc.terrain.showContours = true;

  // 2. バイオーム領域の定義
  // 陸地全体の境界
  const landPolygon: Point[] = [...coastPoints, [widthUnits, heightUnits], [widthUnits, 0]];

  // 東部山脈（Spine of the World / Sword Mountains 風）
  const mountainPoly: Point[] = [
    [widthUnits * 0.72, 0],
    [widthUnits * 0.95, 0],
    [widthUnits * 0.92, heightUnits * 0.75],
    [widthUnits * 0.65, heightUnits * 0.6]
  ];

  // 丘陵地帯（山脈の前駆）
  const hillsPoly: Point[] = [
    [widthUnits * 0.58, 0],
    [widthUnits * 0.72, 0],
    [widthUnits * 0.65, heightUnits * 0.6],
    [widthUnits * 0.52, heightUnits * 0.5]
  ];

  // 大森林（Neverwinter Wood / High Forest 風）
  const forestPoly: Point[] = [
    [widthUnits * 0.38, heightUnits * 0.12],
    [widthUnits * 0.62, heightUnits * 0.1],
    [widthUnits * 0.66, heightUnits * 0.42],
    [widthUnits * 0.42, heightUnits * 0.45]
  ];

  // 湿地帯（Mere of Dead Men 風: 海岸線の陸側にピッタリ沿わせる）
  const swampY1 = heightUnits * 0.62;
  const swampY2 = heightUnits * 0.84;
  const swampPoly: Point[] = [
    [getCoastX(swampY1), swampY1],
    [getCoastX(swampY1) + 70, swampY1],
    [getCoastX(swampY2) + 60, swampY2],
    [getCoastX(swampY2), swampY2]
  ];

  doc.biomes = [
    { id: "bio-ocean", kind: "ocean", polygon: seaPolygon },
    { id: "bio-grassland", kind: "grassland", polygon: landPolygon },
    { id: "bio-mountains", kind: "mountains", polygon: mountainPoly },
    { id: "bio-hills", kind: "hills", polygon: hillsPoly },
    { id: "bio-forest", kind: "deciduous_forest", polygon: forestPoly },
    { id: "bio-swamp", kind: "swamp", polygon: swampPoly }
  ];

  // 3. 河川の生成（山脈から海へ流れる川）
  const river1MouthY = heightUnits * 0.54;
  const river1Points: Point[] = [
    [widthUnits * 0.82, heightUnits * 0.35],
    [widthUnits * 0.7, heightUnits * 0.45],
    [widthUnits * 0.55, heightUnits * 0.48],
    [widthUnits * 0.4, heightUnits * 0.52],
    [getCoastX(river1MouthY) - 8, river1MouthY]
  ];

  const river2MouthY = heightUnits * 0.28;
  const river2Points: Point[] = [
    [widthUnits * 0.75, heightUnits * 0.15],
    [widthUnits * 0.62, heightUnits * 0.22],
    [widthUnits * 0.48, heightUnits * 0.25],
    [getCoastX(river2MouthY) - 8, river2MouthY]
  ];

  const river1: RegionRiver = {
    id: "river-1",
    name: "River Chionthar",
    points: river1Points,
    widths: [80, 140, 220, 320, 480],
    dischargeM3s: 240
  };

  const river2: RegionRiver = {
    id: "river-2",
    name: "River Delimbiyr",
    points: river2Points,
    widths: [60, 110, 180, 260],
    dischargeM3s: 160
  };

  doc.rivers = [river1, river2];

  // 4. 主要街道の生成（The Trade Way: 海岸線の内陸側を確実に通る）
  const roadY1 = 0;
  const roadY2 = heightUnits * 0.26;
  const roadY3 = heightUnits * 0.53;
  const roadY4 = heightUnits * 0.74;
  const roadY5 = heightUnits;

  const roadPoints: Point[] = [
    [getCoastX(roadY1) + 40, roadY1],
    [getCoastX(roadY2) + 35, roadY2],
    [getCoastX(roadY3) + 45, roadY3], // river1 と交差！
    [getCoastX(roadY4) + 50, roadY4],
    [getCoastX(roadY5) + 40, roadY5]
  ];

  const branchRoad: Point[] = [
    [getCoastX(roadY3) + 45, roadY3],
    [widthUnits * 0.58, heightUnits * 0.58],
    [widthUnits * 0.75, heightUnits * 0.65]
  ];

  const rawRoutes: RegionRoute[] = [
    { id: "route-high-road", kind: "highway", name: "The Trade Way", points: roadPoints },
    { id: "route-east-trail", kind: "road", name: "Daggerford Road", points: branchRoad }
  ];

  // 5. 直角橋の生成（AGENTS.md 原則: 河川接線と厳格に90度交差）
  const bridgeResult = generatePerpendicularBridges(doc.rivers, rawRoutes, doc.bounds.metersPerUnit);
  doc.bridges = bridgeResult.bridges;
  doc.routes = bridgeResult.adjustedRoutes;

  // 6. 地勢シンボルの散布
  const symbols: RegionSymbol[] = [];

  // 山岳シンボルの散布
  const mountainPoints = poissonDiscSampling(
    { minX: widthUnits * 0.65, minY: 0, maxX: widthUnits, maxY: heightUnits * 0.78 },
    34 / (0.5 + settings.mountainDensity * 0.8),
    rng.next,
    mountainPoly
  );

  for (const [idx, pt] of mountainPoints.entries()) {
    const isSnow = pt[1] < heightUnits * 0.2;
    const isMajor = rng.next() > 0.45;
    const type: SymbolType = isSnow ? "mountain_snow" : isMajor ? "mountain_peak_major" : "mountain_peak_minor";
    symbols.push({
      id: `sym-mtn-${idx}`,
      type,
      x: pt[0],
      y: pt[1],
      scale: 0.85 + rng.next() * 0.35,
      rotationDeg: 0,
      elevationMeters: isSnow ? 2800 : 1800
    });
  }

  // 丘陵シンボルの散布
  const hillPoints = poissonDiscSampling(
    { minX: widthUnits * 0.5, minY: 0, maxX: widthUnits * 0.75, maxY: heightUnits * 0.65 },
    24,
    rng.next,
    hillsPoly
  );
  for (const [idx, pt] of hillPoints.entries()) {
    symbols.push({
      id: `sym-hill-${idx}`,
      type: rng.next() > 0.5 ? "hill_cluster" : "hill_single",
      x: pt[0],
      y: pt[1],
      scale: 0.75 + rng.next() * 0.3,
      rotationDeg: 0
    });
  }

  // 樹木シンボル: 森林セルは一体化茂みキャノピーとして描画するため、一本木の無数敷き詰めは行わない

  // 湿地シンボルの散布
  const swampPoints = poissonDiscSampling(
    { minX: coastBaseX - 35, minY: heightUnits * 0.64, maxX: coastBaseX + 65, maxY: heightUnits * 0.9 },
    18,
    rng.next,
    swampPoly
  );
  for (const [idx, pt] of swampPoints.entries()) {
    symbols.push({
      id: `sym-swamp-${idx}`,
      type: "swamp_grass",
      x: pt[0],
      y: pt[1],
      scale: 0.7 + rng.next() * 0.25,
      rotationDeg: 0
    });
  }

  // Z-sort: 北から南へ（Y座標昇順）にソートして立体的な重なりを成立させる
  symbols.sort((a, b) => a.y - b.y);
  doc.symbols = symbols;

  // 7. 集落（Settlements）
  doc.settlements = [
    {
      id: "set-1",
      name: "Waterdeep",
      position: [getCoastX(heightUnits * 0.28) + 14, heightUnits * 0.28],
      type: "metropolis",
      population: 130000,
      farmlandAreaHectares: 0,
      isCapital: true,
      hasWalls: true,
      hasCitadel: true,
      hasPort: true
    },
    {
      id: "set-2",
      name: "Daggerford",
      position: [getCoastX(heightUnits * 0.54) + 48, heightUnits * 0.54],
      type: "town",
      population: 4500,
      farmlandAreaHectares: 0,
      hasWalls: true,
      hasCitadel: true
    },
    {
      id: "set-3",
      name: "Secomber",
      position: [widthUnits * 0.75, heightUnits * 0.65],
      type: "village",
      population: 900,
      farmlandAreaHectares: 0
    }
  ];

  // 8. 冒険地点・ダンジョン (Landmarks)
  doc.landmarks = [
    {
      id: "lm-1",
      name: "Undermountain",
      position: [getCoastX(heightUnits * 0.28) + 24, heightUnits * 0.29],
      kind: "dungeon",
      dangerLevel: 9,
      dungeonPreset: "room-corridor"
    },
    {
      id: "lm-2",
      name: "Hold of the Sea Kings",
      position: [getCoastX(heightUnits * 0.72) + 12, heightUnits * 0.72],
      kind: "ruins",
      dangerLevel: 5
    },
    {
      id: "lm-3",
      name: "Way Inn",
      position: [getCoastX(heightUnits * 0.7) + 52, heightUnits * 0.7],
      kind: "tower",
      dangerLevel: 1,
      dungeonPreset: "caravanserai"
    }
  ];

  // 9. 地名ラベル
  doc.labels = [
    {
      id: "lab-title",
      text: settings.title,
      position: [widthUnits * 0.5, 35],
      category: "region",
      fontSizePt: 24,
      fontStyle: "serif"
    },
    {
      id: "lab-sea",
      text: "Sea of Swords",
      position: [widthUnits * 0.12, heightUnits * 0.5],
      category: "water",
      fontSizePt: 16,
      fontStyle: "italic"
    },
    {
      id: "lab-mtn",
      text: "Sword Mountains",
      position: [widthUnits * 0.8, heightUnits * 0.22],
      category: "natural",
      fontSizePt: 15,
      fontStyle: "serif"
    },
    {
      id: "lab-forest",
      text: "High Forest",
      position: [widthUnits * 0.52, heightUnits * 0.28],
      category: "natural",
      fontSizePt: 14,
      fontStyle: "italic"
    }
  ];

  return doc;
}

/**
 * FMG の RegionSiteDescriptor から RegionDocument を生成（アップサンプリング）
 */
export function generateFromFmgDescriptor(descriptor: RegionSiteDescriptor): RegionDocument {
  const settings: RegionGenerationSettings = {
    seed: descriptor.sourceSeed,
    title: descriptor.provinceName || descriptor.stateName || "Regional Map",
    widthMeters: descriptor.extentMeters.width,
    heightMeters: descriptor.extentMeters.height,
    metersPerUnit: 100,
    theme: "schley",
    treeDensity: 0.5,
    mountainDensity: 0.5
  };

  const doc = createEmptyRegionDocument(settings);
  doc.source = {
    fmgMapSeed: descriptor.sourceSeed,
    provinceId: descriptor.provinceId,
    provinceName: descriptor.provinceName,
    stateId: descriptor.stateId,
    stateName: descriptor.stateName,
    fmgBBox: descriptor.boundsMapUnits
  };

  const [minX, minY] = descriptor.boundsMapUnits;
  const metersPerMapUnit = descriptor.metersPerMapUnit;
  const metersPerUnit = doc.bounds.metersPerUnit;

  // 座標変換: FMG世界座標 [gx, gy] -> REローカル座標 [lx, ly]
  const toLocal = (pt: Point): Point => {
    const mx = (pt[0] - minX) * metersPerMapUnit;
    const my = (pt[1] - minY) * metersPerMapUnit;
    return [mx / metersPerUnit, my / metersPerUnit];
  };

  // 海岸線と湖
  doc.terrain.coastlinePolygons = descriptor.coastlines.map(poly => poly.map(toLocal));
  doc.terrain.lakePolygons = descriptor.lakes.map(poly => poly.map(toLocal));
  doc.terrain.coastalHabitats = descriptor.coastalHabitats?.map(segment => ({
    coastalHabitat: segment.coastalHabitat,
    points: segment.points.map(toLocal),
    landPolygon: segment.landPolygon.map(toLocal)
  }));

  // 標高グリッド（Heightfield）および等高線（Contours）の生成
  if (descriptor.cells && descriptor.cells.length > 0) {
    const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
    const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;
    const localCells = descriptor.cells.map(c => ({
      point: toLocal(c.point),
      elevationMeters: c.elevationMeters
    }));

    const heightfield = generateHeightfieldFromCells(localCells, widthUnits, heightUnits);
    const contourResult = generateContourLines(heightfield, widthUnits, heightUnits);

    doc.terrain.heightfield = heightfield;
    doc.terrain.contours = contourResult.contours;
    doc.terrain.contourIntervalMeters = contourResult.intervalMeters;
    doc.terrain.showContours = true;
  }
  const polyCells = (descriptor.cells ?? []).filter(c => c.polygon && c.polygon.length >= 3);
  doc.terrain.cellPolygons = polyCells.map(c => c.polygon!.map(toLocal));
  doc.terrain.cellBiomeColors = polyCells.map(c => c.biomeColor ?? c.biomeDefinition?.color ?? "#cccccc");

  // 河川（海セルには描かず、陸セル部分だけを残す）
  const waterPolys = (descriptor.cells ?? [])
    .filter(c => c.isWater && c.polygon && c.polygon.length >= 3)
    .map(c => c.polygon!.map(toLocal));
  const inWater = (pt: Point) => waterPolys.some(poly => pointInPolygon(pt, poly));
  // 陸点→水点の線分と水セル境界の最初の交点（なければ水点側を使わず陸点を返す）
  const waterEdgeCrossing = (land: Point, water: Point): Point => {
    let best: Point = land;
    let bestT = Infinity;
    for (const poly of waterPolys) {
      for (let k = 0; k < poly.length; k++) {
        const hit = segmentIntersection(land, water, poly[k], poly[(k + 1) % poly.length]);
        if (hit.intersects && hit.point && hit.t! < bestT) {
          bestT = hit.t!;
          best = hit.point;
        }
      }
    }
    return best;
  };
  doc.rivers = descriptor.rivers.flatMap(r => {
    const pts = r.points.map(toLocal);
    const widths = r.widthsMeters && r.widthsMeters.length === r.points.length ? r.widthsMeters : undefined;
    const widthAt = (i: number) => (widths ? widths[i] : r.widthMeters);
    const runs: Array<{ points: Point[]; widths: number[] }> = [];
    let cur: { points: Point[]; widths: number[] } | null = null;
    pts.forEach((pt, i) => {
      if (inWater(pt)) {
        if (cur) {
          cur.points.push(waterEdgeCrossing(pts[i - 1], pt));
          cur.widths.push(widthAt(i - 1));
          runs.push(cur);
          cur = null;
        }
        return;
      }
      if (!cur) {
        cur = { points: [], widths: [] };
        if (i > 0) {
          cur.points.push(waterEdgeCrossing(pt, pts[i - 1]));
          cur.widths.push(widthAt(i));
        }
      }
      cur.points.push(pt);
      cur.widths.push(widthAt(i));
    });
    if (cur) runs.push(cur);
    const valid = runs.filter(run => run.points.length >= 2);
    return valid.map((run, n) => ({
      id: valid.length > 1 ? `river-${r.id}-${n}` : `river-${r.id}`,
      sourceRiverId: r.sourceRiverId,
      name: r.name,
      points: run.points,
      widths: widths ? run.widths : [r.widthMeters],
      dischargeM3s: r.dischargeM3s
    }));
  });

  // 集落
  doc.settlements = descriptor.burgs.map(b => ({
    id: `set-${b.id}`,
    burgId: b.id,
    name: b.name,
    position: toLocal(b.point),
    type: normalizeSettlementType(b.group, b.capital),
    group: b.group,
    population: b.population,
    landUseProfile: b.landUseProfile,
    builtAreaHa: b.builtAreaHa,
    isCapital: b.capital,
    hasWalls: b.walls,
    hasCitadel: b.citadel,
    hasPort: b.port,
    siteDescriptor: b.siteDescriptor
  }));

  // 街道
  const routes: RegionRoute[] = descriptor.roads.map((rd, i) => ({
    id: `route-${rd.routeId}-${i}`,
    name: rd.name,
    kind: rd.type,
    points: rd.points.map(toLocal)
  }));

  // ★直角橋の生成（規約遵守）★
  const bridgeResult = generatePerpendicularBridges(doc.rivers, routes, metersPerUnit);
  doc.bridges = bridgeResult.bridges;
  doc.routes = bridgeResult.adjustedRoutes;

  // ダンジョン
  if (descriptor.dungeons) {
    doc.landmarks = descriptor.dungeons.map(d => ({
      id: `lm-${d.id}`,
      dungeonId: d.id,
      name: d.name,
      position: toLocal(d.point),
      kind: "dungeon",
      dungeonPreset: "room-corridor"
    }));
  }

  // CE準拠のバイオーム面と風景シンボルの生成
  if (descriptor.cells && descriptor.cells.length > 0) {
    const landscape = buildLandscapeFromCells(
      descriptor.cells,
      toLocal,
      descriptor.sourceSeed,
      descriptor.metersPerMapUnit,
      {
        width: doc.bounds.widthMeters / doc.bounds.metersPerUnit,
        height: doc.bounds.heightMeters / doc.bounds.metersPerUnit
      }
    );
    doc.biomes = landscape.biomes;
    doc.symbols = landscape.symbols;
  } else {
    doc.biomes = [];
    doc.symbols = [];
  }

  generateFarmland(doc, descriptor, toLocal);

  return doc;
}
