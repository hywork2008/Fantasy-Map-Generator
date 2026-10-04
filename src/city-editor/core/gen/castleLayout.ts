import { circuitRing, insideRing, polygonOverlaps, polylineInsideRing } from "../fortifications";
import type { CastlePart, CastlePlan, CityDocument, Point } from "../types";
import { polygonArea, polygonCentroid, segmentInteriorInPolygon } from "./geom";
import { insetConvexKernel } from "./lotGeometry";

/** Rectangular buildings on a shared court, in metres rather than cell units. */
export function layoutCastle(document: CityDocument, castle: CastlePlan, minFrame = 13): CastlePlan | null {
  const circuit = document.defenseCircuits?.find(c => c.id === castle.circuitId);
  const gate = document.gates.find(g => g.ownerCastleId === castle.id);
  if (!circuit || !gate) return null;
  const ring = circuitRing(document, circuit);
  const at = document.mesh.vertices[gate.vertexId]?.point;
  if (!at || ring.length < 3) return null;
  const safe = insetConvexKernel(
    ring,
    ring.map(() => 4)
  );
  if (safe.length < 3) return null;
  const center = polygonCentroid(safe);
  const dy = [center[0] - at[0], center[1] - at[1]];
  const length = Math.hypot(...dy);
  if (length < 1) return null;
  const y: Point = [dy[0] / length, dy[1] / length];
  const x: Point = [y[1], -y[0]];
  const world = (u: number, v: number): Point => [center[0] + x[0] * u + y[0] * v, center[1] + x[1] * u + y[1] * v];
  const rectangle = (u: number, v: number, w: number, h: number): Point[] => [
    world(u - w / 2, v - h / 2),
    world(u + w / 2, v - h / 2),
    world(u + w / 2, v + h / 2),
    world(u - w / 2, v + h / 2)
  ];
  // Try wide and deep frames separately, avoiding an oversized keep on large maps.
  let frame: [number, number] | null = null;
  for (const ratio of [1, 1.25, 0.8, 1.5, 0.67]) {
    // 13 m is the ordinary bailey. Installation of a hamlet curtain may pass a
    // lower floor when the inset kernel is only ~40 m across.
    for (let h = 48; h >= minFrame; h -= 1) {
      const w = Math.min(55, h * ratio);
      if (w < minFrame || !rectangle(0, 0, w * 2, h * 2).every(p => insideRing(p, safe))) continue;
      if (!frame || w * h > frame[0] * frame[1]) frame = [w, h];
      break;
    }
  }
  if (!frame) return null;
  const [w, h] = frame;
  const parts: CastlePart[] = [];
  const add = (role: CastlePart["role"], u: number, v: number, width: number, depth: number, entrance: Point) => {
    // The small-bailey frame floor does not relax the document's 20 m²
    // minimum for real buildings. Leave 5% headroom for coordinate rounding.
    const scale = Math.max(1, Math.sqrt(21 / (width * depth)));
    parts.push({
      id: `${castle.id}:${role}`,
      role,
      footprint: rectangle(u, v, width * scale, depth * scale),
      entrances: [entrance],
      locked: false
    });
  };
  const keepWidth = Math.min(20, w * 0.5),
    keepDepth = Math.min(24, h * 0.6);
  if (castle.form === "keep-bailey")
    add("keep", w * 0.52, h * 0.43, keepWidth, keepDepth, world(w * 0.52, h * 0.43 - keepDepth / 2));
  else
    add(
      "range",
      w * 0.72,
      h * 0.1,
      Math.min(12, w * 0.25),
      Math.min(44, h * 1.45),
      world(w * 0.72 - Math.min(12, w * 0.25) / 2, h * 0.1)
    );
  const hallWidth = Math.min(32, w * 0.8),
    hallDepth = Math.min(12, h * 0.3);
  add("hall", -w * 0.4, h * 0.62, hallWidth, hallDepth, world(-w * 0.4, h * 0.62 - hallDepth / 2));
  const serviceWidth = Math.min(9, w * 0.25),
    serviceDepth = Math.min(20, h * 0.6);
  add("service", -w * 0.7, -h * 0.35, serviceWidth, serviceDepth, world(-w * 0.7 + serviceWidth / 2, -h * 0.35));
  // The frame sets building dimensions only. Anchor each wing against the actual
  // inner curtain, rather than leaving the compound clustered inside that frame.
  for (const part of parts) {
    const direction: Point = part.role === "hall" ? y : part.role === "service" ? [-x[0], -x[1]] : x;
    const anchor = part.footprint;
    let offset = 0;
    for (let distance = 0.25; distance < 1000; distance += 0.25) {
      if (!anchor.every(p => insideRing([p[0] + direction[0] * distance, p[1] + direction[1] * distance], safe))) break;
      offset = distance;
    }
    part.footprint = anchor.map(p => [p[0] + direction[0] * offset, p[1] + direction[1] * offset]);
    // Entrances face the court, including the keep's west-facing doorway.
    const side = part.role === "hall" ? [0, 1] : part.role === "service" ? [1, 2] : [3, 0];
    part.entrances = [
      [
        (part.footprint[side[0]][0] + part.footprint[side[1]][0]) / 2,
        (part.footprint[side[0]][1] + part.footprint[side[1]][1]) / 2
      ]
    ];
  }
  for (const old of castle.parts.filter(p => p.locked)) {
    const index = parts.findIndex(p => p.role === old.role);
    if (index < 0 || !old.footprint.every(p => insideRing(p, safe))) return null;
    parts[index] = structuredClone(old);
  }
  if (parts.some((p, i) => parts.slice(i + 1).some(q => polygonOverlaps(p.footprint, q.footprint)))) return null;

  // Reserve the largest clear court, allowing a longer bailey behind the gate.
  // Irregular curtains need different court proportions and offsets.
  let court: Point[] | null = null;
  let courtArea = 0;
  for (const ratio of [0.65, 1, 1.5]) {
    for (const u of [-0.2, 0, 0.2]) {
      for (const v of [-0.35, -0.15, 0.05]) {
        for (let factor = 1.8; factor >= 0.4; factor -= 0.05) {
          const candidate = rectangle(w * u, h * v, w * factor * ratio, (h * factor) / ratio);
          if (!candidate.every(p => insideRing(p, safe))) continue;
          if (parts.some(p => polygonOverlaps(candidate, p.footprint))) continue;
          const area = Math.abs(polygonArea(candidate));
          if (area > courtArea) {
            court = candidate;
            courtArea = area;
          }
          break;
        }
      }
    }
  }
  if (!court) return null;
  const local = (p: Point): Point => [
    (p[0] - center[0]) * x[0] + (p[1] - center[1]) * x[1],
    (p[0] - center[0]) * y[0] + (p[1] - center[1]) * y[1]
  ];
  const clear = (points: Point[]) =>
    polylineInsideRing(points, ring) &&
    !parts.some(part => points.slice(1).some((p, i) => segmentInteriorInPolygon(points[i], p, part.footprint)));
  const accesses: CastlePlan["accesses"] = [];
  for (const part of parts) {
    const entrance = part.entrances[0];
    const [u, v] = local(entrance);
    // A gate-to-court spine with perpendicular branches, not a radial hub.
    const direct = [at, world(0, v), entrance];
    let points = clear(direct) ? direct : null;
    if (!points) {
      // Locked wings can interrupt the spine; walk around them via a parallel aisle.
      for (const aisle of [-w * 0.25, w * 0.25, -w * 0.5, w * 0.5]) {
        const candidate = [at, world(0, -h * 0.6), world(aisle, -h * 0.6), world(aisle, v), world(u, v)];
        if (clear(candidate)) {
          points = candidate;
          break;
        }
      }
    }
    if (!points) return null;
    accesses.push({ gateId: gate.id, points, widthMeters: 3.5 });
  }
  const courts = [court];
  return { ...castle, parts, courtyards: courts, accesses };
}

export function refreshCastleLayouts(document: CityDocument): boolean {
  for (let i = 0; i < (document.castles?.length ?? 0); i++) {
    const castle = document.castles![i];
    if (castle.locked) continue;
    const updated = layoutCastle(document, castle, 8);
    if (!updated) return false;
    document.castles![i] = updated;
  }
  return true;
}
