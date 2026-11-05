import { describe, expect, it } from "vitest";
import { ENCLOSED_GUILD_HALL } from "../../buildings/medieval/enclosedGuildHall";
import { placementFootprint } from "../../buildings/placementModels";
import { createTownObjects } from "../../city3d/three/objectMeshes";
import { collectCityStructures } from "../renderers/structureMassing";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import type { Point } from "../types/document";
import { allocateBVFacilities } from "./allocateBVFacilities";
import { buildBlockFabric } from "./blockInfill";
import type { DistrictFabric } from "./blockInfill.types";
import { bvFacilityAsset } from "./bvFacilityAsset";
import { createDocument } from "./document";
import { nearestOnPolyline, polygonCentroid } from "./geom";
import { bvLandmarkElements } from "./landmarkIntegration";
import { accessCorridor } from "./landmarks";
import { meshFromCells } from "./mesh";
import { intersectConvex, plotArea } from "./parcelGeometry";
import { residentialCapacity } from "./residentialCapacityFormula";

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
    expect(["lane", "road"]).toContain(placed.accesses[0].target.kind);
    for (const lane of fabric.lanes)
      for (const band of accessCorridor(lane.points, lane.widthMeters))
        expect(plotArea(intersectConvex(placed.site[0].outer, band.outer))).toBeLessThan(1e-6);
    expect(JSON.stringify([document, fabric, hall])).toBe(before);
  });
  it("keeps a river-bound facility in the outskirts within its bank-distance limit", () => {
    const document = city();
    document.mesh.faces.f0.properties.settlement = "outskirts";
    const bank = Object.values(document.mesh.edges).find(
      e => document.mesh.vertices[e.a].point[0] === 60 && document.mesh.vertices[e.b].point[0] === 60
    )!;
    document.featureGroups.push({
      id: "river",
      kind: "river",
      name: "River",
      locked: false,
      vertices: [bank.a, bank.b],
      source: null,
      mouth: null,
      style: { widthMeters: 4, color: "#68a" }
    });
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
        }
      ]
    };
    const allocation = allocateBVFacilities(document, fabric, [
      { id: "river-facility", asset: asset(), zone: "outskirts", riverbankMaxDistanceMeters: 25 }
    ]);
    expect(allocation.placed).toHaveLength(1);
    const center = polygonCentroid(allocation.document.landmarks![0].site[0].outer);
    expect(
      nearestOnPolyline(center, [document.mesh.vertices[bank.a].point, document.mesh.vertices[bank.b].point]).dist
    ).toBeLessThanOrEqual(27);
  });
  it("uses unlocked adjoining field cells for a long outskirts site, while preserving streets and locked land", () => {
    const document = city();
    const rectangle = (x: number): Point[] => [
      [x, 0],
      [x + 40, 0],
      [x + 40, 30],
      [x, 30]
    ];
    document.mesh = meshFromCells(
      [0, 1].map(id => ({
        id,
        polygon: rectangle(id * 40),
        site: [id * 40 + 20, 15],
        centroid: [id * 40 + 20, 15],
        neighbors: [1 - id],
        onBorder: true
      }))
    );
    for (const face of Object.values(document.mesh.faces))
      Object.assign(face.properties, {
        water: "land",
        elevation: 3,
        buildable: true,
        settlement: "outskirts",
        ward: "farm",
        locked: false
      });
    const roadEdges = Object.values(document.mesh.edges).filter(
      e => document.mesh.vertices[e.a].point[1] === 0 && document.mesh.vertices[e.b].point[1] === 0
    );
    document.featureGroups = [
      {
        id: "road",
        kind: "road",
        name: "Road",
        locked: false,
        style: { widthMeters: 2, color: "#888" },
        segments: roadEdges.map(e => ({ edgeId: e.id, forward: true }))
      }
    ];
    const outer: Point[] = [
      [-30, -2.5],
      [30, -2.5],
      [30, 2.5],
      [-30, 2.5]
    ];
    const longSite = {
      ...asset(),
      bvModel: undefined,
      referenceSizeMeters: [60, 5] as [number, number],
      minimumSite: [{ outer, holes: [] }],
      footprint: [{ outer, holes: [] }],
      entrances: [
        { id: "main", point: [0, -2.5] as Point, outward: [0, -1] as Point, widthMeters: 1.4, required: true }
      ]
    };
    const fabric: DistrictFabric = {
      buildings: [],
      lanes: [],
      entrances: new Map(),
      farms: Object.values(document.mesh.faces).map(f => ({
        faceId: f.id,
        polygon: rectangle(f.id === "f0" ? 0 : 40),
        rows: []
      }))
    };
    const requests = [{ id: "ropewalk", asset: longSite, zone: "outskirts" as const }];
    expect(allocateBVFacilities(document, fabric, requests).placed).toEqual([]);
    const placed = allocateBVFacilities(document, fabric, requests, 0, { allowOutskirtsFields: true });
    expect(placed.placed).toEqual(["ropewalk"]);
    expect(plotArea(placed.document.landmarks![0].site[0].outer)).toBeCloseTo(300);
    expect(placed.document.featureGroups).toEqual(document.featureGroups);
    const locked = structuredClone(document);
    locked.mesh.faces.f1.properties.locked = true;
    expect(allocateBVFacilities(locked, fabric, requests, 0, { allowOutskirtsFields: true }).placed).toEqual([]);
    const street = structuredClone(document);
    const boundary = Object.values(street.mesh.edges).find(e => e.leftFace && e.rightFace)!;
    street.featureGroups.push({
      id: "cross-road",
      kind: "road",
      name: "Cross road",
      locked: false,
      style: { widthMeters: 2, color: "#888" },
      segments: [{ edgeId: boundary.id, forward: true }]
    });
    expect(allocateBVFacilities(street, fabric, requests, 0, { allowOutskirtsFields: true }).placed).toEqual([]);
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
