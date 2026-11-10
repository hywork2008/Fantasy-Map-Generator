import { describe, expect, it } from "vitest";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { createVectorScene } from "../../renderers/vector/scene3d";
import { parseVectorDocument, serializeVectorDocument } from "../../services/io/vector/documentCodec";
import { createVectorDocument } from "./document";
import { rebuildRoadGraph } from "./editing/network";
import { curveSource } from "./editing/paths";
import { addVectorFeature, removeVectorFeature, type VectorFeatureDraft } from "./features";
import { bridgeGeometry } from "./geometry/network";
import { vectorWaterSurfaces } from "./geometry/water";

const input = () => {
  const doc = createVectorDocument();
  doc.paths.road = {
    id: "road",
    revision: 0,
    role: "road",
    origin: "manual",
    editPolicy: "editable",
    source: curveSource(
      [
        [100, -150],
        [100, 150]
      ],
      "polyline",
      false
    ),
    width: { leftMeters: 3, rightMeters: 3, stations: [] }
  };
  rebuildRoadGraph(doc);
  return doc;
};
const draft = (kind: VectorFeatureDraft["kind"]): VectorFeatureDraft => ({
  kind,
  roadId: "road",
  boundary: {
    outer: [
      [-40, -40],
      [40, -40],
      [40, 40],
      [-40, 40]
    ],
    holes: []
  },
  density: 0.7,
  heightMeters: 14,
  activity: "market-day",
  culture: "stone",
  moatWidthMeters: 0
});
describe("M8 feature reservations and persisted detail", () => {
  it("adopts a castle circuit, shared gate and orthogonal moat crossing, and removes them atomically", () => {
    const original = input(),
      before = JSON.stringify(original),
      doc = addVectorFeature(original, { ...draft("castle"), moatWidthMeters: 4 });
    expect(Object.values(doc.connections.circuits)).toHaveLength(1);
    expect(Object.values(doc.connections.gates)).toHaveLength(1);
    const bridge = Object.values(doc.connections.bridges)[0];
    expect(bridgeGeometry(doc, bridge, vectorWaterSurfaces(doc)).skewDegrees).toBeLessThan(1);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
    const feature = Object.values(doc.environment!.features)[0];
    expect(feature.pieces.filter(p => p.role === "structure").length).toBeGreaterThan(4);
    const removed = removeVectorFeature(doc, feature.id);
    expect(Object.keys(removed.paths)).toEqual(["road"]);
    expect(Object.keys(removed.connections.gates)).toHaveLength(0);
    expect(JSON.stringify(original)).toBe(before);
  });
  it.each(["market", "temple", "cemetery", "park", "farm", "forest"] as const)(
    "keeps %s geometry identical through native, 2D and 3D",
    kind => {
      const doc = addVectorFeature(input(), draft(kind)),
        feature = Object.values(doc.environment!.features)[0];
      expect(feature.pieces.length).toBeGreaterThan(0);
      const data = vectorRenderData(parseVectorDocument(serializeVectorDocument(doc))!);
      const pieces = data.surfaces.filter(s => s.kind === "feature");
      expect(pieces).toHaveLength(feature.pieces.length + 1);
      const scene = createVectorScene(data);
      expect(scene.group.children.filter(n => n.userData.kind === "feature")).toHaveLength(pieces.length);
      scene.dispose();
    }
  );
  it("reserves a dry quay, cargo route and waterborne ship on the nearest bank", () => {
    const doc = input();
    doc.paths.river = {
      id: "river",
      role: "river",
      origin: "manual",
      editPolicy: "editable",
      revision: 0,
      source: curveSource(
        [
          [-60, -150],
          [-60, 150]
        ],
        "polyline",
        false
      ),
      width: { leftMeters: 10, rightMeters: 10, stations: [] }
    };
    const port = addVectorFeature(doc, {
        ...draft("harbor"),
        riverId: "river",
        boundary: {
          outer: [
            [-48, -30],
            [20, -30],
            [20, 30],
            [-48, 30]
          ],
          holes: []
        }
      }),
      f = Object.values(port.environment!.features)[0];
    expect(f.pieces.map(p => p.role)).toEqual(expect.arrayContaining(["quay", "ship", "cargo"]));
    expect(f.pathIds.some(id => id.endsWith(":quay-access"))).toBe(true);
    expect(parseVectorDocument(serializeVectorDocument(port))).toEqual(port);
  });
  it("places a measured BV asset without resizing it to the site", () => {
    const doc = addVectorFeature(input(), { ...draft("temple"), modelId: "house:mediterranean", heightMeters: 30 });
    const feature = Object.values(doc.environment!.features)[0];
    expect(feature.placementIds).toHaveLength(1);
    const p = doc.placements[feature.placementIds[0]];
    expect(p.display!.heightMeters).toBeGreaterThan(0);
    const scene = createVectorScene(vectorRenderData(doc));
    expect(scene.group.children.find(o => o.userData.id === p.id)?.userData.representation).toBe("bv");
    scene.dispose();
  });
  it("enforces defensive technology, dry sites, access and fixed ownership", () => {
    expect(() => addVectorFeature(input(), draft("bastion"))).toThrow("feature-period");
    const doc = input();
    doc.context.historicalPeriod = "ageOfExploration";
    expect(addVectorFeature(doc, draft("bastion")).environment).toBeDefined();
    const castle = addVectorFeature(input(), draft("castle")),
      f = Object.values(castle.environment!.features)[0];
    f.editPolicy = "fixed";
    for (const id of f.pathIds) castle.paths[id].editPolicy = "fixed";
    expect(() => removeVectorFeature(castle, f.id)).toThrow("feature-fixed");
    expect(() => addVectorFeature(input(), { ...draft("forest"), roadId: "absent" })).toThrow("feature-road-required");
  });
});
