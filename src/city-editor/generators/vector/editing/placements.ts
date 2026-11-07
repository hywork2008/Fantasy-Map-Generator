import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { waterDistance } from "../generation/urbanPacking";
import { evaluateAnchor } from "../geometry/curves";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { assertVectorDocument } from "../validation/document";
import { prepareVectorEdit } from "./dependencies";
/** Explicit rigid placement edits acquire manual ownership; authored dimensions and dwelling capacity stay fixed. */
export function transformVectorPlacement(
  source: VectorCityDocument,
  id: string,
  position: Point,
  facingDegrees: number
): VectorCityDocument {
  assertVectorDocument(source);
  const original = source.placements[id];
  if (!original?.building && !original?.display) throw new Error("dependency-placement-required");
  if (original.editPolicy === "fixed") throw new Error("dependency-protected-placement");
  if (!position.every(Number.isFinite) || !Number.isFinite(facingDegrees) || facingDegrees < 0 || facingDegrees >= 360)
    throw new Error("dependency-placement-transform");
  const doc = prepareVectorEdit(source),
    p = structuredClone(original),
    angle = ((facingDegrees - p.facingDegrees) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const rotate = (v: Point): Point => [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
  const transform = (v: Point): Point => {
    const q = rotate([v[0] - p.position[0], v[1] - p.position[1]]);
    return [q[0] + position[0], q[1] + position[1]];
  };
  p.site = { outer: p.site.outer.map(transform), holes: p.site.holes.map(h => h.map(transform)) };
  if (!p.building && p.display) {
    p.display.footprint = p.display.footprint.map(r => ({
      outer: r.outer.map(transform),
      holes: r.holes.map(h => h.map(transform))
    }));
    const obstacles = [
      ...Object.values(doc.paths).map(pathSurface),
      ...Object.values(doc.placements)
        .filter(other => other.id !== id)
        .map(other => other.site)
    ];
    if (regionBoolean([p.site], obstacles, "intersection").some(r => regionArea(r) > 1e-5))
      throw Error("dependency-placement-obstacle");
    const plot = doc.environment?.terrain?.plots.find(plot => `freeform:placement:${plot.ownerId}` === id);
    if (plot) plot.outline = plot.outline.map(transform);
    p.position = [...position];
    p.facingDegrees = facingDegrees;
    p.origin = "manual";
    doc.placements[id] = p;
    doc.revision++;
    assertVectorDocument(doc);
    return doc;
  }
  const b = p.building!;
  b.footprint = b.footprint.map(r => ({ outer: r.outer.map(transform), holes: r.holes.map(h => h.map(transform)) }));
  const roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(pathSurface),
    corridors = [];
  for (const e of b.entrances) {
    e.point = transform(e.point);
    e.outward = rotate(e.outward);
    const end = evaluateAnchor(doc.paths[p.accesses[e.accessIndex].pathId], p.accesses[e.accessIndex]),
      dx = end[0] - e.point[0],
      dy = end[1] - e.point[1],
      d = Math.hypot(dx, dy);
    if (d < 0.01 || dx * e.outward[0] + dy * e.outward[1] <= 0) throw new Error("dependency-placement-access");
    e.connector = [e.point, end];
    const n: Point = [((-dy / d) * e.widthMeters) / 2, ((dx / d) * e.widthMeters) / 2];
    corridors.push({
      outer: [
        [e.point[0] + n[0], e.point[1] + n[1]],
        [end[0] + n[0], end[1] + n[1]],
        [end[0] - n[0], end[1] - n[1]],
        [e.point[0] - n[0], e.point[1] - n[1]]
      ] as Point[],
      holes: []
    });
  }
  if (b.riverbankDistanceMeters !== undefined) {
    const distance = waterDistance(doc, [p.site]);
    if (distance > 50) throw new Error("dependency-placement-river");
    b.riverbankDistanceMeters = distance;
  }
  b.reserved = regionBoolean([p.site], regionBoolean(corridors, roads, "difference"), "union");
  if (source.urban && regionBoolean(b.reserved, source.urban.domain, "difference").some(r => regionArea(r) > 1e-5))
    throw new Error("dependency-placement-domain");
  p.position = [...position];
  p.facingDegrees = facingDegrees;
  p.origin = "manual";
  doc.placements[id] = p;
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
export function setVectorPlacementPolicy(
  source: VectorCityDocument,
  id: string,
  policy: "fixed" | "editable"
): VectorCityDocument {
  const doc = prepareVectorEdit(source),
    p = source.placements[id];
  if (!p) throw new Error("dependency-placement-required");
  doc.placements[id] = { ...structuredClone(p), editPolicy: policy };
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}

/** Grade one authored pad; the preserved Freeform source remains immutable. */
export function setVectorPlacementLevel(
  source: VectorCityDocument,
  id: string,
  levelMeters: number
): VectorCityDocument {
  const p = source.placements[id];
  if (!p) throw Error("dependency-placement-required");
  if (p.editPolicy === "fixed") throw Error("dependency-protected-placement");
  if (!Number.isFinite(levelMeters) || Math.abs(levelMeters) > 10000) throw Error("dependency-placement-transform");
  const doc = prepareVectorEdit(source),
    terrain = doc.environment?.terrain;
  if (!terrain) throw Error("terrain-required");
  const ownerId = id.replace(/^freeform:placement:/, ""),
    plot = terrain.plots.find(p => p.ownerId === ownerId);
  if (plot) plot.levelMeters = levelMeters;
  else
    terrain.plots.push({
      id: `pad:${id}`,
      ownerId,
      outline: structuredClone(p.site.outer),
      levelMeters,
      edge: { kind: "wall" },
      marginMeters: 0
    });
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
