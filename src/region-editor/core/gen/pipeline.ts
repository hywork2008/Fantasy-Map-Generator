import { createEmptyRegionDocument } from "../document";
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
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const y = (heightUnits / steps) * i;
    const wobble = (rng.next() - 0.5) * widthUnits * 0.12 + Math.sin(i * 0.4) * widthUnits * 0.08;
    coastPoints.push([coastBaseX + wobble, y]);
  }

  // 海岸線ポリゴン（西側海域）
  const seaPolygon: Point[] = [[0, 0], ...coastPoints, [0, heightUnits]];
  doc.terrain.coastlinePolygons = [coastPoints];

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

  // 湿地帯（Mere of Dead Men 風）
  const swampPoly: Point[] = [
    [coastBaseX - 20, heightUnits * 0.68],
    [coastBaseX + 60, heightUnits * 0.65],
    [coastBaseX + 50, heightUnits * 0.88],
    [coastBaseX - 30, heightUnits * 0.86]
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
  const river1Points: Point[] = [
    [widthUnits * 0.82, heightUnits * 0.35],
    [widthUnits * 0.7, heightUnits * 0.45],
    [widthUnits * 0.55, heightUnits * 0.48],
    [widthUnits * 0.4, heightUnits * 0.52],
    [coastBaseX - 10, heightUnits * 0.54]
  ];

  const river2Points: Point[] = [
    [widthUnits * 0.75, heightUnits * 0.15],
    [widthUnits * 0.62, heightUnits * 0.22],
    [widthUnits * 0.48, heightUnits * 0.25],
    [coastBaseX + 5, heightUnits * 0.28]
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

  // 4. 主要街道の生成（High Road: 南北に走る大動脈）
  const roadPoints: Point[] = [
    [coastBaseX + 45, 0],
    [coastBaseX + 55, heightUnits * 0.26],
    [coastBaseX + 40, heightUnits * 0.53], // river1 と交差！
    [coastBaseX + 70, heightUnits * 0.75],
    [coastBaseX + 50, heightUnits]
  ];

  const branchRoad: Point[] = [
    [coastBaseX + 40, heightUnits * 0.53],
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

  // 樹木シンボルの散布
  const treePoints = poissonDiscSampling(
    { minX: widthUnits * 0.35, minY: heightUnits * 0.08, maxX: widthUnits * 0.68, maxY: heightUnits * 0.48 },
    14 / (0.5 + settings.treeDensity * 0.8),
    rng.next,
    forestPoly
  );
  for (const [idx, pt] of treePoints.entries()) {
    symbols.push({
      id: `sym-tree-${idx}`,
      type: pt[1] < heightUnits * 0.25 ? "tree_pine" : "tree_deciduous",
      x: pt[0],
      y: pt[1],
      scale: 0.65 + rng.next() * 0.3,
      rotationDeg: 0
    });
  }

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
      position: [coastBaseX + 15, heightUnits * 0.28],
      type: "metropolis",
      population: 130000,
      isCapital: true,
      hasWalls: true,
      hasCitadel: true,
      hasPort: true
    },
    {
      id: "set-2",
      name: "Daggerford",
      position: [coastBaseX + 48, heightUnits * 0.54],
      type: "town",
      population: 4500,
      hasWalls: true,
      hasCitadel: true
    },
    {
      id: "set-3",
      name: "Secomber",
      position: [widthUnits * 0.75, heightUnits * 0.65],
      type: "village",
      population: 900
    }
  ];

  // 8. 冒険地点・ダンジョン (Landmarks)
  doc.landmarks = [
    {
      id: "lm-1",
      name: "Undermountain",
      position: [coastBaseX + 22, heightUnits * 0.29],
      kind: "dungeon",
      dangerLevel: 9,
      dungeonPreset: "room-corridor"
    },
    {
      id: "lm-2",
      name: "Hold of the Sea Kings",
      position: [coastBaseX - 25, heightUnits * 0.72],
      kind: "ruins",
      dangerLevel: 5
    },
    {
      id: "lm-3",
      name: "Way Inn",
      position: [coastBaseX + 46, heightUnits * 0.68],
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

  // 河川
  doc.rivers = descriptor.rivers.map(r => ({
    id: `river-${r.id}`,
    name: r.name,
    points: r.points.map(toLocal),
    widths: [r.widthMeters],
    dischargeM3s: r.dischargeM3s
  }));

  // 集落
  doc.settlements = descriptor.burgs.map(b => ({
    id: `set-${b.id}`,
    burgId: b.id,
    name: b.name,
    position: toLocal(b.point),
    type: b.capital ? "city" : b.population > 2000 ? "town" : "village",
    population: b.population,
    isCapital: b.capital,
    hasWalls: b.walls,
    hasCitadel: b.citadel,
    hasPort: b.port
  }));

  // 街道
  const routes: RegionRoute[] = descriptor.roads.map((rd, i) => ({
    id: `route-${rd.routeId}-${i}`,
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

  // バイオームとシンボルの散布
  const rng = makeRng(`${descriptor.sourceSeed}:symbols`);
  const symbols: RegionSymbol[] = [];

  for (const cell of descriptor.cells) {
    const localPt = toLocal(cell.point);
    const biome = cell.biomeName.toLowerCase();

    if (biome.includes("mountain") || biome.includes("highland")) {
      symbols.push({
        id: `sym-mtn-${symbols.length}`,
        type: cell.elevationMeters > 2000 ? "mountain_snow" : "mountain_peak_major",
        x: localPt[0],
        y: localPt[1],
        scale: 0.9 + rng.next() * 0.25,
        rotationDeg: 0,
        elevationMeters: cell.elevationMeters
      });
    } else if (biome.includes("forest") || biome.includes("wood")) {
      symbols.push({
        id: `sym-tree-${symbols.length}`,
        type: biome.includes("taiga") || biome.includes("conifer") ? "tree_pine" : "tree_deciduous",
        x: localPt[0],
        y: localPt[1],
        scale: 0.75 + rng.next() * 0.2,
        rotationDeg: 0
      });
    } else if (biome.includes("swamp") || biome.includes("wetland") || biome.includes("marsh")) {
      symbols.push({
        id: `sym-swamp-${symbols.length}`,
        type: "swamp_grass",
        x: localPt[0],
        y: localPt[1],
        scale: 0.7 + rng.next() * 0.2,
        rotationDeg: 0
      });
    }
  }

  symbols.sort((a, b) => a.y - b.y);
  doc.symbols = symbols;

  return doc;
}
