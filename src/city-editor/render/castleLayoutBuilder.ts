/**
 * @file castleLayoutBuilder.ts
 * @description
 * 史実・文化に基づく8大城郭様式の縄張幾何学プラン（FortressPlan）を構築するジェネレーター。
 *
 * 【設計思想・全体アーキテクチャ】
 * 従来の単純な箱型・単一パーツ配置から脱却し、各城郭様式の史実に基づく軍事・生活幾何学を生成します。
 * 構成要素（ramparts, towers, buildings, defensiveGates, courtyards, props）は
 * 地形・立体構造の整合性を保つため、castleSvg.ts にて厳密な地層順序でレンダリングされます。
 *
 * 【各要素の企図】
 * - ramparts: 高石垣（算木積み）、円形モット盛土（等高線・法面ケバ線）、傾斜スカルプ、木柵、内郭防壁
 * - courtyards: 曲輪のベースグラウンド（白砂利、石畳、土間、練兵広場、パティオ）
 * - defensiveGates: 枡形虎口、半月堡（デミルーン）、フライング木橋、カストラ大門などの防衛門構え
 * - buildings: 連立天守群、多聞櫓、本丸御殿、大広間、兵舎、礼拝堂などの主要建築
 * - towers: 星形稜堡、隅櫓、円形ドラムタワー、角塔、木造物見櫓
 * - props: 井戸、松の植込、大砲砲台、水盤などの生活・軍事ディテール
 *
 * 詳細仕様・拡張ガイドライン: docs/city-editor/castle-architecture-guide.md を参照。
 */

import { circuitRing } from "../core/fortifications";
import { polygonCentroid } from "../core/gen/geom";
import type { CastlePart, CastlePlan, CityDocument, Point } from "../core/types";
import type { CastleStyle, CastleStyleProfile } from "./castlePatterns";

export interface RampartGeometry {
  kind: "inner_wall" | "outer_wall" | "stone_slope" | "motte_slope" | "bastion_glacis" | "palisade";
  polygon: Point[];
  strokeWidth?: number;
}

export interface TowerGeometry {
  kind: "square_tower" | "drum_tower" | "star_bastion" | "yagura_corner" | "wood_watchtower";
  point: Point;
  polygon?: Point[];
  radius?: number;
}

export interface BuildingGeometry {
  id: string;
  kind:
    | "main_keep"
    | "small_keep"
    | "watari_yagura"
    | "tamon_yagura"
    | "great_hall"
    | "palace_wing"
    | "chapel"
    | "barracks"
    | "service";
  polygon: Point[];
  roofStyle: string;
}

export interface DefensiveGateGeometry {
  kind: "masugata" | "twin_drum_gate" | "barbican" | "timber_ramp" | "simple_gate";
  polygon?: Point[];
  approachPoints?: Point[];
  outerGate?: Point;
  innerGate?: Point;
}

export interface FortressPlan {
  style: CastleStyle;
  ramparts: RampartGeometry[];
  towers: TowerGeometry[];
  buildings: BuildingGeometry[];
  defensiveGates: DefensiveGateGeometry[];
  courtyards: Array<{ polygon: Point[]; texture: string }>;
  props: Array<{ kind: "stone_well" | "reflecting_pool" | "garden_pines" | "cannon_battery"; point: Point }>;
  /** 城壁の実厚(m)。市壁より薄く見えないよう、城・市街の石壁のうち最も厚いものに合わせる。 */
  wallWidthMeters?: number;
}

const BASE_CASTLE_WALL_METERS = 4.2;

/**
 * 城の防壁が市壁より弱く見えないよう、城郭回路と市街回路の壁群のうち最大の厚みを返す。
 */
function castleWallWidthMeters(document: CityDocument, castle: CastlePlan): number {
  const circuitIds = new Set<unknown>([castle.circuitId]);
  for (const c of document.defenseCircuits ?? []) if (c.scope === "town") circuitIds.add(c.id);
  const wallIds = new Set(
    (document.defenseCircuits ?? []).filter(c => circuitIds.has(c.id)).flatMap(c => c.wallGroupIds)
  );
  let width = BASE_CASTLE_WALL_METERS;
  for (const g of document.featureGroups)
    if (g.kind === "wall" && wallIds.has(g.id) && Number.isFinite(g.style.widthMeters))
      width = Math.max(width, g.style.widthMeters);
  return width;
}

/**
 * 壁厚に合わせて城壁の線幅と塔の大きさを引き上げる（市壁の塔 = 壁厚×1.05 と同等以上）。
 */
function scaleToWallWidth(plan: FortressPlan, wallWidth: number): FortressPlan {
  plan.wallWidthMeters = wallWidth;
  const k = wallWidth / BASE_CASTLE_WALL_METERS;
  for (const r of plan.ramparts) if (r.kind === "outer_wall" || r.kind === "inner_wall") r.strokeWidth = wallWidth;
  if (k <= 1) return plan;
  for (const t of plan.towers) {
    if (t.radius !== undefined) t.radius = Math.max(t.radius * k, wallWidth * 1.05);
    if (t.polygon)
      t.polygon = t.polygon.map(([x, y]) => [t.point[0] + (x - t.point[0]) * k, t.point[1] + (y - t.point[1]) * k]);
  }
  return plan;
}

/**
 * Offsets a polygon along its vertex outward normals.
 */
export function offsetPolygon(points: Point[], offsetMeters: number): Point[] {
  if (points.length < 3) return points;
  const c = polygonCentroid(points);
  return points.map(([x, y]) => {
    const dx = x - c[0];
    const dy = y - c[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return [x, y];
    const factor = (dist + offsetMeters) / dist;
    return [c[0] + dx * factor, c[1] + dy * factor];
  });
}

/**
 * Creates an oriented rectangle in local coordinates.
 */
export function createRotatedRect(center: Point, width: number, height: number, angleRad: number): Point[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const hw = width / 2;
  const hh = height / 2;
  const corners: Point[] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh]
  ];
  return corners.map(([x, y]) => [center[0] + x * cos - y * sin, center[1] + x * sin + y * cos]);
}

/**
 * Creates a regular polygon approximating a circle.
 */
export function createCirclePolygon(center: Point, radius: number, segments = 16): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i * 2 * Math.PI) / segments;
    pts.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return pts;
}

/**
 * Creates a star bastion (arrowhead pentagon) pointing in a direction.
 */
export function createBastionPolygon(point: Point, size: number, angleRad: number): Point[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  // Arrowhead shape: tip, right shoulder, right flank, left flank, left shoulder
  const local: Point[] = [
    [size * 1.3, 0],
    [size * 0.4, size * 0.9],
    [-size * 0.5, size * 0.6],
    [-size * 0.5, -size * 0.6],
    [size * 0.4, -size * 0.9]
  ];
  return local.map(([x, y]) => [point[0] + x * cos - y * sin, point[1] + x * sin + y * cos]);
}

/**
 * Builds full fortress geometry for a Japanese Shiro (本丸・二の丸・天守群・多聞櫓・枡形虎口).
 */
function buildJapaneseShiro(ring: Point[], center: Point, gatePoint: Point, parts: CastlePart[]): FortressPlan {
  const plan: FortressPlan = {
    style: "japanese-shiro",
    ramparts: [],
    towers: [],
    buildings: [],
    defensiveGates: [],
    courtyards: [],
    props: []
  };

  // 1. Ni-no-maru (外郭・二の丸): 既存城壁リングを高石垣と角櫓（隅櫓）で置き換える
  const outerSlope = offsetPolygon(ring, 3.2);
  plan.ramparts.push({
    kind: "stone_slope",
    polygon: outerSlope
  });
  plan.ramparts.push({
    kind: "outer_wall",
    polygon: ring
  });
  plan.courtyards.push({
    polygon: ring,
    texture: "white_gravel"
  });

  // 外周リングの各角（vertex）に、日本式の正統な「角櫓（隅櫓・yagura_corner）」を配置
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    if (Math.hypot(p[0] - gatePoint[0], p[1] - gatePoint[1]) > 10) {
      plan.towers.push({
        kind: "yagura_corner",
        point: p,
        radius: 3.5
      });
    }
  }

  // 外周の城壁に沿って多聞櫓（tamon_yagura）を配置
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const next = ring[(i + 1) % ring.length];
    const edgeLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    if (edgeLen > 15) {
      const mid: Point = [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];
      const ang = Math.atan2(next[1] - p[1], next[0] - p[0]);
      const tamon = createRotatedRect(mid, Math.min(edgeLen * 0.6, 20), 4.2, ang);
      plan.buildings.push({
        id: `tamon-${i}`,
        kind: "tamon_yagura",
        polygon: tamon,
        roofStyle: "tenshu_shoin"
      });
      break;
    }
  }
  if (!plan.buildings.some(b => b.kind === "tamon_yagura")) {
    const tamonPos: Point = [center[0], center[1] - 8];
    plan.buildings.push({
      id: "tamon-default",
      kind: "tamon_yagura",
      polygon: createRotatedRect(tamonPos, 14, 4.5, 0.15),
      roofStyle: "tenshu_shoin"
    });
  }

  // 2. Honmaru (内郭・本丸)
  const honmaruRing = offsetPolygon(ring, -11.0);
  const honmaruCenter = polygonCentroid(honmaruRing);

  if (honmaruRing.length >= 3) {
    const slopeBase = offsetPolygon(honmaruRing, 2.8);
    plan.ramparts.push({
      kind: "stone_slope",
      polygon: slopeBase
    });
    plan.ramparts.push({
      kind: "inner_wall",
      polygon: honmaruRing
    });
  }

  // 3. Tenshu Complex (連立式天守: 大天守 + 小天守 + 渡り櫓)
  const keepPart = parts.find(p => p.role === "keep");
  const tenshuCenter: Point = keepPart
    ? polygonCentroid(keepPart.footprint)
    : [honmaruCenter[0] + 4, honmaruCenter[1] + 4];

  // Tenshu-dai (天守台石垣)
  const mainTenshuSize = 16;
  const tenshudai = createRotatedRect(tenshuCenter, mainTenshuSize + 5, mainTenshuSize + 5, 0.15);
  plan.ramparts.push({
    kind: "stone_slope",
    polygon: tenshudai
  });

  // Main Tenshu (大天守)
  const mainTenshu = createRotatedRect(tenshuCenter, mainTenshuSize, mainTenshuSize, 0.15);
  plan.buildings.push({
    id: "tenshu-main",
    kind: "main_keep",
    polygon: mainTenshu,
    roofStyle: "tenshu_gables"
  });

  // Small Tenshu (小天守)
  const smallTenshuCenter: Point = [tenshuCenter[0] - 12, tenshuCenter[1] + 5];
  const smallTenshu = createRotatedRect(smallTenshuCenter, 9, 9, 0.15);
  plan.buildings.push({
    id: "tenshu-small",
    kind: "small_keep",
    polygon: smallTenshu,
    roofStyle: "tenshu_gables"
  });

  // Watari-yagura (渡り櫓) connecting Main & Small
  const watariCenter: Point = [
    (tenshuCenter[0] + smallTenshuCenter[0]) / 2,
    (tenshuCenter[1] + smallTenshuCenter[1]) / 2
  ];
  const watari = createRotatedRect(watariCenter, 6, 4.5, 0.15);
  plan.buildings.push({
    id: "tenshu-watari",
    kind: "watari_yagura",
    polygon: watari,
    roofStyle: "tenshu_shoin"
  });

  // 4. Honmaru Palace (本丸御殿 - 書院造)
  const palaceCenter: Point = [honmaruCenter[0] - 8, honmaruCenter[1] - 8];
  const palace = createRotatedRect(palaceCenter, 18, 12, 0.15);
  plan.buildings.push({
    id: "honmaru-palace",
    kind: "palace_wing",
    polygon: palace,
    roofStyle: "tenshu_shoin"
  });

  // 5. Masugata Gate (枡形虎口) at the castle gate entrance
  const gateAngle = Math.atan2(center[1] - gatePoint[1], center[0] - gatePoint[0]);
  const masugataCenter: Point = [gatePoint[0] + Math.cos(gateAngle) * 7, gatePoint[1] + Math.sin(gateAngle) * 7];
  const masugata = createRotatedRect(masugataCenter, 12, 10, gateAngle);
  plan.defensiveGates.push({
    kind: "masugata",
    polygon: masugata,
    outerGate: gatePoint,
    innerGate: [gatePoint[0] + Math.cos(gateAngle) * 12, gatePoint[1] + Math.sin(gateAngle) * 12]
  });

  // Props
  plan.props.push({ kind: "stone_well", point: [honmaruCenter[0] + 2, honmaruCenter[1] - 2] });
  plan.props.push({ kind: "garden_pines", point: [palaceCenter[0] + 10, palaceCenter[1] - 3] });
  plan.props.push({ kind: "garden_pines", point: [honmaruCenter[0] - 10, honmaruCenter[1] + 8] });

  return plan;
}

/**
 * Builds Concentric fortress geometry (二重囲壁・全周ドラムタワー・大双塔門・ゴシック大広間).
 */
function buildConcentric(ring: Point[], center: Point, gatePoint: Point, parts: CastlePart[]): FortressPlan {
  const plan: FortressPlan = {
    style: "concentric",
    ramparts: [],
    towers: [],
    buildings: [],
    defensiveGates: [],
    courtyards: [],
    props: []
  };

  // Outer Curtain Wall
  plan.ramparts.push({
    kind: "outer_wall",
    polygon: ring
  });

  // Outer corner/flank towers (small drum towers)
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    plan.towers.push({
      kind: "drum_tower",
      point: p,
      radius: 3.5
    });
  }

  // Inner Curtain Wall (内郭二重壁, offset by 7m inward)
  const innerRing = offsetPolygon(ring, -7.5);
  if (innerRing.length >= 3) {
    plan.ramparts.push({
      kind: "inner_wall",
      polygon: innerRing
    });
    plan.courtyards.push({
      polygon: innerRing,
      texture: "flagstones"
    });

    // Massive Drum Towers on the Inner Curtain corners
    for (const p of innerRing) {
      plan.towers.push({
        kind: "drum_tower",
        point: p,
        radius: 5.2
      });
    }
  }

  // Great Twin-Drum Gatehouse (双塔大門)
  const gateAngle = Math.atan2(center[1] - gatePoint[1], center[0] - gatePoint[0]);
  const leftDrum: Point = [
    gatePoint[0] + Math.cos(gateAngle + Math.PI / 2) * 5.5,
    gatePoint[1] + Math.sin(gateAngle + Math.PI / 2) * 5.5
  ];
  const rightDrum: Point = [
    gatePoint[0] + Math.cos(gateAngle - Math.PI / 2) * 5.5,
    gatePoint[1] + Math.sin(gateAngle - Math.PI / 2) * 5.5
  ];
  plan.towers.push({ kind: "drum_tower", point: leftDrum, radius: 4.8 });
  plan.towers.push({ kind: "drum_tower", point: rightDrum, radius: 4.8 });

  // Barbican (前進堡塁)
  const barbicanCenter: Point = [gatePoint[0] - Math.cos(gateAngle) * 8, gatePoint[1] - Math.sin(gateAngle) * 8];
  plan.defensiveGates.push({
    kind: "barbican",
    polygon: createRotatedRect(barbicanCenter, 10, 8, gateAngle),
    outerGate: [barbicanCenter[0] - Math.cos(gateAngle) * 4, barbicanCenter[1] - Math.sin(gateAngle) * 4],
    innerGate: gatePoint
  });

  // Great Hall & Chapel along the inner curtain
  const innerCenter = polygonCentroid(innerRing);
  const hall = createRotatedRect([innerCenter[0] + 6, innerCenter[1] - 4], 24, 11, gateAngle + 0.3);
  plan.buildings.push({
    id: "concentric-hall",
    kind: "great_hall",
    polygon: hall,
    roofStyle: "gable"
  });

  const chapel = createRotatedRect([innerCenter[0] - 8, innerCenter[1] + 6], 14, 8, gateAngle + 0.3);
  plan.buildings.push({
    id: "concentric-chapel",
    kind: "chapel",
    polygon: chapel,
    roofStyle: "gable"
  });

  plan.props.push({ kind: "stone_well", point: innerCenter });

  return plan;
}

/**
 * Builds Bastion Citadel geometry (星形稜堡・傾斜スカルプ・対称兵舎・練兵広場).
 */
function buildBastionCitadel(ring: Point[], center: Point, gatePoint: Point, parts: CastlePart[]): FortressPlan {
  const plan: FortressPlan = {
    style: "bastion-citadel",
    ramparts: [],
    towers: [],
    buildings: [],
    defensiveGates: [],
    courtyards: [],
    props: []
  };

  // Star Bastions on outer corners
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const outAngle = Math.atan2(p[1] - center[1], p[0] - center[0]);
    const bastionPoly = createBastionPolygon(p, 8.5, outAngle);
    plan.towers.push({
      kind: "star_bastion",
      point: p,
      polygon: bastionPoly
    });
  }

  // Glacis / Rampart Slope around the whole ring
  const glacis = offsetPolygon(ring, 4.0);
  plan.ramparts.push({
    kind: "bastion_glacis",
    polygon: glacis
  });
  plan.ramparts.push({
    kind: "outer_wall",
    polygon: ring
  });

  // Central Parade Ground (Place d'Armes)
  const paradeRing = offsetPolygon(ring, -6.5);
  plan.courtyards.push({
    polygon: paradeRing,
    texture: "parade_ground"
  });

  // Symmetrical Barracks & Arsenal Blocks
  const c = polygonCentroid(paradeRing);
  const barracks1 = createRotatedRect([c[0] - 10, c[1] + 6], 18, 7, 0);
  const barracks2 = createRotatedRect([c[0] + 10, c[1] + 6], 18, 7, 0);
  const governor = createRotatedRect([c[0], c[1] - 8], 16, 9, 0);

  plan.buildings.push({
    id: "bastion-barracks-1",
    kind: "barracks",
    polygon: barracks1,
    roofStyle: "hip"
  });
  plan.buildings.push({
    id: "bastion-barracks-2",
    kind: "barracks",
    polygon: barracks2,
    roofStyle: "hip"
  });
  plan.buildings.push({
    id: "bastion-governor",
    kind: "palace_wing",
    polygon: governor,
    roofStyle: "hip"
  });

  // Demi-Lune / Ravelin Gatehouse (半月堡・要塞門)
  const gateAngle = Math.atan2(center[1] - gatePoint[1], center[0] - gatePoint[0]);
  const ravelinTip: Point = [gatePoint[0] - Math.cos(gateAngle) * 9, gatePoint[1] - Math.sin(gateAngle) * 9];
  const ravelinLeft: Point = [
    gatePoint[0] - Math.cos(gateAngle) * 2 + Math.cos(gateAngle + Math.PI / 2) * 6,
    gatePoint[1] - Math.sin(gateAngle) * 2 + Math.sin(gateAngle + Math.PI / 2) * 6
  ];
  const ravelinRight: Point = [
    gatePoint[0] - Math.cos(gateAngle) * 2 + Math.cos(gateAngle - Math.PI / 2) * 6,
    gatePoint[1] - Math.sin(gateAngle) * 2 + Math.sin(gateAngle - Math.PI / 2) * 6
  ];
  plan.defensiveGates.push({
    kind: "barbican",
    polygon: [ravelinTip, ravelinLeft, gatePoint, ravelinRight],
    outerGate: ravelinTip,
    innerGate: gatePoint
  });

  // Cannon batteries at bastions
  for (const b of plan.towers) {
    plan.props.push({ kind: "cannon_battery", point: b.point });
  }
  plan.props.push({ kind: "reflecting_pool", point: c });

  return plan;
}

/**
 * Builds Motte-and-Bailey geometry (円形モット盛土・独立外郭ベイリー・木造シェルキープ・木橋).
 */
function buildMotteBailey(ring: Point[], center: Point, gatePoint: Point, parts: CastlePart[]): FortressPlan {
  const plan: FortressPlan = {
    style: "motte-bailey",
    ramparts: [],
    towers: [],
    buildings: [],
    defensiveGates: [],
    courtyards: [],
    props: []
  };

  // 1. Calculate orientation and radial extent
  const awayAngle = Math.atan2(center[1] - gatePoint[1], center[0] - gatePoint[0]);
  const distances = ring.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]));
  const minRadius = Math.min(...distances, 25);

  // 2. Motte (円形盛土丘陵): 敷地奥側の角・縁に独立してそびえ立つ
  const motteDistance = Math.max(14, minRadius * 0.55);
  const motteCenter: Point = [
    center[0] + Math.cos(awayAngle) * motteDistance,
    center[1] + Math.sin(awayAngle) * motteDistance
  ];
  const motteRadius = Math.min(20, Math.max(12, minRadius * 0.42));

  // Motte earthen mound slope (円錐台の盛土法面・テラス)
  const motteMound = createCirclePolygon(motteCenter, motteRadius, 16);
  plan.ramparts.push({
    kind: "motte_slope",
    polygon: motteMound
  });

  // Motte summit terrace (頂上プラットフォームと木柵)
  const summitRadius = motteRadius * 0.52;
  const motteSummit = createCirclePolygon(motteCenter, summitRadius, 12);
  plan.ramparts.push({
    kind: "palisade",
    polygon: motteSummit
  });

  // Shell Keep / Timber Keep at the summit
  const keepSize = Math.max(8, summitRadius * 1.15);
  const keepPoly = createRotatedRect(motteCenter, keepSize, keepSize, awayAngle);
  plan.buildings.push({
    id: "motte-keep",
    kind: "main_keep",
    polygon: keepPoly,
    roofStyle: "timber_deck"
  });

  // Watchtower atop the keep
  plan.towers.push({
    kind: "wood_watchtower",
    point: motteCenter,
    radius: 3.0
  });

  // 3. Bailey (外郭・居住と防衛の平地)
  // The bailey court covers the precinct ground
  plan.courtyards.push({
    polygon: ring,
    texture: "bailey_dirt"
  });

  // Outer Palisade surrounding the Bailey perimeter
  plan.ramparts.push({
    kind: "palisade",
    polygon: ring
  });

  // Cross-palisade (モットとベイリーを隔てる内木柵)
  const crossNormal = awayAngle + Math.PI / 2;
  const crossWidth = motteRadius * 1.6;
  const crossMid: Point = [
    motteCenter[0] - Math.cos(awayAngle) * (motteRadius + 1.5),
    motteCenter[1] - Math.sin(awayAngle) * (motteRadius + 1.5)
  ];
  const crossPalisade: Point[] = [
    [crossMid[0] + Math.cos(crossNormal) * (crossWidth / 2), crossMid[1] + Math.sin(crossNormal) * (crossWidth / 2)],
    crossMid,
    [crossMid[0] - Math.cos(crossNormal) * (crossWidth / 2), crossMid[1] - Math.sin(crossNormal) * (crossWidth / 2)]
  ];
  plan.ramparts.push({
    kind: "palisade",
    polygon: crossPalisade
  });

  // 4. Flying Timber Ramp (ベイリー平地からモット頂上へ登る急勾配の木造架橋)
  const rampStart: Point = [
    motteCenter[0] - Math.cos(awayAngle) * (motteRadius + 5.5),
    motteCenter[1] - Math.sin(awayAngle) * (motteRadius + 5.5)
  ];
  plan.defensiveGates.push({
    kind: "timber_ramp",
    approachPoints: [rampStart, motteCenter]
  });

  // 5. Buildings inside the Bailey (ベイリー平地の中央〜側壁沿いに配置、モットの上に乗らない)
  const baileyCenter: Point = [
    center[0] - Math.cos(awayAngle) * (motteDistance * 0.4),
    center[1] - Math.sin(awayAngle) * (motteDistance * 0.4)
  ];

  // Great Hall / Longhouse in Bailey (大広間)
  const hallPos: Point = [baileyCenter[0] + Math.cos(crossNormal) * 8.5, baileyCenter[1] + Math.sin(crossNormal) * 8.5];
  const longhouse = createRotatedRect(hallPos, 18, 8, awayAngle);
  plan.buildings.push({
    id: "bailey-longhouse",
    kind: "great_hall",
    polygon: longhouse,
    roofStyle: "gable"
  });

  // Stables / Barracks in Bailey (厩舎・兵舎)
  const stablePos: Point = [
    baileyCenter[0] - Math.cos(crossNormal) * 9.5,
    baileyCenter[1] - Math.sin(crossNormal) * 9.5
  ];
  const stables = createRotatedRect(stablePos, 15, 7, awayAngle);
  plan.buildings.push({
    id: "bailey-stables",
    kind: "barracks",
    polygon: stables,
    roofStyle: "hip"
  });

  // Wood watchtowers on Bailey outer palisade corners (モットの真上は避ける)
  for (let i = 0; i < ring.length; i += 2) {
    const pt = ring[i];
    if (Math.hypot(pt[0] - motteCenter[0], pt[1] - motteCenter[1]) > motteRadius * 0.9) {
      plan.towers.push({
        kind: "wood_watchtower",
        point: pt,
        radius: 2.8
      });
    }
  }

  // Bailey central water well
  plan.props.push({ kind: "stone_well", point: baileyCenter });

  return plan;
}

/**
 * Builds Norman Keep fortress geometry (前殿付き方形主塔・バットレス・大広間・アプス付き礼拝堂).
 */
function buildNormanKeep(ring: Point[], center: Point, gatePoint: Point, parts: CastlePart[]): FortressPlan {
  const plan: FortressPlan = {
    style: "norman-keep",
    ramparts: [],
    towers: [],
    buildings: [],
    defensiveGates: [],
    courtyards: [],
    props: []
  };

  // Curtain Wall with square corner towers
  plan.ramparts.push({
    kind: "outer_wall",
    polygon: ring
  });
  for (const p of ring) {
    plan.towers.push({
      kind: "square_tower",
      point: p,
      radius: 3.8
    });
  }

  const bailey = offsetPolygon(ring, -4.5);
  plan.courtyards.push({
    polygon: bailey,
    texture: "flagstones"
  });

  // Massive Composite Norman Keep (L字型前殿フォアビルディング付き主塔)
  const keepCenter: Point = [center[0] + 4, center[1] + 4];
  const keepMain = createRotatedRect(keepCenter, 20, 16, 0.1);
  plan.buildings.push({
    id: "norman-keep-main",
    kind: "main_keep",
    polygon: keepMain,
    roofStyle: "crenellated_open"
  });

  // Forebuilding (前殿・防御階段塔)
  const foreCenter: Point = [keepCenter[0] - 11, keepCenter[1] - 2];
  const forebuilding = createRotatedRect(foreCenter, 8, 10, 0.1);
  plan.buildings.push({
    id: "norman-forebuilding",
    kind: "service",
    polygon: forebuilding,
    roofStyle: "crenellated_open"
  });

  // Great Hall and Chapel along curtain
  const hall = createRotatedRect([center[0] - 8, center[1] - 10], 22, 10, 0.1);
  plan.buildings.push({
    id: "norman-hall",
    kind: "great_hall",
    polygon: hall,
    roofStyle: "gable"
  });

  const chapel = createRotatedRect([center[0] + 12, center[1] - 8], 12, 7, 0.1);
  plan.buildings.push({
    id: "norman-chapel",
    kind: "chapel",
    polygon: chapel,
    roofStyle: "gable"
  });

  // Norman Barbican / Outer Gatehouse (前衛堡塁門)
  const gateAngle = Math.atan2(center[1] - gatePoint[1], center[0] - gatePoint[0]);
  const barbicanCenter: Point = [gatePoint[0] - Math.cos(gateAngle) * 6, gatePoint[1] - Math.sin(gateAngle) * 6];
  plan.defensiveGates.push({
    kind: "barbican",
    polygon: createRotatedRect(barbicanCenter, 9, 7, gateAngle),
    outerGate: [barbicanCenter[0] - Math.cos(gateAngle) * 3.5, barbicanCenter[1] - Math.sin(gateAngle) * 3.5],
    innerGate: gatePoint
  });

  plan.props.push({ kind: "stone_well", point: [center[0] - 2, center[1] + 1] });

  return plan;
}

/**
 * Builds Islamic Qalat geometry (四角角塔・鋸歯銃眼・パティオ水盤・回廊).
 */
function buildIslamicQalat(ring: Point[], center: Point, gatePoint: Point, parts: CastlePart[]): FortressPlan {
  const plan: FortressPlan = {
    style: "islamic-qalat",
    ramparts: [],
    towers: [],
    buildings: [],
    defensiveGates: [],
    courtyards: [],
    props: []
  };

  plan.ramparts.push({
    kind: "outer_wall",
    polygon: ring
  });
  for (const p of ring) {
    plan.towers.push({
      kind: "square_tower",
      point: p,
      radius: 4.2
    });
  }

  const patio = offsetPolygon(ring, -5.0);
  plan.courtyards.push({
    polygon: patio,
    texture: "patio_pool"
  });

  // Arcaded Palace Wings around the central courtyard
  const northWing = createRotatedRect([center[0], center[1] + 10], 22, 7, 0);
  const southWing = createRotatedRect([center[0], center[1] - 10], 22, 7, 0);
  const mainDiwan = createRotatedRect([center[0] + 12, center[1]], 8, 16, 0);

  plan.buildings.push({
    id: "qalat-north",
    kind: "palace_wing",
    polygon: northWing,
    roofStyle: "flat_parapet"
  });
  plan.buildings.push({
    id: "qalat-south",
    kind: "palace_wing",
    polygon: southWing,
    roofStyle: "flat_parapet"
  });
  plan.buildings.push({
    id: "qalat-diwan",
    kind: "great_hall",
    polygon: mainDiwan,
    roofStyle: "flat_dome"
  });

  // Bent Entrance Gate (イスラム要塞特有の屈曲門)
  const qalatGateAngle = Math.atan2(center[1] - gatePoint[1], center[0] - gatePoint[0]);
  const bentGateCenter: Point = [
    gatePoint[0] + Math.cos(qalatGateAngle) * 5,
    gatePoint[1] + Math.sin(qalatGateAngle) * 5
  ];
  plan.defensiveGates.push({
    kind: "masugata",
    polygon: createRotatedRect(bentGateCenter, 9, 8, qalatGateAngle),
    outerGate: gatePoint,
    innerGate: [bentGateCenter[0] + Math.cos(qalatGateAngle) * 8, bentGateCenter[1] + Math.sin(qalatGateAngle) * 8]
  });

  // Central Reflecting Pool (長方形水盤)
  plan.props.push({ kind: "reflecting_pool", point: center });
  plan.props.push({ kind: "garden_pines", point: [center[0] - 8, center[1] + 2] });

  return plan;
}

/**
 * Builds Ancient Castra / Acropolis geometry (列柱・神殿庁舎・方形物見台).
 */
function buildAncientCastra(ring: Point[], center: Point, gatePoint: Point, parts: CastlePart[]): FortressPlan {
  const plan: FortressPlan = {
    style: "ancient-castra",
    ramparts: [],
    towers: [],
    buildings: [],
    defensiveGates: [],
    courtyards: [],
    props: []
  };

  plan.ramparts.push({
    kind: "outer_wall",
    polygon: ring
  });
  for (const p of ring) {
    plan.towers.push({
      kind: "square_tower",
      point: p,
      radius: 3.5
    });
  }

  const forum = offsetPolygon(ring, -4.5);
  plan.courtyards.push({
    polygon: forum,
    texture: "flagstones"
  });

  // Principia / Praetorium (司令部庁舎)
  const principia = createRotatedRect([center[0], center[1] + 4], 20, 14, 0);
  plan.buildings.push({
    id: "castra-principia",
    kind: "main_keep",
    polygon: principia,
    roofStyle: "pitched_tile"
  });

  // Granary (Horreum) & Barracks
  const horreum = createRotatedRect([center[0] - 10, center[1] - 8], 16, 7, 0);
  plan.buildings.push({
    id: "castra-horreum",
    kind: "barracks",
    polygon: horreum,
    roofStyle: "pitched_tile"
  });

  // Porta Praetoria Gatehouse (カストラ大門)
  const castraGateAngle = Math.atan2(center[1] - gatePoint[1], center[0] - gatePoint[0]);
  const castraGateCenter: Point = [
    gatePoint[0] - Math.cos(castraGateAngle) * 4,
    gatePoint[1] - Math.sin(castraGateAngle) * 4
  ];
  plan.defensiveGates.push({
    kind: "barbican",
    polygon: createRotatedRect(castraGateCenter, 10, 6, castraGateAngle),
    outerGate: [
      castraGateCenter[0] - Math.cos(castraGateAngle) * 2.5,
      castraGateCenter[1] - Math.sin(castraGateAngle) * 2.5
    ],
    innerGate: gatePoint
  });

  plan.props.push({ kind: "stone_well", point: [center[0] + 5, center[1] - 5] });

  return plan;
}

/** Use persisted footprints for editable buildings; style geometry supplies their appearance. */
function applySavedBuildings(plan: FortressPlan, parts: CastlePart[], profile: CastleStyleProfile): FortressPlan {
  const kinds: Record<CastlePart["role"], BuildingGeometry["kind"]> = {
    keep: "main_keep",
    hall: "great_hall",
    range: "palace_wing",
    service: "service",
    chapel: "chapel"
  };
  // These structures are architectural details of the keep, rather than independent editable parts.
  const keep = parts.find(part => part.role === "keep");
  const templateKeep = plan.buildings.find(building => building.kind === "main_keep");
  const auxiliary = plan.buildings.filter(
    building =>
      ["small_keep", "watari_yagura", "tamon_yagura"].includes(building.kind) || building.id === "norman-forebuilding"
  );
  const translate = (points: Point[], delta: Point): Point[] => points.map(([x, y]) => [x + delta[0], y + delta[1]]);
  if (keep && templateKeep) {
    const savedCenter = polygonCentroid(keep.footprint);
    const oldCenter = polygonCentroid(templateKeep.polygon);
    const delta: Point = [savedCenter[0] - oldCenter[0], savedCenter[1] - oldCenter[1]];
    for (const building of auxiliary) {
      if (building.kind !== "tamon_yagura") building.polygon = translate(building.polygon, delta);
    }
    if (plan.style === "japanese-shiro") {
      // The keep platform must enclose the saved footprint as well.
      plan.ramparts[plan.ramparts.length - 1].polygon = offsetPolygon(keep.footprint, 2.5);
    }
    if (plan.style === "motte-bailey") {
      for (const rampart of plan.ramparts.slice(0, 2)) rampart.polygon = translate(rampart.polygon, delta);
      const watchtower = plan.towers.find(tower => tower.point[0] === oldCenter[0] && tower.point[1] === oldCenter[1]);
      if (watchtower) watchtower.point = savedCenter;
      for (const gate of plan.defensiveGates) {
        if (gate.kind === "timber_ramp" && gate.approachPoints)
          gate.approachPoints = translate(gate.approachPoints, delta);
      }
    }
  }
  plan.buildings = parts.map(part => ({
    id: part.id,
    kind:
      part.role === "service" && (plan.style === "bastion-citadel" || plan.style === "ancient-castra")
        ? "barracks"
        : kinds[part.role],
    polygon: part.footprint,
    roofStyle: part.role === "keep" ? profile.keepFeatures.roofStyle : profile.rangeFeatures.roofStyle
  }));
  plan.buildings.push(...auxiliary.filter(building => building.kind === "tamon_yagura" || !!keep));
  return plan;
}

/**
 * Master generator: constructs a historically authentic FortressPlan based on the castle style.
 */
export function buildFortressPlan(
  document: CityDocument,
  castle: CastlePlan,
  profile: CastleStyleProfile
): FortressPlan {
  const circuit = document.defenseCircuits?.find(c => c.id === castle.circuitId);
  let ring = circuit ? circuitRing(document, circuit) : [];
  if (ring.length < 3 && castle.courtyards.length > 0) {
    ring = castle.courtyards[0];
  }
  const center = ring.length >= 3 ? polygonCentroid(ring) : ([0, 0] as Point);

  const gate = document.gates?.find(g => g.ownerCastleId === castle.id);
  const gatePoint: Point = gate
    ? (document.mesh.vertices[gate.vertexId]?.point ?? [center[0], center[1] - 20])
    : [center[0], center[1] - 20];

  let plan: FortressPlan;
  switch (profile.style) {
    case "japanese-shiro":
      plan = buildJapaneseShiro(ring, center, gatePoint, castle.parts);
      break;
    case "concentric":
      plan = buildConcentric(ring, center, gatePoint, castle.parts);
      break;
    case "bastion-citadel":
      plan = buildBastionCitadel(ring, center, gatePoint, castle.parts);
      break;
    case "motte-bailey":
      plan = buildMotteBailey(ring, center, gatePoint, castle.parts);
      break;
    case "norman-keep":
      plan = buildNormanKeep(ring, center, gatePoint, castle.parts);
      break;
    case "islamic-qalat":
      plan = buildIslamicQalat(ring, center, gatePoint, castle.parts);
      break;
    case "ancient-castra":
      plan = buildAncientCastra(ring, center, gatePoint, castle.parts);
      break;
    default:
      plan = buildNormanKeep(ring, center, gatePoint, castle.parts);
      break;
  }
  return scaleToWallWidth(applySavedBuildings(plan, castle.parts, profile), castleWallWidthMeters(document, castle));
}
