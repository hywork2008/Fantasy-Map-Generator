import { distance, pointInPolygon } from "../geometry";
import type { Point } from "../types";

/**
 * 2D Bridson's Poisson Disc Sampling
 * ポリゴンまたは境界矩形内に、最小距離 minRadius を保ちながら均等に点を散布する。
 */
export function poissonDiscSampling(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  minRadius: number,
  rng: () => number,
  polygon?: Point[],
  k = 30
): Point[] {
  const cellSize = minRadius / Math.SQRT2;
  const gridWidth = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
  const gridHeight = Math.ceil((bounds.maxY - bounds.minY) / cellSize);

  // グリッドには点のインデックスを格納
  const grid: Array<number | -1> = new Array(gridWidth * gridHeight).fill(-1);
  const points: Point[] = [];
  const activeList: number[] = [];

  const getGridIndex = (x: number, y: number): number => {
    const col = Math.floor((x - bounds.minX) / cellSize);
    const row = Math.floor((y - bounds.minY) / cellSize);
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) return -1;
    return row * gridWidth + col;
  };

  // 最初のシード点を探す
  let initialPoint: Point | null = null;
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate: Point = [
      bounds.minX + rng() * (bounds.maxX - bounds.minX),
      bounds.minY + rng() * (bounds.maxY - bounds.minY)
    ];
    if (!polygon || pointInPolygon(candidate, polygon)) {
      initialPoint = candidate;
      break;
    }
  }

  if (!initialPoint) return [];

  points.push(initialPoint);
  activeList.push(0);
  const initialGIdx = getGridIndex(initialPoint[0], initialPoint[1]);
  if (initialGIdx >= 0) grid[initialGIdx] = 0;

  while (activeList.length > 0) {
    const activeIdx = Math.floor(rng() * activeList.length);
    const pointIdx = activeList[activeIdx];
    const basePoint = points[pointIdx];
    let found = false;

    for (let i = 0; i < k; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = minRadius * (1 + rng()); // [r, 2r]
      const nx = basePoint[0] + Math.cos(angle) * radius;
      const ny = basePoint[1] + Math.sin(angle) * radius;

      if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) {
        continue;
      }
      const candidate: Point = [nx, ny];
      if (polygon && !pointInPolygon(candidate, polygon)) {
        continue;
      }

      // 近傍セルの点を検査
      const col = Math.floor((nx - bounds.minX) / cellSize);
      const row = Math.floor((ny - bounds.minY) / cellSize);
      let ok = true;

      for (let r = Math.max(0, row - 2); r <= Math.min(gridHeight - 1, row + 2); r++) {
        for (let c = Math.max(0, col - 2); c <= Math.min(gridWidth - 1, col + 2); c++) {
          const neighborIdx = grid[r * gridWidth + c];
          if (neighborIdx !== -1) {
            const neighbor = points[neighborIdx];
            if (distance(candidate, neighbor) < minRadius) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) break;
      }

      if (ok) {
        points.push(candidate);
        const newPointIdx = points.length - 1;
        activeList.push(newPointIdx);
        const gIdx = getGridIndex(nx, ny);
        if (gIdx >= 0) grid[gIdx] = newPointIdx;
        found = true;
        break;
      }
    }

    if (!found) {
      activeList.splice(activeIdx, 1);
    }
  }

  return points;
}
