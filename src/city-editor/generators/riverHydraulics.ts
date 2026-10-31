import type { RiverHydraulicProfile, RiverHydraulicStation } from "../types/contracts/riverHydraulics";
import type { Point } from "../types/document";
import type { TerrainRiverCorridor } from "../types/terrain";
import { riverDropMeters } from "./riverSurface";

export const RIVER_GRAVITY_MPS2 = 9.80665;
/** Natural channel default when FMG provides no measured boundary flow. */
export const RIVER_MANNING_ROUGHNESS = 0.035;

export interface RiverHydraulicInput {
  corridor: TerrainRiverCorridor;
  landAt(point: Point): number;
  bankDropMeters?: number;
  upstreamDepthMeters?: number;
  upstreamVelocityMps?: number;
}

/** Same limited miter used by the drawn river ribbon. */
function sectionOffset(line: Point[], index: number): Point {
  const normal = (a: Point, b: Point): Point => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy) || 1;
    return [-dy / length, dx / length];
  };
  const a = index > 0 ? normal(line[index - 1], line[index]) : normal(line[0], line[1]);
  const b = index < line.length - 1 ? normal(line[index], line[index + 1]) : a;
  const length = Math.hypot(a[0] + b[0], a[1] + b[1]);
  const m: Point = length > 1e-6 ? [(a[0] + b[0]) / length, (a[1] + b[1]) / length] : a;
  const dot = m[0] * b[0] + m[1] * b[1];
  const scale = Math.min(4, 1 / Math.max(0.25, dot));
  return [m[0] * scale, m[1] * scale];
}

/**
 * Prescribed bank clearance, then a downstream energy balance with Manning friction.
 * Q = width * depth * velocity is conserved. Cross-section water levels never inherit cross-slope.
 * This is a steady 1D approximation, not a three-dimensional particle fluid solver.
 */
export function solveRiverHydraulics(input: RiverHydraulicInput): RiverHydraulicProfile | null {
  const { corridor, landAt } = input;
  if (corridor.centerline.length < 2) return null;
  const source = corridor.centerline;
  let total = 0;
  for (let i = 1; i < source.length; i++)
    total += Math.hypot(source[i][0] - source[i - 1][0], source[i][1] - source[i - 1][1]);
  const spacing = Math.max(10, total / 512);
  const line: Point[] = [source[0]],
    widths = [corridor.widthsMeters[0]];
  for (let i = 1; i < source.length; i++) {
    const a = source[i - 1],
      b = source[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      line.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      widths.push(corridor.widthsMeters[i - 1] + (corridor.widthsMeters[i] - corridor.widthsMeters[i - 1]) * t);
    }
  }
  if (line.length < 2) return null;
  const bankDrop = riverDropMeters(input.bankDropMeters);
  const initialDepth = Math.max(0.05, input.upstreamDepthMeters ?? corridor.depthMeters);
  const sections = line.map((point, i) => {
    const offset = sectionOffset(line, i),
      half = widths[i] / 2;
    const left: Point = [point[0] + offset[0] * half, point[1] + offset[1] * half];
    const right: Point = [point[0] - offset[0] * half, point[1] - offset[1] * half];
    return { point, left, right, leftBank: landAt(left), rightBank: landAt(right) };
  });
  const targets = sections.map(section => Math.max(0, Math.min(section.leftBank, section.rightBank) - bankDrop));
  const fall = Math.max(0, targets[0] - Math.min(...targets));
  const radius = (widths[0] * initialDepth) / (widths[0] + 2 * initialDepth);
  // No fall and no supplied inflow means standing water, not a fictional current or an infinitely deep channel.
  const initialVelocity = Math.max(
    0,
    input.upstreamVelocityMps ?? (radius ** (2 / 3) * Math.sqrt(fall / Math.max(total, 1))) / RIVER_MANNING_ROUGHNESS
  );
  const discharge = widths[0] * initialDepth * initialVelocity;
  const stations: RiverHydraulicStation[] = [];
  for (let i = 0; i < line.length; i++) {
    const { point, left, right, leftBank, rightBank } = sections[i];
    const previous = stations[i - 1];
    const target = targets[i];
    const surface = previous ? Math.min(previous.surfaceMeters, target) : target;
    const run = previous ? Math.hypot(point[0] - previous.point[0], point[1] - previous.point[1]) : 0;
    let velocity = initialVelocity;
    if (previous && run > 0 && discharge > 0) {
      const available = Math.max(0, previous.energyHeadMeters - surface);
      let low = 0,
        high = Math.sqrt(2 * RIVER_GRAVITY_MPS2 * available);
      // Implicit friction is stable on flat reaches and at large drops; no frame-time integration is needed.
      for (let iteration = 0; iteration < 40; iteration++) {
        const v = (low + high) / 2;
        const depth = discharge / (widths[i] * Math.max(v, 1e-12));
        const radius = (widths[i] * depth) / (widths[i] + 2 * depth);
        const loss = (run * RIVER_MANNING_ROUGHNESS ** 2 * v * v) / radius ** (4 / 3);
        if ((v * v) / (2 * RIVER_GRAVITY_MPS2) + loss > available) high = v;
        else low = v;
      }
      velocity = Math.max(1e-12, (low + high) / 2);
    }
    const depth = discharge > 0 ? discharge / (widths[i] * velocity) : initialDepth;
    stations.push({
      point,
      left,
      right,
      leftBankMeters: leftBank,
      rightBankMeters: rightBank,
      distanceMeters: (previous?.distanceMeters ?? 0) + run,
      widthMeters: widths[i],
      surfaceMeters: surface,
      bedMeters: surface - depth,
      depthMeters: depth,
      velocityMps: velocity,
      energyHeadMeters: surface + (velocity * velocity) / (2 * RIVER_GRAVITY_MPS2)
    });
  }
  return {
    sourceId: corridor.sourceId,
    bankDropMeters: bankDrop,
    dischargeM3s: discharge,
    roughness: RIVER_MANNING_ROUGHNESS,
    stations,
    corridor: {
      ...corridor,
      centerline: line,
      widthsMeters: widths,
      bedMeters: stations.map(s => s.bedMeters),
      depthsMeters: stations.map(s => s.depthMeters)
    }
  };
}

/** Interpolate the same paired-bank triangles used by Three.js, including mitered bends. */
export function hydraulicWaterAt(profiles: readonly RiverHydraulicProfile[], point: Point): number | null {
  let surface: number | null = null;
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const profile of profiles)
    for (let i = 1; i < profile.stations.length; i++) {
      const a = profile.stations[i - 1],
        b = profile.stations[i];
      for (const [points, heights] of [
        [
          [a.left, a.right, b.left],
          [a.surfaceMeters, a.surfaceMeters, b.surfaceMeters]
        ],
        [
          [a.right, b.right, b.left],
          [a.surfaceMeters, b.surfaceMeters, b.surfaceMeters]
        ]
      ] as [Point[], number[]][]) {
        const area = cross(points[0], points[1], points[2]);
        if (Math.abs(area) < 1e-9) continue;
        const u = cross(point, points[1], points[2]) / area,
          v = cross(points[0], point, points[2]) / area,
          w = 1 - u - v;
        if (Math.min(u, v, w) < -1e-7) continue;
        const value = u * heights[0] + v * heights[1] + w * heights[2];
        surface = surface === null ? value : Math.min(surface, value);
      }
    }
  return surface;
}
