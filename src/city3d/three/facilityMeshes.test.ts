import * as THREE from "three";
import { beforeAll, expect, it } from "vitest";
import input from "../../city-editor/data/fixtures/vegides-20261026.json";
import { buildBlockFabric } from "../../city-editor/generators/blockInfill";
import type { DistrictFabric } from "../../city-editor/generators/blockInfill.types";
import type { GateInn } from "../../city-editor/generators/gateInnPlacement";
import { generateCityOnDocument } from "../../city-editor/generators/generation/generateCity";
import { pointInPolygon } from "../../city-editor/generators/geom";
import { collectCityStructures } from "../../city-editor/renderers/structureMassing";
import { parseIncomingPayload } from "../../city-editor/services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../../city-editor/services/io/shareRequest";
import type { CityDocument, Point } from "../../city-editor/types/document";
import { createBvPrototypeCache } from "./bvInstances";
import { createTownFacilities } from "./facilityMeshes";

let city: CityDocument;
let fabric: DistrictFabric;
beforeAll(() => {
  const share = parseIncomingPayload(JSON.stringify(input))!;
  city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
  // These controls request the same saved facility plans that the SVG displays.
  city.facilityCounts = { livestockPen: 1, timberYard: 1, inn: 1, caravanserai: 1 };
  for (const road of city.fabric!.generation!.settings.descriptor!.roads) {
    road.traffic = 24;
    road.trafficRank = 1;
  }
  fabric = buildBlockFabric(city);
});

it("shows Vegides windmills, yards and every saved citadel building, and releases shared prototypes", () => {
  expect(fabric.aerialLandmarks!.windmills).toHaveLength(1);
  expect(fabric.aerialLandmarks!.gateInns.map(inn => inn.kind).sort()).toEqual(["caravanserai", "inn"]);
  expect(fabric.aerialLandmarks!.storageYards.some(yard => yard.form === "livestockPen")).toBe(true);
  expect(fabric.aerialLandmarks!.guildYards.some(yard => yard.kind === "timberYard")).toBe(true);
  const cache = createBvPrototypeCache();
  const parts = collectCityStructures(city);
  const layer = createTownFacilities(city, fabric, parts, cache, "high");
  const ids = new Set(layer.accepted.map(site => site.id));
  for (const site of layer.accepted) {
    const scale = new THREE.Vector3().setFromMatrixScale(site.matrix);
    for (const component of scale.toArray()) expect(component).toBeCloseTo(1, 10);
  }
  for (const item of [
    ...fabric.aerialLandmarks!.windmills,
    ...fabric.aerialLandmarks!.gateInns,
    ...fabric.aerialLandmarks!.storageYards,
    ...fabric.aerialLandmarks!.guildYards
  ])
    expect(ids.has(item.id), item.id).toBe(true);
  const buildings = parts.filter(part => part.id.startsWith("castle:"));
  expect(buildings.length).toBeGreaterThan(0);
  for (const part of buildings) expect(layer.replaced.has(part.id), part.id).toBe(true);
  expect(layer.accepted.filter(site => site.name === "cannon_battery")).toHaveLength(
    parts.filter(part => part.id.startsWith("tower:")).length
  );
  expect(layer.accepted.some(site => site.name === "Citadel ravelin")).toBe(true);
  for (const mesh of layer.pickables)
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  const refreshed = createTownFacilities(city, fabric, parts, cache, "high");
  layer.dispose();
  expect(cache.size).toBeGreaterThan(0);
  expect(refreshed.accepted.map(site => site.id)).toEqual([...ids]);
  refreshed.dispose();
  expect(cache.size).toBe(0);
});

it("keeps rotated lodging courtyards and street entrances open on raised terrain", () => {
  const angle = 0.43;
  const rect = (w: number, d: number, cx: number): Point[] =>
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2]
    ].map(([x, y]) => [cx + x * Math.cos(angle) - y * Math.sin(angle), 40 + x * Math.sin(angle) + y * Math.cos(angle)]);
  const inns: GateInn[] = (["inn", "caravanserai"] as const).map((kind, i) => {
    const footprint = rect(29, 27, i * 50),
      court = rect(14, 12, i * 50);
    const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return {
      id: kind,
      kind,
      name: kind,
      stableSpaces: 8,
      count: 1,
      year: 674,
      footprint,
      court,
      entrance: [mid(footprint[0], footprint[1]), mid(court[0], court[1])],
      stalls: []
    };
  });
  const plan = { ...fabric, aerialLandmarks: { ...fabric.aerialLandmarks!, gateInns: inns } };
  const cache = createBvPrototypeCache();
  const layer = createTownFacilities(city, plan, collectCityStructures(city), cache, "high", {
    relief: true,
    foundationAt: () => 9,
    heightAt: () => 3
  });
  for (const inn of inns) {
    const mesh = layer.pickables.find(mesh => layer.resolve({ object: mesh, instanceId: 0 })?.id === inn.id)!;
    expect(mesh).toBeDefined();
    mesh.updateMatrixWorld(true);
    const center = inn.court.reduce<Point>((p, q) => [p[0] + q[0] / 4, p[1] + q[1] / 4], [0, 0]);
    const courtHit = new THREE.Raycaster(
      new THREE.Vector3(center[0], 30, -center[1]),
      new THREE.Vector3(0, -1, 0)
    ).intersectObject(mesh)[0];
    expect(courtHit.point.y).toBeCloseTo(9.05, 4);
    const from = inn.entrance[0],
      to = inn.entrance[1];
    const direction = new THREE.Vector3(to[0] - from[0], 0, -(to[1] - from[1])).normalize();
    const entranceHits = new THREE.Raycaster(
      new THREE.Vector3(from[0], 10.5, -from[1]),
      direction,
      0,
      Math.hypot(to[0] - from[0], to[1] - from[1])
    ).intersectObject(mesh);
    expect(entranceHits).toHaveLength(0);
  }
  layer.dispose();
  expect(cache.size).toBe(0);
});

it("keeps compact warehouses and yards visible without shrinking their doors or fences", () => {
  const rectangle = (x: number, w: number, d: number): Point[] => [
    [x - w / 2, -d / 2],
    [x + w / 2, -d / 2],
    [x + w / 2, d / 2],
    [x - w / 2, d / 2]
  ];
  const sites = (["warehouse", "warehouse", "timberYard"] as const).map((form, i) => ({
    ...fabric.aerialLandmarks!.storageYards[0],
    id: `compact-${i}`,
    form,
    origin: undefined,
    polygon: rectangle(i * 40, i === 0 ? 30 : 6, i === 0 ? 20 : 5)
  }));
  const cache = createBvPrototypeCache();
  const layer = createTownFacilities(
    { ...city, castles: [], bastionedTown: undefined },
    {
      ...fabric,
      watermills: undefined,
      aerialLandmarks: {
        ...fabric.aerialLandmarks!,
        windmills: [],
        gateInns: [],
        storageYards: sites,
        guildYards: [],
        guildHalls: [],
        tanneries: [],
        gallows: [],
        quayWarehouses: []
      }
    },
    [],
    cache
  );
  expect(layer.accepted.map(site => site.id)).toEqual(sites.map(site => site.id));
  for (const [i, site] of layer.accepted.entries()) {
    const model = site.definition.create();
    model.group.updateMatrixWorld(true);
    const feature = model.pickables.find(mesh => mesh.name === (i === 2 ? "fence-post" : "door-leaf"))!;
    expect(feature).toBeDefined();
    const bounds = new THREE.Box3().setFromObject(feature, true).applyMatrix4(site.matrix);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(i === 2 ? 1.3 : 2.2);
    if (i === 1) {
      const envelope = new THREE.Box3().setFromObject(model.group, true).applyMatrix4(site.matrix);
      expect(envelope.max.x - envelope.min.x).toBeLessThan(6);
      expect(envelope.max.z - envelope.min.z).toBeLessThan(5);
    }
    model.dispose();
  }
  layer.dispose();
  expect(cache.size).toBe(0);
});

it.each([0, 0.25, 0.85, 1, 1.2])("immerses low-bank BV wheels at a %s m river drop on both banks", drop => {
  const angle = 0.61;
  const mills = [1, -1].map((side, i) => {
    const center: Point = [50 + i * 30, 40];
    const point = (x: number, y: number): Point => [
      center[0] + x * Math.cos(angle) - y * Math.sin(angle),
      center[1] + x * Math.sin(angle) + y * Math.cos(angle)
    ];
    return {
      id: `watermill-${i}`,
      riverId: "river",
      kind: "gristmill" as const,
      name: "Watermill",
      bankSide: side === 1 ? ("left" as const) : ("right" as const),
      millhousePolygon: [point(-5, side * 2), point(5, side * 2), point(5, side * 8), point(-5, side * 8)],
      millhouseRidge: [point(-5, side * 5), point(5, side * 5)] as [Point, Point],
      riverSideRoof: [],
      landSideRoof: [],
      wakePolyline: [],
      wheel: { center, radius: 1.9 + i * 0.4, width: 1.8, angleRad: angle, bladeCount: 8 }
    };
  });
  const cache = createBvPrototypeCache();
  const layer = createTownFacilities(
    { ...city, castles: [], bastionedTown: undefined },
    { ...fabric, aerialLandmarks: undefined, watermills: { mills, buildingCount: 500, derivedPopulation: 2250 } },
    [],
    cache,
    "high",
    { relief: true, foundationAt: () => 7, heightAt: () => 0 },
    () => 7 - drop
  );
  expect(layer.accepted).toHaveLength(2);
  for (const [i, site] of layer.accepted.entries()) {
    expect(site.id).toBe(mills[i].id);
    expect(site.definition.variant).toContain("object.waterMillLowBank");
    expect(site.definition.variant).toContain(i === 0 ? "Forward@" : "Reverse@");
    const model = site.definition.create();
    model.group.updateMatrixWorld(true);
    const door = model.group.getObjectByName("entrance-door-board")!;
    const doorBounds = new THREE.Box3().setFromObject(door, true).applyMatrix4(site.matrix);
    expect(doorBounds.max.y - doorBounds.min.y).toBeCloseTo(2.02);
    const wheelPart = model.group.getObjectByName("waterwheel-assembly")!;
    const foundation = new THREE.Box3().setFromObject(model.group.getObjectByName("foundation")!, true);
    for (const x of [foundation.min.x, foundation.max.x])
      for (const z of [foundation.min.z, foundation.max.z]) {
        const corner = new THREE.Vector3(x, 0, z).applyMatrix4(site.matrix);
        expect(pointInPolygon([corner.x, -corner.z], mills[i].millhousePolygon)).toBe(true);
      }
    const shaft = new THREE.Box3().setFromObject(model.group.getObjectByName("wheel-axle")!, true);
    expect(shaft.min.z).toBeLessThan(2.8);
    expect(shaft.max.z).toBeGreaterThan(wheelPart.position.z);
    const wheelBounds = new THREE.Box3().setFromObject(wheelPart, true).applyMatrix4(site.matrix);
    // Raked paddle corners project a few millimetres beyond the nominal circular rim.
    expect(Math.abs(wheelBounds.min.y - (7 - drop - 0.35))).toBeLessThan(0.01);
    const paddleBottom = Math.min(
      ...model.pickables
        .filter(mesh => mesh.name === "undershot-paddle")
        .map(mesh => new THREE.Box3().setFromObject(mesh, true).applyMatrix4(site.matrix).min.y)
    );
    expect(7 - drop - paddleBottom).toBeGreaterThan(0.3);
    expect(7 - drop - paddleBottom).toBeLessThan(0.4);
    const hub = wheelPart.position.clone().applyMatrix4(site.matrix);
    const gate = model.group.getObjectByName("low-sluice-gate")!.position.clone().applyMatrix4(site.matrix);
    const tail = model.group.getObjectByName("tailrace-guide")!.position.clone().applyMatrix4(site.matrix);
    const downstream = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    expect(gate.clone().sub(hub).dot(downstream)).toBeLessThan(0);
    expect(tail.clone().sub(hub).dot(downstream)).toBeGreaterThan(0);
    expect(model.group.getObjectByName("millrace-water")).toBeUndefined();
    model.dispose();
    const wheel = new THREE.Vector3(wheelPart.position.x, 0, wheelPart.position.z).applyMatrix4(site.matrix);
    expect(wheel.x).toBeCloseTo(mills[i].wheel.center[0]);
    expect(wheel.z).toBeCloseTo(-mills[i].wheel.center[1]);
    expect(wheel.y).toBeCloseTo(7);
    const house = new THREE.Vector3(0, 0, -0.1).applyMatrix4(site.matrix);
    const dx = house.x - wheel.x,
      dy = -house.z + wheel.z;
    expect((-Math.sin(angle) * dx + Math.cos(angle) * dy) * (i === 0 ? 1 : -1)).toBeGreaterThan(0);
    const mesh = layer.pickables.find(mesh => layer.resolve({ object: mesh, instanceId: 0 })?.id === site.id);
    expect(mesh).toBeDefined();
  }
  layer.dispose();
  expect(cache.size).toBe(0);
});
