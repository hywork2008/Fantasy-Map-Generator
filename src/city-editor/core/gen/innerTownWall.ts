import { registerTownCircuit } from "../castles";
import { boundaryEdges, boundaryRings, outerTownCircuit, reservedCastleFaces } from "../fortifications";
import { facePoints, faceVertices, insertEdgeVertex, splitFace } from "../mesh";
import { kindEdgeIds, townCenter } from "../passages";
import type { CityDocument, EdgeRef, Id, Point } from "../types";
import { polygonArea, polygonCentroid } from "./geom";

/**
 * P1 of docs/plan/ce-multi-ring-walls.md: an old-town wall inside the generated
 * (outer) town wall. The outer wall already encloses the whole built-up area;
 * this picks a round, connected set of central faces, keeps every street off
 * the new curtain, and opens a gate wherever a street crosses it. The gate
 * passages, gate squaring and smoothing are the same later passes as the
 * outer wall's (`townGates` includes these gates).
 */

export interface InnerWallOptions {
  /** Old-town area as a share of the outer wall's land area. */
  share: number;
  /** Required face layers between the inner and the outer curtain. */
  minGapCells: number;
  /** Id prefix of generated groups and gates. */
  prefix: string;
}

/** Order is the diagnostic code (`failureCode` = index + 1) recorded by the generator. */
export const INNER_WALL_FAILURES = ["no-outer-wall", "too-small", "gap", "no-gate"] as const;
export type InnerWallFailure = (typeof INNER_WALL_FAILURES)[number];

export interface InnerWallReport {
  ok: boolean;
  failure?: InnerWallFailure;
  faces: number;
  areaShare: number;
  gapCells: number;
  gates: number;
  /** Curtain edges left open where a river crosses the line. */
  riverOpenings: number;
  /** Curtain edges left open because a street still runs along the line. */
  streetOpenings: number;
  /** Faces cut so a street can pass the curtain at a vertex. */
  cuts: number;
}

interface FaceInfo {
  id: Id;
  area: number;
  dist: number;
  /** Eligible (town land, non-castle) neighbours only. */
  neighbors: Id[];
  /** Borders something that is not eligible town land: the town edge, water or a castle. */
  edge: boolean;
}

const MIN_INNER_FACES = 3;

export function addInnerTownWall(
  document: CityDocument,
  options: InnerWallOptions
): { document: CityDocument; report: InnerWallReport } {
  const fail = (failure: InnerWallFailure, extra: Partial<InnerWallReport> = {}) => ({
    document,
    report: {
      ok: false,
      failure,
      faces: 0,
      areaShare: 0,
      gapCells: 0,
      gates: 0,
      riverOpenings: 0,
      streetOpenings: 0,
      cuts: 0,
      ...extra
    }
  });
  const outer = outerTownCircuit(document);
  if (!outer) return fail("no-outer-wall");
  const center: Point = townCenter(document);
  const base = townFaces(document, outer.id, center);
  if (base.ordered.length < MIN_INNER_FACES * 3) return fail("too-small");
  const rivers = kindEdgeIds(document, "river");

  let target = base.landArea * options.share;
  for (let attempt = 0; attempt < 6; attempt++, target *= 0.85) {
    const trial = selectRound(base.info, base.ordered, target, base.seed);
    if (trial.size < MIN_INNER_FACES) return fail("too-small");
    if (gapOf(document, base.outer, trial) < options.minGapCells) continue;
    // The radius fits. Give every street that crosses the circle a vertex on
    // it, so the curtain can pass through the street there (the future gate).
    const radius = Math.sqrt(target / Math.PI);
    const cut = cutStreetCrossings(document, center, radius, base.info);
    const town = townFaces(cut.document, outer.id, center);
    const roads = kindEdgeIds(cut.document, "road");
    const inner = selectRound(town.info, town.ordered, target, town.seed);
    keepStreetsOffCurtain(cut.document, inner, town.info, roads, town.seed, radius);
    if (inner.size < MIN_INNER_FACES) continue;
    const gap = gapOf(cut.document, town.outer, inner);
    if (gap < options.minGapCells) continue;
    return finish(cut.document, inner, outer.id, options, roads, rivers, town.landArea, town.info, gap, cut.cuts);
  }
  return fail("gap");
}

/** Town land faces inside the outer wall (no water, no castle), with distances from the centre. */
function townFaces(document: CityDocument, outerId: Id, center: Point) {
  const mesh = document.mesh;
  const castle = reservedCastleFaces(document);
  const outer = new Set(document.defenseCircuits?.find(c => c.id === outerId)?.areaFaceIds ?? []);
  const info = new Map<Id, FaceInfo>();
  for (const id of outer) {
    const face = mesh.faces[id];
    if (face?.properties.water !== "land" || castle.has(id)) continue;
    const points = facePoints(mesh, face);
    const c = polygonCentroid(points);
    info.set(id, {
      id,
      area: Math.abs(polygonArea(points)),
      dist: Math.hypot(c[0] - center[0], c[1] - center[1]),
      neighbors: [],
      edge: false
    });
  }
  for (const edge of Object.values(mesh.edges)) {
    const l = edge.leftFace ? info.get(edge.leftFace) : undefined;
    const r = edge.rightFace ? info.get(edge.rightFace) : undefined;
    if (l && r) {
      l.neighbors.push(r.id);
      r.neighbors.push(l.id);
    } else if (l || r) (l ?? r)!.edge = true;
  }
  const ordered = [...info.values()].sort((a, b) => a.dist - b.dist || a.id.localeCompare(b.id));
  return {
    outer,
    info,
    ordered,
    landArea: ordered.reduce((sum, f) => sum + f.area, 0),
    seed: ordered[0]?.id ?? ""
  };
}

/** Face layers from `inner` to anything outside the outer wall. */
function gapOf(document: CityDocument, outer: Set<Id>, inner: Set<Id>): number {
  const mesh = document.mesh;
  const depth = new Map<Id, number>();
  const queue: Id[] = [];
  for (const id of inner) {
    depth.set(id, 0);
    queue.push(id);
  }
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q];
    const d = depth.get(id)!;
    for (const ref of mesh.faces[id].boundary) {
      const edge = mesh.edges[ref.edgeId];
      const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
      if (!other || !outer.has(other)) return d;
      if (depth.has(other)) continue;
      depth.set(other, d + 1);
      queue.push(other);
    }
  }
  return Infinity;
}

/**
 * A street on a degree-3 mesh can only pass a curtain where a vertex has four
 * arms, as at the outer wall's gate passages. Put a vertex on each street edge
 * where it crosses the circle and cut both neighbouring faces from it along
 * the circle; the old-town selection then runs its curtain through it.
 */
function cutStreetCrossings(
  document: CityDocument,
  center: Point,
  radius: number,
  eligible: Map<Id, FaceInfo>
): { document: CityDocument; cuts: number } {
  const mesh = document.mesh;
  const dist = (p: Point) => Math.hypot(p[0] - center[0], p[1] - center[1]);
  const crossings: Array<{ edgeId: Id; t: number; faces: Id[] }> = [];
  for (const edgeId of kindEdgeIds(document, "road")) {
    const edge = mesh.edges[edgeId];
    if (!edge?.leftFace || !edge.rightFace || !eligible.has(edge.leftFace) || !eligible.has(edge.rightFace)) continue;
    const a = mesh.vertices[edge.a].point,
      b = mesh.vertices[edge.b].point;
    if (dist(a) < radius === dist(b) < radius) continue;
    // |a + (b - a)t - c| = radius, the root in [0, 1].
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      fx = a[0] - center[0],
      fy = a[1] - center[1];
    const qa = dx * dx + dy * dy,
      qb = 2 * (fx * dx + fy * dy),
      qc = fx * fx + fy * fy - radius * radius;
    const disc = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
    const t = [(-qb - disc) / (2 * qa), (-qb + disc) / (2 * qa)].find(x => x >= 0 && x <= 1);
    if (t === undefined) continue;
    crossings.push({ edgeId, t, faces: [edge.leftFace, edge.rightFace] });
  }
  let next = document;
  let cuts = 0;
  for (const crossing of crossings) {
    const edge = next.mesh.edges[crossing.edgeId];
    if (!edge) continue;
    let vertexId: Id;
    if (crossing.t < 0.2) vertexId = edge.a;
    else if (crossing.t > 0.8) vertexId = edge.b;
    else {
      const inserted = insertEdgeVertex(next, crossing.edgeId, crossing.t);
      if (!inserted) continue;
      next = inserted.document;
      vertexId = inserted.vertexId;
    }
    const at = next.mesh.vertices[vertexId].point;
    for (const faceId of crossing.faces) {
      const face = next.mesh.faces[faceId];
      if (!face || !faceVertices(next.mesh, face).includes(vertexId)) continue;
      // The chord runs along the circle: its far end is the corner nearest the radius.
      const corners = faceVertices(next.mesh, face)
        .filter(id => id !== vertexId)
        .sort(
          (p, q) =>
            Math.abs(dist(next.mesh.vertices[p].point) - radius) - Math.abs(dist(next.mesh.vertices[q].point) - radius)
        );
      for (const corner of corners) {
        const far = next.mesh.vertices[corner].point;
        if (Math.hypot(far[0] - at[0], far[1] - at[1]) < 4) continue;
        const split = splitFace(next, faceId, vertexId, corner);
        if (!split) continue;
        next = split;
        cuts++;
        break;
      }
    }
  }
  return { document: next, cuts };
}

/** Distance-ordered prefix by area, pulled round: add in-circle faces, drop protrusions, fill holes. */
function selectRound(info: Map<Id, FaceInfo>, ordered: FaceInfo[], target: number, seed: Id): Set<Id> {
  const set = new Set<Id>();
  let area = 0;
  for (const f of ordered) {
    if (set.size && Math.abs(area - target) <= Math.abs(area + f.area - target)) break;
    set.add(f.id);
    area += f.area;
  }
  const r = Math.sqrt(target / Math.PI);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const id of [...set]) {
      const f = info.get(id)!;
      if (id !== seed && f.dist > 1.15 * r && f.neighbors.some(n => !set.has(n))) {
        set.delete(id);
        changed = true;
      }
    }
    for (const id of [...set])
      for (const n of info.get(id)!.neighbors)
        if (!set.has(n) && info.get(n)!.dist <= r) {
          set.add(n);
          changed = true;
        }
    if (!changed) break;
  }
  return connectedFilled(info, set, seed);
}

/** The seed's component, with enclosed pockets of eligible faces added. */
function connectedFilled(info: Map<Id, FaceInfo>, set: Set<Id>, seed: Id): Set<Id> {
  const component = new Set<Id>([seed]);
  const queue = [seed];
  while (queue.length) {
    const id = queue.pop()!;
    for (const n of info.get(id)!.neighbors)
      if (set.has(n) && !component.has(n)) {
        component.add(n);
        queue.push(n);
      }
  }
  // Faces of the town not reachable from the town edge without crossing the set are pockets.
  const outside = new Set<Id>();
  const pending: Id[] = [];
  for (const f of info.values())
    if (!component.has(f.id) && f.edge) {
      outside.add(f.id);
      pending.push(f.id);
    }
  while (pending.length) {
    const id = pending.pop()!;
    for (const n of info.get(id)!.neighbors)
      if (!component.has(n) && !outside.has(n)) {
        outside.add(n);
        pending.push(n);
      }
  }
  for (const f of info.values()) if (!component.has(f.id) && !outside.has(f.id)) component.add(f.id);
  return component;
}

/**
 * A street lying along the curtain would be walled over. Move the curtain off
 * it by adding the outside face or dropping the inside one, whichever keeps the
 * line nearer the target circle. Pushing only outward walks the curtain along a
 * radial street to the outer wall. A face toggles at most twice; street edges
 * still on the line afterwards become openings in the curtain.
 */
function keepStreetsOffCurtain(
  document: CityDocument,
  inner: Set<Id>,
  info: Map<Id, FaceInfo>,
  roads: Set<Id>,
  seed: Id,
  radius: number
): void {
  const mesh = document.mesh;
  const toggles = new Map<Id, number>();
  const off = (id: Id) => Math.abs(info.get(id)!.dist - radius);
  for (let pass = 0; pass < 40; pass++) {
    const onCurtain = boundaryEdges(mesh, inner).filter(ref => roads.has(ref.edgeId));
    let changed = false;
    for (const ref of onCurtain) {
      const edge = mesh.edges[ref.edgeId];
      const inside = edge.leftFace && inner.has(edge.leftFace) ? edge.leftFace : edge.rightFace;
      const other = inside === edge.leftFace ? edge.rightFace : edge.leftFace;
      if (!inside || !inner.has(inside) || (other && inner.has(other))) continue;
      const canAdd = !!other && info.has(other) && (toggles.get(other) ?? 0) < 2;
      const canDrop = inside !== seed && (toggles.get(inside) ?? 0) < 2;
      const face = canAdd && (!canDrop || off(other!) <= off(inside)) ? other! : canDrop ? inside : null;
      if (!face) continue;
      if (face === inside) inner.delete(face);
      else inner.add(face);
      toggles.set(face, (toggles.get(face) ?? 0) + 1);
      changed = true;
    }
    if (!changed) break;
    const refilled = connectedFilled(info, inner, seed);
    inner.clear();
    for (const id of refilled) inner.add(id);
  }
}

function finish(
  document: CityDocument,
  inner: Set<Id>,
  outerId: Id,
  options: InnerWallOptions,
  roads: Set<Id>,
  rivers: Set<Id>,
  landArea: number,
  info: Map<Id, FaceInfo>,
  gap: number,
  cuts: number
): { document: CityDocument; report: InnerWallReport } {
  const built = build(document, inner, outerId, options, roads, rivers);
  const area = [...inner].reduce((sum, id) => sum + (info.get(id)?.area ?? 0), 0);
  const report: InnerWallReport = {
    ok: built.gates > 0,
    failure: built.gates > 0 ? undefined : "no-gate",
    faces: inner.size,
    areaShare: Math.round((area / landArea) * 1000) / 1000,
    gapCells: Number.isFinite(gap) ? gap : -1,
    gates: built.gates,
    riverOpenings: built.riverOpenings,
    streetOpenings: built.streetOpenings,
    cuts
  };
  return { document: report.ok ? built.document : document, report };
}

function build(
  source: CityDocument,
  inner: Set<Id>,
  outerId: Id,
  options: InnerWallOptions,
  roads: Set<Id>,
  rivers: Set<Id>
): { document: CityDocument; gates: number; riverOpenings: number; streetOpenings: number } {
  const next = structuredClone(source);
  const mesh = next.mesh;
  const outerWall = next.featureGroups.find(
    g => g.kind === "wall" && next.defenseCircuits?.find(c => c.id === outerId)?.wallGroupIds.includes(g.id)
  );
  const style = outerWall?.kind === "wall" ? outerWall.style : { widthMeters: 4, color: "#41382e" };
  const material = outerWall?.kind === "wall" ? outerWall.wallMaterial : undefined;

  // One closed ring, or open runs where a river passes under the line.
  const ring = boundaryRings(mesh, boundaryEdges(mesh, inner)).sort((a, b) => b.length - a.length)[0] ?? [];
  // A curtain that meets a river must cross it as a water gate (outer wall
  // routing). The old-town curtain stops short of the bank instead.
  const riverVertices = new Set(next.featureGroups.flatMap(group => (group.kind === "river" ? group.vertices : [])));
  const touchesRiver = (ref: EdgeRef) => {
    const edge = mesh.edges[ref.edgeId];
    return rivers.has(ref.edgeId) || riverVertices.has(edge.a) || riverVertices.has(edge.b);
  };
  const open = (ref: EdgeRef) => touchesRiver(ref) || roads.has(ref.edgeId);
  const riverOpenings = ring.filter(touchesRiver).length;
  const streetOpenings = ring.filter(ref => roads.has(ref.edgeId)).length;
  const runs: EdgeRef[][] = [];
  if (!riverOpenings && !streetOpenings) runs.push(ring);
  else {
    const start = ring.findIndex(open);
    let run: EdgeRef[] = [];
    for (let k = 1; k <= ring.length; k++) {
      const ref = ring[(start + k) % ring.length];
      if (open(ref)) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push(ref);
    }
    if (run.length) runs.push(run);
  }
  runs.forEach((segments, k) => {
    const id = `${options.prefix}inner-wall-${k}`;
    next.featureGroups.push({
      id,
      kind: "wall",
      name: `Old town wall ${k + 1}`,
      segments,
      style: { ...style, widthMeters: Math.max(2.4, style.widthMeters * 0.85) },
      ...(material ? { wallMaterial: material } : {}),
      locked: false
    });
  });

  // Gates: curtain vertices a street passes through (one street edge inside, one outside).
  const wallVertices = new Set(runs.flat().flatMap(ref => [mesh.edges[ref.edgeId].a, mesh.edges[ref.edgeId].b]));
  const side = (edgeId: Id): "in" | "out" | "on" => {
    const e = mesh.edges[edgeId];
    const l = !!e.leftFace && inner.has(e.leftFace);
    const r = !!e.rightFace && inner.has(e.rightFace);
    return l && r ? "in" : l || r ? "on" : "out";
  };
  const crossings = new Map<Id, { in: boolean; out: boolean }>();
  for (const edgeId of roads) {
    const e = mesh.edges[edgeId];
    if (!e) continue;
    const s = side(edgeId);
    if (s === "on") continue;
    for (const v of [e.a, e.b]) {
      if (!wallVertices.has(v)) continue;
      const c = crossings.get(v) ?? { in: false, out: false };
      c[s] = true;
      crossings.set(v, c);
    }
  }
  // Run ends are not curtain vertices with two wall neighbours; a gate needs both arms.
  const runEnds = new Set(
    runs.length === 1 && !riverOpenings && !streetOpenings
      ? []
      : runs.flatMap(run => [mesh.edges[run[0].edgeId], mesh.edges[run.at(-1)!.edgeId]].flatMap(e => [e.a, e.b]))
  );
  const gateVertices = [...crossings].filter(([v, c]) => c.in && c.out && !runEnds.has(v)).map(([v]) => v);

  registerTownCircuit(next, [], true, [...inner], 0);
  const circuitId = `gc:defense-town-0`;
  for (const c of next.defenseCircuits!) if (c.id === outerId) c.ring = 1;
  gateVertices.forEach((vertexId, k) => {
    next.gates.push({ id: `${options.prefix}inner-gate-${k}`, vertexId, locked: false, role: "town", circuitId });
  });
  const outerCircuit = next.defenseCircuits!.find(c => c.id === outerId)!;
  const outerFaces = new Set(outerCircuit.areaFaceIds);
  for (const face of Object.values(mesh.faces)) {
    if (inner.has(face.id)) face.properties.wallRing = 0;
    else if (outerFaces.has(face.id)) face.properties.wallRing = 1;
  }
  return { document: next, gates: gateVertices.length, riverOpenings, streetOpenings };
}
