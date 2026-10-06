import { cloneRegionDocument } from "./document";
import { generateContourLines } from "./gen/contours";
import { generatePerpendicularBridges } from "./gen/perpendicularBridges";
import { distance } from "./geometry";
import type {
  BiomeKind,
  Point,
  RegionBiomeArea,
  RegionDocument,
  RegionLandmark,
  RegionSettlement,
  RegionSymbol,
  SymbolType
} from "./types";

/**
 * シンボルを追加し、Y 座標順（北から南）で再ソートする
 */
export function addSymbol(doc: RegionDocument, symbol: RegionSymbol): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.symbols.push(symbol);
  next.symbols.sort((a, b) => a.y - b.y);
  return next;
}

export function removeSymbol(doc: RegionDocument, symbolId: string): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.symbols = next.symbols.filter(s => s.id !== symbolId);
  return next;
}

export function moveSymbol(doc: RegionDocument, symbolId: string, x: number, y: number): RegionDocument {
  const next = cloneRegionDocument(doc);
  const sym = next.symbols.find(s => s.id === symbolId);
  if (sym && !sym.locked) {
    sym.x = x;
    sym.y = y;
    next.symbols.sort((a, b) => a.y - b.y);
  }
  return next;
}

export function addSettlement(doc: RegionDocument, settlement: RegionSettlement): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.settlements.push({ ...settlement, farmlandAreaHectares: settlement.farmlandAreaHectares ?? 0 });
  return next;
}

export function updateSettlement(doc: RegionDocument, settlement: RegionSettlement): RegionDocument {
  const next = cloneRegionDocument(doc);
  const idx = next.settlements.findIndex(s => s.id === settlement.id);
  if (idx >= 0) {
    next.settlements[idx] = { ...settlement };
  }
  return next;
}

export function removeSettlement(doc: RegionDocument, settlementId: string): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.settlements = next.settlements.filter(s => s.id !== settlementId);
  return next;
}

export function addLandmark(doc: RegionDocument, landmark: RegionLandmark): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.landmarks.push(landmark);
  return next;
}

export function updateLandmark(doc: RegionDocument, landmark: RegionLandmark): RegionDocument {
  const next = cloneRegionDocument(doc);
  const idx = next.landmarks.findIndex(l => l.id === landmark.id);
  if (idx >= 0) {
    next.landmarks[idx] = { ...landmark };
  }
  return next;
}

export function removeLandmark(doc: RegionDocument, landmarkId: string): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.landmarks = next.landmarks.filter(l => l.id !== landmarkId);
  return next;
}

/**
 * バイオーム筆塗り（円形ブラシでポリゴンを作成しバイオーム面を追加＋シンボル配置）
 */
export function paintBiome(doc: RegionDocument, center: Point, radius: number, kind: BiomeKind): RegionDocument {
  const next = cloneRegionDocument(doc);

  // 円形ポリゴン（12頂点）の生成
  const segments = 12;
  const poly: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    poly.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }

  const newArea: RegionBiomeArea = {
    id: `bio-${kind}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind,
    polygon: poly
  };
  next.biomes.push(newArea);

  // 森林や山岳の場合は、円内に数個のシンボルを自動散布
  if (kind.includes("forest") || kind.includes("mountains") || kind.includes("hills")) {
    const count = Math.max(1, Math.floor(radius / 12));
    for (let i = 0; i < count; i++) {
      const dist = Math.random() * radius * 0.75;
      const ang = Math.random() * Math.PI * 2;
      const x = center[0] + Math.cos(ang) * dist;
      const y = center[1] + Math.sin(ang) * dist;

      let symType: SymbolType = "tree_deciduous";
      if (kind === "coniferous_forest") symType = "tree_pine";
      else if (kind === "tropical_forest") symType = "tree_jungle";
      else if (kind === "mountains") symType = Math.random() > 0.5 ? "mountain_peak_major" : "mountain_peak_minor";
      else if (kind === "hills") symType = "hill_single";

      next.symbols.push({
        id: `sym-brush-${Date.now()}-${i}`,
        type: symType,
        x,
        y,
        scale: 0.8 + Math.random() * 0.3,
        rotationDeg: 0
      });
    }
    next.symbols.sort((a, b) => a.y - b.y);
  }

  return next;
}

/**
 * 指定位置の近傍シンボルを消去する
 */
export function eraseAt(doc: RegionDocument, center: Point, radius: number): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.symbols = next.symbols.filter(s => distance([s.x, s.y], center) > radius);
  return next;
}

/**
 * 道路を追加または更新し、直角橋を自動再計算する（AGENTS.md 原則遵守）
 */
export function updateRoutesAndBridges(doc: RegionDocument): RegionDocument {
  const next = cloneRegionDocument(doc);
  const result = generatePerpendicularBridges(next.rivers, next.routes, next.bounds.metersPerUnit);
  next.bridges = result.bridges;
  next.routes = result.adjustedRoutes;
  return next;
}

/**
 * 等高線レイヤーの表示/非表示を切り替える
 */
export function toggleContours(doc: RegionDocument, show?: boolean): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.terrain.showContours = show ?? !(next.terrain.showContours ?? true);
  return next;
}

/**
 * 都市アイコンの拡大倍率を設定する（整数、最小1）
 */
export function setSettlementIconScale(doc: RegionDocument, scale: number): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.decoration.settlementIconScale = Number.isFinite(scale) ? Math.max(1, Math.round(scale)) : 1;
  return next;
}

function sanitizeWidthScale(scale: number): number {
  return Number.isFinite(scale) ? Math.max(0.5, scale) : 1;
}

/**
 * 街道の線幅倍率を設定する（最小0.5）
 */
export function setRouteWidthScale(doc: RegionDocument, scale: number): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.decoration.routeWidthScale = sanitizeWidthScale(scale);
  return next;
}

/**
 * 河川の川幅倍率を設定する（最小0.5）
 */
export function setRiverWidthScale(doc: RegionDocument, scale: number): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.decoration.riverWidthScale = sanitizeWidthScale(scale);
  return next;
}

/**
 * 主等高線の標高注記の表示/非表示を切り替える（デフォルトは非表示）
 */
export function toggleContourElevations(doc: RegionDocument, show?: boolean): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.terrain.showContourElevations = show ?? !(next.terrain.showContourElevations ?? false);
  return next;
}

/**
 * セル境界線の表示/非表示を切り替える（デフォルトは非表示）
 */
export function toggleCellBorders(doc: RegionDocument, show?: boolean): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.terrain.showCellBorders = show ?? !(next.terrain.showCellBorders ?? false);
  return next;
}

/** セルをFMGバイオーム色の単色で塗る表示の切り替え */
export function toggleBiomeCells(doc: RegionDocument, show?: boolean): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.terrain.showBiomeCells = show ?? !(next.terrain.showBiomeCells ?? false);
  return next;
}

/** 高山の真上視点表現（陰影・高度帯）の切り替え */
export function toggleRelief(doc: RegionDocument, show?: boolean): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.terrain.showRelief = show ?? !(next.terrain.showRelief ?? false);
  return next;
}

/** セル境界線の重なり順を設定する */
export function setCellBorderOrder(doc: RegionDocument, order: "top" | "bottom"): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.terrain.cellBorderOrder = order;
  return next;
}

/** セル境界線の不透明度（0〜1）を設定する */
export function setCellBorderOpacity(doc: RegionDocument, opacity: number): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.terrain.cellBorderOpacity = Math.max(0, Math.min(1, opacity));
  return next;
}

/**
 * 耕作地レイヤーの表示/非表示を切り替える（デフォルトは非表示）
 */
export function toggleCultivation(doc: RegionDocument, show?: boolean): RegionDocument {
  const next = cloneRegionDocument(doc);
  next.terrain.showCultivation = show ?? !(next.terrain.showCultivation ?? false);
  return next;
}

/**
 * 等高線の生成間隔を変更し、等高線を再生成する
 */
export function updateContourInterval(doc: RegionDocument, intervalMeters: number): RegionDocument {
  const next = cloneRegionDocument(doc);
  if (next.terrain.heightfield) {
    const widthUnits = next.bounds.widthMeters / next.bounds.metersPerUnit;
    const heightUnits = next.bounds.heightMeters / next.bounds.metersPerUnit;
    const res = generateContourLines(next.terrain.heightfield, widthUnits, heightUnits, intervalMeters);
    next.terrain.contours = res.contours;
    next.terrain.contourIntervalMeters = res.intervalMeters;
    next.terrain.showContours = true;
  }
  return next;
}
