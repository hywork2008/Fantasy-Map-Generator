import { expect, it } from "vitest";
import { harborCraneFoundationFootprint } from "../../buildings/medieval/harborCraneDimensions";
import { renderEditorSvg } from "../renderers/editorSvg";
import type { CityDocument, Point } from "../types/document";
import { buildBlockFabric, buildHarborPlan } from "./blockInfill";
import { createDocument, createSizedDocument } from "./document";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { pointInPolygon, polygonCentroid } from "./geom";
import { polygonsOverlap } from "./harborCargo";
import { planHarbor } from "./harborFabric";
import { facePoints, meshFromCells } from "./mesh";
import { corridor, intersectConvex, plotArea } from "./parcelGeometry";

it.each([
  ["straight", "reference-town", "tiny"],
  ["bay", "complete-b", "tiny"],
  ["cape", "complete-c", "tiny"],
  ["straight", "reference-town", "small"],
  ["bay", "complete-b", "small"],
  ["cape", "complete-c", "small"]
] as const)("provides a quay crane in a generated %s port with berthed ships (%s, %s)", (coast, seed, size) => {
  const settings = defaultGenerationSettings();
  settings.config.coast = coast;
  settings.config.rivers = [];
  settings.config.relief = false;
  settings.config.features.port = true;
  settings.buildingPattern = "medieval";
  const city = generateCityOnDocument(createSizedDocument(size, "crane-port"), settings, seed)!;
  expect(city).not.toBeNull();
  const ships = city.elements.filter(e => e.kind === "ship");
  const harbor = buildHarborPlan(city)!;
  expect(ships.length).toBeGreaterThan(0);
  expect(harbor.cranes.length).toBeGreaterThan(0);
  const fabric = buildBlockFabric(city);
  for (const crane of harbor.cranes) {
    const footprint = harborCraneFoundationFootprint(crane.point, crane.armAngleRad);
    const hook: Point = [
      crane.point[0] + Math.cos(crane.armAngleRad) * crane.armLengthMeters,
      crane.point[1] + Math.sin(crane.armAngleRad) * crane.armLengthMeters
    ];
    expect(
      Object.values(city.mesh.faces).some(
        face => face.properties.water !== "land" && pointInPolygon(hook, facePoints(city.mesh, face))
      )
    ).toBe(true);
    const covered = harbor.spaces.reduce((sum, space) => sum + plotArea(intersectConvex(footprint, space.polygon)), 0);
    expect(covered).toBeCloseTo(plotArea(footprint), 3);
    expect(fabric.buildings.some(b => polygonsOverlap(footprint, b.polygon))).toBe(false);
    for (const road of city.featureGroups.filter(g => g.kind === "road" || g.kind === "plank"))
      for (const ref of road.segments) {
        const edge = city.mesh.edges[ref.edgeId];
        const roadPolygon = corridor(
          city.mesh.vertices[edge.a].point,
          city.mesh.vertices[edge.b].point,
          road.style.widthMeters
        );
        expect(polygonsOverlap(footprint, roadPolygon)).toBe(false);
      }
  }
});

function threeQuays(): CityDocument {
  const city = createDocument("three-crane-quays", 800);
  const polygons: Point[][] = [];
  for (let i = 0; i < 3; i++)
    for (const x of [-100, 0])
      polygons.push([
        [x, i * 80],
        [x + 100, i * 80],
        [x + 100, i * 80 + 80],
        [x, i * 80 + 80]
      ]);
  city.mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: false
    }))
  );
  Object.values(city.mesh.faces).forEach((f, i) => {
    Object.assign(f.properties, {
      water: i % 2 ? "land" : "sea",
      ward: i % 2 ? "harbor" : null,
      buildable: !!(i % 2),
      depth: 6
    });
  });
  city.elements = [];
  city.featureGroups = [];
  city.gates = [];
  return city;
}

it("tries later quays when the highest ranked shore cannot accept the foundation", () => {
  const city = threeQuays();
  const streets = [0, 1, 2].map(i => ({ a: [90, i * 80] as Point, b: [90, i * 80 + 80] as Point, widthMeters: 5 }));
  const harbor = planHarbor(city, streets, [], polygon => {
    const xs = polygon.map(p => p[0]),
      ys = polygon.map(p => p[1]);
    return (
      Math.max(...xs) - Math.min(...xs) > 10 ||
      Math.max(...ys) - Math.min(...ys) > 10 ||
      polygonCentroid(polygon)[1] >= 160
    );
  });
  expect(harbor.cranes).toHaveLength(1);
  expect(harbor.cranes[0].point[1]).toBeGreaterThan(160);
  const footprint = harborCraneFoundationFootprint(harbor.cranes[0].point, harbor.cranes[0].armAngleRad);
  const face = Object.values(city.mesh.faces).find(
    f => f.properties.water === "land" && pointInPolygon(harbor.cranes[0].point, facePoints(city.mesh, f))
  )!;
  expect(footprint.every(p => pointInPolygon(p, facePoints(city.mesh, face)))).toBe(true);
  expect(planHarbor(city, streets, [], () => false).cranes).toEqual([]);
});

it("also equips a legacy Coast + Port generation with a crane", () => {
  const settings = defaultGenerationSettings();
  settings.config.coast = "straight";
  settings.config.rivers = [];
  settings.config.relief = false;
  settings.config.features.port = true;
  settings.buildingPattern = "legacy";
  const city = generateCityOnDocument(createSizedDocument("tiny", "crane-port"), settings, "reference-town")!;
  expect(city.elements.some(e => e.kind === "ship")).toBe(true);
  const fabric = buildBlockFabric(city),
    harbor = buildHarborPlan(city)!;
  expect(harbor.cranes.length).toBeGreaterThan(0);
  const svg = renderEditorSvg(
    city,
    "select",
    { faceId: null, edgeId: null, vertexId: null, groupId: null },
    "-300 -300 600 600",
    1
  );
  expect(svg.querySelectorAll(".ce-crane")).toHaveLength(harbor.cranes.length);
  expect(svg.querySelectorAll(".ce-crane-foundation")).toHaveLength(harbor.cranes.length);
  for (const crane of harbor.cranes) {
    const footprint = harborCraneFoundationFootprint(crane.point, crane.armAngleRad);
    const hook: Point = [
      crane.point[0] + Math.cos(crane.armAngleRad) * crane.armLengthMeters,
      crane.point[1] + Math.sin(crane.armAngleRad) * crane.armLengthMeters
    ];
    expect(
      Object.values(city.mesh.faces).some(
        face => face.properties.water !== "land" && pointInPolygon(hook, facePoints(city.mesh, face))
      )
    ).toBe(true);
    for (const lane of fabric.lanes)
      for (let i = 1; i < lane.points.length; i++)
        expect(polygonsOverlap(footprint, corridor(lane.points[i - 1], lane.points[i], lane.widthMeters))).toBe(false);
  }
});
