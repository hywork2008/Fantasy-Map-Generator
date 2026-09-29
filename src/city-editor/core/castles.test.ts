import { describe, expect, it } from "vitest";
import { serializeCitySvg } from "../render/svg";
import {
  createCastleOnFace,
  deleteCastle,
  installCastle,
  regenerateCastleInterior,
  setCastleLocked,
  setCastlePartLocked
} from "./castles";
import { parseDocument } from "./document";
import { removeEdgeFromGroup, removeGroup, toggleGate } from "./features";
import {
  boundaryEdges,
  boundaryRings,
  castleWallIds,
  circuitRing,
  polygonOverlaps,
  validateFortifications,
  wallRunsOutsideGates
} from "./fortifications";
import { buildCityBuildings } from "./gen/buildingLots";
import { nearestOnPolyline, polygonArea } from "./gen/geom";
import type { Cell } from "./gen/types";
import { DocumentHistory } from "./history";
import {
  facePoints,
  insertEdgeVertex,
  meshFromCells,
  moveVertex,
  scaleDocument,
  setFaceWater,
  splitFace,
  validate
} from "./mesh";
import type { CityDocument, Point } from "./types";

function fixture(shared = false): CityDocument {
  const polys: Point[][] = [
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ],
    [
      [-100, 0],
      [0, 0],
      [0, 100],
      [-100, 100]
    ]
  ];
  const cells: Cell[] = polys.map((polygon, id) => ({
    id,
    polygon,
    site: [id ? -50 : 50, 50],
    centroid: [id ? -50 : 50, 50],
    neighbors: [1 - id],
    onBorder: true
  }));
  const doc: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 400, cityRadiusMeters: 150, blockSizeMeters: 50 },
    mesh: meshFromCells(cells),
    featureGroups: [],
    gates: [],
    elements: [{ id: "plaza", kind: "plaza", faceIds: ["f1"], point: [-50, 50], locked: false }]
  };
  if (shared) {
    doc.version = 2;
    const segments = boundaryRings(doc.mesh, boundaryEdges(doc.mesh, ["f0", "f1"]))[0];
    doc.featureGroups.push({
      id: "town-wall",
      kind: "wall",
      name: "Town curtain",
      segments,
      style: { widthMeters: 3, color: "#55443d" },
      locked: false
    });
    doc.defenseCircuits = [
      {
        id: "town",
        scope: "town",
        areaFaceIds: ["f0", "f1"],
        wallGroupIds: ["town-wall"],
        naturalBarriers: [],
        locked: false
      }
    ];
  }
  return doc;
}
function castle(shared = false): CityDocument {
  const doc = fixture(shared);
  const next = installCastle(
    doc,
    {
      mesh: doc.mesh,
      faceId: "f0",
      seed: "fixture",
      position: shared ? "edge" : "central",
      relationship: shared ? "integrated" : "detached",
      form: "keep-bailey"
    },
    "f0",
    "fixture"
  );
  expect(next).not.toBeNull();
  return next!;
}

describe("Castle compounds", () => {
  it.each([false, true])("keeps a closed circuit, a city-side gate and canonical shared walls (%s)", shared => {
    const doc = castle(shared),
      plan = doc.castles![0],
      circuit = doc.defenseCircuits!.find(c => c.id === plan.circuitId)!;
    expect(validate(doc)).toEqual([]);
    expect(plan.parts.map(p => p.role)).toEqual(["keep", "hall", "service"]);
    expect(plan.courtyards).toHaveLength(1);
    expect(doc.elements.some(e => e.kind === "citadel")).toBe(false);
    const edges = doc.featureGroups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : []));
    expect(new Set(edges).size).toBe(edges.length);
    expect(doc.gates.filter(g => g.ownerCastleId === plan.id)).toHaveLength(1);
    expect(circuit.naturalBarriers).toEqual([]);
    if (shared)
      expect(
        doc.defenseCircuits!.find(c => c.scope === "town")!.wallGroupIds.some(id => circuit.wallGroupIds.includes(id))
      ).toBe(true);
    const ring = circuitRing(doc, circuit);
    expect(buildCityBuildings(doc).some(b => polygonOverlaps(b.polygon, ring))).toBe(false);
    const svg = serializeCitySvg(doc);
    expect(svg).toContain("ce-castles");
    expect(svg).not.toContain("NaN");
  });
  it.each(["keep-bailey", "courtyard"] as const)("places %s wings by the curtain around a broad court", form => {
    let doc = castle();
    if (form === "courtyard") doc = regenerateCastleInterior(doc, doc.castles![0].id)!;
    const plan = doc.castles![0];
    const ring = circuitRing(doc, doc.defenseCircuits!.find(c => c.id === plan.circuitId)!);
    for (const part of plan.parts) {
      const gap = Math.min(...part.footprint.map(p => nearestOnPolyline(p, [...ring, ring[0]]).dist));
      expect(gap).toBeGreaterThanOrEqual(3.9);
      expect(gap).toBeLessThan(4.3);
    }
    expect(Math.abs(polygonArea(plan.courtyards[0]))).toBeGreaterThan(1800);
    for (const access of plan.accesses) {
      const a = access.points[0],
        b = access.points[1],
        c = access.points[2];
      const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
      expect(Math.abs(dot)).toBeLessThan(1e-6);
    }
    expect(new Set(plan.accesses.map(a => JSON.stringify(a.points[1]))).size).toBeGreaterThan(1);
    expect(validate(doc)).toEqual([]);
  });
  it("rearranges an existing interior without changing its form or walls", () => {
    const doc = castle();
    const plan = doc.castles![0];
    const next = regenerateCastleInterior(doc, plan.id, false)!;
    expect(next.castles![0].form).toBe(plan.form);
    expect(next.featureGroups).toEqual(doc.featureGroups);
    expect(next.gates).toEqual(doc.gates);
    expect(next.mesh).toEqual(doc.mesh);
    expect(validate(next)).toEqual([]);
  });
  it("round-trips native files and rejects broken references", () => {
    const doc = castle(true);
    expect(parseDocument(JSON.stringify(doc))).toEqual(doc);
    const broken = structuredClone(doc);
    broken.castles![0].circuitId = "missing";
    expect(parseDocument(JSON.stringify(broken))).toBeNull();
    expect(parseDocument(JSON.stringify(fixture()))?.version).toBe(1);
  });
  it("preserves ownership across edge insertion, face splitting and scale", () => {
    const doc = castle(),
      circuit = doc.defenseCircuits!.find(c => c.scope === "castle")!;
    const ref = doc.mesh.faces[circuit.areaFaceIds[0]].boundary.find(
      r => !doc.gates[0].wallEdgeIds!.includes(r.edgeId)
    )!;
    const inserted = insertEdgeVertex(doc, ref.edgeId, 0.5)!;
    expect(validate(inserted.document)).toEqual([]);
    const face = doc.mesh.faces.f0;
    const ids = face.boundary.map(r => (r.forward ? doc.mesh.edges[r.edgeId].a : doc.mesh.edges[r.edgeId].b));
    const split = splitFace(doc, "f0", ids[0], ids[2]);
    expect(split).not.toBeNull();
    expect(split!.defenseCircuits!.find(c => c.scope === "castle")!.areaFaceIds).toHaveLength(2);
    expect(validate(split!)).toEqual([]);
    const scaled = scaleDocument(doc, 2)!;
    expect(validate(scaled)).toEqual([]);
    expect(scaled.castles![0].parts[0].footprint[0][0]).toBe(doc.castles![0].parts[0].footprint[0][0] * 2);
  });
  it("protects walls, gates, water classification and locked geometry", () => {
    const doc = castle(),
      id = doc.castles![0].id,
      wall = [...castleWallIds(doc)][0],
      gate = doc.gates[0];
    const opened = removeGroup(doc, wall);
    expect(opened.featureGroups.some(g => g.id === wall)).toBe(false);
    expect(opened.castles).toEqual(doc.castles);
    expect(validate(opened)).toEqual([]);
    expect(removeGroup(setCastleLocked(doc, id, true)!, wall).featureGroups.some(g => g.id === wall)).toBe(true);
    expect(removeEdgeFromGroup(doc, wall, boundaryEdges(doc.mesh, ["f0"])[0].edgeId)).toBeNull();
    expect(toggleGate(doc, gate.vertexId)).toBeNull();
    const reassigned = structuredClone(doc);
    reassigned.mesh.faces.f0.properties.ward = "market";
    expect(validate(reassigned)).toContain(`Unreserved castle area ${id}`);
    expect(setFaceWater(doc, "f0", "sea")).toBe(doc);
    const locked = setCastleLocked(doc, id, true)!;
    expect(moveVertex(locked, gate.vertexId, [10, 10])).toBeNull();
    expect(deleteCastle(locked, id)).toBeNull();
    expect(regenerateCastleInterior(locked, id)).toBeNull();
  });
  it("records an explicit town-wall opening without removing the castle curtain", () => {
    const doc = castle(true),
      owned = castleWallIds(doc),
      townWall = doc.featureGroups.find(g => g.kind === "wall" && !owned.has(g.id))!;
    const changed = removeGroup(doc, townWall.id);
    expect(changed.defenseCircuits!.find(c => c.scope === "town")!.naturalBarriers.length).toBeGreaterThan(0);
    expect(validate(changed)).toEqual([]);
    expect(changed.castles).toEqual(doc.castles);
  });
  it("preserves a locked building while changing the castle form", () => {
    const doc = castle(),
      plan = doc.castles![0],
      hall = plan.parts.find(p => p.role === "hall")!;
    const locked = setCastlePartLocked(doc, plan.id, hall.id, true)!;
    const changed = regenerateCastleInterior(locked, plan.id)!;
    expect(changed.castles![0].parts.find(p => p.role === "hall")).toEqual(
      locked.castles![0].parts.find(p => p.role === "hall")
    );
    expect(validate(changed)).toEqual([]);
  });
  it("records castle changes in undo/redo and removes only castle-owned walls", () => {
    const doc = castle(true),
      id = doc.castles![0].id,
      history = new DocumentHistory(doc);
    const changed = regenerateCastleInterior(doc, id)!;
    history.commit(changed);
    expect(history.undo()!.castles).toEqual(doc.castles);
    expect(history.redo()!.castles).toEqual(changed.castles);
    const removed = deleteCastle(changed, id)!;
    expect(removed.castles).toEqual([]);
    expect(validate(removed)).toEqual([]);
    expect(removed.featureGroups.filter(g => g.kind === "wall").length).toBeGreaterThan(0);
  });
  it("creates a replacement explicitly and cuts real gate openings", () => {
    expect(createCastleOnFace(fixture(), "f0")).not.toBeNull();
    const doc = castle(),
      p = doc.mesh.vertices[doc.gates[0].vertexId].point;
    const runs = wallRunsOutsideGates(doc, [
      [p[0], p[1] - 20],
      [p[0], p[1] + 20]
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0][1][1]).toBeCloseTo(p[1] - 2.5);
    expect(runs[1][0][1]).toBeCloseTo(p[1] + 2.5);
    expect(validateFortifications(doc)).toEqual([]);
    expect(facePoints(doc.mesh, doc.mesh.faces.f0).length).toBeGreaterThan(4);
  });
});
