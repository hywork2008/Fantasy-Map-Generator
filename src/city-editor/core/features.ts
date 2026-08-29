import { clone, edgeBetween, edgeEnd, edgeRefFor, vertexTouchesWater } from "./mesh";
import type { CityDocument, EdgeFeatureGroup, ElementKind, FeatureGroup, Id, RiverGroup } from "./types";

export function createGroup(document: CityDocument, kind: FeatureGroup["kind"]): CityDocument {
  const next = clone(document);
  const number = next.featureGroups.filter(group => group.kind === kind).length + 1;
  const group =
    kind === "river"
      ? ({
          id: nextId(next, "river"),
          kind,
          name: `River #${number}`,
          vertices: [],
          source: null,
          mouth: null,
          style: { widthMeters: 18, color: "#3979a8" },
          locked: false
        } satisfies RiverGroup)
      : ({
          id: nextId(next, kind),
          kind,
          name: `${kind === "road" ? "Road" : "Wall"} #${number}`,
          segments: [],
          style: { widthMeters: kind === "road" ? 10 : 7, color: kind === "road" ? "#6b5137" : "#342a22" },
          locked: false
        } satisfies EdgeFeatureGroup);
  next.featureGroups.push(group);
  return next;
}

export function appendEdge(document: CityDocument, groupId: Id, edgeId: Id): CityDocument | null {
  const next = clone(document);
  const group = next.featureGroups.find(candidate => candidate.id === groupId);
  const edge = next.mesh.edges[edgeId];
  if (!group || !edge || group.kind === "river" || group.locked) return null;
  if (group.segments.some(segment => segment.edgeId === edgeId)) return next;
  if (group.segments.length === 0) group.segments.push({ edgeId, forward: true });
  else {
    const end = edgeEnd(next.mesh, group.segments[group.segments.length - 1]);
    const ref = edgeRefFor(next.mesh, edgeId, end);
    if (ref) group.segments.push(ref);
    else {
      const first = group.segments[0];
      const edgeAtStart = next.mesh.edges[first.edgeId];
      const start = first.forward ? edgeAtStart.a : edgeAtStart.b;
      const before = edgeRefFor(next.mesh, edgeId, start);
      if (!before) return null;
      group.segments.unshift({ edgeId: before.edgeId, forward: !before.forward });
    }
  }
  return next;
}

export function appendRiverVertex(document: CityDocument, groupId: Id, vertexId: Id): CityDocument | null {
  const next = clone(document);
  const group = next.featureGroups.find(candidate => candidate.id === groupId);
  if (group?.kind !== "river" || group.locked || !next.mesh.vertices[vertexId]) return null;
  const last = group.vertices.at(-1);
  if (last && !edgeBetween(next.mesh, last, vertexId)) return null;
  if (last === vertexId) return next;
  group.vertices.push(vertexId);
  group.source ??= { vertexId, kind: "spring" };
  if (group.vertices.length >= 2 && vertexTouchesWater(next.mesh, vertexId)) group.mouth = { vertexId, kind: "water" };
  return next;
}

export function finishRiver(document: CityDocument, groupId: Id): CityDocument | null {
  const next = clone(document);
  const group = next.featureGroups.find(candidate => candidate.id === groupId);
  if (group?.kind !== "river" || group.vertices.length < 2) return null;
  const vertexId = group.vertices[group.vertices.length - 1];
  if (vertexTouchesWater(next.mesh, vertexId)) group.mouth = { vertexId, kind: "water" };
  else {
    const p = next.mesh.vertices[vertexId].point;
    const half = next.frame.extentMeters / 2;
    if (Math.abs(Math.abs(p[0]) - half) > 0.01 && Math.abs(Math.abs(p[1]) - half) > 0.01) return null;
    group.mouth = { vertexId, kind: "mapBoundary" };
  }
  return next;
}

export function addElement(document: CityDocument, kind: ElementKind, faceId: Id): CityDocument {
  const next = clone(document);
  if (!next.mesh.faces[faceId]) return next;
  next.elements.push({ id: nextId(next, kind), kind, faceIds: [faceId], locked: true });
  return next;
}

export function removeGroup(document: CityDocument, groupId: Id): CityDocument {
  const next = clone(document);
  next.featureGroups = next.featureGroups.filter(group => group.id !== groupId);
  return next;
}

function nextId(document: CityDocument, prefix: string): Id {
  let n = 1;
  const used = new Set([
    ...document.featureGroups.map(group => group.id),
    ...document.elements.map(element => element.id)
  ]);
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
