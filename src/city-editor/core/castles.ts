import { outerWallRing } from "./concealStreets";
import {
  boundaryEdges,
  boundaryRings,
  castleWallIds,
  reservedCastleFaces,
  validateFortifications
} from "./fortifications";
import { layoutCastle, refreshCastleLayouts } from "./gen/castleLayout";
import type { CastleSite } from "./gen/castlePlacement";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "./gen/geom";
import {
  clone,
  faceNeighbors,
  facePoints,
  faceVertices,
  incidentEdges,
  insertEdgeVertex,
  mergeFaces,
  splitFace,
  validate
} from "./mesh";
import type { CastlePlan, CityDocument, DefenseCircuit, EdgeRef, Id, Point } from "./types";
import { lineHitsDocumentWater } from "./waterGeometry";

/** Explicit town area is independent of standalone castle walls. */
export function registerTownCircuit(
  document: CityDocument,
  regions: Point[][],
  walled: boolean,
  interiorFaceIds: Id[] = []
): void {
  if (!walled) return;
  document.version = 2;
  // Passage construction can move a known interior cell's centroid beyond its
  // original polygon. Preserve planned membership; use geometry for newly split cells.
  const interior = new Set(interiorFaceIds);
  const areaFaceIds = Object.values(document.mesh.faces)
    .filter(
      face =>
        interior.has(face.id) || regions.some(r => pointInPolygon(polygonCentroid(facePoints(document.mesh, face)), r))
    )
    .map(face => face.id);
  const circuit: DefenseCircuit = {
    id: "gc:defense-town",
    scope: "town",
    areaFaceIds,
    wallGroupIds: [],
    naturalBarriers: [],
    locked: false
  };
  document.defenseCircuits ??= [];
  if (!document.defenseCircuits.some(c => c.id === circuit.id && c.locked)) {
    document.defenseCircuits = document.defenseCircuits.filter(c => c.id !== circuit.id);
    document.defenseCircuits.push(circuit);
    updateCircuitWalls(document, circuit);
  }
}

export function updateCircuitWalls(document: CityDocument, circuit: DefenseCircuit): void {
  const boundary = boundaryEdges(document.mesh, circuit.areaFaceIds);
  const ids = new Set(boundary.map(r => r.edgeId));
  circuit.wallGroupIds = document.featureGroups
    .filter(g => g.kind === "wall" && g.segments.some(r => ids.has(r.edgeId)))
    .map(g => g.id);
  const covered = new Set(
    document.featureGroups.flatMap(g =>
      g.kind === "wall" && circuit.wallGroupIds.includes(g.id) ? g.segments.map(r => r.edgeId) : []
    )
  );
  const missing = boundary.filter(r => !covered.has(r.edgeId));
  circuit.naturalBarriers = missing.map(ref => {
    const edge = document.mesh.edges[ref.edgeId];
    const wet = [edge.leftFace, edge.rightFace].some(id => id && document.mesh.faces[id].properties.water !== "land");
    return { kind: wet ? ("waterfront" as const) : ("opening" as const), segments: [ref] };
  });
}

function runsByMembership(refs: EdgeRef[], mask: Set<Id>): Array<{ shared: boolean; refs: EdgeRef[] }> {
  const runs: Array<{ shared: boolean; refs: EdgeRef[] }> = [];
  for (const ref of refs) {
    const shared = mask.has(ref.edgeId);
    if (runs.at(-1)?.shared === shared) runs.at(-1)!.refs.push(ref);
    else runs.push({ shared, refs: [ref] });
  }
  return runs;
}

/** Install a real curtain and split shared town arcs into canonical wall runs. */
export function installCastle(
  document: CityDocument,
  site: CastleSite,
  faceId: Id,
  seed: string,
  diagnostics?: string[]
): CityDocument | null {
  const next = clone(document);
  const face = next.mesh.faces[faceId];
  if (!face) return null;
  const castleId = "gc:castle-0",
    circuitId = "gc:defense-castle-0";
  const boundary = boundaryEdges(next.mesh, [faceId]);
  const ordered = boundaryRings(next.mesh, boundary)[0];
  if (!ordered) return null;
  const mask = new Set(boundary.map(r => r.edgeId));
  const groups: CityDocument["featureGroups"] = [];
  for (const group of next.featureGroups) {
    if (group.kind !== "wall" || !group.segments.some(r => mask.has(r.edgeId))) {
      groups.push(group);
      continue;
    }
    if (group.locked) return null;
    for (const [i, run] of runsByMembership(group.segments, mask).entries())
      groups.push({
        ...group,
        id: i ? `${group.id}:castle-run-${i}` : group.id,
        segments: run.refs,
        style: run.shared ? { ...group.style, widthMeters: 4.2 } : group.style
      });
  }
  next.featureGroups = groups;
  const covered = new Set(groups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : [])));
  for (const [i, run] of runsByMembership(ordered, covered).entries())
    if (!run.shared) {
      next.featureGroups.push({
        id: `${castleId}:curtain-${i}`,
        kind: "wall",
        name: "Castle curtain",
        segments: run.refs,
        style: { widthMeters: 4.2, color: "#55443d" },
        wallMaterial: "stone",
        locked: false
      });
    }
  for (const circuit of next.defenseCircuits ?? []) updateCircuitWalls(next, circuit);
  const town = next.defenseCircuits?.find(c => c.scope === "town");
  const center = town
    ? polygonCentroid(town.areaFaceIds.flatMap(id => facePoints(next.mesh, next.mesh.faces[id])))
    : (next.elements.find(e => e.kind === "plaza")?.point ?? [0, 0]);
  const candidates = boundary
    .filter(ref => {
      const e = next.mesh.edges[ref.edgeId],
        other = e.leftFace === faceId ? e.rightFace : e.leftFace;
      return (
        other &&
        next.mesh.faces[other].properties.water === "land" &&
        (!town || site.relationship !== "integrated" || town.areaFaceIds.includes(other))
      );
    })
    .sort((a, b) => {
      const rate = (r: EdgeRef) => {
        const e = next.mesh.edges[r.edgeId],
          p = next.mesh.vertices[e.a].point,
          q = next.mesh.vertices[e.b].point;
        return Math.hypot((p[0] + q[0]) / 2 - center[0], (p[1] + q[1]) / 2 - center[1]);
      };
      return rate(a) - rate(b) || a.edgeId.localeCompare(b.edgeId);
    });
  for (const ref of candidates) {
    const edge = next.mesh.edges[ref.edgeId];
    const p = next.mesh.vertices[edge.a].point,
      q = next.mesh.vertices[edge.b].point;
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 14) {
      diagnostics?.push(`${edge.id}: gate edge shorter than 14m`);
      continue;
    }
    const inserted = insertEdgeVertex(next, edge.id, 0.5);
    if (!inserted) continue;
    let working = inserted.document;
    const vertexId = inserted.vertexId;
    const outside = edge.leftFace === faceId ? edge.rightFace : edge.leftFace;
    if (!outside) continue;
    // A third mesh arm connects the gate to the city. Its inner arm is local access.
    const exterior = working.mesh.faces[outside];
    const targets = faceVertices(working.mesh, exterior)
      .filter(id => id !== vertexId)
      .filter(id => {
        const target = working.mesh.vertices[id].point;
        const at = working.mesh.vertices[vertexId].point;
        const dx = target[0] - at[0],
          dy = target[1] - at[1];
        const tangent = Math.abs(dx * (q[0] - p[0]) + dy * (q[1] - p[1]));
        return tangent <= Math.hypot(dx, dy) * Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.6;
      })
      .sort((a, b) => {
        const p = working.mesh.vertices[a].point,
          q = working.mesh.vertices[b].point;
        return Math.hypot(p[0] - center[0], p[1] - center[1]) - Math.hypot(q[0] - center[0], q[1] - center[1]);
      });
    let split: CityDocument | null = null;
    for (const target of targets) {
      split = splitFace(working, outside, vertexId, target);
      if (split) break;
    }
    if (!split) {
      diagnostics?.push(`${edge.id}: no exterior access arm`);
      continue;
    }
    working = split;
    const arms = incidentEdges(working.mesh, vertexId)
      .filter(e => e.leftFace === faceId || e.rightFace === faceId)
      .map(e => e.id);
    if (arms.length !== 2) {
      diagnostics?.push(`${edge.id}: ${arms.length} curtain arms`);
      continue;
    }
    working.gates.push({
      id: `${castleId}:gate`,
      vertexId,
      role: "castle-main",
      ownerCastleId: castleId,
      wallEdgeIds: arms as [Id, Id],
      passageWidthMeters: 5,
      locked: false
    });
    const circuit: DefenseCircuit = {
      id: circuitId,
      scope: "castle",
      ownerCastleId: castleId,
      areaFaceIds: [faceId],
      wallGroupIds: [],
      naturalBarriers: [],
      locked: false
    };
    working.defenseCircuits ??= [];
    working.defenseCircuits.push(circuit);
    updateCircuitWalls(working, circuit);
    if (circuit.naturalBarriers.length) {
      diagnostics?.push(`${edge.id}: ${circuit.naturalBarriers.length} natural barriers`);
      continue;
    }
    const castle: CastlePlan = {
      id: castleId,
      version: 1,
      seed: site.seed ?? seed,
      position: site.position,
      relationship: site.relationship,
      form: site.form,
      circuitId,
      courtyards: [],
      parts: [],
      accesses: [],
      provenance: "generated",
      locked: false
    };
    working.castles ??= [];
    working.castles.push(castle);
    working.version = 2;
    const layout = layoutCastle(working, castle, 8);
    if (!layout) {
      diagnostics?.push(`${edge.id}: no valid gate/court/building layout`);
      continue;
    }
    working.castles[working.castles.length - 1] = layout;
    working.elements = working.elements.filter(e => e.kind !== "citadel" || !e.faceIds.includes(faceId));
    for (const id of circuit.areaFaceIds) {
      working.mesh.faces[id].properties.ward = "castle";
      working.mesh.faces[id].properties.buildable = false;
    }
    const issues = validateFortifications(working);
    if (issues.length) {
      diagnostics?.push(`${edge.id}: ${issues.join("; ")}`);
      continue;
    }
    return working;
  }
  return null;
}

/** Shortest exterior mesh branch, stopping on the existing public street graph.
 * The clearance pass keeps the spur off the curtain. A site pinched against
 * that curtain retries without the clearance so the gate can still leave. */
function connectCastleGate(document: CityDocument, vertexId: Id, castleId: Id): EdgeRef[] | null {
  const { mesh } = document,
    castleFaces = reservedCastleFaces(document);
  const barriers = new Set(
    document.featureGroups.flatMap(g =>
      g.kind === "wall"
        ? g.segments.map(r => r.edgeId)
        : g.kind === "river"
          ? g.vertices.slice(1).flatMap((v, i) =>
              Object.values(mesh.edges)
                .filter(e => (e.a === v && e.b === g.vertices[i]) || (e.b === v && e.a === g.vertices[i]))
                .map(e => e.id)
            )
          : []
    )
  );
  const targets = new Set(
    document.featureGroups.flatMap(g =>
      g.kind === "road" && !g.id.startsWith(`${castleId}:`)
        ? g.segments.flatMap(r => [mesh.edges[r.edgeId].a, mesh.edges[r.edgeId].b])
        : []
    )
  );
  if (!targets.size) {
    const plaza = document.elements.find(e => e.kind === "plaza");
    for (const id of plaza?.faceIds ?? []) for (const v of faceVertices(mesh, mesh.faces[id])) targets.add(v);
  }
  // An imported settlement may have zero world roads and no market square.
  // Its castle still needs a local approach to an inhabited city block.
  if (!targets.size) {
    const curtainVertices = new Set([...barriers].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
    for (const face of Object.values(mesh.faces)) {
      if (
        castleFaces.has(face.id) ||
        !face.properties.buildable ||
        face.properties.water !== "land" ||
        face.properties.settlement !== "core"
      )
        continue;
      for (const id of faceVertices(mesh, face)) if (!curtainVertices.has(id) && id !== vertexId) targets.add(id);
    }
  }
  if (!targets.size) return null;
  const search = (clearance: boolean): EdgeRef[] | null => {
    const adjacent = new Map<Id, Array<{ to: Id; edge: Id; cost: number }>>();
    for (const edge of Object.values(mesh.edges)) {
      if (
        barriers.has(edge.id) ||
        (clearance && !castleRoadEdgeAllowed(document, edge.id, 4)) ||
        [edge.leftFace, edge.rightFace].some(
          id => id && (castleFaces.has(id) || mesh.faces[id].properties.water !== "land")
        ) ||
        lineHitsDocumentWater(document, [mesh.vertices[edge.a].point, mesh.vertices[edge.b].point], 4, true)
      )
        continue;
      const p = mesh.vertices[edge.a].point,
        q = mesh.vertices[edge.b].point,
        cost = Math.hypot(p[0] - q[0], p[1] - q[1]);
      for (const [a, b] of [
        [edge.a, edge.b],
        [edge.b, edge.a]
      ]) {
        const entries = adjacent.get(a) ?? [];
        entries.push({ to: b, edge: edge.id, cost });
        adjacent.set(a, entries);
      }
    }
    const distance = new Map<Id, number>([[vertexId, 0]]),
      previous = new Map<Id, { from: Id; edge: Id }>(),
      pending = new Set([vertexId]);
    let goal: Id | null = null;
    while (pending.size) {
      const at = [...pending].sort((a, b) => distance.get(a)! - distance.get(b)! || a.localeCompare(b))[0];
      pending.delete(at);
      if (targets.has(at)) {
        goal = at;
        break;
      }
      for (const item of adjacent.get(at) ?? []) {
        const cost = distance.get(at)! + item.cost;
        if (cost >= (distance.get(item.to) ?? Infinity)) continue;
        distance.set(item.to, cost);
        previous.set(item.to, { from: at, edge: item.edge });
        pending.add(item.to);
      }
    }
    if (!goal) return null;
    const refs: EdgeRef[] = [];
    for (let at = goal; at !== vertexId; ) {
      const step = previous.get(at)!;
      refs.push({ edgeId: step.edge, forward: mesh.edges[step.edge].a === step.from });
      at = step.from;
    }
    return refs.reverse();
  };
  return search(true) ?? search(false);
}

export function finalizeCastles(document: CityDocument, connect: boolean): boolean {
  if (connect)
    for (const castle of document.castles ?? []) {
      const gate = document.gates.find(g => g.ownerCastleId === castle.id);
      if (!gate) return false;
      const segments = connectCastleGate(document, gate.vertexId, castle.id);
      if (!segments) return false;
      if (segments.length)
        document.featureGroups.push({
          id: `${castle.id}:approach`,
          kind: "road",
          name: "Castle approach",
          segments,
          style: { widthMeters: 4, color: "#bba78b" },
          locked: false
        });
    }
  return refreshCastleLayouts(document) && !validate(document).length;
}

export function regenerateCastleInterior(document: CityDocument, id: Id, changeForm = true): CityDocument | null {
  const next = clone(document),
    index = next.castles?.findIndex(c => c.id === id) ?? -1;
  if (index < 0 || next.castles![index].locked) return null;
  const castle = next.castles![index];
  const result = layoutCastle(
    next,
    {
      ...castle,
      form: changeForm ? (castle.form === "keep-bailey" ? "courtyard" : "keep-bailey") : castle.form
    },
    8
  );
  if (!result) return null;
  next.castles![index] = result;
  return validateFortifications(next).length ? null : next;
}

export function deleteCastle(document: CityDocument, id: Id): CityDocument | null {
  const next = clone(document),
    castle = next.castles?.find(c => c.id === id);
  if (!castle || castle.locked) return null;
  const circuit = next.defenseCircuits?.find(c => c.id === castle.circuitId);
  if (!circuit || circuit.locked || circuit.wallGroupIds.some(id => next.featureGroups.find(g => g.id === id)?.locked))
    return null;
  const townWalls = new Set((next.defenseCircuits ?? []).filter(c => c.scope === "town").flatMap(c => c.wallGroupIds));
  next.featureGroups = next.featureGroups.filter(g => !g.id.startsWith(`${id}:`) || townWalls.has(g.id));
  const ownedWalls = new Set(circuit.wallGroupIds.filter(id => !townWalls.has(id)));
  next.featureGroups = next.featureGroups.filter(g => !ownedWalls.has(g.id));
  next.gates = next.gates.filter(g => g.ownerCastleId !== id);
  next.castles = next.castles!.filter(c => c.id !== id);
  next.defenseCircuits = next.defenseCircuits!.filter(c => c.id !== castle.circuitId);
  for (const faceId of circuit.areaFaceIds) {
    const face = next.mesh.faces[faceId];
    face.properties.ward = "park";
    face.properties.buildable = false;
  }
  return validateFortifications(next).length ? null : next;
}

/** Explicit replacement for a selected legacy castle or a manually chosen site. */
export function createCastleOnFace(document: CityDocument, faceId: Id): CityDocument | null {
  if (
    document.castles?.length ||
    !document.mesh.faces[faceId] ||
    document.mesh.faces[faceId].properties.water !== "land"
  )
    return null;
  let next = clone(document);
  const members = new Set<Id>([faceId]);
  if (next.mesh.faces[faceId].properties.ward === "castle") {
    const pending = [faceId];
    for (let i = 0; i < pending.length; i++)
      for (const id of faceNeighbors(next.mesh, pending[i])) {
        if (!members.has(id) && next.mesh.faces[id].properties.ward === "castle") {
          members.add(id);
          pending.push(id);
        }
      }
  }
  const mask = new Set([...members].flatMap(id => next.mesh.faces[id].boundary.map(ref => ref.edgeId)));
  next.featureGroups = next.featureGroups.flatMap(group => {
    if (group.kind !== "road") return [group];
    if (group.locked && group.segments.some(r => mask.has(r.edgeId))) return [group];
    const runs: EdgeRef[][] = [];
    let current: EdgeRef[] = [];
    for (const ref of group.segments) {
      if (mask.has(ref.edgeId)) {
        if (current.length) runs.push(current);
        current = [];
      } else current.push(ref);
    }
    if (current.length) runs.push(current);
    return runs.map((segments, i) => ({ ...group, id: i ? `${group.id}:conversion-run-${i}` : group.id, segments }));
  });
  for (const id of members)
    if (id !== faceId) {
      const merged = mergeFaces(next, faceId, id);
      if (!merged) return null;
      next = merged;
    }
  if (!next.defenseCircuits?.some(c => c.scope === "town")) {
    const ring = outerWallRing(next);
    if (ring) registerTownCircuit(next, [ring], true);
  }
  const town = next.defenseCircuits?.find(c => c.scope === "town");
  const townBoundary = new Set(town ? boundaryEdges(next.mesh, town.areaFaceIds).map(r => r.edgeId) : []);
  const integrated = boundaryEdges(next.mesh, [faceId]).some(r => townBoundary.has(r.edgeId));
  const site: CastleSite = {
    seed: document.generationSeed ?? faceId,
    mesh: next.mesh,
    faceId,
    position: integrated ? "edge" : "central",
    relationship: integrated ? "integrated" : "detached",
    form: "keep-bailey"
  };
  const result = installCastle(next, site, faceId, site.seed);
  if (!result || !finalizeCastles(result, true)) return null;
  result.castles![0].provenance = "manual";
  delete result.fabric;
  return result;
}

export function setCastleLocked(document: CityDocument, id: Id, locked: boolean): CityDocument | null {
  const next = clone(document),
    castle = next.castles?.find(c => c.id === id);
  if (!castle) return null;
  castle.locked = locked;
  const circuit = next.defenseCircuits?.find(c => c.id === castle.circuitId);
  if (!circuit) return null;
  circuit.locked = locked;
  for (const group of next.featureGroups) if (circuit.wallGroupIds.includes(group.id)) group.locked = locked;
  for (const gate of next.gates) if (gate.ownerCastleId === id) gate.locked = locked;
  return next;
}

export function setCastlePartLocked(
  document: CityDocument,
  castleId: Id,
  partId: Id,
  locked: boolean
): CityDocument | null {
  const next = clone(document),
    castle = next.castles?.find(c => c.id === castleId),
    part = castle?.parts.find(p => p.id === partId);
  if (!castle || castle.locked || !part) return null;
  part.locked = locked;
  return next;
}

/** Keep road ribbons clear of castle curtains, tapering clearance at an actual gate. */
export function castleRoadEdgeAllowed(document: CityDocument, edgeId: Id, width: number): boolean {
  const edge = document.mesh.edges[edgeId];
  const a = document.mesh.vertices[edge.a].point,
    b = document.mesh.vertices[edge.b].point;
  const owned = castleWallIds(document);
  for (const group of document.featureGroups) {
    if (group.kind !== "wall" || !owned.has(group.id)) continue;
    const clearance = (width + group.style.widthMeters) / 2 + 0.5;
    for (const ref of group.segments) {
      const wall = document.mesh.edges[ref.edgeId];
      if (wall.id === edgeId) return false;
      const c = document.mesh.vertices[wall.a].point,
        d = document.mesh.vertices[wall.b].point;
      const gate = document.gates.find(
        g => g.ownerCastleId && [edge.a, edge.b].includes(g.vertexId) && [wall.a, wall.b].includes(g.vertexId)
      );
      const gatePoint = gate && document.mesh.vertices[gate.vertexId].point;
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const q = nearestOnPolyline(p, [c, d]).point;
        const minimum = gatePoint
          ? Math.min(clearance, Math.hypot(p[0] - gatePoint[0], p[1] - gatePoint[1]) * 0.75)
          : clearance;
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) + 0.01 < minimum) return false;
      }
      if (!gatePoint)
        for (const p of [c, d]) {
          const q = nearestOnPolyline(p, [a, b]).point;
          if (Math.hypot(p[0] - q[0], p[1] - q[1]) < clearance) return false;
        }
    }
  }
  return true;
}
