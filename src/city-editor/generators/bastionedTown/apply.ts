// Bind the saved plan to the finished wall chain and install a detached citadel.
import type { BastionedTownPlan, CityDocument, CityGate, EdgeRef, Point } from "../../types/document";
import type { Id } from "../../types/primitives";
import {
  boundaryEdges,
  boundaryRings,
  polygonOverlaps,
  polylineInsideRing,
  refPoints,
  validateFortifications
} from "../fortifications";
import { GEN_PREFIX } from "../generation/constants";
import { pointInPolygon, polygonArea, polygonCentroid } from "../geom";
import { facePoints } from "../mesh";
import type { BastionedTownDraft } from "./draft";
import { markReservedFaces } from "./reserve";
import type { FortressFailureReason } from "./validate";

const BIND_METERS = 3;

export function lockBastionedRoads(document: CityDocument, locked: boolean): void {
  for (const group of document.featureGroups)
    if (group.kind === "road" && group.id.includes(`${GEN_PREFIX}road-`)) group.locked = locked;
}

function chainPoints(document: CityDocument, segments: EdgeRef[]): Point[] {
  if (!segments.length) return [];
  const first = document.mesh.edges[segments[0].edgeId];
  if (!first) return [];
  const points = [document.mesh.vertices[segments[0].forward ? first.a : first.b].point];
  for (const ref of segments) {
    const edge = document.mesh.edges[ref.edgeId];
    points.push(document.mesh.vertices[ref.forward ? edge.b : edge.a].point);
  }
  return points;
}

function matchChain(chain: Point[], ring: Point[]): number[] | null {
  if (chain.length < ring.length) return null;
  let start = -1;
  let best = BIND_METERS;
  chain.forEach((point, index) => {
    const gap = Math.hypot(point[0] - ring[0][0], point[1] - ring[0][1]);
    if (gap <= best) {
      best = gap;
      start = index;
    }
  });
  if (start < 0) return null;
  const map = [start];
  let cursor = start;
  for (let i = 1; i < ring.length; i++) {
    let found = -1;
    for (let step = 1; step <= chain.length; step++) {
      const index = (cursor + step) % chain.length;
      if (Math.hypot(chain[index][0] - ring[i][0], chain[index][1] - ring[i][1]) <= BIND_METERS) {
        found = index;
        break;
      }
    }
    if (found < 0) return null;
    map.push(found);
    cursor = found;
  }
  return map;
}

function edgesBetween(from: number, to: number, segments: EdgeRef[], backward: boolean): Id[] {
  const ids: Id[] = [];
  let index = from;
  for (let n = 0; n < segments.length; n++) {
    if (index === to) break;
    const edge = backward ? (index - 1 + segments.length) % segments.length : index;
    ids.push(segments[edge].edgeId);
    index = backward ? edge : (index + 1) % segments.length;
  }
  return index === to && ids.length ? ids : [];
}

function bindMainLine(document: CityDocument, draft: BastionedTownDraft): BastionedTownPlan | null {
  const wall = document.featureGroups.find(group => group.kind === "wall" && group.id === `${GEN_PREFIX}wall-0`);
  if (wall?.kind !== "wall" || !wall.segments.length) return null;
  const walked = chainPoints(document, wall.segments);
  const closed =
    walked.length > 2 && Math.hypot(walked[0][0] - walked.at(-1)![0], walked[0][1] - walked.at(-1)![1]) < 0.05;
  const chain = closed ? walked.slice(0, -1) : walked;
  if (chain.length !== wall.segments.length) return null;
  const forward = matchChain(chain, draft.meshRing);
  const reversed = forward ? null : matchChain([...chain].reverse(), draft.meshRing);
  const map = forward ?? reversed?.map(index => chain.length - 1 - index) ?? null;
  if (!map) return null;
  const plan: BastionedTownPlan = structuredClone(draft.plan);
  const claim = (start: number, end: number) => edgesBetween(map[start], map[end], wall.segments, !forward);
  plan.bastions.forEach((bastion, index) => {
    const [start, end] = draft.bastionVertices[index];
    bastion.wallEdgeIds = claim(start, end);
  });
  plan.curtains.forEach((curtain, index) => {
    const [start, end] = draft.curtainVertices[index];
    curtain.wallEdgeIds = claim(start, end);
  });
  const claimed = [...plan.bastions, ...plan.curtains].flatMap(part => part.wallEdgeIds);
  const wallIds = new Set(wall.segments.map(ref => ref.edgeId));
  if (!claimed.length || claimed.some(id => !id) || new Set(claimed).size !== wallIds.size) return null;
  if (claimed.some(id => !wallIds.has(id))) return null;
  return plan;
}

function nearestVertex(document: CityDocument, point: Point): { id: Id; point: Point } | null {
  let best: { id: Id; point: Point } | null = null;
  let gap = 0.75;
  for (const vertex of Object.values(document.mesh.vertices)) {
    const next = Math.hypot(vertex.point[0] - point[0], vertex.point[1] - point[1]);
    if (next <= gap) {
      gap = next;
      best = vertex;
    }
  }
  return best;
}

function rectangle(center: Point, halfX: number, halfY: number): Point[] {
  return [
    [center[0] - halfX, center[1] - halfY],
    [center[0] + halfX, center[1] - halfY],
    [center[0] + halfX, center[1] + halfY],
    [center[0] - halfX, center[1] + halfY]
  ];
}

function installCitadel(document: CityDocument, square: Point[]): string | null {
  const faces = Object.values(document.mesh.faces).filter(face => {
    if (face.properties.water !== "land") return false;
    return pointInPolygon(polygonCentroid(facePoints(document.mesh, face)), square);
  });
  if (!faces.length) return "no citadel faces";
  const areaFaceIds = faces.map(face => face.id);
  const rings = boundaryRings(document.mesh, boundaryEdges(document.mesh, areaFaceIds));
  if (rings.length !== 1) return "citadel ring";
  const ring = rings[0];
  const groupId = `${GEN_PREFIX}citadel-wall`;
  document.featureGroups.push({
    id: groupId,
    kind: "wall",
    name: "Citadel wall",
    segments: ring,
    style: { widthMeters: 4.2, color: "#55443d" },
    wallMaterial: "stone",
    locked: true
  });
  const castleId = `${GEN_PREFIX}castle-0`;
  const circuitId = `${GEN_PREFIX}defense-castle-0`;
  document.defenseCircuits ??= [];
  document.defenseCircuits.push({
    id: circuitId,
    scope: "castle",
    ownerCastleId: castleId,
    areaFaceIds,
    wallGroupIds: [groupId],
    naturalBarriers: [],
    locked: true
  });
  for (const face of faces) {
    face.properties.ward = "castle";
    face.properties.buildable = false;
  }
  const town = document.elements.find(element => element.kind === "plaza")?.point ?? [0, 0];
  const corner = [...square].sort(
    (a, b) => Math.hypot(a[0] - town[0], a[1] - town[1]) - Math.hypot(b[0] - town[0], b[1] - town[1])
  )[0];
  const vertex = nearestVertex(document, corner);
  if (!vertex) return "citadel gate";
  const arms = ring.filter(ref => {
    const edge = document.mesh.edges[ref.edgeId];
    return edge.a === vertex.id || edge.b === vertex.id;
  });
  if (arms.length < 2) return "citadel gate arms";
  const gate: CityGate = {
    id: `${GEN_PREFIX}citadel-gate`,
    vertexId: vertex.id,
    role: "castle-main",
    ownerCastleId: castleId,
    passageWidthMeters: 4,
    wallEdgeIds: [arms[0].edgeId, arms[1].edgeId],
    locked: true
  };
  document.gates.push(gate);
  const center = polygonCentroid(square);
  const ox = Math.sign(center[0] - town[0]) || 1;
  const oy = Math.sign(center[1] - town[1]) || 1;
  const rangeCenter: Point = [center[0] + ox * 6, center[1] + oy * 6];
  const range = rectangle(rangeCenter, 7, 6);
  const entrance: Point = [rangeCenter[0] - ox * 7, rangeCenter[1]];
  const court = rectangle([center[0] - ox * 8, center[1] - oy * 8], 4, 4);
  const circuitRing = refPoints(document.mesh, ring);
  if (
    Math.abs(polygonArea(range)) < 20 ||
    !polylineInsideRing([...range, range[0]], circuitRing) ||
    !polylineInsideRing([...court, court[0]], circuitRing) ||
    polygonOverlaps(range, court)
  )
    return "citadel buildings";
  document.castles ??= [];
  document.castles.push({
    id: castleId,
    version: 1,
    seed: document.generationSeed ?? "bastioned-citadel",
    position: "central",
    relationship: "detached",
    form: "courtyard",
    circuitId,
    courtyards: [court],
    parts: [
      {
        id: `${castleId}:range`,
        role: "range",
        footprint: range,
        entrances: [entrance],
        locked: false
      }
    ],
    accesses: [{ gateId: gate.id, points: [vertex.point, entrance], widthMeters: 4 }],
    provenance: "generated",
    locked: true
  });
  const errors = validateFortifications(document);
  return errors.length ? errors[0] : null;
}

function releaseRoads(document: CityDocument): void {
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    const match = new RegExp(`^${GEN_PREFIX}road-(\\d+)`).exec(group.id);
    if (!match) continue;
    group.locked = false;
    if (Number(match[1]) >= 1000) group.roadRole = "street";
  }
}

export function applyBastionedTown(
  document: CityDocument,
  draft: BastionedTownDraft
): { document: CityDocument } | { reason: FortressFailureReason; details: string[] } {
  const plan = bindMainLine(document, draft);
  if (!plan) return { reason: "fortress-invalid-bastion", details: ["main line does not match the wall chain"] };
  const circuit = document.defenseCircuits?.find(item => item.id === plan.circuitId && item.scope === "town");
  if (circuit) circuit.locked = true;
  for (const gate of document.gates) {
    if (!gate.id.startsWith(`${GEN_PREFIX}gate-`) || gate.ownerCastleId) continue;
    gate.circuitId = plan.circuitId;
    gate.passageWidthMeters = 6;
    gate.locked = true;
    gate.role = "town";
  }
  if (draft.citadelSquare) {
    const citadel = installCitadel(document, draft.citadelSquare);
    if (citadel) return { reason: "fortress-insufficient-space", details: [citadel] };
  }
  releaseRoads(document);
  document.bastionedTown = plan;
  document.version = 5;
  markReservedFaces(document);
  const errors = validateFortifications(document);
  if (errors.length) return { reason: "fortress-invalid-bastion", details: errors };
  return { document };
}
