import {
  isSimplePolygon,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  segmentInteriorInPolygon,
  segmentSegmentHit
} from "./gen/geom";
import type { CityDocument, DefenseCircuit, EdgeRef, Id, Mesh, Point } from "./types";

export function townGates(document: CityDocument) {
  return (document.gates ?? []).filter(gate => !gate.ownerCastleId);
}

export function boundaryEdges(mesh: Mesh, ids: Iterable<Id>): EdgeRef[] {
  const members = new Set(ids);
  return [...members].flatMap(id =>
    (mesh.faces[id]?.boundary ?? []).filter(ref => {
      const edge = mesh.edges[ref.edgeId];
      return edge && !(members.has(edge.leftFace ?? "") && members.has(edge.rightFace ?? ""));
    })
  );
}

export function boundaryRings(mesh: Mesh, refs: EdgeRef[]): EdgeRef[][] {
  const start = (ref: EdgeRef) => (ref.forward ? mesh.edges[ref.edgeId].a : mesh.edges[ref.edgeId].b);
  const end = (ref: EdgeRef) => (ref.forward ? mesh.edges[ref.edgeId].b : mesh.edges[ref.edgeId].a);
  const remaining = new Set(refs);
  const rings: EdgeRef[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    const ring = [first];
    remaining.delete(first);
    let at = end(first);
    while (at !== start(first)) {
      const next = [...remaining].find(ref => start(ref) === at);
      if (!next) return [];
      ring.push(next);
      remaining.delete(next);
      at = end(next);
    }
    rings.push(ring);
  }
  return rings;
}

export function refPoints(mesh: Mesh, refs: EdgeRef[]): Point[] {
  return refs.map(ref => mesh.vertices[ref.forward ? mesh.edges[ref.edgeId].a : mesh.edges[ref.edgeId].b].point);
}

export function circuitRing(document: CityDocument, circuit: DefenseCircuit): Point[] {
  const rings = boundaryRings(document.mesh, boundaryEdges(document.mesh, circuit.areaFaceIds));
  return (
    rings
      .map(refs => refPoints(document.mesh, refs))
      .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0] ?? []
  );
}

export function reservedCastleFaces(document: CityDocument): Set<Id> {
  return new Set((document.defenseCircuits ?? []).filter(c => c.scope === "castle").flatMap(c => c.areaFaceIds));
}

export function castleWallIds(document: CityDocument): Set<Id> {
  return new Set((document.defenseCircuits ?? []).filter(c => c.scope === "castle").flatMap(c => c.wallGroupIds));
}

export function polygonOverlaps(a: Point[], b: Point[]): boolean {
  return (
    a.some(p => pointInPolygon(p, b)) ||
    b.some(p => pointInPolygon(p, a)) ||
    a.some((p, i) => b.some((q, j) => !!segmentSegmentHit(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])))
  );
}

export function insideRing(p: Point, ring: Point[]): boolean {
  return pointInPolygon(p, ring) || nearestOnPolyline(p, [...ring, ring[0]]).dist < 0.01;
}

/** Test every interval between boundary crossings, including concave boundaries. */
export function polylineInsideRing(points: Point[], ring: Point[]): boolean {
  if (!points.every(p => p.length === 2 && p.every(Number.isFinite) && insideRing(p, ring))) return false;
  return points.slice(1).every((b, i) => {
    const a = points[i],
      cuts = [0, 1];
    for (let j = 0; j < ring.length; j++) {
      const hit = segmentSegmentHit(a, b, ring[j], ring[(j + 1) % ring.length]);
      if (hit) cuts.push(hit.t);
    }
    cuts.sort((x, y) => x - y);
    return cuts.slice(1).every((end, j) => {
      const t = (cuts[j] + end) / 2;
      return insideRing([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ring);
    });
  });
}

/** Pure reference/geometry checks; no rendering and no mutation during import. */
export function validateFortifications(document: CityDocument): string[] {
  const errors: string[] = [];
  if (document.version === 1 && (document.castles?.length || document.defenseCircuits?.length))
    return ["Fortifications require document version 2"];
  const circuits = document.defenseCircuits ?? [];
  const castles = document.castles ?? [];
  const unique = (ids: string[]) => ids.length === new Set(ids).size;
  if (!unique(circuits.map(c => c.id)) || !unique(castles.map(c => c.id))) errors.push("Duplicate fortification ID");
  const wallEdges = new Map<Id, Id>();
  for (const group of document.featureGroups) {
    if (group.kind !== "wall") continue;
    for (const ref of group.segments) {
      if (wallEdges.has(ref.edgeId) && circuits.some(c => c.wallGroupIds.includes(group.id)))
        errors.push(`Duplicate physical wall ${ref.edgeId}`);
      wallEdges.set(ref.edgeId, group.id);
    }
  }
  for (const circuit of circuits) {
    if (!["town", "castle"].includes(circuit.scope) || !unique(circuit.wallGroupIds))
      errors.push(`Invalid circuit metadata ${circuit.id}`);

    if (
      !circuit.areaFaceIds.length ||
      !unique(circuit.areaFaceIds) ||
      circuit.areaFaceIds.some(id => !document.mesh.faces[id])
    ) {
      errors.push(`Invalid area on circuit ${circuit.id}`);
      continue;
    }
    const boundary = boundaryEdges(document.mesh, circuit.areaFaceIds);
    const rings = boundaryRings(document.mesh, boundary);
    if (!rings.length || (circuit.scope === "castle" && rings.length !== 1))
      errors.push(`Open or disconnected circuit ${circuit.id}`);
    const wall = new Set<Id>();
    for (const id of circuit.wallGroupIds) {
      const group = document.featureGroups.find(g => g.id === id);
      if (group?.kind !== "wall") {
        errors.push(`Missing wall ${id}`);
        continue;
      }
      for (const ref of group.segments) wall.add(ref.edgeId);
    }
    const natural = new Set(circuit.naturalBarriers.flatMap(b => b.segments.map(r => r.edgeId)));
    for (const ref of boundary)
      if (!wall.has(ref.edgeId) && !natural.has(ref.edgeId))
        errors.push(`Uncovered boundary ${circuit.id}: ${ref.edgeId}`);
    for (const id of natural)
      if (wall.has(id) || !boundary.some(r => r.edgeId === id)) errors.push(`Invalid natural boundary ${id}`);
    if (
      circuit.scope === "castle" &&
      circuit.areaFaceIds.some(id => document.mesh.faces[id].properties.water !== "land")
    )
      errors.push(`Castle ${circuit.id} is on water`);
  }
  for (const castle of castles) {
    if (
      castle.version !== 1 ||
      !["keep-bailey", "courtyard"].includes(castle.form) ||
      !["edge", "central"].includes(castle.position) ||
      !["integrated", "detached"].includes(castle.relationship) ||
      !unique(castle.parts.map(p => p.id))
    )
      errors.push(`Invalid castle metadata ${castle.id}`);

    const circuit = circuits.find(
      c => c.id === castle.circuitId && c.scope === "castle" && c.ownerCastleId === castle.id
    );
    if (!circuit) {
      errors.push(`Missing castle circuit ${castle.id}`);
      continue;
    }
    const ring = circuitRing(document, circuit);
    if (!ring.length) continue;
    if (
      circuit.areaFaceIds.some(
        id => document.mesh.faces[id].properties.ward !== "castle" || document.mesh.faces[id].properties.buildable
      )
    )
      errors.push(`Unreserved castle area ${castle.id}`);
    if (
      !castle.parts.some(p => p.role === "hall" || p.role === "range") ||
      (castle.form === "keep-bailey" && !castle.parts.some(p => p.role === "keep"))
    )
      errors.push(`Missing required building on ${castle.id}`);
    for (const part of castle.parts) {
      if (
        !isSimplePolygon(part.footprint) ||
        Math.abs(polygonArea(part.footprint)) < 20 ||
        !polylineInsideRing([...part.footprint, part.footprint[0]], ring)
      )
        errors.push(`Invalid castle building ${part.id}`);
      if (
        !part.entrances.length ||
        part.entrances.some(
          p => !p.every(Number.isFinite) || nearestOnPolyline(p, [...part.footprint, part.footprint[0]]).dist > 0.01
        )
      )
        errors.push(`Missing entrance ${part.id}`);
    }
    for (let i = 0; i < castle.parts.length; i++)
      for (let j = i + 1; j < castle.parts.length; j++)
        if (polygonOverlaps(castle.parts[i].footprint, castle.parts[j].footprint))
          errors.push(`Overlapping castle buildings ${castle.id}`);
    if (
      !castle.courtyards.length ||
      castle.courtyards.some(
        c =>
          !isSimplePolygon(c) ||
          !polylineInsideRing([...c, c[0]], ring) ||
          castle.parts.some(part => polygonOverlaps(c, part.footprint))
      )
    )
      errors.push(`Invalid castle courtyard ${castle.id}`);
    for (const access of castle.accesses) {
      const gate = document.gates.find(g => g.id === access.gateId && g.ownerCastleId === castle.id);
      const at = gate && document.mesh.vertices[gate.vertexId]?.point;
      if (
        !at ||
        access.points.length < 2 ||
        Math.hypot(at[0] - access.points[0][0], at[1] - access.points[0][1]) > 0.01 ||
        !polylineInsideRing(access.points, ring) ||
        !Number.isFinite(access.widthMeters) ||
        access.widthMeters <= 0 ||
        castle.parts.some(part =>
          access.points.slice(1).some((p, i) => segmentInteriorInPolygon(access.points[i], p, part.footprint))
        ) ||
        !castle.parts.some(part =>
          part.entrances.some(p => Math.hypot(p[0] - access.points.at(-1)![0], p[1] - access.points.at(-1)![1]) < 0.01)
        )
      )
        errors.push(`Invalid castle access ${castle.id}`);
    }
    for (const part of castle.parts)
      if (
        !castle.accesses.some(access =>
          part.entrances.some(p => {
            const end = access.points.at(-1);
            return end && Math.hypot(p[0] - end[0], p[1] - end[1]) < 0.01;
          })
        )
      )
        errors.push(`Unreachable castle building ${part.id}`);
    if (!castle.accesses.length) errors.push(`Missing castle access ${castle.id}`);
  }
  for (const gate of document.gates ?? [])
    if (gate.ownerCastleId) {
      if (!castles.some(c => c.id === gate.ownerCastleId)) errors.push(`Missing gate owner ${gate.id}`);
      if (!Number.isFinite(gate.passageWidthMeters) || (gate.passageWidthMeters ?? 0) <= 0)
        errors.push(`Invalid gate opening ${gate.id}`);
      const ownedCircuit = circuits.find(c => c.ownerCastleId === gate.ownerCastleId && c.scope === "castle");
      const ownedBoundary = new Set(
        ownedCircuit ? boundaryEdges(document.mesh, ownedCircuit.areaFaceIds).map(r => r.edgeId) : []
      );
      if (gate.role !== "castle-main" && gate.role !== "postern") errors.push(`Invalid castle gate role ${gate.id}`);
      const arms = gate.wallEdgeIds?.map(id => document.mesh.edges[id]);
      if (
        arms?.length !== 2 ||
        arms.some(
          e =>
            !e || !wallEdges.has(e.id) || !ownedBoundary.has(e.id) || (e.a !== gate.vertexId && e.b !== gate.vertexId)
        )
      )
        errors.push(`Invalid castle gate arms ${gate.id}`);
    }
  return errors;
}

/** Cut a physical opening in the curtain rather than painting over the wall. */
export function wallRunsOutsideGates(document: CityDocument, points: Point[]): Point[][] {
  const openings = (document.gates ?? []).flatMap(g => {
    const p = document.mesh.vertices[g.vertexId]?.point;
    return p
      ? [
          {
            point: p,
            radius:
              (g.passageWidthMeters ??
                Math.max(
                  6,
                  ...document.featureGroups.flatMap(group =>
                    group.kind === "road" &&
                    group.segments.some(ref => {
                      const edge = document.mesh.edges[ref.edgeId];
                      return edge.a === g.vertexId || edge.b === g.vertexId;
                    })
                      ? [group.style.widthMeters + 2.2]
                      : []
                  )
                )) / 2
          }
        ]
      : [];
  });
  const runs: Point[][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    if (length < 0.001) continue;
    let intervals: Array<[number, number]> = [[0, 1]];
    for (const opening of openings) {
      const px = opening.point[0] - a[0],
        py = opening.point[1] - a[1],
        t = (px * dx + py * dy) / (length * length);
      const distance = Math.hypot(px - dx * t, py - dy * t);
      if (distance >= opening.radius) continue;
      const half = Math.sqrt(opening.radius ** 2 - distance ** 2) / length,
        lo = t - half,
        hi = t + half;
      intervals = intervals.flatMap(([start, end]) =>
        hi <= start || lo >= end
          ? [[start, end] as [number, number]]
          : ([
              [start, Math.max(start, lo)],
              [Math.min(end, hi), end]
            ].filter(([l, r]) => r - l > 0.00001) as Array<[number, number]>)
      );
    }
    for (const [start, end] of intervals)
      runs.push([
        [a[0] + dx * start, a[1] + dy * start],
        [a[0] + dx * end, a[1] + dy * end]
      ]);
  }
  return runs;
}

/** A deliberate town-wall edit records openings on the existing town boundary. */
export function refreshTownWallReferences(document: CityDocument): void {
  for (const circuit of document.defenseCircuits ?? []) {
    if (circuit.scope !== "town") continue;
    const boundary = boundaryEdges(document.mesh, circuit.areaFaceIds),
      ids = new Set(boundary.map(r => r.edgeId));
    const groups = document.featureGroups.filter(g => g.kind === "wall" && g.segments.some(r => ids.has(r.edgeId)));
    circuit.wallGroupIds = groups.map(g => g.id);
    const covered = new Set(groups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : [])));
    circuit.naturalBarriers = boundary
      .filter(r => !covered.has(r.edgeId))
      .map(ref => {
        const edge = document.mesh.edges[ref.edgeId],
          wet = [edge.leftFace, edge.rightFace].some(id => id && document.mesh.faces[id].properties.water !== "land");
        return { kind: wet ? ("waterfront" as const) : ("opening" as const), segments: [ref] };
      });
  }
}
