// Standalone mode — fabricate a plausible BurgSiteDescriptor from a composable
// SiteConfig (coast shape × 0..2 rivers × relief) so the pipeline can run
// without the world map. Deterministic in (preset, config, seed). M3 replaces
// this path with a real FMG descriptor; the pipeline downstream is identical.

import { azimuthToVec, nearestOnPolyline, vecToAzimuth } from "../core/geom";
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
import type { CoastShape, RiverShape, SiteConfig } from "./siteConfig";
import { siteConfigKey } from "./siteConfig";

const WALLED_DENSITY_PER_HA = 150;

interface RiverPlacement {
  shape: RiverShape;
  axisDeg: number;
  /** Signed perpendicular offset as a fraction of cityRadius (+ toward +perp). */
  offsetRatio: number;
  crossesSite: boolean;
}

export function synthSite(preset: PresetId, config: SiteConfig, seed: string): BurgSiteDescriptor {
  const rng = makeRng(`${preset}|${siteConfigKey(config)}|${seed}`);
  const population = presetPopulation(preset);
  const areaHa = Math.max(population, 50) / WALLED_DENSITY_PER_HA;
  const cityRadiusMeters = clamp(Math.round(Math.sqrt((areaHa * 1e4) / Math.PI)), 80, 1500);
  const extentMeters = clamp(Math.round(cityRadiusMeters * 6), 1500, 4500);
  const half = extentMeters / 2;
  const walls = population >= 3_000;

  const waterbody = config.coast === "none" ? null : synthCoast(rng, config.coast, half, cityRadiusMeters);

  // `toCoast` without a coast degrades to `through`.
  const effective: RiverShape[] = config.rivers.map(s => (s === "toCoast" && !waterbody ? "through" : s));
  const straddle = effective.length === 2 && effective.every(s => s === "through");
  // With a coast every river must have somewhere to flow: orient it roughly
  // toward the water so it runs inland → through the site → out to sea.
  const shoreAz = waterbody?.shoreAzimuthDeg ?? null;
  const towardSea = (): number => (shoreAz ?? rng.range(0, 360)) + rng.range(-38, 38);
  const freeAxis = (): number => (shoreAz === null ? rng.range(0, 360) : towardSea());
  const sharedAxis = freeAxis();
  const placements: RiverPlacement[] = effective.map((shape, i) => {
    if (straddle) {
      return {
        shape: "through",
        axisDeg: sharedAxis + rng.range(-12, 12),
        offsetRatio: (i === 0 ? -1 : 1) * rng.range(0.35, 0.55),
        crossesSite: true
      };
    }
    if (shape === "beside") {
      return {
        shape,
        axisDeg: freeAxis(),
        offsetRatio: (rng() < 0.5 ? -1 : 1) * rng.range(0.85, 1.15),
        crossesSite: false
      };
    }
    if (shape === "toCoast") {
      return { shape, axisDeg: 0, offsetRatio: 0, crossesSite: true };
    }
    // `through` — flows through the site but keeps the town clearly on one bank
    // (offset well above the walk's ~1-cell wiggle).
    return {
      shape: "through",
      axisDeg: freeAxis(),
      offsetRatio: (rng() < 0.5 ? -1 : 1) * rng.range(0.28, 0.5),
      crossesSite: true
    };
  });
  const rivers = placements.map((p, i) => synthRiver(rng, p, i + 1, half, cityRadiusMeters, waterbody));

  const roads = synthRoads(rng, half, roadBearings(rng, config, waterbody?.shoreAzimuthDeg ?? null, rivers));

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
      port: waterbody !== null,
      citadel: config.relief || (walls && rng() < 0.4),
      plaza: population >= 1_500,
      walls,
      temple: true,
      shanty: population >= 8_000
    },
    frame: { originMapUnits: [0, 0], metersPerMapUnit: 1, extentMeters, cityRadiusMeters },
    climate: { temperatureC: 12, biomeId: 0 },
    terrain: synthTerrain(config.relief, half, cityRadiusMeters, rng),
    rivers,
    waterbody,
    roads,
    suggestedGates: roads.filter(r => r.group !== "searoutes").length,
    suggestedArchetype: deriveArchetype(config)
  };
}

// --- coast --------------------------------------------------------------------
//
// The coast is a large CIRCULAR ARC with its own centre of curvature — a
// landform, not a line bent to meet the town. The town is dropped onto (or just
// inland of) the arc, off the apex. "bay vs cape" is which side of the arc holds
// the water. Returns a rough corridor (arc samples); the graph walk adds the
// fine jaggedness. See docs/city-generator/design.md §4.2.
//
//   straight — huge Rc → nearly straight open coast.
//   bay      — Rc ~1.5–4× the window, centre on the WATER side → land curves
//              around the water (Osaka-Bay style); the built-up area rides the
//              curving shore.
//   cape     — Rc ~0.4–0.9× the window, centre on the LAND side → land is a
//              small disc (a headland) with water on most sides.

function synthCoast(rng: Rng, shape: CoastShape, half: number, R: number): BurgSiteWaterbody {
  // Base "town → water" direction, then the arc apex is offset off it so the
  // town sits on the flank of the arc, not its tip.
  const baseAz = rng.range(0, 360);
  const apexAz = baseAz + rng.range(-55, 55);
  const apex = azimuthToVec(((apexAz % 360) + 360) % 360); // town → arc centre

  const standoff = R * (shape === "straight" ? rng.range(0.6, 1.4) : rng.range(0.0, 0.5));
  let curvature: number;
  let waterInside: boolean;
  if (shape === "straight") {
    curvature = half * rng.range(4, 9);
    waterInside = true;
  } else if (shape === "bay") {
    curvature = half * rng.range(1.5, 4);
    waterInside = true;
  } else {
    curvature = half * rng.range(0.4, 0.95);
    waterInside = false;
  }

  // Arc centre: along `apex` from the town. For a bay the centre lies in the
  // water beyond the shore (town outside the circle = land); for a cape it lies
  // inland (town inside the circle = the headland).
  const centreDist = waterInside ? curvature + standoff : curvature - standoff;
  const centre: Point = [apex[0] * centreDist, apex[1] * centreDist];

  // Sample the arc segment nearest the town, spanning the window along the tangent.
  const baseAngle = Math.atan2(-apex[1], -apex[0]); // centre → town's shoreline point
  const sweep = Math.min(1.2, ((half * 1.7) / curvature) * 1.1);
  const n = 9;
  const jig = (): number => rng.range(-0.06, 0.06) * R;
  const corridor: Point[] = Array.from({ length: n }, (_, i) => {
    const a = baseAngle + sweep * (2 * (i / (n - 1)) - 1);
    return [centre[0] + Math.cos(a) * (curvature + jig()), centre[1] + Math.sin(a) * (curvature + jig())] as Point;
  });

  // Town → water azimuth: toward the centre for a bay, away for a cape.
  const waterAz = waterInside ? apexAz : apexAz + 180;
  return {
    kind: "ocean",
    name: "The Sea",
    isPort: true,
    shoreAzimuthDeg: rn(((waterAz % 360) + 360) % 360, 1),
    shoreline: [corridor]
  };
}

// --- rivers ------------------------------------------------------------------

function synthRiver(
  rng: Rng,
  placement: RiverPlacement,
  id: number,
  half: number,
  R: number,
  waterbody: BurgSiteWaterbody | null
): BurgSiteRiver {
  // A 3-point CORRIDOR: source → chord control → mouth. The pipeline walk fills
  // in the meander and stops at the shoreline.
  let corridor: Point[];
  let cityBank: "left" | "right";

  if (placement.shape === "toCoast" && waterbody) {
    const water = azimuthToVec(waterbody.shoreAzimuthDeg);
    corridor = [
      [-water[0] * half * 1.3, -water[1] * half * 1.3],
      [rng.range(-0.1, 0.1) * R, rng.range(-0.1, 0.1) * R],
      [water[0] * half * 1.3, water[1] * half * 1.3]
    ];
    cityBank = "right";
  } else {
    const flow = azimuthToVec(((placement.axisDeg % 360) + 360) % 360);
    const perp: Point = [-flow[1], flow[0]];
    const shift = placement.offsetRatio * R;
    const span = half * 1.35;
    corridor = [
      [perp[0] * shift - flow[0] * span, perp[1] * shift - flow[1] * span],
      [perp[0] * shift, perp[1] * shift],
      [perp[0] * shift + flow[0] * span, perp[1] * shift + flow[1] * span]
    ];
    // Town (perp position 0) is on the −sign(shift) side; sideOfPolyline(origin) = −shift.
    cityBank = shift < 0 ? "left" : "right";
  }

  const widthsMeters = corridor.map((_, i) => rn(6 + 10 * (i / (corridor.length - 1)) + rng.range(-1, 1), 1));
  const hit = nearestOnPolyline([0, 0], corridor);
  const nxt = corridor[Math.min(hit.segIndex + 1, corridor.length - 1)];
  const flowVec: Point = [nxt[0] - corridor[hit.segIndex][0], nxt[1] - corridor[hit.segIndex][1]];
  const offsetMeters = rn(hit.dist, 1);

  return {
    riverId: id,
    name: `River ${id}`,
    type: "River",
    widthMeters: widthsMeters[Math.floor(widthsMeters.length / 2)],
    axisAzimuthDeg: rn(vecToAzimuth(flowVec[0], flowVec[1]), 1),
    offsetMeters,
    offsetRatio: rn(offsetMeters / R, 2),
    cityBank,
    crossesSite: placement.crossesSite,
    throughBurgCell: placement.crossesSite,
    rawOffsetMeters: offsetMeters,
    snappedToBank: true,
    segments: [{ points: corridor, widthsMeters }]
  };
}

// --- roads / terrain -------------------------------------------------------------

function roadBearings(rng: Rng, config: SiteConfig, shoreAz: number | null, rivers: BurgSiteRiver[]): number[] {
  const bearings =
    shoreAz !== null ? landwardBearings(shoreAz, 3) : spreadBearings(rng, config.rivers.length > 0 ? 3 : 4);
  const through = rivers.find(r => r.crossesSite);
  if (through) bearings.push((through.axisAzimuthDeg + 90) % 360, (through.axisAzimuthDeg + 270) % 360);
  return bearings;
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
    return { routeId: index + 1, group: "roads", entryAzimuthDeg: rn(az, 1), reachesEdge: true, path, nextBurg: null };
  });
}

function synthTerrain(relief: boolean, half: number, R: number, rng: Rng): BurgSiteTerrain {
  const size = 17;
  const spacingMeters = rn((half * 2) / (size - 1), 1);
  const base = 40;
  const amp = relief ? 60 : 6;
  const tiltAz = rng.range(0, 360);
  const tilt = azimuthToVec(tiltAz);
  const elevationsMeters: number[] = [];
  const waterMask: (0 | 1)[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = -half + col * spacingMeters;
      const y = half - row * spacingMeters;
      const dome = relief ? amp * Math.exp(-((x * x + y * y) / (R * R))) : 0;
      const plane = relief ? 0 : ((tilt[0] * x + tilt[1] * y) / half) * amp;
      elevationsMeters.push(rn(base + dome + plane, 1));
      waterMask.push(0);
    }
  }
  return {
    elevationMeters: rn(base + amp, 1),
    downhillAzimuthDeg: relief ? rn(rng.range(0, 360), 1) : rn((tiltAz + 180) % 360, 1),
    gradePercent: relief ? 9 : 1.5,
    heightfield: { size, spacingMeters, elevationsMeters, waterMask }
  };
}

function deriveArchetype(config: SiteConfig): BurgSiteArchetype {
  if (config.coast !== "none") return "harbor";
  if (config.rivers.some(s => s === "through")) return "riverCrossing";
  if (config.relief) return "hillTop";
  return "crossroads";
}

// --- shared geometry -----------------------------------------------------------

function spreadBearings(rng: Rng, n: number): number[] {
  const phase = rng.range(0, 360);
  return Array.from({ length: n }, (_, i) => (phase + (i * 360) / n + rng.range(-18, 18) + 360) % 360);
}

function landwardBearings(shoreAzimuthDeg: number, n: number): number[] {
  const inland = (shoreAzimuthDeg + 180) % 360;
  return Array.from({ length: n }, (_, i) => (inland + (i - (n - 1) / 2) * 55 + 360) % 360);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rn(v: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
