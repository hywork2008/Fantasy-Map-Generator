import { getCoastalHabitatKey } from "../../../data/coastalHabitatCatalog";
import { type Point, type RegionSiteCell, type RegionWetlandPatch, WETLAND_LEVELS } from "../types";
import { clipConvex, landscapeNoise, polygonArea, rectangle } from "./landUseGeometry";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 蒸発散量の粗い推定 (mm/年)。気温が高いほど水が失われる。 */
function potentialEvapotranspirationMm(temperatureC: number | undefined): number {
  return clamp(350 + 40 * (temperatureC ?? 10), 250, 1700);
}

/** 降水量 / 蒸発散量。1 を超えると水が余る。 */
function humidityRatio(c: RegionSiteCell): number {
  return (c.annualPrecipitationMm ?? 900) / potentialEvapotranspirationMm(c.annualTemperatureC);
}

/** 冠水段階の閾値の起点（これ未満は湿地面を描かない）。 */
const LEVEL_FLOOR = 0.36;
/** 最小で使う段階数と最大の段階数。乾燥した湿地でも 5 段階は描き分ける。 */
const MIN_LEVELS = 5;

/**
 * 湿地の冠水段階を等高線状の入れ子の面として生成する（水文シミュレーションではなく視覚的推定）。
 *
 * 段階 0 = 湿った地面 / 1 = 飽和した泥 / 2 = スゲ・湿草地 / 3 = 葦の湿原 /
 * 4 = 浅く冠水した湿原 / 5 = 冠水した抽水植物帯 / 6 = 抽水植物の混じる浅い水面 /
 * 7 = 池・水路 / 8 = 浅い開放水面 / 9 = 深い開放水面。
 *
 * 使う段階数（5〜10）はセルの湿潤度で決まる。降水量と気温（蒸発散）の比、周囲セルの乾燥度、
 * 周囲より低いか、近くに水があるか、で決まり、乾燥した地域の湿地は浅い段階だけを細かく刻む。
 * ワールド座標のノイズで隣接セルは同じ微地形を共有する。砂は砂質の海岸基質があるときだけ。
 */
export function buildWetlandPatches(
  cell: RegionSiteCell,
  cells: RegionSiteCell[],
  seed: string,
  metersPerMapUnit: number
): RegionWetlandPatch[] {
  const poly = cell.polygon;
  if (!poly || poly.length < 3) return [];
  const scale = Math.max(0.001, metersPerMapUnit);
  const xs = poly.map(p => p[0]),
    ys = poly.map(p => p[1]);
  const step = Math.max(180 / scale, Math.sqrt(polygonArea(poly) / 256));
  const radius = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
  const nearby = cells.filter(c => Math.hypot(c.point[0] - cell.point[0], c.point[1] - cell.point[1]) <= radius * 2);
  const water = nearby.filter(c => c.isWater || (c.height !== undefined && c.height < 20));
  const land = nearby.filter(c => !c.isWater && (c.height === undefined || c.height >= 20));
  const habitat = getCoastalHabitatKey(cell.coastalHabitat ?? 0);
  const sandy = habitat === "sandyBeach" || habitat === "coastalDune";

  // 湿潤度: 自セルと周囲の乾燥度を混ぜる（周囲が乾いていれば水は集まりにくい）
  const neighbours = land.filter(c => c !== cell && c.annualPrecipitationMm !== undefined);
  const ownRatio = humidityRatio(cell);
  const surroundRatio = neighbours.length
    ? neighbours.reduce((sum, c) => sum + humidityRatio(c), 0) / neighbours.length
    : ownRatio;
  const humidity = clamp01((0.65 * ownRatio + 0.35 * surroundRatio - 0.4) / 1.8);
  const meanSurroundElevation = land.length
    ? land.reduce((sum, c) => sum + c.elevationMeters, 0) / land.length
    : cell.elevationMeters;
  const lowness = clamp01(0.5 + (meanSurroundElevation - cell.elevationMeters) / 200);
  const nearestWater = water.length
    ? Math.min(...water.map(c => Math.hypot(c.point[0] - cell.point[0], c.point[1] - cell.point[1]) * scale))
    : Infinity;
  const waterNear = Math.exp(-nearestWater / 3000);
  const wetness = clamp01(0.5 * humidity + 0.25 * lowness + 0.25 * waterNear);
  const levelCount = Math.round(MIN_LEVELS + (WETLAND_LEVELS - MIN_LEVELS) * wetness);
  // 乾燥した湿地は浅い段階を細かく刻み（スパン小）、湿潤な湿地は深い段階まで伸ばす（スパン大）
  const span = 0.13 + 0.45 * wetness;
  const thresholds = Array.from({ length: levelCount }, (_, k) => LEVEL_FLOOR + (span * k) / (levelCount - 1));
  const climateShift = (wetness - 0.5) * 0.3;

  const score = (p: Point) => {
    // IDW interpolation of surrounding land elevations: coarse terrain is only a
    // relative wetness cue; subcell relief cannot be recovered from FMG heights.
    let total = 0,
      weight = 0;
    for (const c of land) {
      const w = 1 / (1 + Math.hypot(p[0] - c.point[0], p[1] - c.point[1]) ** 2);
      total += w * c.elevationMeters;
      weight += w;
    }
    const relativeLow = weight ? clamp((cell.elevationMeters - total / weight) / 300, -0.08, 0.08) : 0;
    const waterDistance = water.length
      ? Math.min(...water.map(c => Math.hypot(p[0] - c.point[0], p[1] - c.point[1]) * scale))
      : Infinity;
    const proximity = 0.08 * Math.exp(-waterDistance / 1500);
    return (
      landscapeNoise((p[0] * scale) / 160, (p[1] * scale) / 160, `${seed}:wetland`) +
      climateShift +
      relativeLow +
      proximity
    );
  };
  const patches: RegionWetlandPatch[] = [];
  // Linear scalar clipping keeps natural contour edges rather than visible grid tiles.
  const contourAbove = (points: Point[], values: number[], threshold: number): Point[] => {
    const result: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const a = values[i] - threshold,
        b = values[j] - threshold;
      if (a >= 0) result.push(points[i]);
      if (a >= 0 !== b >= 0) {
        const t = a / (a - b);
        result.push([
          points[i][0] + t * (points[j][0] - points[i][0]),
          points[i][1] + t * (points[j][1] - points[i][1])
        ]);
      }
    }
    return result;
  };
  for (let ix = Math.floor(Math.min(...xs) / step); ix * step < Math.max(...xs); ix++) {
    for (let iy = Math.floor(Math.min(...ys) / step); iy * step < Math.max(...ys); iy++) {
      const square = rectangle(ix * step, iy * step, step, step);
      for (const tri of [
        [square[0], square[1], square[2]],
        [square[0], square[2], square[3]]
      ]) {
        const values = tri.map(score);
        const peak = Math.max(...values);
        for (let level = 0; level < levelCount && thresholds[level] <= peak; level++) {
          const clipped = clipConvex(contourAbove(tri, values, thresholds[level]), poly);
          if (polygonArea(clipped) <= 1e-8) continue;
          patches.push({
            kind: level >= 6 ? "water" : sandy ? "sand" : "mud",
            level,
            polygon: clipped
          });
        }
      }
    }
  }
  return patches;
}
