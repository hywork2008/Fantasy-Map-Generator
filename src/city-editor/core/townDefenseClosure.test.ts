import { expect, it } from "vitest";
import { registerTownCircuit, updateCircuitWalls } from "./castles";
import { createGridDocument } from "./document";
import { boundaryEdges, boundaryRings } from "./fortifications";
import { polygonCentroid } from "./gen/geom";
import { facePoints, validate } from "./mesh";
import { auditTownDefenseClosure } from "./townDefenseClosure";

function town() {
  const doc = createGridDocument({ size: "small", grid: "hex", seed: "closure" });
  for (const [ring, radius] of [
    [0, 150],
    [1, 350]
  ]) {
    const faces = Object.values(doc.mesh.faces)
      .filter(f => Math.hypot(...polygonCentroid(facePoints(doc.mesh, f))) < radius)
      .map(f => f.id);
    const segments = boundaryRings(doc.mesh, boundaryEdges(doc.mesh, faces))[0];
    doc.featureGroups.push({
      id: `wall-${ring}`,
      kind: "wall",
      name: "Curtain",
      segments,
      style: { widthMeters: 4, color: "#41382e" },
      locked: false
    });
    registerTownCircuit(doc, [], true, faces, ring);
  }
  return doc;
}

it("detects an inner-bank opening even behind an intact outer curtain", () => {
  const doc = town(),
    original = structuredClone(doc);
  expect(auditTownDefenseClosure(doc, "gc:defense-town-0")).toMatchObject({
    ok: true,
    undefendedLengthMeters: 0,
    invasionPaths: 0
  });
  expect(doc).toEqual(original);
  const wall = doc.featureGroups.find(g => g.id === "wall-0")!;
  if (wall.kind !== "wall") throw new Error("Missing wall");
  const ref = wall.segments.shift()!;
  const edge = doc.mesh.edges[ref.edgeId];
  doc.featureGroups.push({
    id: "river",
    kind: "river",
    name: "River bank",
    vertices: [edge.a, edge.b],
    source: null,
    mouth: null,
    style: { widthMeters: 12, color: "#4f8aad" },
    locked: false
  });
  updateCircuitWalls(doc, doc.defenseCircuits![0]);
  // The structural validator accepts a recorded natural opening.
  doc.featureGroups.pop();
  expect(validate(doc)).toEqual([]);
  doc.featureGroups.push({
    id: "river",
    kind: "river",
    name: "River bank",
    vertices: [edge.a, edge.b],
    source: null,
    mouth: null,
    style: { widthMeters: 12, color: "#4f8aad" },
    locked: false
  });
  const report = auditTownDefenseClosure(doc, "gc:defense-town-0");
  expect(report.ok).toBe(false);
  expect(report.riverOpeningLengthMeters).toBeGreaterThan(0);
  expect(report.disconnectedEnds).toBe(2);
  // Remove the water barrier: an attacker can now cross the land gap; the
  // intact outer circuit must not hide this inner-wall defect.
  doc.featureGroups.pop();
  expect(auditTownDefenseClosure(doc, "gc:defense-town-0").invasionPaths).toBeGreaterThan(0);
  expect(auditTownDefenseClosure(doc, "gc:defense-town-1").ok).toBe(true);
});

it("exempts an explicitly razed old wall from the defence requirement", () => {
  const doc = town();
  doc.defenseCircuits![0].state = "razed";
  doc.featureGroups = doc.featureGroups.filter(g => g.id !== "wall-0");
  updateCircuitWalls(doc, doc.defenseCircuits![0]);
  expect(auditTownDefenseClosure(doc, "gc:defense-town-0").ok).toBe(true);
});

it("does not mistake an enclosed castle for an unprotected hole", () => {
  const doc = town(),
    inner = doc.defenseCircuits![0];
  const id = inner.areaFaceIds.reduce((a, b) =>
    Math.hypot(...polygonCentroid(facePoints(doc.mesh, doc.mesh.faces[a]))) <
    Math.hypot(...polygonCentroid(facePoints(doc.mesh, doc.mesh.faces[b])))
      ? a
      : b
  );
  const segments = boundaryRings(doc.mesh, boundaryEdges(doc.mesh, [id]))[0];
  doc.featureGroups.push({
    id: "castle-wall",
    kind: "wall",
    name: "Castle",
    segments,
    style: { widthMeters: 4, color: "#41382e" },
    locked: false
  });
  inner.areaFaceIds = inner.areaFaceIds.filter(f => f !== id);
  doc.defenseCircuits!.push({
    id: "castle",
    scope: "castle",
    areaFaceIds: [id],
    wallGroupIds: ["castle-wall"],
    naturalBarriers: [],
    locked: false
  });
  updateCircuitWalls(doc, inner);
  expect(auditTownDefenseClosure(doc, inner.id).ok).toBe(true);
});

it("rejects an underwater curtain without a full-width water gate", () => {
  const doc = town();
  const ref = boundaryEdges(doc.mesh, doc.defenseCircuits![0].areaFaceIds)[0];
  const edge = doc.mesh.edges[ref.edgeId],
    a = doc.mesh.vertices[edge.a].point,
    b = doc.mesh.vertices[edge.b].point;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  doc.waterAreas = [
    {
      kind: "river",
      polygon: [
        [mid[0] - 15, mid[1] - 15],
        [mid[0] + 15, mid[1] - 15],
        [mid[0] + 15, mid[1] + 15],
        [mid[0] - 15, mid[1] + 15]
      ]
    }
  ];
  const report = auditTownDefenseClosure(doc, "gc:defense-town-0");
  expect(report.ok).toBe(false);
  expect(report.issues.some(issue => issue.includes("Submerged curtain"))).toBe(true);
});
