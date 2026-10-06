import { pointInPolygon } from "../core/geometry";
import { DEFAULT_FOREST_DENSITY_THRESHOLD, type Point, type RegionDocument } from "../core/types";
import type { ForestMass } from "./forestMass";

export interface CellInfo {
  id: string;
  /** FMG のセル番号（id が bio-cell-N の場合） */
  cellId: number | null;
  kind: string;
  terrainKind?: string;
  areaHa: number;
  forestCover?: number;
  forestStock?: number;
  /** 保存された森林ポリゴンの面積 ÷ セル面積（実際に森がある割合） */
  forestPolygonRatio: number | null;
  forestPolygonCount: number;
  /** 森林塊の判定を行う対象か（森林バイオーム） */
  isForest: boolean;
  /** セル内のぼかし後森林密度の平均と最大。mass が無ければ null */
  meanDensity: number | null;
  maxDensity: number | null;
  /** セル内で森林塊（密度 ≥ しきい値）として描かれる面積割合 */
  drawnRatio: number | null;
  threshold: number;
  /** 森林ポリゴンがあるのに 1 本も描かれないセルか（しきい値を下げれば描かれる可能性がある） */
  vanishes: boolean;
  landUse: Array<{ kind: string; areaHa: number }>;
  settlements: string[];
}

function ringArea(ring: Point[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a / 2);
}

/** 選択したセル（bio-cell-N）の森林・土地利用の情報を集める。見つからなければ null */
export function describeCell(
  doc: RegionDocument,
  biomeId: string,
  mass: ForestMass | null | undefined
): CellInfo | null {
  const cell = doc.biomes.find(b => b.id === biomeId);
  if (!cell) return null;
  const haPerUnit2 = (doc.bounds.metersPerUnit * doc.bounds.metersPerUnit) / 10_000;
  const cellArea = ringArea(cell.polygon);
  const polys = cell.forestPolygons ?? [];
  const forestArea = polys.reduce((s, p) => s + ringArea(p), 0);
  const threshold = doc.terrain.forestDensityThreshold ?? DEFAULT_FOREST_DENSITY_THRESHOLD;
  const isForest = cell.forestPolygons !== undefined;

  let meanDensity: number | null = null;
  let maxDensity: number | null = null;
  let drawnRatio: number | null = null;
  if (mass && isForest && cellArea > 0) {
    const xs = cell.polygon.map(p => p[0]);
    const ys = cell.polygon.map(p => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const step = Math.max(Math.sqrt(cellArea / 1600), 1e-6);
    let n = 0;
    let sum = 0;
    let max = 0;
    let drawn = 0;
    for (let x = x0 + step / 2; x < Math.max(...xs); x += step)
      for (let y = y0 + step / 2; y < Math.max(...ys); y += step) {
        if (!pointInPolygon([x, y], cell.polygon)) continue;
        const d = mass.density([x, y]);
        n++;
        sum += d;
        if (d > max) max = d;
        if (d >= threshold) drawn++;
      }
    if (n > 0) {
      meanDensity = sum / n;
      maxDensity = max;
      drawnRatio = drawn / n;
    }
  }

  const m = /^bio-cell-(\d+)$/.exec(cell.id);
  const cellId = m ? Number(m[1]) : null;
  const byKind = new Map<string, number>();
  for (const p of doc.landUse?.patches ?? [])
    if (cellId !== null && p.sourceCellId === cellId) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + p.areaHa);

  return {
    id: cell.id,
    cellId,
    kind: cell.kind,
    terrainKind: cell.terrainKind,
    areaHa: cellArea * haPerUnit2,
    forestCover: cell.forestCover,
    forestStock: cell.forestStock,
    forestPolygonRatio: isForest && cellArea > 0 ? forestArea / cellArea : null,
    forestPolygonCount: polys.length,
    isForest,
    meanDensity,
    maxDensity,
    drawnRatio,
    threshold,
    vanishes: isForest && polys.length > 0 && drawnRatio === 0,
    landUse: [...byKind].map(([kind, areaHa]) => ({ kind, areaHa })).sort((a, b) => b.areaHa - a.areaHa),
    settlements: doc.settlements.filter(s => pointInPolygon(s.position, cell.polygon)).map(s => s.name)
  };
}
