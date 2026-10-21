import { describe, expect, it } from "vitest";
import { parseDocument } from "../services/io/documentCodec";
import type { CityDocument, Point } from "../types/document";
import { buildBlockFabric } from "./blockInfill";
import { polygonArea, polygonCentroid } from "./geom";
import { DocumentHistory } from "./history";
import { meshFromCells } from "./mesh";
import { corridor, intersectConvex } from "./parcelGeometry";
import { cultivateRoadside, regenerateRuralLand } from "./roadsideFarms";
import { applyRuralFields } from "./ruralFields";
import { ruralSuitability } from "./ruralSuitability";

function city(): CityDocument {
  const polygons: Point[][] = [
    [
      [0, 0],
      [240, 0],
      [240, 400],
      [0, 400]
    ],
    [
      [240, 0],
      [480, 0],
      [480, 400],
      [240, 400]
    ]
  ];
  const mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: true
    }))
  );
  for (const face of Object.values(mesh.faces))
    Object.assign(face.properties, { ward: "farm", settlement: "outskirts", buildable: true, water: "land" });
  const road = Object.values(mesh.edges).find(
    edge => mesh.vertices[edge.a].point[1] === 0 && mesh.vertices[edge.b].point[1] === 0
  )!;
  return {
    format: "fmg-city-editor",
    version: 1,
    generationSeed: "rural-regression",
    ruralFieldVersion: 1,
    frame: { extentMeters: 1000, cityRadiusMeters: 300, blockSizeMeters: 80 },
    mesh,
    gates: [],
    elements: [],
    featureGroups: [
      {
        id: "road",
        kind: "road",
        name: "Road",
        locked: false,
        segments: [{ edgeId: road.id, forward: true }],
        style: { widthMeters: 6, color: "brown" }
      }
    ]
  };
}
const emptyFabric = () => ({ buildings: [], farms: [], lanes: [], entrances: new Map() });

describe("CE rural field integration", () => {
  it("expands rural land away from highways without retagging locked or occupied land", () => {
    const document = city();
    document.mesh.faces.f1.properties.ward = "empty";
    document.featureGroups = [];
    cultivateRoadside(document);
    expect(document.mesh.faces.f1.properties.ward).toBe("farm");
    document.mesh.faces.f1.properties.ward = "empty";
    document.mesh.faces.f1.properties.locked = true;
    cultivateRoadside(document);
    expect(document.mesh.faces.f1.properties.ward).toBe("empty");
    document.mesh.faces.f1.properties.locked = false;
    document.mesh.faces.f1.properties.ward = "cemetery";
    cultivateRoadside(document);
    expect(document.mesh.faces.f1.properties.ward).toBe("cemetery");
  });

  it("preserves the generation version on save and uses the common pass without a fabric plan", () => {
    const document = city();
    const saved = parseDocument(JSON.stringify(document))!;
    expect(saved).toBeTruthy();
    expect(saved.ruralFieldVersion).toBe(1);
    const fabric = buildBlockFabric(saved);
    expect(fabric.farms.length).toBeGreaterThan(0);
    expect(fabric.lanes.some(lane => lane.kind === "farm-track")).toBe(true);
    expect(fabric.farms.map(farm => farm.polygon)).toEqual(buildBlockFabric(document).farms.map(farm => farm.polygon));
    const legacy = { ...document, ruralFieldVersion: undefined };
    expect(buildBlockFabric(legacy).ruralFields).toBeUndefined();
    expect(parseDocument(JSON.stringify({ ...document, ruralFieldVersion: 99 }))).toBeNull();
  });

  it("persists v2 settings and quality, rejects invalid data and invalidates cached suitability", () => {
    const document = city();
    document.ruralFieldVersion = 2;
    document.ruralFieldSettings = { system: "bocage", rotationYear: 2, gardenRadiusMeters: 0 };
    const saved = parseDocument(JSON.stringify(document))!;
    expect(saved.ruralFieldSettings).toEqual(document.ruralFieldSettings);
    expect(buildBlockFabric(saved).farms.some(farm => farm.boundaryKind === "hedge")).toBe(true);
    document.farmlandAreaHectares = 5;
    for (const face of Object.values(document.mesh.faces)) face.properties.farming = { soilQuality: 0.1, wetness: 0.9 };
    const blocked = buildBlockFabric(document);
    expect(blocked.farms).toHaveLength(0);
    expect(blocked.ruralFields?.shortfallReason).toBe("terrain");
    expect(blocked.ruralFields?.suitabilitySource).toBe("survey");
    document.mesh.faces.f0.properties.farming = { soilQuality: 0.8, wetness: 0.2 };
    expect(buildBlockFabric(document).farms.length).toBeGreaterThan(0);
    expect(parseDocument(JSON.stringify(document))).not.toBeNull();
    document.mesh.faces.f0.properties.farming = { soilQuality: 2 };
    expect(parseDocument(JSON.stringify(document))).toBeNull();
    expect(parseDocument(JSON.stringify({ ...saved, ruralFieldSettings: { rotationYear: -1 } }))).toBeNull();
  });

  it("uses the continuous terrain model and labels biome inference without inventing soil measurements", () => {
    const document = city();
    document.ruralFieldVersion = 2;
    document.mesh.faces.f0.properties.elevation = 0;
    document.mesh.faces.f1.properties.elevation = 200;
    const suitability = ruralSuitability(document);
    const polygon: Point[] = [
      [200, 100],
      [230, 100],
      [230, 200],
      [200, 200]
    ];
    expect(suitability.steep(polygon)).toBe(true);
    expect(suitability.steepArea(polygon)).toBeGreaterThan(0);
    document.biome = { id: 1, key: "wetland", name: "Wetland", color: "green" };
    expect(ruralSuitability(document).source).toBe("biome-estimate");
    expect(ruralSuitability(document).accepts("f0")).toBe(false);
    document.mesh.faces.f0.properties.farming = { soilQuality: 0.8, wetness: 0.2 };
    expect(ruralSuitability(document).accepts("f0")).toBe(true);
  });

  it("upgrades a legacy city without mutating it and can undo the upgrade", () => {
    const document = city();
    delete document.ruralFieldVersion;
    const original = structuredClone(document);
    const next = regenerateRuralLand(document);
    expect(document).toEqual(original);
    expect(next.ruralFieldVersion).toBe(2);
    const history = new DocumentHistory(document);
    history.commit(next);
    expect(history.undo(next)).toEqual(document);
    expect(history.redo(document)).toEqual(next);
  });

  it("keeps adopted plots and access off buildings and reserves locked farm area first", () => {
    const document = city();
    document.farmlandAreaHectares = 2;
    document.mesh.faces.f1.properties.locked = true;
    const fixed = {
      faceId: "f1",
      polygon: [
        [260, 20],
        [300, 20],
        [300, 60],
        [260, 60]
      ] as Point[],
      rows: []
    };
    const building = {
      faceId: "f0",
      polygon: [
        [80, 80],
        [136, 80],
        [136, 200],
        [80, 200]
      ] as Point[]
    };
    const fabric = applyRuralFields(document, { ...emptyFabric(), farms: [fixed], buildings: [building] } as Parameters<
      typeof applyRuralFields
    >[1]);
    expect(fabric.farms).toContain(fixed);
    expect(fabric.farms.length).toBeGreaterThan(1);
    expect(fabric.farms.reduce((sum, farm) => sum + Math.abs(polygonArea(farm.polygon)), 0)).toBeLessThanOrEqual(
      20_000 + 1e-6
    );
    for (const farm of fabric.farms)
      expect(Math.abs(polygonArea(intersectConvex(farm.polygon, building.polygon)))).toBeLessThan(0.01);
    for (const lane of fabric.lanes)
      expect(
        Math.abs(
          polygonArea(intersectConvex(corridor(lane.points[0], lane.points[1], lane.widthMeters), building.polygon))
        )
      ).toBeLessThan(0.01);
    document.farmlandAreaHectares = 0;
    expect(applyRuralFields(document, { ...emptyFabric(), farms: [fixed] }).farms).toEqual([fixed]);
  });

  it("invalidates fields when a contributing face other than the representative is locked", () => {
    const document = city();
    const before = buildBlockFabric(document);
    expect(before.farms.some(farm => farm.sourceFaceIds?.includes("f1"))).toBe(true);
    document.mesh.faces.f1.properties.locked = true;
    const after = buildBlockFabric(document);
    expect(after).not.toBe(before);
    expect(after.farms.filter(farm => farm.plotId).every(farm => !farm.sourceFaceIds?.includes("f1"))).toBe(true);
  });
});
