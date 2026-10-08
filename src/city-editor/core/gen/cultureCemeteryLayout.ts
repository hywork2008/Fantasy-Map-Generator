import type { BurialCultureProfile } from "../../../data/burialCultures";
import { polygonOverlaps, polylineInsideRing } from "../fortifications";
import type { CemeteryPart, CemeteryPlan, CityDocument, Point } from "../types";
import { dryRuns, waterPolygons } from "../waterGeometry";
import { nearestOnPolyline } from "./geom";
import { makeRng } from "./prng";

/** All culture-specific geometry is saved in the plan, so exports and editing agree. */
export function layoutCultureCemetery(
  document: CityDocument,
  cemetery: CemeteryPlan,
  safe: Point[],
  gate: Point,
  center: Point,
  x: Point,
  y: Point
): CemeteryPlan {
  const profile = cemetery.burialProfile!;
  const rng = makeRng(cemetery.seed);
  const world = (u: number, v: number): Point => [center[0] + x[0] * u + y[0] * v, center[1] + x[1] * u + y[1] * v];
  const local = (p: Point): Point => [
    (p[0] - center[0]) * x[0] + (p[1] - center[1]) * x[1],
    (p[0] - center[0]) * y[0] + (p[1] - center[1]) * y[1]
  ];
  const points = safe.map(local);
  const minU = Math.min(...points.map(p => p[0]));
  const maxU = Math.max(...points.map(p => p[0]));
  const minV = Math.min(...points.map(p => p[1]));
  const maxV = Math.max(...points.map(p => p[1]));
  const parts: CemeteryPart[] = [];
  const accesses: CemeteryPlan["accesses"] = [];
  const trees: Point[] = [];
  const fits = (ring: Point[]) => polylineInsideRing([...ring, ring[0]], safe);
  const rectangle = (u: number, v: number, w: number, h: number): Point[] => [
    world(u - w / 2, v - h / 2),
    world(u + w / 2, v - h / 2),
    world(u + w / 2, v + h / 2),
    world(u - w / 2, v + h / 2)
  ];
  const circle = (u: number, v: number, radius: number, n = 24) =>
    Array.from({ length: n }, (_, i) =>
      world(u + Math.cos((i * 2 * Math.PI) / n) * radius, v + Math.sin((i * 2 * Math.PI) / n) * radius)
    );
  // Disjoint boxes cannot overlap; a tumulus field holds hundreds of 24-gon parts (Odeck).
  const partBoxes: Box[] = [];
  const overlapsPart = (footprint: Point[]) => {
    const box = boxOf(footprint);
    return parts.some((part, i) => boxesTouch(partBoxes[i], box) && polygonOverlaps(part.footprint, footprint));
  };
  const add = (role: CemeteryPart["role"], kind: CemeteryPart["kind"], footprint: Point[], holes?: Point[][]) => {
    if (
      !fits(footprint) ||
      overlapsPart(footprint) ||
      trees.some(t => {
        const [u, v] = local(t);
        return polygonOverlaps(rectangle(u, v, 3, 3), footprint);
      })
    )
      return false;
    partBoxes.push(boxOf(footprint));
    parts.push({
      id: `${cemetery.id}:${role}:${parts.length}`,
      role,
      kind,
      footprint,
      holes,
      entrances: [],
      locked: false
    });
    return true;
  };

  // Scale down only when a parcel cannot hold the normal footprint; never spill into roads/water.
  if (profile.sanctuary !== "none_flat_memorial") {
    for (const scale of [1, 0.8, 0.6, 0.4, 0.25]) {
      let footprint: Point[];
      let holes: Point[][] | undefined;
      switch (profile.sanctuary) {
        case "tower_of_silence":
          footprint = circle(0, 0, 8 * scale);
          holes = [circle(0, 0, 6.7 * scale), circle(0, 0, 1.5 * scale)];
          break;
        case "mausoleum_dome":
          footprint = circle(0, 0, 5 * scale, 8);
          break;
        case "stupa_chorten":
          footprint = rectangle(0, 0, 9 * scale, 9 * scale);
          break;
        case "preaching_cross_calvary":
          footprint = rectangle(0, 0, 2 * scale, 2 * scale);
          break;
        case "cremation_pyre_platform":
          footprint = rectangle(0, 0, 9 * scale, 4 * scale);
          break;
        case "chapel_basilica":
          if (profile.id === "edo_temple_town") {
            footprint = rectangle(0, 0, 10 * scale, 6 * scale);
            break;
          }
          footprint = [
            [-3, -6],
            [3, -6],
            [3, -1],
            [5, -1],
            [5, 2],
            [3, 2],
            [3, 6],
            [-3, 6],
            [-3, 2],
            [-5, 2],
            [-5, -1],
            [-3, -1]
          ].map(([u, v]) => world(u * scale, v * scale));
          break;
        default:
          footprint = rectangle(0, 0, 8 * scale, 5 * scale);
      }
      if (add("sanctuary", profile.sanctuary, footprint, holes)) break;
    }
  }

  const layout = profile.monuments;
  if (layout === "columbarium_walls") {
    for (let i = 0; i < safe.length; i++) {
      const a = safe[i],
        b = safe[(i + 1) % safe.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      if (length < 5) continue;
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let normal: Point = [-dy / length, dx / length];
      if ((center[0] - mid[0]) * normal[0] + (center[1] - mid[1]) * normal[1] < 0) normal = [-normal[0], -normal[1]];
      const q = (t: number, d: number): Point => [a[0] + dx * t + normal[0] * d, a[1] + dy * t + normal[1] * d];
      add("monument", layout, [q(0.06, 0.5), q(0.94, 0.5), q(0.94, 1.7), q(0.06, 1.7)]);
    }
  }

  // A straight approach or central avenue, clipped to the safe precinct.
  const avenue = profile.monuments === "linear_avenue_monuments";
  const axis = [world(0, minV + 0.8), world(0, maxV - 0.8)];
  if (polylineInsideRing(axis, safe)) {
    for (const run of dryRuns(
      axis,
      parts.map(part => part.footprint)
    ))
      accesses.push({ points: run, widthMeters: avenue ? 3.5 : 1.5 });
  }

  // Ritual facilities occupy small perimeter plots, clear of the central building.
  for (const facility of profile.ritualFacilities) {
    let placed = false;
    for (let v = minV + 2; v < maxV - 2 && !placed; v += 3) {
      for (let u = minU + 2; u < maxU - 2 && !placed; u += 3) {
        const p = world(u, v);
        if (accesses.some(a => nearestOnPolyline(p, a.points).dist < a.widthMeters / 2 + 1.5)) continue;
        placed = add("ritual", facility, rectangle(u, v, 2.5, 2));
      }
    }
  }

  // Boundaries whose geometry differs from a simple enclosing line.
  if (profile.boundary === "stepped_water_terrace") {
    const water = waterPolygons(document);
    const edges = safe.map((a, i) => ({ a, b: safe[(i + 1) % safe.length] }));
    const distance = (p: Point) => Math.min(...water.map(ring => nearestOnPolyline(p, [...ring, ring[0]]).dist));
    edges.sort(
      (a, b) =>
        distance([(a.a[0] + a.b[0]) / 2, (a.a[1] + a.b[1]) / 2]) -
        distance([(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2])
    );
    const edge = edges[0];
    for (const offset of [0, 0.8, 1.6]) {
      const move = (p: Point): Point => {
        const d = Math.hypot(center[0] - p[0], center[1] - p[1]);
        return [p[0] + ((center[0] - p[0]) * offset) / d, p[1] + ((center[1] - p[1]) * offset) / d];
      };
      accesses.push({ points: [move(edge.a), move(edge.b)], widthMeters: 0.3 });
    }
  } else if (profile.boundary === "monumental_gate_pylon") {
    const [u, v] = local(gate);
    for (const du of [-2, 2]) add("boundary", profile.boundary, rectangle(u + du, v + 3, 1.2, 1.2));
  }

  // Tree species affect both the placement and the renderer's canopy silhouette.
  if (profile.vegetation !== "barren_gravel") {
    const treeCandidates: Point[] = [];
    if (profile.vegetation === "sacred_bodhi_and_fig") treeCandidates.push(world(7, 2));
    else if (profile.vegetation === "mediterranean_cypress") {
      for (let v = minV + 3; v < maxV - 2; v += 5)
        treeCandidates.push(world(avenue ? -4.5 : -3, v), world(avenue ? 4.5 : 3, v));
    } else if (profile.vegetation === "oriental_evergreen") {
      for (let i = 0; i < 5; i++) {
        const a = ((i + 1) * Math.PI) / 6;
        treeCandidates.push(world(Math.cos(a) * (maxU - minU) * 0.28, Math.sin(a) * (maxV - minV) * 0.28));
      }
    } else
      treeCandidates.push(
        world(minU + 3, minV + 3),
        world(maxU - 3, minV + 3),
        world(minU + 3, maxV - 3),
        world(maxU - 3, maxV - 3)
      );
    if (
      profile.vegetation === "sacred_yew" ||
      profile.vegetation === "garden_parkland" ||
      profile.vegetation === "peaceful_willow"
    ) {
      treeCandidates.push(
        ...safe.map(p => [center[0] + (p[0] - center[0]) * 0.65, center[1] + (p[1] - center[1]) * 0.65] as Point)
      );
    }
    for (const p of treeCandidates) {
      if (
        trees.length >=
        (profile.vegetation === "sacred_bodhi_and_fig" ? 1 : profile.vegetation === "mediterranean_cypress" ? 12 : 4)
      )
        break;
      const [u, v] = local(p);
      const canopy = rectangle(u, v, 3, 3);
      if (
        fits(canopy) &&
        !overlapsPart(canopy) &&
        !accesses.some(a => nearestOnPolyline(p, a.points).dist < a.widthMeters / 2 + 1.5)
      )
        trees.push(p);
    }
  }

  // Each marker is actual geometry (no implicit European headstone overlay).
  const basePitch =
    layout === "crowded_jumble" ? 1.8 : layout === "headstone_grid" || layout === "flat_ground_markers" ? 2.4 : 6;
  const pitch = Math.max(basePitch, Math.sqrt(((maxU - minU) * (maxV - minV)) / 4500));
  let attempts = 0;
  // Cremation ghats, sky-exposure towers and household burials have no ground graves.
  const groundMarkers =
    layout !== "columbarium_walls" &&
    !(
      profile.zoning === "riverfront_ghat" ||
      profile.sanctuary === "tower_of_silence" ||
      profile.zoning === "household_intramural"
    );
  if (groundMarkers)
    for (let v = minV + pitch / 2; v < maxV && attempts < 5000; v += pitch) {
      for (
        let u = avenue ? -4.5 : minU + pitch / 2;
        u < (avenue ? 5 : maxU) && attempts++ < 5000;
        u += avenue ? 9 : pitch
      ) {
        const ju = layout === "crowded_jumble" ? (rng() - 0.5) * 0.6 : 0;
        const jv = layout === "crowded_jumble" ? (rng() - 0.5) * 0.6 : 0;
        const p = world(u + ju, v + jv);
        const radius = pitch > 3 ? 2 : 0.8;
        if (
          accesses.some(a => nearestOnPolyline(p, a.points).dist < a.widthMeters / 2 + radius) ||
          trees.some(t => Math.hypot(p[0] - t[0], p[1] - t[1]) < 3)
        )
          continue;
        let footprint: Point[];
        if (layout === "stepped_tumuli_mounds") footprint = circle(u, v, 2.2);
        else if (layout === "cairns_and_steles") footprint = circle(u, v, 0.8, 6);
        else if (layout === "terrace_horseshoe") {
          const outer = Array.from({ length: 13 }, (_, i) => {
            const a = (i * Math.PI) / 12;
            return world(u + 2.2 * Math.cos(a), v + 2.2 * Math.sin(a));
          });
          const inner = Array.from({ length: 13 }, (_, i) => {
            const a = ((12 - i) * Math.PI) / 12;
            return world(u + 1.5 * Math.cos(a), v + 1.5 * Math.sin(a));
          });
          footprint = [...outer, ...inner];
        } else if (layout === "linear_avenue_monuments") {
          if (Math.abs(u) > 7 || Math.abs(u) < 3) continue;
          footprint = rectangle(u, v, 2.8, 2.8);
        } else {
          footprint = rectangle(u + ju, v + jv, 0.8, 1.3);
          if (layout === "crowded_jumble") {
            const angle = ((rng() - 0.5) * Math.PI) / 6;
            footprint = footprint.map(q => {
              const dx = q[0] - p[0],
                dy = q[1] - p[1];
              return [
                p[0] + dx * Math.cos(angle) - dy * Math.sin(angle),
                p[1] + dx * Math.sin(angle) + dy * Math.cos(angle)
              ];
            });
          }
        }
        add("monument", layout, footprint);
      }
    }
  return { ...cemetery, parts, courtyards: [safe], accesses, trees, gatePoint: gate };
}

type Box = [number, number, number, number];
const BOX_MARGIN = 1e-6;

function boxOf(points: Point[]): Box {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function boxesTouch(a: Box, b: Box): boolean {
  return (
    a[0] <= b[2] + BOX_MARGIN && b[0] <= a[2] + BOX_MARGIN && a[1] <= b[3] + BOX_MARGIN && b[1] <= a[3] + BOX_MARGIN
  );
}

export function cemeteryGroundColor(profile: BurialCultureProfile): string {
  return profile.vegetation === "barren_gravel" || profile.zoning === "subterranean_network" ? "#c8bca6" : "#7ea867";
}
