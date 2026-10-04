import { insideRing, polygonOverlaps, polylineInsideRing } from "../fortifications";
import { facePoints, indexMeshEdges } from "../mesh";
import type { CemeteryPart, CemeteryPlan, CityDocument, Face, Id, Point } from "../types";
import { waterPolygons } from "../waterGeometry";
import { nearestOnPolyline, polygonArea, polygonCentroid, segmentInteriorInPolygon } from "./geom";
import { clipBlockWithRivers, convexInfillParts, insetConvexKernel, type RiverMargin } from "./lotGeometry";
import { plotArea, subtractConvex } from "./parcelGeometry";

/**
 * Geometric layout of a cemetery precinct (churchyard / cloister / field).
 * Modeled closely after `layoutCastle` to ensure architectural symmetry,
 * high maintainability, and consistent coordinate space mapping.
 */
export function layoutCemetery(document: CityDocument, cemetery: CemeteryPlan): CemeteryPlan | null {
  const ring = cemetery.boundary;
  if (!ring || ring.length < 3) return null;

  // Inset the boundary to establish a safe perimeter inside the perimeter stone wall
  const isField = cemetery.form === "field";
  const setback = isField ? 1.4 : 2.0;
  const safe = insetConvexKernel(
    ring,
    ring.map(() => setback)
  );
  if (safe.length < 3) return null;

  const safeArea = Math.abs(polygonArea(safe));
  const xs = safe.map(p => p[0]);
  const ys = safe.map(p => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const minSpan = Math.min(spanX, spanY);
  const maxSpan = Math.max(spanX, spanY);

  if (isField) {
    // Burial field needs enough room for headstone rows and access walk
    if (safeArea < 30 || minSpan < 2.5 || maxSpan < 6.0) return null;
  } else {
    // Churchyard precinct requires room for chapel, rectory, and ossuary buildings
    if (safeArea < 50 || spanX < 5.0 || spanY < 5.0) return null;
  }

  const center = polygonCentroid(safe);

  // Determine primary gate/entrance position 'at'
  let at = cemetery.gatePoint;
  if (!at || !insideRing(at, ring)) {
    // Look for a road adjacent to this cemetery boundary
    const roadPolylines: Point[][] = [];
    for (const group of document.featureGroups ?? []) {
      if (group.kind === "road") {
        const pts = (group.segments ?? []).flatMap(s => {
          const edge = document.mesh.edges[s.edgeId];
          if (!edge) return [];
          const va = document.mesh.vertices[edge.a]?.point;
          const vb = document.mesh.vertices[edge.b]?.point;
          return va && vb ? [va, vb] : [];
        });
        if (pts.length >= 2) roadPolylines.push(pts);
      }
    }

    let bestDist = Infinity;
    let candidate = ring[0];
    if (roadPolylines.length > 0) {
      for (const p of ring) {
        for (const road of roadPolylines) {
          const hit = nearestOnPolyline(p, road);
          if (hit.dist < bestDist) {
            bestDist = hit.dist;
            candidate = p;
          }
        }
      }
    } else {
      // Fallback: prefer south side (lowest Y)
      let lowestY = Infinity;
      for (const p of ring) {
        if (p[1] < lowestY) {
          lowestY = p[1];
          candidate = p;
        }
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

  const extentRadius = Math.sqrt(safeArea / Math.PI);

  // If explicitly configured as "field" (pure burial ground with rows of headstones),
  // layout burial field directly without attempting large church buildings
  if (cemetery.form === "field") {
    return layoutBurialField(cemetery, safe, ring, at, center, x, y, world, extentRadius);
  }

  // Fit the largest rectangular frame inside the safe kernel for churchyard buildings
  let frame: [number, number] | null = null;
  for (const ratio of [1, 1.25, 0.8, 1.5, 0.67, 1.8, 0.55]) {
    for (let h = 40; h >= 10; h -= 1) {
      const w = Math.min(48, h * ratio);
      if (w < 10 || !rectangle(0, 0, w * 2, h * 2).every(p => insideRing(p, safe))) continue;
      if (!frame || w * h > frame[0] * frame[1]) frame = [w, h];
      break;
    }
  }

  // A narrow churchyard can still serve as a burial ground without chapel buildings.
  if (!frame) {
    return layoutBurialField(cemetery, safe, ring, at, center, x, y, world, extentRadius);
  }
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
  for (const old of (cemetery.parts ?? []).filter(p => p.locked)) {
    const index = parts.findIndex(p => p.role === old.role);
    if (index >= 0 && old.footprint.every(p => insideRing(p, safe))) {
      parts[index] = structuredClone(old);
    }
  }

  // Check overlaps among building parts (excluding calvary/graves which sit in open yard)
  const solidParts = parts.filter(p => p.role !== "calvary" && p.role !== "graves");
  if (solidParts.some((p, i) => solidParts.slice(i + 1).some(q => polygonOverlaps(p.footprint, q.footprint)))) {
    return layoutBurialField(cemetery, safe, ring, at, center, x, y, world, extentRadius);
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
 * Lays out a burial ground / field without full-set church buildings,
 * consisting of headstone rows, pathways, open lawn, central cross/memorial, and trees.
 * Ideal for suburban expansion cemeteries, pre-industrial/modern cemeteries,
 * or compact parcels where a full abbey/church complex does not fit.
 */
function layoutBurialField(
  cemetery: CemeteryPlan,
  safe: Point[],
  _ring: Point[],
  at: Point,
  center: Point,
  x: Point,
  y: Point,
  world: (u: number, v: number) => Point,
  extentRadius: number
): CemeteryPlan {
  const parts: CemeteryPart[] = [];
  const accesses: CemeteryPlan["accesses"] = [];

  // 1. Central preaching cross or memorial column
  const calvarySize = Math.max(1.6, Math.min(2.4, extentRadius * 0.2));
  const calvaryCenter = center;
  parts.push({
    id: `${cemetery.id}:calvary`,
    role: "calvary",
    footprint: [
      [
        calvaryCenter[0] - x[0] * calvarySize * 0.5 - y[0] * calvarySize * 0.5,
        calvaryCenter[1] - x[1] * calvarySize * 0.5 - y[1] * calvarySize * 0.5
      ],
      [
        calvaryCenter[0] + x[0] * calvarySize * 0.5 - y[0] * calvarySize * 0.5,
        calvaryCenter[1] + x[1] * calvarySize * 0.5 - y[1] * calvarySize * 0.5
      ],
      [
        calvaryCenter[0] + x[0] * calvarySize * 0.5 + y[0] * calvarySize * 0.5,
        calvaryCenter[1] + x[1] * calvarySize * 0.5 + y[1] * calvarySize * 0.5
      ],
      [
        calvaryCenter[0] - x[0] * calvarySize * 0.5 + y[0] * calvarySize * 0.5,
        calvaryCenter[1] - x[1] * calvarySize * 0.5 + y[1] * calvarySize * 0.5
      ]
    ],
    entrances: [[calvaryCenter[0] - y[0] * calvarySize * 0.5, calvaryCenter[1] - y[1] * calvarySize * 0.5]],
    locked: false
  });

  // 2. Main access path: entrance 'at' -> center calvary -> deep end
  const pathToEnd = world(0, extentRadius * 0.75);
  const mainSpine: Point[] = [at, center];
  if (insideRing(pathToEnd, safe)) {
    mainSpine.push(pathToEnd);
  }
  accesses.push({ points: mainSpine, widthMeters: 2.0 });

  // Optional cross-path if wide enough
  const leftWing = world(-extentRadius * 0.6, 0);
  const rightWing = world(extentRadius * 0.6, 0);
  if (insideRing(leftWing, safe) && insideRing(rightWing, safe) && extentRadius >= 10) {
    accesses.push({ points: [leftWing, rightWing], widthMeters: 1.5 });
  }

  // 3. Graves: the safe kernel is dedicated as burial grounds with headstones
  parts.push({
    id: `${cemetery.id}:graves`,
    role: "graves",
    footprint: safe,
    entrances: [at],
    locked: false
  });

  // 4. Trees: planted along perimeter borders
  const treeCandidates: Point[] = [
    world(-extentRadius * 0.65, -extentRadius * 0.65),
    world(extentRadius * 0.65, -extentRadius * 0.65),
    world(-extentRadius * 0.65, extentRadius * 0.65),
    world(extentRadius * 0.65, extentRadius * 0.65)
  ];
  const trees = treeCandidates.filter(p => insideRing(p, safe));

  return {
    ...cemetery,
    form: "field",
    parts,
    courtyards: [safe],
    accesses,
    trees,
    gatePoint: at
  };
}

/**
 * Computes an inset cemetery boundary polygon that respects adjacent river widths,
 * city walls, roads, and water bodies, preventing cemetery stone walls and internal
 * geometry from clipping into river channels, walls, or road rights-of-way.
 */
export function computeCemeteryBoundary(document: CityDocument, face: Face): Point[] {
  const raw = facePoints(document.mesh, face);
  if (raw.length < 3) return raw;

  const edgeIndex = indexMeshEdges(document.mesh);
  const riverMarginByEdge = new Map<Id, number>();
  const wallMarginByEdge = new Map<Id, number>();
  const roadMarginByEdge = new Map<Id, number>();
  const rivers: RiverMargin[] = [];

  for (const group of document.featureGroups ?? []) {
    const halfWidth = (group.style?.widthMeters ?? 4) / 2;
    if (group.kind === "river") {
      const margin = halfWidth + 3.5;
      const pts = (group.vertices ?? []).map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
      if (pts.length >= 2) {
        rivers.push({
          points: pts,
          margin,
          halfWidth
        });
      }
      const edgeIds = (group.vertices ?? []).slice(1).flatMap((id, i) => {
        const edge = edgeIndex.between(group.vertices[i], id);
        return edge ? [edge.id] : [];
      });
      for (const eid of edgeIds) {
        riverMarginByEdge.set(eid, Math.max(riverMarginByEdge.get(eid) ?? 0, margin));
      }
    } else if (group.kind === "wall") {
      const margin = halfWidth + 2.5;
      for (const seg of group.segments ?? []) {
        wallMarginByEdge.set(seg.edgeId, Math.max(wallMarginByEdge.get(seg.edgeId) ?? 0, margin));
      }
    } else if (group.kind === "road") {
      const margin = halfWidth + 1.8;
      for (const seg of group.segments ?? []) {
        roadMarginByEdge.set(seg.edgeId, Math.max(roadMarginByEdge.get(seg.edgeId) ?? 0, margin));
      }
    }
  }

  // Calculate per-edge setback for each boundary segment
  const setbacks = face.boundary.map(ref => {
    const edge = document.mesh.edges[ref.edgeId];
    const otherId = edge ? (edge.leftFace === face.id ? edge.rightFace : edge.leftFace) : null;
    const otherFace = otherId ? document.mesh.faces[otherId] : null;

    // Check river
    const riverM = riverMarginByEdge.get(ref.edgeId);
    if (riverM !== undefined) return riverM;

    // Adjacent water face (sea, lake, canal, open water)
    if (otherFace && otherFace.properties.water !== "land") {
      return 6.0;
    }

    // Check city wall
    const wallM = wallMarginByEdge.get(ref.edgeId);
    if (wallM !== undefined) return wallM;

    // Check road
    const roadM = roadMarginByEdge.get(ref.edgeId);
    if (roadM !== undefined) return roadM;

    // Standard parcel boundary buffer
    return 1.8;
  });

  let boundary = insetConvexKernel(raw, setbacks);
  if (boundary.length < 3 || Math.abs(polygonArea(boundary)) < 40) {
    // If setback was too large for a small polygon, apply capped setback
    const fallbackSetbacks = setbacks.map(s => Math.min(s, 2.2));
    boundary = insetConvexKernel(raw, fallbackSetbacks);
  }

  if (boundary.length >= 3 && rivers.length > 0) {
    const center = face.site ?? polygonCentroid(raw);
    const clipped = clipBlockWithRivers(boundary, raw, center, rivers);
    if (clipped.length >= 3 && Math.abs(polygonArea(clipped)) >= 30) {
      boundary = clipped;
    }
  }

  // Physical channels can cross a land-classified editing cell without a
  // river feature group or an adjacent water face.
  if (waterPolygons(document).length) {
    let dry = convexInfillParts(boundary.length >= 3 ? boundary : raw);
    for (const polygon of waterPolygons(document))
      for (const wet of convexInfillParts(polygon)) dry = dry.flatMap(part => subtractConvex(part, wet, 0.01));
    return dry.sort((a, b) => plotArea(b) - plotArea(a))[0] ?? [];
  }
  return boundary.length >= 3 ? boundary : raw;
}

/**
 * Recomputes layout for all unlocked cemeteries in the document.
 */
export function refreshCemeteryLayouts(document: CityDocument): boolean {
  for (let i = 0; i < (document.cemeteries?.length ?? 0); i++) {
    const cemetery = document.cemeteries![i];
    if (cemetery.locked) continue;
    const face = document.mesh.faces[cemetery.faceId];
    const boundary = face ? computeCemeteryBoundary(document, face) : cemetery.boundary;
    const updated = layoutCemetery(document, { ...cemetery, boundary });
    document.cemeteries![i] = updated ?? {
      ...cemetery,
      boundary,
      courtyards: [],
      parts: [],
      accesses: [],
      trees: [],
      gatePoint: undefined
    };
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
        const boundary = computeCemeteryBoundary(document, face);
        const area = Math.abs(polygonArea(boundary));
        const period = document.historicalPeriod;
        const isModern = period === "preIndustrialEra" || period === "steamEra" || period === "industrialChemistryEra";
        const form: CemeteryPlan["form"] = isModern || area < 750 ? "field" : "churchyard";
        plan = {
          id: `cemetery:${face.id}`,
          version: 1,
          seed: `cemetery-${face.id}`,
          form,
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
