import { generateHeightfieldFromCells } from "../core/gen/contours";
import type { Point, RegionHeightfield, RegionReliefSettings } from "../core/types";

/**
 * 高山の真上視点表現（Alpine Relief）
 * 設計: docs/plan/region-editor-alpine-relief.md
 *
 * 粗い標高グリッドに斜面方向の谷筋（LIC）を刻んだディテール標高 H を作り、
 * 同じ H から陰影・落ち影・高度帯（低木・岩・雪）を求めて 1 枚の RGBA ラスタに合成する。
 * 森と雪が同じシワを共有するのは、どちらも H から導くため。
 */

/** 気候サンプル: [x, y, 標高 m, 年平均気温 °C]（RE ローカル座標） */
export type ClimateSample = [number, number, number, number];

export const DEFAULT_RELIEF_SETTINGS: Required<RegionReliefSettings> = {
  sunAzimuthDeg: 315,
  sunAltitudeDeg: 35,
  verticalExaggeration: 3,
  hideMountainSymbols: true
};

/** 較正用の定数（ライブ表示で調整する） */
export const RELIEF_CONSTANTS = {
  maxRasterSide: 1600,
  maxPxPerUnit: 2,
  lapseRateCPerM: 0.0065,
  /** 気候サンプルが無いときの海面気温 */
  defaultSeaLevelTempC: 14,
  /** 谷筋の横方向間隔 (m) */
  gullySpacingM: 260,
  /** LIC の片側積分長 (m) */
  gullyLengthM: 900,
  /** 谷の深さ = clamp(標高 × k, 0, max) × 傾斜係数 */
  gullyDepthPerM: 0.03,
  gullyDepthMaxM: 60,
  gullySlopeLo: 0.025,
  gullySlopeHi: 0.12,
  /** 谷筋の最小間隔・最小積分長（ラスタ画素数）。広域地図で 1px 未満の縞にならないようにする */
  gullyMinSpacingPx: 5,
  gullyMinLengthPx: 14,
  /** 谷の深さの上限 = 谷間隔 × この比（急すぎる微小斜面で全面が岩になるのを防ぐ） */
  gullyDepthPerSpacing: 0.12,
  /**
   * 帯の気温しきい値 (°C)。FMG の気候に合わせて較正（2026-10-06 実測）:
   * FMG の Glacier セル ≈ −1°C、Alpine tundra 5〜8°C、Montane forest ≈ 10°C。
   */
  treeLineC: 6.5,
  alpineC: 3,
  snowLineC: 0.5,
  bandSoftC: 0.6,
  /** 太陽と反対向きの斜面は寒い（雪線が下がる） */
  aspectC: 1.5,
  /** 谷筋に雪が残る分の補正 */
  valleySnowC: 1.5,
  bandNoiseC: 0.7,
  bandNoiseSpacingM: 2200,
  rockSlopeLoDeg: 30,
  rockSlopeHiDeg: 40,
  snowSlopeLoDeg: 34,
  snowSlopeHiDeg: 46,
  /**
   * 山岳マスク M: 周囲（半径 baseRadiusM の平均）からの比高、または絶対標高で山地とみなす。
   * 高度帯と谷筋は M の範囲だけに描く。寒冷地の低地の森・ツンドラは FMG のバイオームのまま残す。
   */
  baseRadiusM: 20000,
  mountainReliefLoM: 250,
  mountainReliefHiM: 700,
  mountainElevLoM: 1000,
  mountainElevHiM: 1600,
  /** 山地外の陰影の強さ（ハイライトは付けない） */
  lowlandShade: 0.3,
  shadeDark: 0.55,
  shadeLight: 0.4,
  castShadow: 0.38,
  castShadowExaggeration: 1.5,
  castShadowDownsample: 4
};

const COLORS = {
  scrub: [156, 159, 110],
  rock: [138, 128, 114],
  snow: [244, 246, 248],
  shadow: [0, 0, 0],
  snowShadow: [61, 83, 112],
  light: [255, 255, 255]
} as const;

export interface ReliefInput {
  heightfield: RegionHeightfield;
  widthUnits: number;
  heightUnits: number;
  metersPerUnit: number;
  seed: string;
  climateSamples?: ClimateSample[];
  settings?: RegionReliefSettings;
  monochrome?: boolean;
}

export interface ReliefRaster {
  width: number;
  height: number;
  /** 非乗算 RGBA */
  rgba: Uint8ClampedArray;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function seedHash(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function hash2(ix: number, iy: number, salt: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 格子間隔 spacing のバリューノイズ（0〜1） */
function valueNoise(x: number, y: number, spacing: number, salt: number): number {
  const fx = x / spacing;
  const fy = y / spacing;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, salt);
  const b = hash2(ix + 1, iy, salt);
  const c = hash2(ix, iy + 1, salt);
  const d = hash2(ix + 1, iy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** グリッド（0..widthUnits に cols 点）を Catmull-Rom 双三次で W×H ラスタへ拡大 */
function upsampleGrid(values: ArrayLike<number>, cols: number, rows: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  const at = (c: number, r: number) =>
    values[Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))];
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  for (let y = 0; y < H; y++) {
    const gy = ((y + 0.5) / H) * (rows - 1);
    const r = Math.floor(gy);
    const ty = gy - r;
    for (let x = 0; x < W; x++) {
      const gx = ((x + 0.5) / W) * (cols - 1);
      const c = Math.floor(gx);
      const tx = gx - c;
      const row = (rr: number) => cr(at(c - 1, rr), at(c, rr), at(c + 1, rr), at(c + 2, rr), tx);
      out[y * W + x] = cr(row(r - 1), row(r), row(r + 1), row(r + 2), ty);
    }
  }
  return out;
}

/** 分離型ボックスブラー（半径 r、pass 回） */
function boxBlur(src: Float32Array, W: number, H: number, r: number, passes = 2): Float32Array {
  if (r < 1) return src;
  const out = Float32Array.from(src);
  const tmp = new Float32Array(W * H);
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      const o = y * W;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += out[o + Math.max(0, Math.min(W - 1, k))];
      for (let x = 0; x < W; x++) {
        tmp[o + x] = sum / n;
        sum += out[o + Math.min(W - 1, x + r + 1)] - out[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.max(0, Math.min(H - 1, k)) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = sum / n;
        sum += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
  }
  return out;
}

/** 中心差分の勾配（m/m） */
function gradient(h: Float32Array, W: number, H: number, mPx: number): { gx: Float32Array; gy: Float32Array } {
  const gx = new Float32Array(W * H);
  const gy = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(H - 1, y + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(W - 1, x + 1);
      const i = y * W + x;
      gx[i] = (h[y * W + x1] - h[y * W + x0]) / ((x1 - x0) * mPx);
      gy[i] = (h[y1 * W + x] - h[y0 * W + x]) / ((y1 - y0) * mPx);
    }
  }
  return { gx, gy };
}

export function reliefRasterSize(widthUnits: number, heightUnits: number): { width: number; height: number } {
  const pxPerUnit = Math.min(
    RELIEF_CONSTANTS.maxPxPerUnit,
    RELIEF_CONSTANTS.maxRasterSide / Math.max(widthUnits, heightUnits)
  );
  return {
    width: Math.max(8, Math.round(widthUnits * pxPerUnit)),
    height: Math.max(8, Math.round(heightUnits * pxPerUnit))
  };
}

function gullySpacing(mPx: number): number {
  return Math.max(RELIEF_CONSTANTS.gullySpacingM, RELIEF_CONSTANTS.gullyMinSpacingPx * mPx);
}

/**
 * 斜面方向の線積分畳み込み（LIC）。勾配方向に沿ってノイズを平均し、谷筋の縞 S ∈ [-1, 1] を返す。
 * mask が 0 の画素は 0 のまま。
 */
function gullyStreaks(
  dirX: Float32Array,
  dirY: Float32Array,
  mask: Float32Array,
  W: number,
  H: number,
  mPx: number,
  salt: number
): Float32Array {
  const C = RELIEF_CONSTANTS;
  const spacing = gullySpacing(mPx);
  const noise = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (mask[y * W + x] > 0) noise[y * W + x] = valueNoise(x * mPx, y * mPx, spacing, salt);
  // マスク外のノイズも積分経路上で必要なので、マスク近傍は遅延評価する
  const noiseAt = (x: number, y: number): number => {
    const i = y * W + x;
    if (mask[i] > 0) return noise[i];
    return valueNoise(x * mPx, y * mPx, spacing, salt);
  };
  const steps = Math.max(C.gullyMinLengthPx, Math.round(C.gullyLengthM / mPx));
  const out = new Float32Array(W * H);
  let sumSq = 0;
  let count = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i0 = y * W + x;
      if (mask[i0] <= 0) continue;
      let sum = noise[i0];
      let n = 1;
      for (const sign of [1, -1]) {
        let px = x + 0.5;
        let py = y + 0.5;
        for (let s = 0; s < steps; s++) {
          const ix = px | 0;
          const iy = py | 0;
          if (ix < 0 || iy < 0 || ix >= W || iy >= H) break;
          const j = iy * W + ix;
          const dx = dirX[j];
          const dy = dirY[j];
          if (dx === 0 && dy === 0) break;
          px += sign * dx;
          py += sign * dy;
          const nx = px | 0;
          const ny = py | 0;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
          sum += noiseAt(nx, ny);
          n++;
        }
      }
      const v = sum / n - 0.5;
      out[i0] = v;
      sumSq += v * v;
      count++;
    }
  }
  const sigma = count > 0 ? Math.sqrt(sumSq / count) : 1;
  const norm = sigma > 1e-6 ? 1 / (2 * sigma) : 0;
  for (let i = 0; i < out.length; i++) if (mask[i] > 0) out[i] = Math.max(-1, Math.min(1, out[i] * norm));
  return out;
}

/** 低解像度で太陽方向へレイマーチした落ち影（0〜1）を全解像度で返す */
function castShadows(
  h: Float32Array,
  W: number,
  H: number,
  mPx: number,
  sunX: number,
  sunY: number,
  tanAlt: number
): Float32Array {
  const C = RELIEF_CONSTANTS;
  const f = C.castShadowDownsample;
  const lw = Math.max(2, Math.ceil(W / f));
  const lh = Math.max(2, Math.ceil(H / f));
  const low = new Float32Array(lw * lh);
  let hMax = -Infinity;
  for (let y = 0; y < lh; y++)
    for (let x = 0; x < lw; x++) {
      const v = h[Math.min(H - 1, y * f) * W + Math.min(W - 1, x * f)] * C.castShadowExaggeration;
      low[y * lw + x] = v;
      if (v > hMax) hMax = v;
    }
  const stepM = f * mPx;
  const rise = stepM * tanAlt;
  const shadow = new Float32Array(lw * lh);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const h0 = low[y * lw + x];
      let ray = h0;
      let px = x;
      let py = y;
      for (let s = 0; s < 1000; s++) {
        px += sunX;
        py += sunY;
        ray += rise;
        if (ray >= hMax) break;
        const ix = Math.round(px);
        const iy = Math.round(py);
        if (ix < 0 || iy < 0 || ix >= lw || iy >= lh) break;
        if (low[iy * lw + ix] > ray) {
          shadow[y * lw + x] = 1;
          break;
        }
      }
    }
  }
  const soft = boxBlur(shadow, lw, lh, 1, 2);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const gy = Math.min(lh - 1.001, y / f);
    const y0 = Math.floor(gy);
    const ty = gy - y0;
    for (let x = 0; x < W; x++) {
      const gx = Math.min(lw - 1.001, x / f);
      const x0 = Math.floor(gx);
      const tx = gx - x0;
      const a = soft[y0 * lw + x0];
      const b = soft[y0 * lw + x0 + 1];
      const c = soft[(y0 + 1) * lw + x0];
      const d = soft[(y0 + 1) * lw + x0 + 1];
      out[y * W + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

/** 海面換算気温 T0 = T + 逓減率 × 標高 のグリッド。サンプルが無ければ null */
function seaLevelTemperatureGrid(
  samples: ClimateSample[] | undefined,
  widthUnits: number,
  heightUnits: number
): RegionHeightfield | null {
  const usable = (samples ?? []).filter(s => Number.isFinite(s[3]));
  if (usable.length === 0) return null;
  return generateHeightfieldFromCells(
    usable.map(([x, y, elev, t]) => ({
      point: [x, y] as Point,
      elevationMeters: t + RELIEF_CONSTANTS.lapseRateCPerM * Math.max(0, elev)
    })),
    widthUnits,
    heightUnits
  );
}

export function computeReliefRaster(input: ReliefInput): ReliefRaster {
  const C = RELIEF_CONSTANTS;
  const settings = { ...DEFAULT_RELIEF_SETTINGS, ...input.settings };
  const { cols, rows, elevationsMeters } = input.heightfield;
  const { width: W, height: H } = reliefRasterSize(input.widthUnits, input.heightUnits);
  const mPx = (input.widthUnits * input.metersPerUnit) / W;
  const salt = seedHash(input.seed);

  // 1. ベース標高: 双三次で拡大し、IDW のセル中心のこぶを平滑化で消す
  const gridStepPx = W / Math.max(1, cols - 1);
  const h0 = boxBlur(upsampleGrid(elevationsMeters, cols, rows, W, H), W, H, Math.round(gridStepPx * 0.5));
  const g0 = gradient(h0, W, H, mPx);

  // 山岳マスク
  const hBase = boxBlur(h0, W, H, Math.max(1, Math.round(C.baseRadiusM / mPx / 2)), 2);
  const mountain = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++)
    mountain[i] = Math.max(
      smoothstep(C.mountainReliefLoM, C.mountainReliefHiM, h0[i] - hBase[i]),
      smoothstep(C.mountainElevLoM, C.mountainElevHiM, h0[i])
    );

  // 2. 谷筋: 最急降下方向に沿った LIC
  const dirX = new Float32Array(W * H);
  const dirY = new Float32Array(W * H);
  const amp = new Float32Array(W * H);
  const depthMax = Math.min(C.gullyDepthMaxM, gullySpacing(mPx) * C.gullyDepthPerSpacing);
  for (let i = 0; i < W * H; i++) {
    const s = Math.hypot(g0.gx[i], g0.gy[i]);
    if (s > 1e-5) {
      dirX[i] = g0.gx[i] / s;
      dirY[i] = g0.gy[i] / s;
    }
    if (h0[i] > 0)
      amp[i] =
        Math.min(depthMax, h0[i] * C.gullyDepthPerM) * smoothstep(C.gullySlopeLo, C.gullySlopeHi, s) * mountain[i];
  }
  const streaks = gullyStreaks(dirX, dirY, amp, W, H, mPx, salt);

  // 3. ディテール標高（ベース + V 字の谷）
  const detail = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) detail[i] = amp[i] > 0 ? amp[i] * (2 * Math.abs(streaks[i]) - 1) : 0;
  const gd = gradient(detail, W, H, mPx);

  // 4. 光源
  const az = (settings.sunAzimuthDeg * Math.PI) / 180;
  const alt = (Math.max(5, Math.min(85, settings.sunAltitudeDeg)) * Math.PI) / 180;
  const sunHX = Math.sin(az);
  const sunHY = -Math.cos(az);
  const sun = [sunHX * Math.cos(alt), sunHY * Math.cos(alt), Math.sin(alt)];
  const flat = Math.sin(alt);
  const z = Math.max(0.5, settings.verticalExaggeration);

  const hFull = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) hFull[i] = h0[i] + detail[i];
  const cast = castShadows(hFull, W, H, mPx, sunHX, sunHY, Math.tan(alt));

  // 5. 気温場
  const t0Grid = seaLevelTemperatureGrid(input.climateSamples, input.widthUnits, input.heightUnits);
  const t0 = t0Grid ? upsampleGrid(t0Grid.elevationsMeters, t0Grid.cols, t0Grid.rows, W, H) : null;

  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (h0[i] <= 0) continue;
      const gx = g0.gx[i] + gd.gx[i];
      const gy = g0.gy[i] + gd.gy[i];
      const slope = Math.hypot(gx, gy);
      const slopeDeg = (Math.atan(slope) * 180) / Math.PI;

      // 高度帯
      const hm = hFull[i];
      const temp = (t0 ? t0[i] : C.defaultSeaLevelTempC) - C.lapseRateCPerM * hm;
      const facing = slope > 1e-5 ? ((-gx * sunHX - gy * sunHY) / slope) * smoothstep(0.02, 0.15, slope) : 0;
      const noise = (valueNoise(x * mPx, y * mPx, C.bandNoiseSpacingM, salt ^ 0x9e3779b9) - 0.5) * 2 * C.bandNoiseC;
      const tEff = temp + C.aspectC * facing + noise;
      const valley = amp[i] > 0 ? Math.max(0, 1 - Math.abs(streaks[i]) * 2.5) : 0;
      const soft = C.bandSoftC;
      const m = mountain[i];
      const scrubA = 0.9 * m * smoothstep(C.treeLineC + soft, C.treeLineC - soft, tEff);
      const rockA =
        m *
        Math.max(
          smoothstep(C.alpineC + soft, C.alpineC - soft, tEff),
          smoothstep(C.rockSlopeLoDeg, C.rockSlopeHiDeg, slopeDeg)
        );
      const snowA =
        m *
        smoothstep(C.snowLineC + soft, C.snowLineC - soft, tEff - C.valleySnowC * valley) *
        (1 - smoothstep(C.snowSlopeLoDeg, C.snowSlopeHiDeg, slopeDeg));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const over = (col: readonly number[], ca: number) => {
        if (ca <= 0) return;
        const na = ca + a * (1 - ca);
        r = (col[0] * ca + r * a * (1 - ca)) / na;
        g = (col[1] * ca + g * a * (1 - ca)) / na;
        b = (col[2] * ca + b * a * (1 - ca)) / na;
        a = na;
      };
      over(COLORS.scrub, scrubA);
      over(COLORS.rock, rockA);
      over(COLORS.snow, snowA);

      // 陰影（ヒルシェード + 落ち影）
      const nx = -z * g0.gx[i] - gd.gx[i];
      const ny = -z * g0.gy[i] - gd.gy[i];
      const nl = Math.hypot(nx, ny, 1);
      const rel = Math.max(0, (nx * sun[0] + ny * sun[1] + sun[2]) / nl) / flat;
      const shadeK = C.lowlandShade + (1 - C.lowlandShade) * m;
      let dark = rel < 1 ? (1 - rel) * C.shadeDark * shadeK : 0;
      dark = 1 - (1 - dark) * (1 - cast[i] * C.castShadow * shadeK);
      const light = rel > 1 ? Math.min(1, (rel - 1) * C.shadeLight) * m : 0;
      if (dark > light) over(snowA > 0.5 ? COLORS.snowShadow : COLORS.shadow, Math.min(0.85, dark));
      else over(COLORS.light, light);

      const o = i * 4;
      if (input.monochrome) {
        const l = 0.3 * r + 0.59 * g + 0.11 * b;
        r = g = b = l;
      }
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a * 255;
    }
  }
  return { width: W, height: H, rgba };
}
