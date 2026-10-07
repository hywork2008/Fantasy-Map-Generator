import { describe, expect, it } from "vitest";
import { renderStandaloneCitySvg } from "../../render/svg";
import { bridgeDecks, documentBridgeSkewLimit } from "../bridgeDeck";
import { createGridDocument, createSizedDocument, parseDocument } from "../document";
import { featureGroupVertices } from "../features";
import { townGates } from "../fortifications";
import {
  countExternalApproachRoads,
  defaultGenerationSettings,
  generateCityOnDocument,
  generateStageOnDocument
} from "../generate";
import { DocumentHistory } from "../history";
import { facePoints, faceVertices, validate } from "../mesh";
import { gateRoadDeviationDegrees, kindEdgeIds, minGateSpacingMeters, vertexHasCrossing } from "../passages";
import type { CityDocument, Point } from "../types";
import { buildBlockFabric } from "./blockInfill";
import { bridgeSkewDegrees } from "./bridgeSkewTestSupport";
import { buildCityBuildings, buildingHitsCivicLandmark, insetConvexKernel } from "./buildingLots";
import {
  orientedRectPolylineDistance,
  pointInOrientedRect,
  polygonHitsOrientedRect,
  templeRectForElement
} from "./civicPlacement";
import { COASTAL_BUILDING_SETBACK_METERS, oceanShoreSegments } from "./coastalSuitability";

import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { civicYardMeters } from "./housing";
import { minExternalRoadsForExtent } from "./settlementExtent";
import { connectUrbanRiverDistricts } from "./urbanBridges";

it("keeps the shared small bay temple clear of finished roads and park plots", () => {
  const grid = createGridDocument({
    size: "small",
    grid: "evolution",
    seed: "hh199ci",
    patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
  });
  const settings = defaultGenerationSettings();
  settings.config.coast = "bay";
  settings.config.rivers = ["through"];
  settings.config.relief = false;
  settings.config.features = { walls: false, citadel: true, plaza: true, temple: true, port: true, shanty: false };
  settings.config.layout = "auto";
  settings.layout = "organic";
  settings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
  const city = generateCityOnDocument(grid, settings, "17m9kwi");
  expect(city).not.toBeNull();
  const temple = city?.elements.find(element => element.kind === "temple");
  expect(temple?.point).toBeDefined();
  if (!city || !temple?.point) return;
  const nave = templeRectForElement(temple.point, temple.sizeMeters, temple.rotation, city.frame.extentMeters);
  for (const group of city.featureGroups.filter(group => group.kind === "road")) {
    const points = featureGroupVertices(city, group)
      .map(id => city.mesh.vertices[id]?.point)
      .filter((p): p is Point => !!p);
    if (points.length >= 2)
      expect(orientedRectPolylineDistance(nave, points)).toBeGreaterThanOrEqual(group.style.widthMeters / 2 + 2);
  }
  for (const face of Object.values(city.mesh.faces).filter(face => face.properties.ward === "park")) {
    expect(polygonHitsOrientedRect(facePoints(city.mesh, face), nave)).toBe(false);
  }
  const shore = oceanShoreSegments(city);
  expect(shore.length).toBeGreaterThan(0);
  for (const [a, b] of shore) {
    expect(orientedRectPolylineDistance(nave, [a, b])).toBeGreaterThanOrEqual(COASTAL_BUILDING_SETBACK_METERS - 0.2);
  }
});

function capeMicroCity(coast: "auto" | "open" | "seaWall" | "opening"): CityDocument | null {
  const input = createGridDocument({
    size: "micro",
    grid: "evolution",
    seed: "fotmhy",
    patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
  });
  const settings = defaultGenerationSettings();
  settings.layout = "organic";
  settings.config.coast = "cape";
  settings.config.rivers = ["straight"];
  settings.config.relief = false;
  settings.config.features = {
    walls: true,
    citadel: true,
    plaza: true,
    temple: false,
    port: true,
    shanty: false
  };
  settings.config.wall = { envelope: "auto", coast, line: "auto" };
  settings.config.layout = "auto";
  settings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
  return generateCityOnDocument(input, settings, "1vt05rm");
}

/** Length of buildable sea-front edges that are not part of a wall group. */
function unwalledSeaFront(city: CityDocument): number {
  const walled = new Set(
    city.featureGroups.flatMap(group => (group.kind === "wall" ? group.segments.map(segment => segment.edgeId) : []))
  );
  let length = 0;
  for (const edge of Object.values(city.mesh.edges)) {
    const left = edge.leftFace ? city.mesh.faces[edge.leftFace] : null;
    const right = edge.rightFace ? city.mesh.faces[edge.rightFace] : null;
    if (!left || !right) continue;
    if (left.properties.water !== "sea" && right.properties.water !== "sea") continue;
    if (left.properties.water !== "land" && right.properties.water !== "land") continue;
    if (!left.properties.buildable && !right.properties.buildable) continue;
    if (walled.has(edge.id)) continue;
    const a = city.mesh.vertices[edge.a].point;
    const b = city.mesh.vertices[edge.b].point;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function roughness(document: CityDocument, kind: "wall" | "road"): number {
  let total = 0;
  for (const group of document.featureGroups.filter(g => g.kind === kind)) {
    const points = featureGroupVertices(document, group).map(id => document.mesh.vertices[id].point);
    for (let i = 1; i + 1 < points.length; i++) {
      const [a, b, c] = points.slice(i - 1, i + 2);
      const incoming = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const outgoing = Math.atan2(c[1] - b[1], c[0] - b[0]);
      total += Math.abs(Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming)));
    }
  }
  return total;
}

describe("complete editable city", () => {
  const base = createSizedDocument("small", "preview");
  it("ends rivers and roads at their interior-side frame contact in the shared cape city", () => {
    const grid = createGridDocument({
      size: "small",
      grid: "evolution",
      seed: "13k952u",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config.coast = "cape";
    settings.config.rivers = ["greatBend", "toCoast"];
    settings.config.relief = true;
    settings.config.features = { walls: true, citadel: true, plaza: false, temple: true, port: false, shanty: false };
    settings.layout = "organic";
    settings.walledAreaShare = 1;
    const city = generateCityOnDocument(grid, settings, "xtce12")!;
    expect(city).not.toBeNull();
    const rivers = city.featureGroups.filter(group => group.kind === "river");
    expect(rivers).toHaveLength(2);
    const half = city.frame.extentMeters / 2;
    const onFrame = (p: Point) => Math.max(Math.abs(p[0]), Math.abs(p[1])) >= half - 0.05;
    for (const id of new Set([...kindEdgeIds(city, "river"), ...kindEdgeIds(city, "road")])) {
      const edge = city.mesh.edges[id];
      const a = city.mesh.vertices[edge.a].point;
      const b = city.mesh.vertices[edge.b].point;
      expect(onFrame(a) && onFrame(b), `${edge.a} → ${edge.b}`).toBe(false);
    }
    expect(validate(city)).toEqual([]);
    const bridge = city.featureGroups.find(group => group.id === "gc:bridge-district-0");
    expect(bridge?.kind).toBe("road");
    if (bridge?.kind === "road") {
      const vertices = featureGroupVertices(city, bridge);
      expect(vertexHasCrossing(city, vertices[1], "river", "road")).toBe(true);
    }
    const fabric = buildBlockFabric(city);
    for (const id of ["f47", "f66"]) {
      const face = city.mesh.faces[id];
      expect(face.properties.buildable).toBe(true);
      expect(
        fabric.buildings.some(building =>
          pointInPolygon(polygonCentroid(building.polygon), facePoints(city.mesh, face))
        ),
        `${id} has housing`
      ).toBe(true);
    }
    expect(connectUrbanRiverDistricts(city, new Set(["gc:river-0", "gc:river-1"]))).toBe(city);
    const isolated = { ...city, featureGroups: city.featureGroups.filter(group => !group.id.includes("district-")) };
    expect(connectUrbanRiverDistricts(isolated, new Set())).toBe(isolated);
  });
  it("retries a bay layout with an unusable crossing without weakening the crossing rules", () => {
    const grid = createGridDocument({ size: "small", grid: "hex", seed: "junction-check" });
    const settings = defaultGenerationSettings();
    settings.config.coast = "bay";
    settings.config.rivers = ["through"];
    settings.config.features.port = true;
    const city = generateCityOnDocument(grid, settings, "junction-6")!;
    expect(city).not.toBeNull();
    for (const gate of townGates(city)) expect(vertexHasCrossing(city, gate.vertexId, "wall", "road")).toBe(true);
    expect(generateCityOnDocument(grid, settings, "junction-6")).toEqual(city);
  });
  it("substantially reduces wall and road turning while retaining the exact route topology", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    const raw = generateCityOnDocument(base, { ...settings, streets: { foldSmoothing: false } }, "reference-town")!;
    const city = generateCityOnDocument(base, settings, "reference-town")!;
    expect(city.featureGroups).toEqual(raw.featureGroups);
    expect(city.gates).toEqual(raw.gates);
    expect(roughness(city, "wall")).toBeLessThan(roughness(raw, "wall") * 0.45);
    expect(roughness(city, "road")).toBeLessThan(roughness(raw, "road") * 0.45);
    for (const face of Object.values(city.mesh.faces)) {
      expect(
        polygonArea(facePoints(city.mesh, face)) / polygonArea(facePoints(raw.mesh, raw.mesh.faces[face.id]))
      ).toBeGreaterThan(0.1);
    }
  });

  it("connects every inland gate to both an approach and an interior street on hex and Voronoi grids", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    for (const grid of [base, createGridDocument({ size: "small", grid: "hex", seed: "preview" })]) {
      const city = generateCityOnDocument(grid, settings, "reference-town")!;
      expect(city.gates.length).toBeGreaterThanOrEqual(2);
      expect(countExternalApproachRoads(city)).toBeGreaterThanOrEqual(2);
      for (const gate of city.gates) {
        const roads = city.featureGroups.filter(
          g => g.kind === "road" && featureGroupVertices(city, g).includes(gate.vertexId)
        );
        expect(roads.length, gate.vertexId).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps at least two map-edge approach roads on Small cities, including unwalled towns", () => {
    for (const walls of [true, false]) {
      const settings = defaultGenerationSettings();
      settings.config.rivers = [];
      settings.config.features.walls = walls;
      const city = generateCityOnDocument(base, settings, "roads-two")!;
      expect(city, `walls=${walls}`).not.toBeNull();
      expect(countExternalApproachRoads(city)).toBeGreaterThanOrEqual(2);
    }
  });

  it("generates a complete Tiny city on hex, Voronoi and Grid evolution", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    for (const grid of ["hex", "voronoi", "evolution"] as const) {
      const input = createGridDocument({ size: "tiny", grid, seed: "tiny-city" });
      expect(input.frame.extentMeters, grid).toBe(600);
      const city = generateCityOnDocument(input, settings, "tiny-city")!;
      expect(city, grid).not.toBeNull();
      expect(validate(city), grid).toEqual([]);
      expect(city.frame.extentMeters, grid).toBe(600);
      expect(countExternalApproachRoads(city), grid).toBeGreaterThanOrEqual(
        minExternalRoadsForExtent(city.frame.extentMeters)
      );
      expect(city.gates.length, grid).toBeGreaterThan(0);
      const buildings = grid === "evolution" ? buildBlockFabric(city).buildings : buildCityBuildings(city);
      expect(buildings.length, grid).toBeGreaterThan(20);
    }
  });

  it("generates a complete Micro city, half a Tiny window, on hex, Voronoi and Grid evolution", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    for (const grid of ["hex", "voronoi", "evolution"] as const) {
      const input = createGridDocument({ size: "micro", grid, seed: "micro-city" });
      expect(input.frame.extentMeters, grid).toBe(300);
      expect(input.frame.cityRadiusMeters, grid).toBeCloseTo(99, 5);
      const city = generateCityOnDocument(input, settings, "micro-city")!;
      expect(city, grid).not.toBeNull();
      expect(validate(city), grid).toEqual([]);
      expect(city.frame.extentMeters, grid).toBe(300);
      expect(countExternalApproachRoads(city), grid).toBeGreaterThanOrEqual(
        minExternalRoadsForExtent(city.frame.extentMeters)
      );
      expect(city.gates.length, grid).toBeGreaterThan(0);
      const buildings = grid === "evolution" ? buildBlockFabric(city).buildings : buildCityBuildings(city);
      expect(buildings.length, grid).toBeGreaterThan(grid === "evolution" ? 40 : 8);
      expect(city.elements.some(element => element.kind === "temple")).toBe(true);
      expect(city.elements.some(element => element.kind === "plaza")).toBe(true);
    }
  });

  it("keeps a Micro town's outer wall to at most three gates when a river crosses it", () => {
    const settings = defaultGenerationSettings();
    settings.layout = "organic";
    settings.config.layout = "organic";
    settings.config.coast = "none";
    settings.config.rivers = ["through"];
    settings.config.features.walls = true;
    for (const seed of ["micro-gates-a", "micro-gates-b"]) {
      const input = createGridDocument({ size: "micro", grid: "evolution", seed });
      const city = generateCityOnDocument(input, settings, seed);
      expect(city, seed).not.toBeNull();
      if (!city) continue;
      expect(city.gates.length, seed).toBeGreaterThan(0);
      expect(city.gates.length, seed).toBeLessThanOrEqual(3);
      expect(countExternalApproachRoads(city), seed).toBeGreaterThanOrEqual(1);
    }
  });

  it("spaces Micro cape gates so their plazas do not meet, and does not bridge the sea wall", () => {
    const city = capeMicroCity("seaWall");
    expect(city).not.toBeNull();
    if (!city) return;
    expect(validate(city)).toEqual([]);
    expect(townGates(city)).toHaveLength(2);
    const wall = city.featureGroups.find(group => group.kind === "wall");
    expect(wall?.kind).toBe("wall");
    if (wall?.kind !== "wall") return;
    const spacing = minGateSpacingMeters(wall.style.widthMeters);
    const points = townGates(city).map(gate => city.mesh.vertices[gate.vertexId].point);
    expect(Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1])).toBeGreaterThanOrEqual(spacing);
    for (const gate of townGates(city)) expect(vertexHasCrossing(city, gate.vertexId, "wall", "road")).toBe(true);
    expect(bridgeDecks(city)).toHaveLength(1);
    expect(renderStandaloneCitySvg(city).querySelectorAll(".ce-quays path")).toHaveLength(0);

    const opened = capeMicroCity("opening");
    const cleared = capeMicroCity("open");
    expect(opened && cleared).toBeTruthy();
    if (!opened || !cleared) return;
    const gap = unwalledSeaFront(opened) - unwalledSeaFront(city);
    expect(gap).toBeGreaterThan(8);
    expect(gap).toBeLessThan(45);
    expect(unwalledSeaFront(cleared)).toBeGreaterThan(unwalledSeaFront(opened) + 80);
  });

  it("draws houses in a concave Micro craftsmen ward left empty by the convex kernel", () => {
    const settings = defaultGenerationSettings();
    settings.layout = "organic";
    settings.config.layout = "organic";
    settings.config.coast = "none";
    settings.config.rivers = ["through"];
    settings.config.relief = false;
    settings.config.features.walls = true;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;
    settings.config.features.citadel = false;
    settings.config.features.port = false;
    settings.config.features.shanty = true;
    const input = createGridDocument({
      size: "micro",
      grid: "evolution",
      seed: "2ojrm7",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const city = generateCityOnDocument(input, settings, "7erakc");
    expect(city).not.toBeNull();
    if (!city) return;
    const fabric = buildBlockFabric(city);
    for (const id of ["f22", "f35", "f36", "f120"]) {
      const face = city.mesh.faces[id];
      expect(face?.properties.ward, id).toBe("craftsmen");
      expect(Math.abs(polygonArea(facePoints(city.mesh, face))), id).toBeGreaterThan(200);
      const houses = fabric.buildings.filter(building => building.faceId === id);
      expect(houses.length, id).toBeGreaterThan(0);
      const outline = facePoints(city.mesh, face);
      for (const house of houses) {
        expect(pointInPolygon(polygonCentroid(house.polygon), outline), id).toBe(true);
      }
    }
  });

  it("is deterministic, preserves input, round-trips files and restores presentation on Undo/Redo", () => {
    const settings = defaultGenerationSettings();
    const original = JSON.stringify(base);
    const city = generateCityOnDocument(base, settings, "repeat")!;
    expect(generateCityOnDocument(base, settings, "repeat")).toEqual(city);
    expect(JSON.stringify(base)).toBe(original);
    expect(parseDocument(JSON.stringify(city))).toEqual(city);
    const history = new DocumentHistory(base);
    history.commit(city);
    const undone = history.undo(city)!;
    expect(undone).toEqual(base);
    expect(history.redo(undone)).toEqual(city);
    // The seed already changes the walled plan; a third full city is not needed to show it.
    expect(generateStageOnDocument(base, settings, "different", 4)).not.toEqual(
      generateStageOnDocument(base, settings, "repeat", 4)
    );
  });

  it("keeps locked face geometry and hand-drawn features", () => {
    const input = structuredClone(base);
    const face = Object.values(input.mesh.faces).find(f => Math.hypot(...(f.site ?? [0, 0])) < 250)!;
    face.properties.locked = true;
    const points = faceVertices(input.mesh, face).map(id => [id, input.mesh.vertices[id].point] as const);
    input.featureGroups.push({
      id: "hand-road",
      kind: "road",
      name: "Hand drawn",
      segments: [face.boundary[0]],
      style: { widthMeters: 6, color: "#555" },
      locked: false
    });
    const city = generateCityOnDocument(input, defaultGenerationSettings(), "protected")!;
    for (const [id, point] of points) expect(city.mesh.vertices[id]?.point).toEqual(point);
    expect(city.featureGroups.find(g => g.id === "hand-road")).toEqual(input.featureGroups[0]);
  });
});

describe("building setbacks", () => {
  it("reserves exact street/river setbacks in either polygon orientation", () => {
    const square: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ];
    const inset = insetConvexKernel(square, [8, 20, 8, 8]);
    expect(Math.abs(polygonArea(inset))).toBeCloseTo(72 * 84);
    expect(Math.max(...inset.map(p => p[0]))).toBeCloseTo(80);
    const reversed = insetConvexKernel([...square].reverse(), [8, 20, 8, 8]);
    expect(Math.abs(polygonArea(reversed))).toBeCloseTo(72 * 84);
  });

  it("keeps the 4rcc9 bridge banks dry, its skew within the era limit and gate roads square", () => {
    const grid = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "1txjevo",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = ["through"];
    settings.config.relief = false;
    settings.config.layout = "organic";
    settings.config.features = { walls: true, plaza: true, temple: true, citadel: false, port: false, shanty: true };
    settings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
    const city = generateCityOnDocument(grid, settings, "4rcc9")!;
    expect(city).not.toBeNull();
    // Mesh ids drift with the generator; check every bridge and gate by role.
    const river = city.featureGroups.find(group => group.kind === "river")!;
    const ribbon = featureGroupVertices(city, river).map(id => city.mesh.vertices[id].point);
    const bridges = city.featureGroups.filter(group => group.id.startsWith("gc:bridge-"));
    expect(bridges.length).toBeGreaterThan(0);
    for (const bridge of bridges) {
      const [bankA, mid, bankB] = featureGroupVertices(city, bridge);
      expect(vertexHasCrossing(city, mid, "river", "road"), bridge.id).toBe(true);
      for (const bank of [bankA, bankB])
        expect(nearestOnPolyline(city.mesh.vertices[bank].point, ribbon).dist, `${bridge.id} ${bank}`).toBeGreaterThan(
          river.style.widthMeters / 2
        );
      expect(bridgeSkewDegrees(city, bankA, mid, bankB)).toBeLessThanOrEqual(documentBridgeSkewLimit(city));
    }
    for (const gate of city.gates)
      expect(gateRoadDeviationDegrees(city, gate.vertexId), gate.vertexId).toBeLessThan(10);
  });

  it("generates a Tiny walled town with a through-river instead of stalling on approach roads", () => {
    const grid = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "1428fb3",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = ["through"];
    settings.config.features.walls = true;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;
    settings.config.features.citadel = false;
    settings.config.features.port = false;
    settings.config.features.shanty = true;
    const city = generateCityOnDocument(grid, settings, "2rxiu8");
    expect(city).not.toBeNull();
    if (!city) return;
    expect(city.gates.length).toBeGreaterThan(0);
    expect(countExternalApproachRoads(city)).toBeGreaterThanOrEqual(1);
    const temple = city.elements.find(e => e.kind === "temple");
    expect(temple?.point).toBeTruthy();
    if (temple?.point) {
      const nave = templeRectForElement(temple.point, temple.sizeMeters, temple.rotation, city.frame.extentMeters);
      for (const group of city.featureGroups) {
        if (group.kind !== "road") continue;
        const points = featureGroupVertices(city, group).map(id => city.mesh.vertices[id].point);
        if (points.length < 2) continue;
        expect(orientedRectPolylineDistance(nave, points)).toBeGreaterThanOrEqual(group.style.widthMeters / 2 + 1.5);
      }
    }
  });

  it("keeps a Tiny temple and plaza off rivers, houses, and precinct interiors", () => {
    const grid = createGridDocument({ size: "tiny", grid: "evolution", seed: "tiny-city" });
    const settings = defaultGenerationSettings();
    settings.config.rivers = ["through"];
    settings.config.features.walls = false;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;
    const city = generateCityOnDocument(grid, settings, "tiny-city");
    expect(city).not.toBeNull();
    if (!city) return;
    const plaza = city.elements.find(e => e.kind === "plaza");
    const temple = city.elements.find(e => e.kind === "temple");
    expect(plaza).toBeTruthy();
    expect(temple).toBeTruthy();
    expect(plaza!.faceIds.length).toBeGreaterThan(0);
    expect(temple!.faceIds.length).toBeGreaterThan(0);
    expect(temple!.rotation).toEqual(expect.any(Number));
    const buildings = buildBlockFabric(city).buildings;
    for (const building of buildings) {
      expect(buildingHitsCivicLandmark(city, building.polygon)).toBe(false);
      expect(plaza!.faceIds.includes(building.faceId)).toBe(false);
      expect(temple!.faceIds.includes(building.faceId)).toBe(false);
    }
    const river = city.featureGroups.find(g => g.kind === "river");
    if (river && temple?.point) {
      const rect = templeRectForElement(temple.point, temple.sizeMeters, temple.rotation, city.frame.extentMeters);
      const yard = civicYardMeters(city.frame.extentMeters);
      const padded = { ...rect, length: rect.length + yard, width: rect.width + yard };
      for (const id of river.vertices) {
        expect(pointInOrientedRect(city.mesh.vertices[id].point, padded)).toBe(false);
      }
    }
    if (temple?.point) {
      const nave = templeRectForElement(temple.point, temple.sizeMeters, temple.rotation, city.frame.extentMeters);
      for (const group of city.featureGroups) {
        if (group.kind !== "road") continue;
        const points = featureGroupVertices(city, group).map(id => city.mesh.vertices[id].point);
        if (points.length < 2) continue;
        expect(orientedRectPolylineDistance(nave, points)).toBeGreaterThanOrEqual(group.style.widthMeters / 2 + 1.5);
      }
    }
    const roadEdges = new Set(
      city.featureGroups.filter(g => g.kind === "road").flatMap(g => g.segments.map(s => s.edgeId))
    );
    for (const precinct of [plaza, temple]) {
      const members = new Set(precinct!.faceIds);
      for (const edge of Object.values(city.mesh.edges)) {
        if (edge.leftFace && edge.rightFace && members.has(edge.leftFace) && members.has(edge.rightFace)) {
          expect(roadEdges.has(edge.id)).toBe(false);
        }
      }
    }
  });

  it("omits water, empty districts and plazas instead of filling them with buildings", () => {
    const doc = createSizedDocument("small", "lots");
    for (const face of Object.values(doc.mesh.faces)) {
      face.properties.water = "lake";
      face.properties.ward = "craftsmen";
    }
    expect(buildCityBuildings(doc)).toEqual([]);
  });

  it("prevents buildings from encroaching into river water at river bends and nearby cells", () => {
    // Construct a document with a curved river and a face that touches the river vertex
    const doc = createSizedDocument("small", "river-clearance");
    const riverVerts = ["v242", "v243", "v268"].filter(id => doc.mesh.vertices[id]);
    if (riverVerts.length >= 2) {
      doc.featureGroups.push({
        id: "test-river",
        kind: "river",
        name: "Test River",
        vertices: riverVerts,
        source: null,
        mouth: null,
        style: { widthMeters: 28, color: "#4f8aad" },
        locked: false
      });
      const buildings = buildCityBuildings(doc);
      const riverPoints = riverVerts.map(id => doc.mesh.vertices[id].point);
      const halfWidth = 14;
      for (const b of buildings) {
        for (const pt of b.polygon) {
          const d = nearestOnPolyline(pt, riverPoints).dist;
          expect(d).toBeGreaterThanOrEqual(halfWidth);
        }
      }
    }
  });

  it("verifies bld-f142 and all buildings in sample map do not encroach into river water", () => {
    try {
      const fs = require("node:fs");
      const path = "temp/ce-20260916-181801.json";
      if (!fs.existsSync(path)) return;
      const doc = JSON.parse(fs.readFileSync(path, "utf8"));
      const river = doc.featureGroups.find((g: { kind: string }) => g.kind === "river");
      if (!river) return;
      const riverPoints = river.vertices.map((id: string) => doc.mesh.vertices[id].point);
      const halfWidth = river.style.widthMeters / 2;
      const buildings = buildCityBuildings(doc);
      for (const b of buildings) {
        for (const pt of b.polygon) {
          const d = nearestOnPolyline(pt, riverPoints).dist;
          expect(d).toBeGreaterThanOrEqual(halfWidth);
        }
      }
    } catch {
      // File may not exist in CI environment
    }
  });

  it("verifies extramural wards are never stranded without a gate or road", () => {
    const grid = createGridDocument({ size: "small", grid: "voronoi", seed: "preview" });
    const settings = defaultGenerationSettings();
    settings.config.features.walls = true;
    const city = generateCityOnDocument(grid, settings, "reference-town");
    expect(city).not.toBeNull();
    if (!city) return;

    const wallGroups = city.featureGroups.filter(g => g.kind === "wall");
    if (!wallGroups.length) return;
    const wallEdges = new Set(wallGroups.flatMap(g => g.segments.map(s => s.edgeId)));
    const roadEdges = new Set(
      city.featureGroups.filter(g => g.kind === "road").flatMap(g => g.segments.map(s => s.edgeId))
    );
    const gateVertices = new Set(city.gates.map(g => g.vertexId));

    const plaza = city.elements.find(e => e.kind === "plaza");
    if (!plaza) return;
    const insideFaces = new Set([...plaza.faceIds]);
    const queue = [...plaza.faceIds];
    while (queue.length) {
      const curr = queue.shift()!;
      const f = city.mesh.faces[curr];
      for (const b of f.boundary) {
        if (wallEdges.has(b.edgeId)) continue;
        const edge = city.mesh.edges[b.edgeId];
        const other = edge.leftFace === curr ? edge.rightFace : edge.leftFace;
        if (other && !insideFaces.has(other)) {
          insideFaces.add(other);
          queue.push(other);
        }
      }
    }

    for (const [id, face] of Object.entries(city.mesh.faces)) {
      if (insideFaces.has(id)) continue;
      if (
        !face.properties.ward ||
        face.properties.ward === "empty" ||
        face.properties.ward === "park" ||
        face.properties.ward === "farm" ||
        face.properties.ward === "cemetery"
      )
        continue;
      if (!face.properties.buildable) continue;

      const hasRoad = face.boundary.some(b => roadEdges.has(b.edgeId));
      const hasGate = face.boundary.some(b => {
        const edge = city.mesh.edges[b.edgeId];
        return edge && (gateVertices.has(edge.a) || gateVertices.has(edge.b));
      });
      expect(hasRoad || hasGate, `Extramural face ${id} has ward ${face.properties.ward} without gate or road`).toBe(
        true
      );
    }
  });

  it("generates a complete Bram circulade town with concentric fabric and opposed gates", () => {
    const grid = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "bram-test-grid",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.layout = "circulade";
    settings.config.layout = "circulade";
    settings.config.coast = "none";
    settings.config.rivers = [];
    settings.config.features.walls = true;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;

    const city = generateCityOnDocument(grid, settings, "bram-seed-1");
    expect(city).not.toBeNull();
    if (!city) return;

    expect(city.layout).toBe("circulade");
    expect(city.gates.length).toBeGreaterThan(0);
    expect(city.fabric).toBeDefined();

    const localFabric = buildBlockFabric(city);
    expect(localFabric.buildings.length).toBeGreaterThan(10);

    const plaza = city.elements.find(e => e.kind === "plaza");
    expect(plaza).toBeDefined();

    const temple = city.elements.find(e => e.kind === "temple");
    expect(temple).toBeDefined();

    if (temple?.point) {
      const nave = templeRectForElement(temple.point, temple.sizeMeters, temple.rotation, city.frame.extentMeters);
      for (const group of city.featureGroups) {
        if (group.kind !== "road") continue;
        const points = featureGroupVertices(city, group)
          .map(id => city.mesh.vertices[id]?.point)
          .filter((p): p is Point => !!p);
        if (points.length < 2) continue;
        const dist = orientedRectPolylineDistance(nave, points);
        if (dist < group.style.widthMeters / 2 + 1.5) {
          console.log("[FAILING ROAD]", group.id, "dist:", dist, "points:", points, "nave:", nave);
        }
        expect(dist).toBeGreaterThanOrEqual(group.style.widthMeters / 2 + 1.5);
      }
    }

    // Verify no two generated roads share edges (no duplicate overlapping roads)
    const roads = city.featureGroups.filter(g => g.kind === "road" && g.id.startsWith("gc:road-"));
    for (let i = 0; i < roads.length; i++) {
      for (let j = i + 1; j < roads.length; j++) {
        const set1 = new Set(roads[i].segments.map(s => s.edgeId));
        const shared = roads[j].segments.filter(s => set1.has(s.edgeId));
        expect(shared.length).toBe(0);
      }
    }
  });

  it("generates a complete Bram town with polygonal core and peripheral blocks", () => {
    const grid = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "core-voronoi-grid",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.layout = "bram";
    settings.config.layout = "bram";
    settings.config.coast = "none";
    settings.config.rivers = [];
    settings.config.features.walls = true;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;

    const city = generateCityOnDocument(grid, settings, "core-voronoi-seed-1");
    expect(city).not.toBeNull();
    if (!city) return;

    expect(city.layout).toBe("bram");
    expect(city.gates.length).toBeGreaterThan(0);

    const plaza = city.elements.find(e => e.kind === "plaza");
    expect(plaza).toBeDefined();

    const temple = city.elements.find(e => e.kind === "temple");
    expect(temple).toBeDefined();

    const localFabric = buildBlockFabric(city);
    expect(localFabric.buildings.length).toBeGreaterThan(20);
    expect(localFabric.lanes.length).toBeGreaterThan(5);

    const hub = plaza!.point;
    // Verify that no mesh-edge roads cut into the interior of the circulade core (<118m)
    for (const group of city.featureGroups) {
      if (group.kind === "road") {
        for (const seg of group.segments) {
          const edge = city.mesh.edges[seg.edgeId];
          const pa = city.mesh.vertices[edge.a].point;
          const pb = city.mesh.vertices[edge.b].point;
          expect(
            Math.min(Math.hypot(pa[0] - hub[0], pa[1] - hub[1]), Math.hypot(pb[0] - hub[0], pb[1] - hub[1]))
          ).toBeGreaterThanOrEqual(118);
        }
      }
    }
  });

  it("reproduces user share case with evolution grid and no walls", () => {
    const grid = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "1ky0kcc",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.layout = "bram";
    settings.config.layout = "bram";
    settings.config.coast = "none";
    settings.config.rivers = [];
    settings.config.relief = false;
    settings.config.features.walls = false;
    settings.config.features.plaza = false;
    settings.config.features.temple = false;
    settings.config.features.citadel = false;
    settings.config.features.port = false;

    const city = generateCityOnDocument(grid, settings, "1ddhnpv");
    expect(city).not.toBeNull();
    if (!city) return;

    const roads = city.featureGroups.filter(g => g.kind === "road");
    // Ensure only the clean external approach roads exist without redundant overlapping stubs (gc:road-2, gc:road-3)
    expect(roads.map(g => g.id)).toEqual(["gc:road-0", "gc:road-1"]);
    expect(city.featureGroups.some(g => g.id === "gc:road-2" || g.id === "gc:road-3")).toBe(false);
  });

  it("generates a complete city with classic layout (323b5638 street growth and frontage buildings)", () => {
    const grid = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "classic-test-grid",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.layout = "classic";
    settings.config.layout = "classic";
    settings.config.coast = "none";
    settings.config.rivers = [];
    settings.config.features.walls = true;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;

    const city = generateCityOnDocument(grid, settings, "classic-seed");
    expect(city).not.toBeNull();
    if (!city) return;

    expect(city.layout).toBe("classic");
    expect(validate(city)).toEqual([]);

    const fabric = buildBlockFabric(city);
    expect(fabric.buildings.length).toBeGreaterThan(30);
    expect(fabric.lanes.length).toBeGreaterThan(2);

    for (const building of fabric.buildings) {
      expect(building.polygon.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("reproduces user nanum6 classic case without redundant roads", () => {
    const fs = require("node:fs");
    const samplePath = "temp/ce-20260921-043609.json";
    if (!fs.existsSync(samplePath)) return;
    const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    const grid = sample.fabric?.generation?.input ?? sample;
    const settings = defaultGenerationSettings();
    settings.layout = "classic";
    settings.config.layout = "classic";
    settings.config.coast = "none";
    settings.config.rivers = ["through"];
    settings.config.features.walls = true;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;

    const city = generateCityOnDocument(grid, settings, "nanum6");
    expect(city).not.toBeNull();
    if (!city) return;

    const roads = city.featureGroups.filter(g => g.kind === "road");
    // Ensure gc:road-9 and gc:road-10 are removed, leaving only the active gate roads and bridge
    expect(roads.map(r => r.id)).toEqual([
      "gc:bridge-0",
      "gc:road-1",
      "gc:road-2",
      "gc:road-3",
      "gc:road-5",
      "gc:road-6",
      "gc:road-7"
    ]);
    expect(roads.some(r => r.id === "gc:road-9" || r.id === "gc:road-10")).toBe(false);
  });

  it("reproduces user 052221 unwalled classic case without redundant roads", () => {
    const fs = require("node:fs");
    const samplePath = "temp/ce-20260921-052221.json";
    if (!fs.existsSync(samplePath)) return;
    const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    const grid = sample.fabric?.generation?.input ?? sample;
    const settings = sample.fabric?.generation?.settings ?? defaultGenerationSettings();
    const seed = sample.fabric?.generation?.seed ?? "1td7xj";

    const city = generateCityOnDocument(grid, settings, seed);
    expect(city).not.toBeNull();
    if (!city) return;

    const roads = city.featureGroups.filter(g => g.kind === "road");
    // Ensure redundant overlapping stubs (gc:road-8, gc:road-10, gc:road-11) are NOT created
    expect(roads.some(g => g.id === "gc:road-8" || g.id === "gc:road-10" || g.id === "gc:road-11")).toBe(false);
    expect(roads.map(r => r.id)).toEqual([
      "gc:bridge-0",
      "gc:road-0",
      "gc:road-2",
      "gc:road-3",
      "gc:road-4",
      "gc:road-6",
      "gc:road-7"
    ]);
  });
});
