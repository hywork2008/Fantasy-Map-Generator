import * as THREE from "three";
import { packedMarketPitch } from "../../../buildings/medieval/marketPresentation";
import { placeableObject } from "../../../buildings/placeableObjects";
import { placementDefinition, placementFootprint } from "../../../buildings/placementModels";
import { historicalPeriodIndex } from "../../../types/historicalPeriod";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument, VectorPath } from "../../types/vector/document";
import type { VectorFeature, VectorFeatureKind } from "../../types/vector/environment";
import type { VectorPolygon } from "../../types/vector/generation";
import { nearestOnPolyline, polygonCentroid } from "../geom";
import { prepareVectorEdit } from "./editing/dependencies";
import { connectVectorAnchors, createVectorGate, networkId, rebuildRoadGraph } from "./editing/network";
import { curveSource } from "./editing/paths";
import { featureReservations } from "./environmentState";
import { nearestRoadAnchor } from "./generation/urbanPacking";
import { evaluateAnchor } from "./geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "./geometry/regions";
import { offsetRing } from "./geometry/routing";
import { pathSurface } from "./geometry/surfaces";
import { allVectorWater } from "./geometry/water";
import { vectorOccupiedSites } from "./occupancy";
import { assertVectorDocument } from "./validation/document";

export interface VectorFeatureDraft {
  modelId?: string;
  kind: VectorFeatureKind;
  boundary: VectorPolygon;
  roadId: string;
  riverId?: string;
  density: number;
  heightMeters: number;
  activity: "market-day" | "closed";
  culture: "stone" | "timber";
  moatWidthMeters: number;
}

const overlap = (a: VectorPolygon[], b: VectorPolygon[]) =>
  regionBoolean(a, b, "intersection").some(p => regionArea(p) > 1e-5);
function box(center: Point, w: number, h: number, angle = 0): VectorPolygon {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    outer: [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2]
    ].map(([x, y]) => [center[0] + x * c - y * s, center[1] + x * s + y * c] as Point),
    holes: []
  };
}
function circle(center: Point, r: number, n = 8): VectorPolygon {
  return {
    outer: Array.from(
      { length: n },
      (_, i) =>
        [center[0] + Math.cos((i * Math.PI * 2) / n) * r, center[1] + Math.sin((i * Math.PI * 2) / n) * r] as Point
    ),
    holes: []
  };
}
/** Builds a reviewable candidate. Geometry and activity are persisted rather than drawn procedurally later. */
export function addVectorFeature(
  input: VectorCityDocument,
  draft: VectorFeatureDraft,
  requestedId?: string
): VectorCityDocument {
  assertVectorDocument(input);
  if (
    draft.kind === "bastion" &&
    historicalPeriodIndex(input.context.historicalPeriod) < historicalPeriodIndex("ageOfExploration")
  )
    throw Error("feature-period");
  let doc = prepareVectorEdit(input);
  const road = doc.paths[draft.roadId];
  if (road?.role !== "road") throw Error("feature-road-required");
  if (road.origin === "automatic") road.origin = "manual";
  if (requestedId && doc.environment?.features[requestedId]) throw Error("feature-id");
  const center = polygonCentroid(draft.boundary.outer),
    access = nearestRoadAnchor(road, center),
    target = evaluateAnchor(road, access);
  if (containsRegion([draft.boundary], target)) throw Error("feature-road-inside");
  const entrance = nearestOnPolyline(target, [...draft.boundary.outer, draft.boundary.outer[0]]).point;
  const id = requestedId ?? networkId(doc.environment?.features ?? {}, "feature"),
    connector: Point[] = [entrance, target];
  const f: VectorFeature = {
    id,
    kind: draft.kind,
    boundary: structuredClone(draft.boundary),
    access,
    entrance,
    connector,
    pathIds: [],
    placementIds: [],
    pieces: [],
    settings: {
      density: draft.density,
      heightMeters: draft.heightMeters,
      activity: draft.activity,
      culture: draft.culture,
      moatWidthMeters: draft.moatWidthMeters
    },
    editPolicy: "editable"
  };
  const obstacles = [
    ...featureReservations(doc),
    ...vectorOccupiedSites(doc, "site"),
    ...Object.values(doc.paths)
      .filter(p => p.role === "wall" || (p.role === "road" && (p.origin !== "automatic" || p.editPolicy === "fixed")))
      .map(pathSurface)
  ];
  if (overlap([f.boundary], obstacles)) throw Error("feature-occupied");
  const waters = allVectorWater(doc);
  if (overlap([f.boundary], waters)) throw Error("feature-dry-site-required");
  const addPath = (name: string, role: VectorPath["role"], points: Point[], half: number, closed = false) => {
    const pathId = `${id}:${name}`;
    doc.paths[pathId] = {
      id: pathId,
      revision: 0,
      role,
      origin: "manual",
      editPolicy: "editable",
      source: curveSource(points, "polyline", closed),
      width: { leftMeters: half, rightMeters: half, stations: [] }
    };
    f.pathIds.push(pathId);
    return doc.paths[pathId];
  };
  const addPiece = (
    role: VectorFeature["pieces"][number]["role"],
    polygon: VectorPolygon,
    height: number,
    color: string
  ) => {
    if (role !== "ship" && regionBoolean([polygon], [f.boundary], "difference").some(p => regionArea(p) > 1e-5)) return;
    f.pieces.push({ id: `${id}:piece:${f.pieces.length + 1}`, role, polygon, heightMeters: height, color });
  };
  let approachStart = entrance;
  if (draft.kind === "castle" || draft.kind === "bastion") {
    const inset = Math.max(8, draft.moatWidthMeters + 6),
      ring = offsetRing(f.boundary.outer, -inset);
    if (
      ring.length < 3 ||
      Math.abs(regionArea({ outer: ring, holes: [] })) < 60 ||
      !ring.every(p => containsRegion([f.boundary], p))
    )
      throw Error("feature-defense-space");
    const wall = addPath("curtain", "wall", ring, 1.2, true),
      wallAnchor = nearestRoadAnchor(wall, target);
    approachStart = evaluateAnchor(wall, wallAnchor);
    const keep = box(center, Math.sqrt(regionArea(f.boundary)) * 0.22, Math.sqrt(regionArea(f.boundary)) * 0.22);
    addPiece("structure", keep, draft.heightMeters, draft.culture === "stone" ? "#8e887e" : "#8c684b");
    for (const corner of ring)
      addPiece(
        "structure",
        draft.kind === "bastion" ? box(corner, 7, 7, Math.PI / 4) : circle(corner, 3.2),
        draft.heightMeters * 0.65,
        "#8e887e"
      );
    const approach = addPath("approach", "road", [approachStart, target], 2);
    rebuildRoadGraph(doc);
    doc = createVectorGate(doc, wallAnchor, { pathId: approach.id, segmentId: "segment:0", t: 0 }, 4.5, "passage");
    if (draft.moatWidthMeters > 0) {
      const moat = addPath(
        "moat",
        "river",
        offsetRing(f.boundary.outer, -(2 + draft.moatWidthMeters / 2)),
        draft.moatWidthMeters / 2,
        true
      );
      const anchor = nearestRoadAnchor(moat, target),
        crossing = evaluateAnchor(moat, anchor),
        dx = target[0] - approachStart[0],
        dy = target[1] - approachStart[1],
        length = Math.hypot(dx, dy),
        t = ((crossing[0] - approachStart[0]) * dx + (crossing[1] - approachStart[1]) * dy) / (length * length),
        dt = (draft.moatWidthMeters / 2 + 2) / length;
      if (t - dt <= 0 || t + dt >= 1) throw Error("feature-moat-landing");
      const bridgeId = networkId(doc.connections.bridges, "bridge");
      doc.connections.bridges[bridgeId] = {
        id: bridgeId,
        roadPathId: approach.id,
        riverAnchor: anchor,
        from: { pathId: approach.id, segmentId: "segment:0", t: t - dt },
        to: { pathId: approach.id, segmentId: "segment:0", t: t + dt },
        structure: draft.culture === "stone" ? "stone" : "timber",
        dryLandingMeters: 1,
        editPolicy: "editable"
      };
    }
  } else addPath("approach", "road", connector, 1.2);
  const approach = doc.paths[f.pathIds.find(id => id.endsWith(":approach"))!];
  const end = approach.source.kind === "curve" ? approach.source.segments.length - 1 : 0;
  doc = connectVectorAnchors(doc, { pathId: approach.id, segmentId: `segment:${end}`, t: 1 }, access);
  // connectVectorAnchors clones the document; insert subsequent paths only before this call.
  const approachSurface = pathSurface(doc.paths[approach.id]);
  if (overlap([approachSurface], waters)) throw Error("feature-access-water");
  if (
    overlap(
      [approachSurface],
      Object.values(input.paths)
        .filter(p => p.role === "wall")
        .map(pathSurface)
    )
  )
    throw Error("feature-access-wall");
  const xs = f.boundary.outer.map(p => p[0]),
    ys = f.boundary.outer.map(p => p[1]),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  if (draft.kind === "harbor") {
    const river = doc.paths[draft.riverId ?? ""];
    if (river?.role !== "river") throw Error("feature-river-required");
    f.waterAnchor = nearestRoadAnchor(river, center);
    const water = evaluateAnchor(river, f.waterAnchor),
      bank = nearestOnPolyline(center, [...pathSurface(river).outer, pathSurface(river).outer[0]]).point;
    if (Math.hypot(bank[0] - center[0], bank[1] - center[1]) > Math.sqrt(regionArea(f.boundary)) * 2)
      throw Error("feature-harbor-bank");
    const shore = nearestOnPolyline(bank, [...f.boundary.outer, f.boundary.outer[0]]).point;
    if (Math.hypot(shore[0] - bank[0], shore[1] - bank[1]) > 3) throw Error("feature-quay-gap");
    const inward: Point = [center[0] - shore[0], center[1] - shore[1]],
      length = Math.hypot(...inward),
      normal: Point = [inward[0] / length, inward[1] / length];
    const quay = box(
        [shore[0] + normal[0] * 2.1, shore[1] + normal[1] * 2.1],
        12,
        4,
        Math.atan2(normal[1], normal[0]) + Math.PI / 2
      ),
      ship = circle(water, Math.min(3, river.width.leftMeters * 0.6), 6);
    if (!containsRegion(waters, water) || !ship.outer.every(p => containsRegion(waters, p)))
      throw Error("feature-ship-water");
    addPiece("quay", quay, 1, "#a49b88");
    if (!f.pieces.some(p => p.role === "quay")) throw Error("feature-quay-space");
    const service = addPath(
      "quay-access",
      "road",
      [entrance, [shore[0] + normal[0] * 4.3, shore[1] + normal[1] * 4.3]],
      1.5
    );
    doc = connectVectorAnchors(
      doc,
      { pathId: service.id, segmentId: "segment:0", t: 0 },
      { pathId: approach.id, segmentId: "segment:0", t: 0 }
    );
    addPiece("ship", ship, 2.5, "#795b3e");
    addPiece("cargo", box(center, 4, 4), 2, "#9c784a");
  } else if (draft.kind === "temple") {
    addPiece(
      "structure",
      box(center, Math.min(18, (maxX - minX) * 0.5), Math.min(30, (maxY - minY) * 0.6)),
      draft.heightMeters,
      "#b5aa98"
    );
    addPiece("structure", box([center[0], center[1] + (maxY - minY) * 0.2], 5, 5), draft.heightMeters * 1.4, "#8b847c");
  }
  const pitch = draft.kind === "forest" ? 7 : draft.kind === "market" ? 7 : draft.kind === "cemetery" ? 4 : 10;
  let index = 0;
  for (let y = minY + pitch / 2; y < maxY; y += pitch)
    for (let x = minX + pitch / 2; x < maxX; x += pitch) {
      if (++index > 4096) throw Error("feature-density-budget");
      const p: Point = [x, y];
      if (!containsRegion([f.boundary], p) || containsRegion([approachSurface], p)) continue;
      const random = ((Math.imul(index, 2654435761) >>> 0) % 1000) / 1000;
      if (random > draft.density) continue;
      if (draft.kind === "forest" || draft.kind === "park")
        addPiece(
          "vegetation",
          circle(p, draft.kind === "forest" ? 2.5 : 1.8, 6),
          draft.kind === "forest" ? 8 : 4,
          "#4f754c"
        );
      if (draft.kind === "farm")
        addPiece("ground", box(p, pitch - 1, pitch - 1), 0.08, index % 2 ? "#b0a45d" : "#b7ae71");
      if (draft.kind === "cemetery") addPiece("structure", box(p, 1, 2), 0.8, "#9c9b90");
      if (draft.kind === "market")
        addPiece("stall", box(p, 3, 3), draft.activity === "market-day" ? 3 : 1.2, index % 2 ? "#b07a54" : "#c8a060");
    }
  if (draft.modelId) {
    const definition =
        placementDefinition(draft.modelId, "low", undefined, { activity: draft.activity }) ??
        (packedMarketPitch(draft.modelId, draft.activity) ? placementDefinition(draft.modelId, "low") : null) ??
        placeableObject(draft.modelId),
      footprint = placementFootprint(draft.modelId, "low");
    if (!definition || !footprint) throw Error("feature-model");
    const angle = Math.atan2(target[1] - center[1], target[0] - center[0]) + Math.PI / 2,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const outer: Point[] = [
      [-footprint.halfX, -footprint.halfZ],
      [footprint.halfX, -footprint.halfZ],
      [footprint.halfX, footprint.halfZ],
      [-footprint.halfX, footprint.halfZ]
    ].map(([x, z]) => [center[0] + x * c + z * s, center[1] + x * s - z * c]);
    if (regionBoolean([{ outer, holes: [] }], [f.boundary], "difference").some(p => regionArea(p) > 1e-5))
      throw Error("feature-model-space");
    const model = definition.create();
    let height = 0;
    try {
      const bounds = new THREE.Box3().setFromObject(model.group, true);
      height = bounds.max.y - bounds.min.y;
    } finally {
      model.dispose();
    }
    if (height > draft.heightMeters) throw Error("feature-model-height");
    const placementId = `${id}:asset`;
    doc.placements[placementId] = {
      id: placementId,
      modelId: draft.modelId,
      position: center,
      facingDegrees: ((((angle * 180) / Math.PI) % 360) + 360) % 360,
      origin: "manual",
      editPolicy: "editable",
      site: { outer, holes: [] },
      accesses: [access],
      display: {
        kind: "facility",
        heightMeters: height,
        footprint: [{ outer, holes: [] }],
        provenance: "copied",
        note: "Authored BV asset at metre scale, reserved within an accessible vector feature."
      },
      appearance: { quality: "low", activity: draft.activity }
    };
    f.placementIds.push(placementId);
    f.pieces = f.pieces.filter(
      p => !["structure", "stall"].includes(p.role) || !overlap([p.polygon], [{ outer, holes: [] }])
    );
  }
  doc.environment ??= { features: {}, hidden: [] };
  doc.environment.features[id] = f;
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
/** Rebuild an explicitly edited feature while preserving unrelated manual geometry. */
export function removeVectorFeature(input: VectorCityDocument, id: string): VectorCityDocument {
  assertVectorDocument(input);
  const feature = input.environment?.features[id];
  if (!feature) throw Error("feature-missing");
  if (feature.editPolicy === "fixed" || feature.placementIds.some(id => input.placements[id]?.editPolicy === "fixed"))
    throw Error("feature-fixed");
  const doc = prepareVectorEdit(input),
    ids = new Set(feature.pathIds);
  if (
    Object.values(doc.placements).some(
      p => !feature.placementIds.includes(p.id) && p.accesses.some(a => ids.has(a.pathId))
    ) ||
    Object.values(doc.environment!.features).some(
      f => f.id !== id && (ids.has(f.access.pathId) || (f.waterAnchor && ids.has(f.waterAnchor.pathId)))
    )
  )
    throw Error("feature-referenced");
  for (const p of feature.pathIds) delete doc.paths[p];
  for (const p of feature.placementIds) delete doc.placements[p];
  for (const [key, b] of Object.entries(doc.connections.bridges))
    if (ids.has(b.roadPathId) || ids.has(b.riverAnchor.pathId)) delete doc.connections.bridges[key];
  for (const [key, g] of Object.entries(doc.connections.gates))
    if (ids.has(g.wallPathId)) delete doc.connections.gates[key];
  for (const [key, c] of Object.entries(doc.connections.circuits))
    if (ids.has(c.pathId)) delete doc.connections.circuits[key];
  for (const n of Object.values(doc.connections.nodes)) {
    n.anchors = n.anchors.filter(a => !ids.has(a.pathId));
    if (!n.anchors.length) delete doc.connections.nodes[n.id];
  }
  for (const [key, e] of Object.entries(doc.connections.edges))
    if (ids.has(e.pathId)) delete doc.connections.edges[key];
  delete doc.environment!.features[id];
  doc.environment!.hidden = doc.environment!.hidden.filter(key => key !== id);
  rebuildRoadGraph(doc);
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}

/** Activity does not reshuffle stall footprints, and locked instances retain their own state. */
export function setVectorFeatureActivity(
  input: VectorCityDocument,
  id: string,
  activity: "market-day" | "closed"
): VectorCityDocument {
  const feature = input.environment?.features[id];
  if (!feature) throw Error("feature-missing");
  if (feature.editPolicy === "fixed") throw Error("feature-fixed");
  const doc = prepareVectorEdit(input),
    f = doc.environment!.features[id];
  f.settings.activity = activity;
  for (const piece of f.pieces) if (piece.role === "stall") piece.heightMeters = activity === "market-day" ? 3 : 1.2;
  for (const id of f.placementIds) {
    const p = doc.placements[id];
    if (p.editPolicy === "fixed") continue;
    p.appearance = { ...p.appearance, quality: p.appearance?.quality ?? "low", activity };
  }
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
