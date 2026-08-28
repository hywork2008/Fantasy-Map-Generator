// Standalone mode — fabricate a plausible BurgSiteDescriptor from a composable
// SiteConfig (coast shape × 0..2 rivers × relief) so the pipeline can run
// without the world map. Deterministic in (preset, config, seed). M3 replaces
// this path with a real FMG descriptor; the pipeline downstream is identical.

import { azimuthToVec, nearestOnPolyline, segmentsIntersect, sideOfPolyline, vecToAzimuth } from "../core/geom";
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

/** Shapes that cross the site (vs `beside` / `toCoast`). All get a meandering or
 * elbowed corridor through the town, differing only in channel-shape profile. */
const THROUGH_FAMILY: RiverShape[] = ["through", "straight", "meander", "greatBend"];

interface RiverPlacement {
  shape: RiverShape;
  axisDeg: number;
  /** Signed perpendicular offset as a fraction of cityRadius (+ toward +perp). */
  offsetRatio: number;
  crossesSite: boolean;
  /** Multiplies the meander amplitude: < 1 keeps two straddling channels tame,
   * > 1 lets a river that runs well clear of the town (`beside`) wander more. */
  meanderScale: number;
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
  const straddle = effective.length === 2 && effective.every(s => THROUGH_FAMILY.includes(s));
  // With a coast every river must have somewhere to flow: orient it roughly
  // toward the water so it runs inland → through the site → out to sea.
  const shoreAz = waterbody?.shoreAzimuthDeg ?? null;
  const towardSea = (): number => (shoreAz ?? rng.range(0, 360)) + rng.range(-38, 38);
  const freeAxis = (): number => (shoreAz === null ? rng.range(0, 360) : towardSea());
  const sharedAxis = freeAxis();
  const placements: RiverPlacement[] = effective.map((shape, i) => {
    if (straddle) {
      return {
        shape,
        axisDeg: sharedAxis + rng.range(-12, 12),
        offsetRatio: (i === 0 ? -1 : 1) * rng.range(0.35, 0.55),
        crossesSite: true,
        meanderScale: 0.55
      };
    }
    if (shape === "beside") {
      return {
        shape,
        axisDeg: freeAxis(),
        offsetRatio: (rng() < 0.5 ? -1 : 1) * rng.range(0.85, 1.15),
        crossesSite: false,
        meanderScale: 0.9
      };
    }
    if (shape === "toCoast") {
      return { shape, axisDeg: 0, offsetRatio: 0, crossesSite: true, meanderScale: 0.85 };
    }
    // through-family (`through` / `straight` / `meander` / `greatBend`) — crosses
    // the site but keeps the town clearly on one bank (the corridor is clamped so
    // it never reaches the town side). `synthRiver` picks the channel profile.
    return {
      shape,
      axisDeg: freeAxis(),
      offsetRatio: (rng() < 0.5 ? -1 : 1) * rng.range(0.28, 0.5),
      crossesSite: true,
      meanderScale: 1
    };
  });
  // Corridor half-length along the flow axis — just past the window edge so edge
  // cells still have corridor to project onto.
  const riverSpan = half * 1.12;
  const rivers = placements.map((p, i) => synthRiver(rng, p, i + 1, half, cityRadiusMeters, waterbody, riverSpan));

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

/** Channel-shape profile → sine-sum parameters. `gentle` is the default
 * (`through` / `beside` / `toCoast`); `straight` and `meander` are the explicit
 * `RiverShape` variants. Ranges are fractions of cityRadius. */
type MeanderProfile = "straight" | "gentle" | "meander";
const MEANDER_PROFILES: Record<
  MeanderProfile,
  {
    bends: [number, number];
    amp: [number, number];
    harmCount: [number, number];
    harmAmp: [number, number];
    harmFreqMul: [number, number];
  }
> = {
  straight: { bends: [1, 2], amp: [0.05, 0.13], harmCount: [0, 2], harmAmp: [0.03, 0.08], harmFreqMul: [1.7, 2.6] },
  gentle: { bends: [2.5, 5], amp: [0.32, 0.58], harmCount: [1, 3], harmAmp: [0.1, 0.26], harmFreqMul: [1.7, 2.6] },
  // Kept below `gentle` × ~1.5 in reach and frequency: a pronounced but still
  // river-shaped wave, not the steep sawtooth that made the walk knot (lgds9i).
  meander: { bends: [3, 5], amp: [0.4, 0.62], harmCount: [1, 3], harmAmp: [0.09, 0.2], harmFreqMul: [1.5, 2] }
};

function meanderProfileFor(shape: RiverShape): MeanderProfile {
  if (shape === "straight") return "straight";
  if (shape === "meander") return "meander";
  return "gentle";
}

/**
 * A multi-point corridor that meanders along `flow`, its centreline offset by
 * `shift` off the town (origin) on `perp`. A dominant sine (bend COUNT across the
 * corridor, so wavelengths read inside the window) plus a few shorter harmonics
 * give the shape; a `sin(u·π)^0.7` taper pins the source and mouth so only the
 * middle wanders, and `lat` is clamped to `nearLimit` so the channel never
 * crosses onto the town's bank. `scale` tunes amplitude per placement
 * (RiverPlacement.meanderScale); `profile` sets how sinuous the channel is.
 */
function meanderCorridor(
  rng: Rng,
  flow: Point,
  perp: Point,
  shift: number,
  span: number,
  R: number,
  scale: number,
  nearLimit: number,
  profile: MeanderProfile
): Point[] {
  const points = 21;
  const sgn = shift < 0 ? -1 : 1;
  const p = MEANDER_PROFILES[profile];
  const bends = rng.range(p.bends[0], p.bends[1]);
  const waves = [
    { amp: rng.range(p.amp[0], p.amp[1]) * R * scale, freq: bends, phase: rng.range(0, Math.PI * 2) },
    ...Array.from({ length: rng.int(p.harmCount[0], p.harmCount[1]) }, () => ({
      amp: rng.range(p.harmAmp[0], p.harmAmp[1]) * R * scale,
      freq: bends * rng.range(p.harmFreqMul[0], p.harmFreqMul[1]),
      phase: rng.range(0, Math.PI * 2)
    }))
  ];
  const skew = rng.range(-0.3, 0.3);

  const build = (ampScale: number): Point[] => {
    const peak = waves.reduce((s, w) => s + w.amp * ampScale, 0);
    // Push the centreline out so the meander swings mostly clear of the town
    // instead of being flattened against `nearLimit` on one side.
    const base = sgn * Math.max(Math.abs(shift), nearLimit + peak * 0.55);
    return Array.from({ length: points }, (_, k) => {
      const u = k / (points - 1);
      const along = (u - 0.5) * 2 * span;
      const warp = u + skew * u * (1 - u);
      const taper = Math.sin(u * Math.PI) ** 0.7;
      let lat = base;
      for (const w of waves) lat += w.amp * ampScale * Math.sin(warp * w.freq * Math.PI * 2 + w.phase) * taper;
      lat = sgn < 0 ? Math.min(lat, -nearLimit) : Math.max(lat, nearLimit);
      return [perp[0] * lat + flow[0] * along, perp[1] * lat + flow[1] * along] as Point;
    });
  };

  // Corridor hygiene: if steep harmonics pinch two limbs of the corridor to
  // within ~1.5 cells, the walk can bridge them and orbit a cell — a knotted
  // river. Shrink the waves until the limbs are clear. Only pathological draws
  // trip this (a clean wave's limbs are ~R apart), so normal corridors are
  // untouched. No rng consumed → deterministic.
  let ampScale = 1;
  let pts = build(ampScale);
  while (ampScale > 0.25 && minSegGap(pts) < R * 0.2) {
    ampScale *= 0.7;
    pts = build(ampScale);
  }
  return pts;
}

/** Smallest distance between any two non-adjacent segments of a polyline. */
function minSegGap(pts: Point[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      if (i === 0 && j === pts.length - 2) continue;
      const d = segSegDist(pts[i], pts[i + 1], pts[j], pts[j + 1]);
      if (d < min) min = d;
    }
  }
  return min;
}

function segSegDist(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(ptSegDist(a, c, d), ptSegDist(b, c, d), ptSegDist(c, a, b), ptSegDist(d, a, b));
}

function ptSegDist(pt: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2));
  return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
}

/**
 * `greatBend` — the river turns 55–95° near an apex just off the town. The
 * OUTGOING leg leaves toward `seaward` when there's a coast (so it still reaches
 * the sea), else along `flow` rotated by the turn; the incoming leg is the
 * outgoing heading rotated back. The corner is a rounded fillet of radius
 * `~0.7R` (a quadratic bend through the apex), NOT a sharp point — a spike makes
 * the walk spiral around the apex cell (the lgds9i curl).
 */
function bendCorridor(
  rng: Rng,
  flow: Point,
  perp: Point,
  shift: number,
  span: number,
  R: number,
  nearLimit: number,
  seaward: Point | null
): Point[] {
  const sgn = shift < 0 ? -1 : 1;
  const base = sgn * Math.max(Math.abs(shift), nearLimit + 0.2 * R);
  const apex: Point = [perp[0] * base, perp[1] * base];
  const turn = (rng() < 0.5 ? 1 : -1) * rng.range(55, 95) * (Math.PI / 180);
  const rot = (v: Point, a: number): Point => [
    v[0] * Math.cos(a) - v[1] * Math.sin(a),
    v[0] * Math.sin(a) + v[1] * Math.cos(a)
  ];
  const outDir: Point = seaward ?? rot(flow, turn);
  // Incoming heading = outgoing rotated back by `turn`; `inDir` points to the source.
  const preBend = rot(outDir, -turn);
  const inDir: Point = [-preBend[0], -preBend[1]];

  const fillet = Math.min(0.7 * R, span * 0.45);
  const legLen = span - fillet;
  const pIn: Point = [apex[0] + inDir[0] * fillet, apex[1] + inDir[1] * fillet];
  const pOut: Point = [apex[0] + outDir[0] * fillet, apex[1] + outDir[1] * fillet];
  const wob = (): number => rng.range(-0.045, 0.045) * R;
  const pts: Point[] = [];
  const leg = 8;
  for (let k = leg; k >= 0; k--) {
    const w = wob();
    pts.push([
      pIn[0] + inDir[0] * legLen * (k / leg) + perp[0] * w,
      pIn[1] + inDir[1] * legLen * (k / leg) + perp[1] * w
    ]);
  }
  const corner = 6;
  for (let k = 1; k < corner; k++) {
    const s = k / corner;
    const b0 = (1 - s) * (1 - s);
    const b1 = 2 * (1 - s) * s;
    const b2 = s * s;
    pts.push([b0 * pIn[0] + b1 * apex[0] + b2 * pOut[0], b0 * pIn[1] + b1 * apex[1] + b2 * pOut[1]]);
  }
  for (let k = 0; k <= leg; k++) {
    const w = wob();
    pts.push([
      pOut[0] + outDir[0] * legLen * (k / leg) + perp[0] * w,
      pOut[1] + outDir[1] * legLen * (k / leg) + perp[1] * w
    ]);
  }
  return pts;
}

/** Move `tip` along the direction `inward → tip` until it meets the [-half,half]²
 * window boundary (extending out, or pulling a too-far corner point back in). */
function toWindowEdge(tip: Point, inward: Point, half: number): Point {
  let dx = tip[0] - inward[0];
  let dy = tip[1] - inward[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  let t = Number.POSITIVE_INFINITY;
  if (Math.abs(dx) > 1e-6) t = Math.min(t, (Math.sign(dx) * half - tip[0]) / dx);
  if (Math.abs(dy) > 1e-6) t = Math.min(t, (Math.sign(dy) * half - tip[1]) / dy);
  // t < 0 means the tip is already outside along this heading — pull it back.
  return Number.isFinite(t) ? [tip[0] + dx * t, tip[1] + dy * t] : tip;
}

function synthRiver(
  rng: Rng,
  placement: RiverPlacement,
  id: number,
  half: number,
  R: number,
  waterbody: BurgSiteWaterbody | null,
  span: number
): BurgSiteRiver {
  // A MEANDERING CORRIDOR: source → … → mouth, sampled along the flow axis with a
  // tapered sine-sum lateral offset (meanderCorridor). The pipeline walk snaps it
  // to cell edges and stops at the shoreline; the bends survive because the walk's
  // corridor pull is soft (riverPath.ts).
  const flowAz =
    placement.shape === "toCoast" && waterbody ? waterbody.shoreAzimuthDeg : ((placement.axisDeg % 360) + 360) % 360;
  const flow = azimuthToVec(flowAz);
  const perp: Point = [-flow[1], flow[0]];
  // `toCoast` carries no authored offset — nudge the channel just off the town
  // (random bank) so it isn't bisected; the rest use their placement offset.
  const shift =
    placement.shape === "toCoast" && waterbody
      ? (rng() < 0.5 ? -1 : 1) * rng.range(0.22, 0.34) * R
      : placement.offsetRatio * R;
  // How close the channel may come to the town: a hair for `through` (town right
  // on the bank), a fraction of the offset for `beside` (stays clearly apart).
  const townClear = 0.22 * R;
  const nearLimit = placement.shape === "beside" ? Math.max(townClear, Math.abs(shift) * 0.6) : townClear;

  const seaward = waterbody ? azimuthToVec(waterbody.shoreAzimuthDeg) : null;
  const raw =
    placement.shape === "greatBend"
      ? bendCorridor(rng, flow, perp, shift, span, R, nearLimit, seaward)
      : meanderCorridor(
          rng,
          flow,
          perp,
          shift,
          span,
          R,
          placement.meanderScale,
          nearLimit,
          meanderProfileFor(placement.shape)
        );
  // Land each end of the corridor EXACTLY on the window boundary along its own
  // direction, so a river always enters / leaves at a map edge. A raw endpoint
  // aimed diagonally sits several cells inside the nearest edge even though it is
  // far out radially — the walk then starts there and the river never reaches the
  // edge. (`toCoast` / seaward mouths land on the edge inside the sea; the walk
  // still stops at the water and finalizeEnds snaps the mouth to the shore.)
  const corridor: Point[] = raw.map(p => [p[0], p[1]] as Point);
  const n = corridor.length;
  corridor[0] = toWindowEdge(corridor[0], corridor[1], half);
  corridor[n - 1] = toWindowEdge(corridor[n - 1], corridor[n - 2], half);
  // Town is on the −sign(shift) side; sideOfPolyline(origin) has that sign.
  const cityBank: "left" | "right" = sideOfPolyline([0, 0], corridor) > 0 ? "left" : "right";

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
  if (config.rivers.some(s => THROUGH_FAMILY.includes(s))) return "riverCrossing";
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
