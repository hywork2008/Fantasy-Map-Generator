import { insideRing, polygonOverlaps, polylineInsideRing } from "../fortifications";
import { facePoints } from "../mesh";
import type { CemeteryPart, CemeteryPlan, CityDocument, Id, Point } from "../types";
import { polygonCentroid, segmentInteriorInPolygon } from "./geom";
import { insetConvexKernel } from "./lotGeometry";

/**
 * Geometric layout of a cemetery precinct (churchyard / cloister / field).
 * Modeled closely after `layoutCastle` to ensure architectural symmetry,
 * high maintainability, and consistent coordinate space mapping.
 */
export function layoutCemetery(document: CityDocument, cemetery: CemeteryPlan): CemeteryPlan | null {
  const ring = cemetery.boundary;
  if (!ring || ring.length < 3) return null;

  // Inset the boundary to establish a safe perimeter inside the churchyard wall
  const setback = 2.0;
  const safe = insetConvexKernel(
    ring,
    ring.map(() => setback)
  );
  if (safe.length < 3) return null;

  const center = polygonCentroid(safe);

  // Determine primary gate/entrance position 'at'
  let at = cemetery.gatePoint;
  if (!at) {
    // If no gate specified, pick the boundary edge closest to a street/road or south-facing
    let bestDist = -Infinity;
    let candidate = ring[0];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      // Prefer south side (negative Y in our coordinates usually, or find lowest Y)
      const dist = -p[1];
      if (dist > bestDist) {
        bestDist = dist;
        candidate = p;
      }
    }
    at = candidate;
  }

  const dy = [center[0] - at[0], center[1] - at[1]];
  const length = Math.hypot(...dy);
  if (length < 1) return null;

  // Local coordinate system:
  // y axis points from gate towards the center/depth of the precinct
  // x axis is perpendicular (width)
  const y: Point = [dy[0] / length, dy[1] / length];
  const x: Point = [y[1], -y[0]];

  const world = (u: number, v: number): Point => [center[0] + x[0] * u + y[0] * v, center[1] + x[1] * u + y[1] * v];

  const rectangle = (u: number, v: number, w: number, h: number): Point[] => [
    world(u - w / 2, v - h / 2),
    world(u + w / 2, v - h / 2),
    world(u + w / 2, v + h / 2),
    world(u - w / 2, v + h / 2)
  ];

  // Fit the largest rectangular frame inside the safe kernel
  let frame: [number, number] | null = null;
  for (const ratio of [1, 1.25, 0.8, 1.5, 0.67, 1.8, 0.55]) {
    for (let h = 40; h >= 10; h -= 1) {
      const w = Math.min(48, h * ratio);
      if (w < 10 || !rectangle(0, 0, w * 2, h * 2).every(p => insideRing(p, safe))) continue;
      if (!frame || w * h > frame[0] * frame[1]) frame = [w, h];
      break;
    }
  }

  if (!frame) return null;
  const [w, h] = frame;

  const parts: CemeteryPart[] = [];
  const add = (role: CemeteryPart["role"], u: number, v: number, width: number, depth: number, entrance: Point) =>
    parts.push({
      id: `${cemetery.id}:${role}`,
      role,
      footprint: rectangle(u, v, width, depth),
      entrances: [entrance],
      locked: false
    });

  // 1. Chapel / Church: placed at the back (depth-wise, v > 0)
  const chapelWidth = Math.min(26, w * 0.85);
  const chapelDepth = Math.min(14, h * 0.5);
  const chapelV = h * 0.45;
  add("chapel", 0, chapelV, chapelWidth, chapelDepth, world(0, chapelV - chapelDepth / 2));

  // 2. Charnel House / Ossuary: along the right/north-east wing
  const ossuaryWidth = Math.min(8, w * 0.28);
  const ossuaryDepth = Math.min(18, h * 0.55);
  const ossuaryU = w * 0.68;
  const ossuaryV = h * 0.3;
  add("ossuary", ossuaryU, ossuaryV, ossuaryWidth, ossuaryDepth, world(ossuaryU - ossuaryWidth / 2, ossuaryV));

  // 3. Rectory / Caretaker: along the left/north-west wing
  const rectoryWidth = Math.min(11, w * 0.35);
  const rectoryDepth = Math.min(11, h * 0.4);
  const rectoryU = -w * 0.68;
  const rectoryV = h * 0.35;
  add("rectory", rectoryU, rectoryV, rectoryWidth, rectoryDepth, world(rectoryU + rectoryWidth / 2, rectoryV));

  // 4. Calvary (Central preaching cross): in the center of the graveyard court
  const calvarySize = 2.4;
  const calvaryV = -h * 0.1;
  add("calvary", 0, calvaryV, calvarySize, calvarySize, world(0, calvaryV - calvarySize / 2));

  // 5. Grave Clusters: in the open yard (v < 0)
  const graveYardWidth = Math.min(24, w * 0.8);
  const graveYardDepth = Math.min(12, h * 0.45);
  const graveYardV = -h * 0.45;
  add("graves", 0, graveYardV, graveYardWidth, graveYardDepth, world(0, graveYardV));

  // Anchor perimeter buildings outwards against the safe perimeter
  for (const part of parts) {
    if (part.role === "calvary" || part.role === "graves") continue;

    const direction: Point = part.role === "chapel" ? y : part.role === "rectory" ? [-x[0], -x[1]] : x;

    const anchor = part.footprint;
    let offset = 0;
    for (let distance = 0.25; distance < 100; distance += 0.25) {
      if (!anchor.every(p => insideRing([p[0] + direction[0] * distance, p[1] + direction[1] * distance], safe))) {
        break;
      }
      offset = distance;
    }
    part.footprint = anchor.map(p => [p[0] + direction[0] * offset, p[1] + direction[1] * offset]);

    // Recalculate entrance facing the central court
    const side =
      part.role === "chapel"
        ? [0, 1] // South side
        : part.role === "rectory"
          ? [1, 2] // East side
          : [3, 0]; // West side
    part.entrances = [
      [
        (part.footprint[side[0]][0] + part.footprint[side[1]][0]) / 2,
        (part.footprint[side[0]][1] + part.footprint[side[1]][1]) / 2
      ]
    ];
  }

  // Restore locked parts
  for (const old of cemetery.parts.filter(p => p.locked)) {
    const index = parts.findIndex(p => p.role === old.role);
    if (index >= 0 && old.footprint.every(p => insideRing(p, safe))) {
      parts[index] = structuredClone(old);
    }
  }

  // Check overlaps among building parts (excluding calvary/graves which sit in open yard)
  const solidParts = parts.filter(p => p.role !== "calvary" && p.role !== "graves");
  if (solidParts.some((p, i) => solidParts.slice(i + 1).some(q => polygonOverlaps(p.footprint, q.footprint)))) {
    return null;
  }

  // Courtyard / lawn: the entire safe kernel inside the precinct wall
  const court = safe;

  // Clear path check
  const clear = (points: Point[]) =>
    polylineInsideRing(points, ring) &&
    !solidParts.some(part => points.slice(1).some((p, i) => segmentInteriorInPolygon(points[i], p, part.footprint)));

  // Access paths: gate -> calvary -> chapel
  const accesses: CemeteryPlan["accesses"] = [];
  const chapelPart = parts.find(p => p.role === "chapel");
  const calvaryPart = parts.find(p => p.role === "calvary");

  if (chapelPart && calvaryPart) {
    const calvaryEnt = calvaryPart.entrances[0];
    const chapelEnt = chapelPart.entrances[0];

    // Main spine: gate -> calvary -> chapel
    const spine = [at, calvaryEnt, chapelEnt];
    if (clear(spine)) {
      accesses.push({ points: spine, widthMeters: 2.2 });
    } else {
      // Fallback direct paths
      if (clear([at, calvaryEnt])) accesses.push({ points: [at, calvaryEnt], widthMeters: 2.0 });
      if (clear([calvaryEnt, chapelEnt])) accesses.push({ points: [calvaryEnt, chapelEnt], widthMeters: 2.0 });
    }
  }

  // Add side paths to rectory and ossuary
  const sideRoles: CemeteryPart["role"][] = ["rectory", "ossuary"];
  for (const role of sideRoles) {
    const part = parts.find(p => p.role === role);
    if (part && calvaryPart) {
      const branch = [calvaryPart.entrances[0], part.entrances[0]];
      if (clear(branch)) {
        accesses.push({ points: branch, widthMeters: 1.6 });
      }
    }
  }

  // Decorative Yew trees (2 to 4 trees along the south border or near entrance)
  const trees: Point[] = [
    world(-w * 0.7, -h * 0.7),
    world(w * 0.7, -h * 0.7),
    world(-w * 0.35, -h * 0.8),
    world(w * 0.35, -h * 0.8)
  ].filter(p => insideRing(p, safe));

  return {
    ...cemetery,
    parts,
    courtyards: [court],
    accesses,
    trees,
    gatePoint: at
  };
}

/**
 * Recomputes layout for all unlocked cemeteries in the document.
 */
export function refreshCemeteryLayouts(document: CityDocument): boolean {
  for (let i = 0; i < (document.cemeteries?.length ?? 0); i++) {
    const cemetery = document.cemeteries![i];
    if (cemetery.locked) continue;
    const updated = layoutCemetery(document, cemetery);
    if (!updated) return false;
    document.cemeteries![i] = updated;
  }
  return true;
}

/**
 * Synchronizes cemetery plans with faces marked as ward === "cemetery".
 */
export function syncDocumentCemeteries(document: CityDocument, faceIds?: Iterable<Id>): void {
  document.cemeteries ??= [];
  const ids = faceIds ?? Object.keys(document.mesh.faces);
  for (const id of ids) {
    const face = document.mesh.faces[id];
    if (face?.properties.ward === "cemetery") {
      let plan = document.cemeteries.find(c => c.faceId === face.id);
      if (!plan) {
        const boundary = facePoints(document.mesh, face);
        plan = {
          id: `cemetery:${face.id}`,
          version: 1,
          seed: `cemetery-${face.id}`,
          form: "churchyard",
          faceId: face.id,
          boundary,
          courtyards: [],
          parts: [],
          accesses: [],
          trees: [],
          provenance: "generated",
          locked: false
        };
        const layout = layoutCemetery(document, plan);
        if (layout) {
          document.cemeteries.push(layout);
        }
      }
    } else {
      document.cemeteries = document.cemeteries.filter(c => c.faceId !== id || c.locked);
    }
  }
}
