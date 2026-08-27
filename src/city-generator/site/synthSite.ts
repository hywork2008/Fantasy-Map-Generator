// Standalone mode — fabricate a plausible BurgSiteDescriptor for one of the four
// archetypes so the pipeline can run without the world map. Deterministic in
// (preset, archetype, seed). M3 replaces this path with a real descriptor pulled
// from FMG; the pipeline downstream is identical either way.

import { azimuthToVec, vecToAzimuth } from "../core/geom";
import { makeRng, type Rng } from "../core/prng";
import type { Point } from "../core/types";
import type {
  BurgSiteArchetype,
  BurgSiteDescriptor,
  BurgSiteRiver,
  BurgSiteRoadEntry,
  BurgSiteTerrain,
  BurgSiteWaterbody
} from "./burgSiteDescriptor";
import { DESCRIPTOR_VERSION } from "./burgSiteDescriptor";
import { type PresetId, presetPopulation } from "./presets";

const WALLED_DENSITY_PER_HA = 150;

export function synthSite(preset: PresetId, archetype: BurgSiteArchetype, seed: string): BurgSiteDescriptor {
  const rng = makeRng(`${preset}|${archetype}|${seed}`);
  const population = presetPopulation(preset);
  const areaHa = Math.max(population, 50) / WALLED_DENSITY_PER_HA;
  const cityRadiusMeters = clamp(Math.round(Math.sqrt((areaHa * 1e4) / Math.PI)), 80, 1500);
  const extentMeters = clamp(Math.round(cityRadiusMeters * 6), 1500, 4500);
  const half = extentMeters / 2;

  const walls = population >= 3_000;

  let rivers: BurgSiteRiver[] = [];
  let waterbody: BurgSiteWaterbody | null = null;
  let roads: BurgSiteRoadEntry[];

  if (archetype === "riverCrossing") {
    const river = synthRiver(rng, half, cityRadiusMeters);
    rivers = [river];
    // Two roads roughly across the river + one along a bank.
    roads = synthRoads(rng, half, [river.axisAzimuthDeg + 90, river.axisAzimuthDeg - 90, river.axisAzimuthDeg + 20]);
  } else if (archetype === "harbor") {
    waterbody = synthWaterbody(rng, half, cityRadiusMeters);
    roads = synthRoads(rng, half, landwardBearings(waterbody.shoreAzimuthDeg, 3));
  } else if (archetype === "hillTop") {
    roads = synthRoads(rng, half, spreadBearings(rng, 3));
  } else {
    roads = synthRoads(rng, half, spreadBearings(rng, 4));
  }

  return {
    version: DESCRIPTOR_VERSION,
    burg: {
      id: 0,
      name: "Preview",
      group: "",
      type: "Generic",
      seed,
      population,
      capital: false,
      port: archetype === "harbor",
      citadel: archetype === "hillTop" || (walls && rng() < 0.4),
      plaza: population >= 1_500,
      walls,
      temple: true,
      shanty: population >= 8_000
    },
    frame: { originMapUnits: [0, 0], metersPerMapUnit: 1, extentMeters, cityRadiusMeters },
    climate: { temperatureC: 12, biomeId: 0 },
    terrain: synthTerrain(archetype, half, cityRadiusMeters, rng),
    rivers,
    waterbody,
    roads,
    suggestedGates: roads.filter(r => r.group !== "searoutes").length,
    suggestedArchetype: archetype
  };
}

function synthRiver(rng: Rng, half: number, cityRadius: number): BurgSiteRiver {
  const axisAzimuthDeg = rng.range(60, 120) * (rng() < 0.5 ? 1 : -1) + (rng() < 0.5 ? 0 : 180);
  const flow = azimuthToVec(((axisAzimuthDeg % 360) + 360) % 360);
  const perp: Point = [-flow[1], flow[0]];
  const cityBank: "left" | "right" = rng() < 0.5 ? "left" : "right";
  // Chord position: 0 bisects, up to ~0.35 of the radius off-center. Push the
  // centerline to the OPPOSITE side of the town from `cityBank`.
  const offsetRatio = rng.range(0, 0.35);
  const shift = offsetRatio * cityRadius * (cityBank === "left" ? -1 : 1);
  const center: Point = [perp[0] * shift, perp[1] * shift];

  const span = half * 1.3;
  const from: Point = [center[0] - flow[0] * span, center[1] - flow[1] * span];
  const to: Point = [center[0] + flow[0] * span, center[1] + flow[1] * span];
  // Keep the meander well below the chord offset so cityBank / offsetRatio stay meaningful.
  const points = meanderLine(rng, from, to, Math.min(cityRadius * 0.12, half * 0.12), 26);

  const widthsMeters = points.map((_, i) => rn(6 + 12 * (i / (points.length - 1)) + rng.range(-1, 1), 1));
  return {
    riverId: 1,
    name: "River",
    type: "River",
    widthMeters: widthsMeters[Math.floor(widthsMeters.length / 2)],
    axisAzimuthDeg: rn(vecToAzimuth(flow[0], flow[1]), 1),
    offsetMeters: rn(Math.abs(shift), 1),
    offsetRatio: rn(offsetRatio, 2),
    cityBank,
    crossesSite: true,
    throughBurgCell: true,
    rawOffsetMeters: rn(Math.abs(shift), 1),
    snappedToBank: true,
    segments: [{ points, widthsMeters }]
  };
}

function synthWaterbody(rng: Rng, half: number, cityRadius: number): BurgSiteWaterbody {
  const shoreAzimuthDeg = rn(rng.range(0, 360), 1);
  const toward = azimuthToVec(shoreAzimuthDeg);
  const along: Point = [-toward[1], toward[0]];
  const standoff = cityRadius * rng.range(0.9, 1.3);
  const mid: Point = [toward[0] * standoff, toward[1] * standoff];
  const span = half * 1.3;
  const from: Point = [mid[0] - along[0] * span, mid[1] - along[1] * span];
  const to: Point = [mid[0] + along[0] * span, mid[1] + along[1] * span];
  return {
    kind: "ocean",
    name: "The Sea",
    isPort: true,
    shoreAzimuthDeg,
    shoreline: [meanderLine(rng, from, to, cityRadius * 0.15, 22)]
  };
}

function synthRoads(rng: Rng, half: number, bearings: number[]): BurgSiteRoadEntry[] {
  return bearings.map((bearing, index) => {
    const az = ((bearing % 360) + 360) % 360;
    const dir = azimuthToVec(az);
    const perp: Point = [-dir[1], dir[0]];
    const reach = half * 1.05;
    const path: Point[] = [];
    for (let t = 0; t <= 1.0001; t += 0.25) {
      const wobble = Math.sin(t * Math.PI) * half * 0.06 * rng.range(-1, 1);
      path.push([dir[0] * reach * t + perp[0] * wobble, dir[1] * reach * t + perp[1] * wobble]);
    }
    return {
      routeId: index + 1,
      group: "roads",
      entryAzimuthDeg: rn(az, 1),
      reachesEdge: true,
      path,
      nextBurg: null
    };
  });
}

function synthTerrain(archetype: BurgSiteArchetype, half: number, cityRadius: number, rng: Rng): BurgSiteTerrain {
  const size = 17;
  const spacingMeters = rn((half * 2) / (size - 1), 1);
  const base = 40;
  const relief = archetype === "hillTop" ? 60 : 6;
  const tiltAz = rng.range(0, 360);
  const tilt = azimuthToVec(tiltAz);
  const elevationsMeters: number[] = [];
  const waterMask: (0 | 1)[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = -half + col * spacingMeters;
      const y = half - row * spacingMeters;
      const dome = archetype === "hillTop" ? relief * Math.exp(-((x * x + y * y) / (cityRadius * cityRadius))) : 0;
      const plane = archetype === "hillTop" ? 0 : ((tilt[0] * x + tilt[1] * y) / half) * relief;
      elevationsMeters.push(rn(base + dome + plane, 1));
      waterMask.push(0);
    }
  }
  return {
    elevationMeters: rn(base + relief, 1),
    downhillAzimuthDeg: archetype === "hillTop" ? rn(rng.range(0, 360), 1) : rn((tiltAz + 180) % 360, 1),
    gradePercent: archetype === "hillTop" ? 9 : 1.5,
    heightfield: { size, spacingMeters, elevationsMeters, waterMask }
  };
}

/** N bearings evenly spread with jitter. */
function spreadBearings(rng: Rng, n: number): number[] {
  const phase = rng.range(0, 360);
  return Array.from({ length: n }, (_, i) => (phase + (i * 360) / n + rng.range(-18, 18) + 360) % 360);
}

/** N bearings on the landward half (away from the shore azimuth). */
function landwardBearings(shoreAzimuthDeg: number, n: number): number[] {
  const inland = (shoreAzimuthDeg + 180) % 360;
  return Array.from({ length: n }, (_, i) => (inland + (i - (n - 1) / 2) * 55 + 360) % 360);
}

/** Sample the from→to line, offset perpendicular by smooth low-frequency noise. */
function meanderLine(rng: Rng, from: Point, to: Point, amplitude: number, steps: number): Point[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  const f2 = 2 + Math.floor(rng() * 3);
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = amplitude * (0.62 * Math.sin(t * Math.PI + p1) + 0.38 * Math.sin(t * Math.PI * f2 + p2));
    pts.push([from[0] + dx * t + nx * off, from[1] + dy * t + ny * off]);
  }
  return pts;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rn(v: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
