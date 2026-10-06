import type { Point, RegionContourLine, RegionHeightfield } from "../types";

/**
 * 空間インデックス: セル重心座標を高速に近傍検索するためのグリッドバケット
 */
class CellSpatialIndex {
  private cellSize: number;
  private buckets = new Map<string, number[]>();
  private cells: Array<{ point: Point; elevationMeters: number }>;

  constructor(cells: Array<{ point: Point; elevationMeters: number }>, cellSize = 50) {
    this.cells = cells;
    this.cellSize = cellSize;
    for (let i = 0; i < cells.length; i++) {
      const [x, y] = cells[i].point;
      const bx = Math.floor(x / cellSize);
      const by = Math.floor(y / cellSize);
      const key = `${bx},${by}`;
      let list = this.buckets.get(key);
      if (!list) {
        list = [];
        this.buckets.set(key, list);
      }
      list.push(i);
    }
  }

  findKNearest(
    x: number,
    y: number,
    k = 6
  ): Array<{ cell: { point: Point; elevationMeters: number }; distSq: number }> {
    const targetK = Math.min(k, this.cells.length);
    if (this.cells.length <= 16) {
      const candidates = this.cells.map(c => ({
        cell: c,
        distSq: (x - c.point[0]) ** 2 + (y - c.point[1]) ** 2
      }));
      candidates.sort((a, b) => a.distSq - b.distSq);
      return candidates.slice(0, targetK);
    }

    const bx = Math.floor(x / this.cellSize);
    const by = Math.floor(y / this.cellSize);
    const candidates: Array<{ cell: { point: Point; elevationMeters: number }; distSq: number }> = [];

    let ring = 0;
    const maxRing = 15;
    while (ring <= maxRing) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const key = `${bx + dx},${by + dy}`;
          const list = this.buckets.get(key);
          if (list) {
            for (const idx of list) {
              const c = this.cells[idx];
              const d2 = (x - c.point[0]) ** 2 + (y - c.point[1]) ** 2;
              candidates.push({ cell: c, distSq: d2 });
            }
          }
        }
      }
      if (candidates.length >= targetK && ring >= 1) break;
      ring++;
    }

    candidates.sort((a, b) => a.distSq - b.distSq);
    return candidates.slice(0, targetK);
  }
}

/**
 * 不規則なセルサンプリング点から等間隔なグリッド標高マップ（Heightfield）を補間生成する
 * 逆距離加重法（IDW: Inverse Distance Weighting）を使用
 */
export function generateHeightfieldFromCells(
  cells: Array<{ point: Point; elevationMeters: number }>,
  widthUnits: number,
  heightUnits: number,
  stepUnits = 12
): RegionHeightfield {
  if (cells.length === 0) {
    return {
      cols: 2,
      rows: 2,
      minElevationMeters: 0,
      maxElevationMeters: 0,
      elevationsMeters: [0, 0, 0, 0]
    };
  }

  const cols = Math.min(160, Math.max(20, Math.round(widthUnits / stepUnits) + 1));
  const rows = Math.min(160, Math.max(20, Math.round(heightUnits / stepUnits) + 1));
  const spatialIndex = new CellSpatialIndex(cells, 50);

  const elevationsMeters = new Array<number>(cols * rows);
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let r = 0; r < rows; r++) {
    const y = (r / (rows - 1)) * heightUnits;
    for (let c = 0; c < cols; c++) {
      const x = (c / (cols - 1)) * widthUnits;
      const nearest = spatialIndex.findKNearest(x, y, 6);

      let elev = 0;
      if (nearest.length > 0) {
        let exact = false;
        let sumW = 0;
        let sumE = 0;
        for (const item of nearest) {
          if (item.distSq < 0.001) {
            elev = item.cell.elevationMeters;
            exact = true;
            break;
          }
          const w = 1 / item.distSq ** 1.1;
          sumW += w;
          sumE += w * item.cell.elevationMeters;
        }
        if (!exact && sumW > 0) {
          elev = sumE / sumW;
        }
      }

      elevationsMeters[r * cols + c] = elev;
      if (elev < minElev) minElev = elev;
      if (elev > maxElev) maxElev = elev;
    }
  }

  return {
    cols,
    rows,
    minElevationMeters: Number.isFinite(minElev) ? minElev : 0,
    maxElevationMeters: Number.isFinite(maxElev) ? maxElev : 0,
    elevationsMeters
  };
}

/**
 * スタンドアロン地域地図用の合成標高グリッド（西側低地・海岸、東側山脈）を生成
 */
export function synthesizeHeightfield(
  widthUnits: number,
  heightUnits: number,
  coastPoints: Point[],
  stepUnits = 12
): RegionHeightfield {
  const cols = Math.min(160, Math.max(20, Math.round(widthUnits / stepUnits) + 1));
  const rows = Math.min(160, Math.max(20, Math.round(heightUnits / stepUnits) + 1));
  const elevationsMeters = new Array<number>(cols * rows);

  let minElev = Infinity;
  let maxElev = -Infinity;

  const getCoastX = (y: number): number => {
    if (coastPoints.length === 0) return widthUnits * 0.28;
    const t = Math.max(0, Math.min(1, y / heightUnits)) * (coastPoints.length - 1);
    const i = Math.floor(t);
    const frac = t - i;
    const p1 = coastPoints[i];
    const p2 = coastPoints[Math.min(i + 1, coastPoints.length - 1)];
    return p1[0] + (p2[0] - p1[0]) * frac;
  };

  for (let r = 0; r < rows; r++) {
    const y = (r / (rows - 1)) * heightUnits;
    const coastX = getCoastX(y);
    for (let c = 0; c < cols; c++) {
      const x = (c / (cols - 1)) * widthUnits;

      let elev = 0;
      if (x < coastX) {
        // 海洋
        elev = 0;
      } else {
        // 陸地: 東に行くにつれて上昇、北東の山脈で高標高
        const landRatio = Math.min(1, Math.max(0, (x - coastX) / (widthUnits - coastX)));
        // 平地（0-250m） -> 丘陵（250-900m） -> 山岳（900-2600m）
        const baseElevation = landRatio ** 1.8 * 2400;
        // 有機的な尾根・谷のうねり（sin波合成）
        const noise =
          Math.sin(x * 0.015 + y * 0.01) * 80 + Math.sin(x * 0.04 - y * 0.035) * 45 + Math.cos(y * 0.02) * 50;
        elev = Math.max(0, baseElevation + noise);
      }

      elevationsMeters[r * cols + c] = elev;
      if (elev < minElev) minElev = elev;
      if (elev > maxElev) maxElev = elev;
    }
  }

  return {
    cols,
    rows,
    minElevationMeters: Number.isFinite(minElev) ? minElev : 0,
    maxElevationMeters: Number.isFinite(maxElev) ? maxElev : 0,
    elevationsMeters
  };
}

interface Segment {
  p0: Point;
  p1: Point;
  used: boolean;
}

/**
 * Marching Squares アルゴリズムにより標高グリッドから等高線ポリラインを生成
 */
export function generateContourLines(
  heightfield: RegionHeightfield,
  widthUnits: number,
  heightUnits: number,
  customInterval?: number
): { contours: RegionContourLine[]; intervalMeters: number; indexIntervalMeters: number } {
  const { cols, rows, minElevationMeters, maxElevationMeters, elevationsMeters } = heightfield;
  const range = maxElevationMeters - Math.max(0, minElevationMeters);

  if (range <= 10 || maxElevationMeters <= 0) {
    return { contours: [], intervalMeters: 50, indexIntervalMeters: 250 };
  }

  // 標高差に応じた等高線間隔の選定
  let interval = 100;
  let indexInterval = 500;

  if (customInterval && customInterval > 0) {
    interval = customInterval;
    indexInterval = customInterval * 5;
  } else if (range <= 150) {
    interval = 25;
    indexInterval = 100;
  } else if (range <= 400) {
    interval = 50;
    indexInterval = 250;
  } else if (range <= 1200) {
    interval = 100;
    indexInterval = 500;
  } else if (range <= 2500) {
    interval = 200;
    indexInterval = 1000;
  } else {
    interval = 250;
    indexInterval = 1000;
  }

  const startLevel = Math.max(interval, Math.ceil(minElevationMeters / interval) * interval);
  const endLevel = Math.floor(maxElevationMeters / interval) * interval;

  const contours: RegionContourLine[] = [];
  let contourIdCounter = 1;

  for (let level = startLevel; level <= endLevel; level += interval) {
    const isIndex = Math.round(level) % indexInterval === 0;
    const segments: Segment[] = [];

    // グリッドセル走査
    for (let r = 0; r < rows - 1; r++) {
      const y0 = (r / (rows - 1)) * heightUnits;
      const y1 = ((r + 1) / (rows - 1)) * heightUnits;

      for (let c = 0; c < cols - 1; c++) {
        const x0 = (c / (cols - 1)) * widthUnits;
        const x1 = ((c + 1) / (cols - 1)) * widthUnits;

        const v0 = elevationsMeters[r * cols + c];
        const v1 = elevationsMeters[r * cols + (c + 1)];
        const v2 = elevationsMeters[(r + 1) * cols + (c + 1)];
        const v3 = elevationsMeters[(r + 1) * cols + c];

        const b0 = v0 >= level ? 8 : 0;
        const b1 = v1 >= level ? 4 : 0;
        const b2 = v2 >= level ? 2 : 0;
        const b3 = v3 >= level ? 1 : 0;
        const cellCase = b0 | b1 | b2 | b3;

        if (cellCase === 0 || cellCase === 15) continue;

        // 各辺の線形補間交差位置
        const pTop: Point = [x0 + ((level - v0) / (v1 - v0 || 1e-6)) * (x1 - x0), y0];
        const pRight: Point = [x1, y0 + ((level - v1) / (v2 - v1 || 1e-6)) * (y1 - y0)];
        const pBottom: Point = [x0 + ((level - v3) / (v2 - v3 || 1e-6)) * (x1 - x0), y1];
        const pLeft: Point = [x0, y0 + ((level - v0) / (v3 - v0 || 1e-6)) * (y1 - y0)];

        switch (cellCase) {
          case 1:
          case 14:
            segments.push({ p0: pLeft, p1: pBottom, used: false });
            break;
          case 2:
          case 13:
            segments.push({ p0: pBottom, p1: pRight, used: false });
            break;
          case 3:
          case 12:
            segments.push({ p0: pLeft, p1: pRight, used: false });
            break;
          case 4:
          case 11:
            segments.push({ p0: pTop, p1: pRight, used: false });
            break;
          case 5: {
            // サドル点: 4隅平均値で結合方向を判定
            const avg = (v0 + v1 + v2 + v3) / 4;
            if (avg >= level) {
              segments.push({ p0: pTop, p1: pLeft, used: false });
              segments.push({ p0: pBottom, p1: pRight, used: false });
            } else {
              segments.push({ p0: pTop, p1: pRight, used: false });
              segments.push({ p0: pLeft, p1: pBottom, used: false });
            }
            break;
          }
          case 6:
          case 9:
            segments.push({ p0: pTop, p1: pBottom, used: false });
            break;
          case 7:
          case 8:
            segments.push({ p0: pLeft, p1: pTop, used: false });
            break;
          case 10: {
            // サドル点
            const avg = (v0 + v1 + v2 + v3) / 4;
            if (avg >= level) {
              segments.push({ p0: pTop, p1: pRight, used: false });
              segments.push({ p0: pBottom, p1: pLeft, used: false });
            } else {
              segments.push({ p0: pTop, p1: pLeft, used: false });
              segments.push({ p0: pBottom, p1: pRight, used: false });
            }
            break;
          }
        }
      }
    }

    if (segments.length === 0) continue;

    // 線分の縫合（Polyline Stitching）
    const polylines = stitchSegments(segments);

    for (const poly of polylines) {
      if (poly.points.length < 2) continue;

      // 短すぎる微小ゴミ線（長さ5px未満）の除外
      let totalLen = 0;
      for (let i = 0; i < poly.points.length - 1; i++) {
        const dx = poly.points[i + 1][0] - poly.points[i][0];
        const dy = poly.points[i + 1][1] - poly.points[i][1];
        totalLen += Math.sqrt(dx * dx + dy * dy);
      }
      if (totalLen < 6 && poly.isClosed) continue;

      // ラプラシアンスムージングで滑らかな手描き等高線に整形
      const smoothed = smoothPolyline(poly.points, poly.isClosed);

      contours.push({
        id: `contour-${level}-${contourIdCounter++}`,
        elevationMeters: level,
        points: smoothed,
        isIndex,
        isClosed: poly.isClosed
      });
    }
  }

  return { contours, intervalMeters: interval, indexIntervalMeters: indexInterval };
}

/**
 * 線分群を端点の一致によって連続ポリラインへと縫合する
 */
function stitchSegments(segments: Segment[]): Array<{ points: Point[]; isClosed: boolean }> {
  const result: Array<{ points: Point[]; isClosed: boolean }> = [];
  const pointKey = (p: Point): string => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;

  const endpointMap = new Map<string, Array<{ seg: Segment; isP0: boolean }>>();
  for (const seg of segments) {
    const k0 = pointKey(seg.p0);
    const k1 = pointKey(seg.p1);

    let l0 = endpointMap.get(k0);
    if (!l0) {
      l0 = [];
      endpointMap.set(k0, l0);
    }
    l0.push({ seg, isP0: true });

    let l1 = endpointMap.get(k1);
    if (!l1) {
      l1 = [];
      endpointMap.set(k1, l1);
    }
    l1.push({ seg, isP0: false });
  }

  for (const seg of segments) {
    if (seg.used) continue;
    seg.used = true;

    const polyline: Point[] = [seg.p0, seg.p1];
    let isClosed = false;

    // 前方に延長
    while (true) {
      const tip = polyline[polyline.length - 1];
      const tipKey = pointKey(tip);
      const connections = endpointMap.get(tipKey);
      let found = false;

      if (connections) {
        for (const conn of connections) {
          if (!conn.seg.used) {
            conn.seg.used = true;
            const nextPt = conn.isP0 ? conn.seg.p1 : conn.seg.p0;
            polyline.push(nextPt);
            found = true;
            if (pointKey(nextPt) === pointKey(polyline[0])) {
              isClosed = true;
            }
            break;
          }
        }
      }

      if (!found || isClosed) break;
    }

    // 閉じていない場合は後方（始点側）にも延長
    if (!isClosed) {
      while (true) {
        const head = polyline[0];
        const headKey = pointKey(head);
        const connections = endpointMap.get(headKey);
        let found = false;

        if (connections) {
          for (const conn of connections) {
            if (!conn.seg.used) {
              conn.seg.used = true;
              const prevPt = conn.isP0 ? conn.seg.p1 : conn.seg.p0;
              polyline.unshift(prevPt);
              found = true;
              if (pointKey(prevPt) === pointKey(polyline[polyline.length - 1])) {
                isClosed = true;
              }
              break;
            }
          }
        }

        if (!found || isClosed) break;
      }
    }

    result.push({ points: polyline, isClosed });
  }

  return result;
}

/**
 * ポリラインのラプラシアンスムージング
 */
function smoothPolyline(pts: Point[], isClosed: boolean): Point[] {
  if (pts.length < 3) return pts;
  const smoothed: Point[] = [];
  if (!isClosed) smoothed.push(pts[0]);

  const count = isClosed ? pts.length : pts.length - 1;
  const start = isClosed ? 0 : 1;

  for (let i = start; i < count; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    smoothed.push([0.22 * prev[0] + 0.56 * curr[0] + 0.22 * next[0], 0.22 * prev[1] + 0.56 * curr[1] + 0.22 * next[1]]);
  }

  if (!isClosed) {
    smoothed.push(pts[pts.length - 1]);
  } else {
    // 閉曲線の末尾を始点と同一にする
    smoothed.push(smoothed[0]);
  }

  return smoothed;
}
