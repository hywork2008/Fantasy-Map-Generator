import { describe, expect, it } from "vitest";
import { ENCLOSED_GUILD_HALL } from "../../buildings/medieval/enclosedGuildHall";
import { placementFootprint } from "../../buildings/placementModels";
import { createTownObjects } from "../../city3d/three/objectMeshes";
import { buildBlockFabric } from "../generators/blockInfill";
import type { DistrictFabric } from "../generators/blockInfill.types";
import { createDocument } from "../generators/document";
import { bvLandmarkElements } from "../generators/landmarkIntegration";
import { accessCorridor } from "../generators/landmarks";
import { meshFromCells } from "../generators/mesh";
import { intersectConvex, plotArea } from "../generators/parcelGeometry";
import { residentialCapacity } from "../generators/residentialCapacityFormula";
import { collectCityStructures } from "../renderers/structureMassing";
import type { Point } from "../types/document";
import { allocateBVFacilities } from "./allocateBVFacilities";
import { bvFacilityAsset } from "./bvFacilityAsset";
import { parseDocument, serializeDocument } from "./io/documentCodec";

const modelId = "trade-hall.guild-enclosed.textiles";
const asset = () =>
  bvFacilityAsset(modelId, [
    { id: "main", position: ENCLOSED_GUILD_HALL.main.position, clearWidth: ENCLOSED_GUILD_HALL.main.clearWidth }
  ]);
function city(width = 120, depth = 80) {
  const document = createDocument("trade-allocation", 400);
  const polygon: Point[] = [
    [-width / 2, 0],
    [width / 2, 0],
    [width / 2, depth],
    [-width / 2, depth]
  ];
  document.mesh = meshFromCells([
    { id: 0, polygon, site: [0, depth / 2], centroid: [0, depth / 2], neighbors: [], onBorder: true }
  ]);
  document.elements = [];
  document.featureGroups = [];
  document.gates = [];
  Object.assign(document.mesh.faces.f0.properties, {
    water: "land",
    elevation: 3,
    ward: "merchant",
    buildable: true,
    locked: false,
    settlement: "core"
  });
  const road = Object.values(document.mesh.edges).find(
    e => document.mesh.vertices[e.a].point[0] === -width / 2 && document.mesh.vertices[e.b].point[0] === -width / 2
  )!;
  document.featureGroups = [
    {
      id: "public-road",
      kind: "road",
      name: "Road",
      locked: false,
      style: { widthMeters: 2, color: "#888" },
      segments: [{ edgeId: road.id, forward: true }]
    }
  ];
  return document;
}
describe("BV facilities in existing buildable blocks", () => {
  it("uses measured BV area and a connected existing lane without moving the lane or its junction", () => {
    const document = city(),
      hall = asset();
    const fabric: DistrictFabric = {
      buildings: [],
      farms: [],
      entrances: new Map(),
      lanes: [
        {
          faceId: "f0",
          points: [
            [-59, 30],
            [59, 30]
          ],
          widthMeters: 2
        },
        {
          faceId: "f0",
          points: [
            [0, 30],
            [0, 78]
          ],
          widthMeters: 2
        }
      ]
    };
    const before = JSON.stringify([document, fabric, hall]);
    const result = allocateBVFacilities(document, fabric, [{ id: "guild:textiles", asset: hall }], 1000);
    expect(result.placed).toEqual(["guild:textiles"]);
    const placed = result.document.landmarks![0],
      footprint = placementFootprint(modelId, "low")!;
    expect(plotArea(placed.site[0].outer)).toBeCloseTo(footprint.halfX * footprint.halfZ * 4, 6);
    expect(placed.scale).toBe(1);
    expect(placed.accesses[0].target.kind).toBe("lane");
    for (const lane of fabric.lanes)
      for (const band of accessCorridor(lane.points, lane.widthMeters))
        expect(plotArea(intersectConvex(placed.site[0].outer, band.outer))).toBeLessThan(1e-6);
    expect(JSON.stringify([document, fabric, hall])).toBe(before);
  });
  it("rejects a block split by a lane rather than putting the facility over the junction or shrinking it", () => {
    const document = city(14, 10),
      hall = asset();
    const fabric: DistrictFabric = {
      buildings: [],
      farms: [],
      entrances: new Map(),
      lanes: [
        {
          faceId: "f0",
          points: [
            [-7, 5],
            [7, 5]
          ],
          widthMeters: 2
        }
      ]
    };
    expect(14 * 10).toBeGreaterThan(hall.referenceSizeMeters[0] * hall.referenceSizeMeters[1]);
    const result = allocateBVFacilities(document, fabric, [{ id: "guild:textiles", asset: hall }]);
    expect(result.placed).toEqual([]);
    expect(result.document).toBe(document);
    expect(result.unplaced).toHaveLength(1);
  });
  it("rebuilds housing with the existing reservation pipeline, preserves streets and renders a single BV model after native reload", () => {
    const document = city(200, 120),
      fabric = buildBlockFabric(document),
      hall = asset();
    const result = allocateBVFacilities(document, fabric, [{ id: "guild:textiles", asset: hall }], 10000);
    expect(result.placed).toHaveLength(1);
    const after = buildBlockFabric(result.document);
    expect(after.lanes).toEqual(fabric.lanes);
    expect(result.housing.afterCapacity).toBe(after.buildings.reduce((n, b) => n + residentialCapacity(b), 0));
    expect(result.housing.shortfall).toBe(Math.max(0, 10000 - result.housing.afterCapacity));
    expect(after.buildings.length).toBeLessThan(fabric.buildings.length);
    expect(result.housing.lostCapacity).toBe(Math.max(0, result.housing.beforeCapacity - result.housing.afterCapacity));
    const loaded = parseDocument(serializeDocument(result.document))!;
    expect(loaded?.landmarks).toEqual(result.document.landmarks);
    const objects = bvLandmarkElements(loaded);
    expect(objects).toHaveLength(1);
    expect(objects[0].objectType).toBe(modelId);
    const meshes = createTownObjects(objects);
    expect(meshes.group.children.length).toBeGreaterThan(0);
    meshes.dispose();
    expect(collectCityStructures(loaded).some(s => s.id.startsWith("landmark:guild:textiles"))).toBe(false);
    loaded.landmarks![0].scale = 0.5;
    expect(parseDocument(serializeDocument(loaded))).toBeNull();
  });
});
