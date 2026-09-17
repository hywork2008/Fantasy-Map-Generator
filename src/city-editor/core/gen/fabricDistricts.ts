import { clone, edgeBetween, facePoints } from "../mesh";
import type { CityDocument, DistrictParameters, EdgeRef, FabricDistrict, FabricPlan, Face, Id } from "../types";
import { longestFrame } from "./lotGeometry";
import {
  COAST_SHAPES,
  FEATURE_KEYS,
  RIVER_SHAPES,
  WALL_COAST_CHOICES,
  WALL_ENVELOPE_CHOICES,
  WALL_LINE_CHOICES
} from "./site/siteConfig";

export function defaultDistrictParameters(face: Face, document: CityDocument): DistrictParameters {
  const axis = longestFrame(facePoints(document.mesh, face)).axis;
  return {
    coverage: 0.75,
    occupancy: face.properties.settlement === "outskirts" ? 0.82 : 0.965,
    lotArea: face.properties.ward === "castle" ? 1200 : face.properties.ward === "merchant" ? 220 : 150,
    laneWidth: 3,
    orientation: Math.atan2(axis[1], axis[0])
  };
}

/** A single outer ring. Hole-bearing or pinched unions are left as separate districts. */
export function districtBoundary(document: CityDocument, ids: Id[]): EdgeRef[] | null {
  const members = new Set(ids);
  const refs = ids
    .flatMap(id => document.mesh.faces[id].boundary)
    .filter(ref => {
      const e = document.mesh.edges[ref.edgeId];
      return !(e.leftFace && e.rightFace && members.has(e.leftFace) && members.has(e.rightFace));
    });
  if (!refs.length) return null;
  const start = (ref: EdgeRef) => {
    const e = document.mesh.edges[ref.edgeId];
    return ref.forward ? e.a : e.b;
  };
  const end = (ref: EdgeRef) => {
    const e = document.mesh.edges[ref.edgeId];
    return ref.forward ? e.b : e.a;
  };
  const byStart = new Map(refs.map(r => [start(r), r]));
  if (byStart.size !== refs.length) return null;
  const ring = [refs.slice().sort((a, b) => a.edgeId.localeCompare(b.edgeId))[0]];
  const used = new Set([ring[0].edgeId]);
  while (ring.length < refs.length) {
    const next = byStart.get(end(ring[ring.length - 1]));
    if (!next || used.has(next.edgeId)) return null;
    ring.push(next);
    used.add(next.edgeId);
  }
  return end(ring[ring.length - 1]) === start(ring[0]) ? ring : null;
}

function protectedEdges(document: CityDocument): Set<Id> {
  const ids = new Set<Id>();
  for (const group of document.featureGroups) {
    if (group.kind === "river") {
      for (let i = 1; i < group.vertices.length; i++) {
        const edge = edgeBetween(document.mesh, group.vertices[i - 1], group.vertices[i]);
        if (edge) ids.add(edge.id);
      }
    } else for (const ref of group.segments) ids.add(ref.edgeId);
  }
  for (const edge of Object.values(document.mesh.edges))
    if (edge.locked || document.mesh.vertices[edge.a].locked || document.mesh.vertices[edge.b].locked) ids.add(edge.id);
  return ids;
}

/** Saved membership is stable; edits can split it at new constraints but never regroup remote districts. */
export function resolveDistricts(document: CityDocument, plan?: FabricPlan): FabricDistrict[] {
  const blocked = protectedEdges(document);
  const reserved = new Set(document.elements.flatMap(e => e.faceIds));
  const saved = new Map<Id, FabricDistrict>();
  for (const district of plan?.districts ?? []) for (const id of district.faceIds) saved.set(id, district);
  const pending = new Set(Object.keys(document.mesh.faces).sort());
  const result: FabricDistrict[] = [];
  while (pending.size) {
    const first = pending.values().next().value as Id;
    const face = document.mesh.faces[first];
    const original = saved.get(first);
    const ids = [first];
    pending.delete(first);
    if (face.properties.water === "land" && !face.properties.locked && !reserved.has(first)) {
      for (let i = 0; i < ids.length; i++) {
        for (const ref of document.mesh.faces[ids[i]].boundary) {
          const edge = document.mesh.edges[ref.edgeId];
          const otherId = edge.leftFace === ids[i] ? edge.rightFace : edge.leftFace;
          if (!otherId || !pending.has(otherId) || blocked.has(edge.id) || (!plan && ids.length >= 6)) continue;
          const other = document.mesh.faces[otherId];
          if (
            other.properties.locked ||
            reserved.has(otherId) ||
            other.properties.water !== "land" ||
            other.properties.ward !== face.properties.ward ||
            other.properties.buildable !== face.properties.buildable ||
            other.properties.settlement !== face.properties.settlement ||
            (plan && saved.get(otherId)?.id !== original?.id) ||
            (plan && !original)
          )
            continue;
          if (!districtBoundary(document, [...ids, otherId])) continue;
          ids.push(otherId);
          pending.delete(otherId);
        }
      }
    }
    ids.sort();
    result.push({
      id: `district:${ids[0]}`,
      faceIds: ids,
      parameters: original?.parameters ?? defaultDistrictParameters(face, document)
    });
  }
  return result;
}

export function createFabricPlan(document: CityDocument, seed: string): FabricPlan {
  return { version: 2, seed, districts: resolveDistricts(document) };
}

/** A disposable union mesh for drawing only. Source edges, faces and feature references remain untouched. */
export function districtDocument(document: CityDocument, districts: FabricDistrict[]): CityDocument {
  const owner = new Map(districts.flatMap(d => d.faceIds.map(id => [id, d.id] as const)));
  const faces = Object.fromEntries(
    districts.map(d => [
      d.id,
      {
        ...document.mesh.faces[d.faceIds[0]],
        id: d.id,
        boundary: districtBoundary(document, d.faceIds)!
      }
    ])
  );
  const edges = Object.fromEntries(
    Object.values(document.mesh.edges).flatMap(e => {
      const leftFace = e.leftFace ? (owner.get(e.leftFace) ?? null) : null;
      const rightFace = e.rightFace ? (owner.get(e.rightFace) ?? null) : null;
      return leftFace && leftFace === rightFace ? [] : [[e.id, { ...e, leftFace, rightFace }]];
    })
  );
  return {
    ...document,
    mesh: { vertices: document.mesh.vertices, edges, faces },
    elements: document.elements.map(e => ({
      ...e,
      faceIds: [...new Set(e.faceIds.map(id => owner.get(id)!).filter(Boolean))]
    }))
  };
}

export function setDistrictParameters(
  document: CityDocument,
  faceId: Id,
  parameters: Partial<DistrictParameters>
): CityDocument | null {
  if (document.gridKind !== "evolution" || !document.mesh.faces[faceId]) return null;
  const next = clone(document);
  next.fabric ??= createFabricPlan(next, "manual");
  next.fabric.districts = resolveDistricts(next, next.fabric);
  const district = next.fabric.districts.find(d => d.faceIds.includes(faceId));
  if (!district || district.faceIds.some(id => next.mesh.faces[id].properties.locked)) return null;
  const p = { ...district.parameters, ...parameters };
  if (!validDistrictParameters(p)) return null;
  district.parameters = p;
  return next;
}

export function validDistrictParameters(p: DistrictParameters): boolean {
  return (
    !!p &&
    Number.isFinite(p.occupancy) &&
    p.occupancy >= 0 &&
    p.occupancy <= 1 &&
    Number.isFinite(p.coverage) &&
    p.coverage >= 0.15 &&
    p.coverage <= 1 &&
    Number.isFinite(p.lotArea) &&
    p.lotArea >= 80 &&
    p.lotArea <= 3000 &&
    Number.isFinite(p.laneWidth) &&
    p.laneWidth >= 1 &&
    p.laneWidth <= 12 &&
    Number.isFinite(p.orientation)
  );
}

export function validFabricPlan(plan: FabricPlan): boolean {
  if (plan?.version !== 2 || typeof plan.seed !== "string" || !Array.isArray(plan.districts)) return false;
  const faces = new Set<Id>(),
    ids = new Set<Id>();
  for (const d of plan.districts) {
    if (
      !d ||
      typeof d.id !== "string" ||
      ids.has(d.id) ||
      !Array.isArray(d.faceIds) ||
      !d.faceIds.length ||
      !validDistrictParameters(d.parameters)
    )
      return false;
    ids.add(d.id);
    for (const id of d.faceIds) {
      if (typeof id !== "string" || faces.has(id)) return false;
      faces.add(id);
    }
  }
  if (!plan.generation) return true;
  const g = plan.generation,
    config = g.settings?.config;
  return (
    g.algorithm === "evolution-city-v3" &&
    (g.settings?.walledAreaShare === undefined ||
      (Number.isFinite(g.settings.walledAreaShare) &&
        g.settings.walledAreaShare >= 0.05 &&
        g.settings.walledAreaShare <= 1)) &&
    typeof g.seed === "string" &&
    !!g.input &&
    !!config &&
    COAST_SHAPES.includes(config.coast) &&
    Array.isArray(config.rivers) &&
    config.rivers.length <= 2 &&
    config.rivers.every(r => RIVER_SHAPES.includes(r)) &&
    typeof config.relief === "boolean" &&
    !!config.features &&
    FEATURE_KEYS.every(k => typeof config.features[k] === "boolean") &&
    !!config.wall &&
    WALL_ENVELOPE_CHOICES.includes(config.wall.envelope) &&
    WALL_COAST_CHOICES.includes(config.wall.coast) &&
    WALL_LINE_CHOICES.includes(config.wall.line)
  );
}
