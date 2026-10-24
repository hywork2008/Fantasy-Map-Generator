import { describe, expect, it } from "vitest";
import { contentDigest } from "../../buildings/canonicalJson";
import { KRAK } from "../../buildings/fortresses/krak";
import { pointInRing } from "../../buildings/geometry";
import { concatPositions, meshIsClosed } from "../../city3d/core/massingGeometry";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import { WATER_Y } from "../../city3d/core/waterGeometry";
import { createCityMassing } from "../../city3d/three/cityMeshes";
import { createTownRoads } from "../../city3d/three/roadMeshes";
import { createTownWater } from "../../city3d/three/waterMeshes";
import { setCastleLocked } from "../generators/castles";
import { fortressPlacement, fortressPoint, setCastleFortress } from "../generators/fortressPlacement";
import { createFortressStudy } from "../generators/fortressStudy";
import { cityTerrain, cityTerrainStamp } from "../generators/terrainElevation";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import type { BuildingMassing } from "../types/contracts/buildingMassing";
import type { Point } from "../types/document";
import { renderCastle } from "./castleSvg";
import { modularFortressStructures } from "./modularFortress";
import { collectCityStructures } from "./structureMassing";
import { lotFoundations } from "./terrainMassing";
import { renderTownFortifications } from "./townFortificationSvg";

function topCovers(positions: Float32Array, point: [number, number], above: number) {
  for (let i = 0; i < positions.length; i += 9) {
    if ([1, 4, 7].some(offset => positions[i + offset] <= above)) continue;
    const tri = [0, 3, 6].map(offset => [positions[i + offset], -positions[i + offset + 2]] as [number, number]);
    if (pointInRing(point, tri)) return true;
  }
  return false;
}

describe("modular Krak fortress", () => {
  it("uses a validated inner record and closed masses while leaving the courtyard open", () => {
    const city = createFortressStudy();
    const castle = city.castles![0];
    expect(contentDigest(KRAK.inner)).toBe(KRAK.inner.contentHash);
    const terrain = cityTerrain(city);
    const parts = modularFortressStructures(city, castle, terrain)!;
    const terrace = parts.find(part => part.id.endsWith(":inner-terrace"))!;
    const courtLevel = terrace.baseElevationMeters + terrace.heightMeters;
    let triangles = 0;
    for (const part of parts) {
      const surfaces = structureSurfaces(part);
      expect(surfaces, part.id).not.toBeNull();
      const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
      expect(meshIsClosed(positions), part.id).toBe(true);
      expect(topCovers(surfaces!.roofs.positions, [0, 0], courtLevel + 0.1), part.id).toBe(false);
      expect([...positions].every(Number.isFinite), part.id).toBe(true);
      triangles += positions.length / 9;
    }
    expect(triangles).toBeLessThan(12000);
    expect(parts.filter(part => /south-tower-\d$/.test(part.id))).toHaveLength(3);
    expect(parts.some(part => part.id.includes("semicircular-tower"))).toBe(true);
    expect(parts.some(part => part.id.includes("southern-stables"))).toBe(true);
    expect(parts.some(part => part.id.includes("cistern-water"))).toBe(true);
    expect(parts.some(part => part.id.includes("qalawun"))).toBe(false);
  });

  it("adds the later rectangular tower and covered ramp only in the Mamluk phase", () => {
    const city = createFortressStudy("mamluk-1302");
    const parts = modularFortressStructures(city, city.castles![0])!;
    expect(parts.some(part => part.id.includes("qalawun-tower-1285"))).toBe(true);
    expect(parts.some(part => part.id.includes("covered-ramp"))).toBe(true);
    for (const part of parts) {
      const surfaces = structureSurfaces(part);
      expect(surfaces, part.id).not.toBeNull();
      expect(meshIsClosed(concatPositions(surfaces!.walls, surfaces!.roofs)), part.id).toBe(true);
    }
  });

  it("replaces classic castle walls, towers and gates in 2D and 3D without duplicate producers", () => {
    const city = createFortressStudy();
    city.castles![0].castleStyle = "classic";
    const parts = collectCityStructures(city);
    expect(parts.some(part => part.id.includes(":krak:"))).toBe(true);
    expect(parts.some(part => part.id.startsWith("wall:"))).toBe(false);
    expect(parts.some(part => part.id.startsWith("gate:"))).toBe(false);
    const svg = renderCastle(city, city.castles![0]);
    expect(svg.querySelector(".ce-modular-fortress")).not.toBeNull();
    expect(svg.querySelectorAll("[data-part]").length).toBeGreaterThan(30);
    expect(renderTownFortifications(city).querySelector("[data-pick]")).toBeNull();
  });

  it("persists the selected phase, respects locking and rejects malformed phase metadata", () => {
    const city = createFortressStudy("mamluk-1302");
    const saved = serializeDocument(city);
    expect(parseDocument(saved)?.castles?.[0].fortress).toEqual(city.castles![0].fortress);
    const invalid = JSON.parse(saved);
    invalid.castles[0].fortress.phase = "unknown";
    expect(parseDocument(JSON.stringify(invalid))).toBeNull();
    const locked = setCastleLocked(city, city.castles![0].id, true)!;
    expect(setCastleFortress(locked, city.castles![0].id, null)).toBeNull();
    const original = setCastleFortress(city, city.castles![0].id, null)!;
    expect(original.castles![0].fortress).toBeUndefined();
    expect(city.castles![0].fortress).toBeDefined();
  });

  it("keeps inner proportions and rejects an enclosure too narrow for the talus", () => {
    const city = createFortressStudy();
    const placement = fortressPlacement(city, city.castles![0])!;
    expect(placement.scale).toBeGreaterThanOrEqual(0.75);
    expect(placement.scale).toBeLessThanOrEqual(1.35);
    const a = fortressPoint([0, 0], placement),
      b = fortressPoint([10, 0], placement);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(10 * placement.scale);
    for (const vertex of Object.values(city.mesh.vertices)) vertex.point[0] *= 0.25;
    expect(fortressPlacement(city, city.castles![0])).toBeNull();
    // A subsequent edit that makes the preset unplaceable falls back to the normal castle.
    expect(modularFortressStructures(city, city.castles![0])).toBeNull();
  });
});

describe("CE cell elevation in the fortress study", () => {
  it("keeps ordinary building floors horizontal and supports them with a plinth on sloping land", () => {
    const terrain = cityTerrain(createFortressStudy());
    const polygon: Point[] = [
      [30, -10],
      [50, -10],
      [50, 10],
      [30, 10]
    ];
    const massing: BuildingMassing = {
      storeys: 1,
      floors: [{ level: 0, use: "residential", heightMeters: 3 }],
      cellar: false,
      jettyMeters: 0,
      eaveHeightMeters: 3,
      roof: { form: "flat", pitchDeg: 0, ridgeAzimuth: 0, material: "slate" },
      wall: "stone",
      baseElevationMeters: 0,
      tint: 0.5
    };
    const lots = [{ id: "study-house", faceId: "f12", polygon, massing }];
    const floor = terrain.foundationAt(polygon);
    const meshes = createCityMassing(lots, terrain.foundationAt);
    const roof = meshes.pickables[1].geometry.getAttribute("position");
    for (let i = 0; i < roof.count; i++) expect(roof.getY(i)).toBeCloseTo(floor + 3, 4);
    const foundation = lotFoundations(lots, terrain)[0];
    expect(foundation.baseElevationMeters + foundation.heightMeters).toBeCloseTo(floor);
    expect(foundation.baseElevationMeters).toBeLessThan(Math.min(...polygon.map(terrain.heightAt)));
    meshes.dispose();
  });

  it("raises roads and inland channels with the hill while retaining their surface offsets", () => {
    const city = createFortressStudy();
    city.waterAreas = [
      {
        kind: "river",
        polygon: [
          [100, 20],
          [200, 20],
          [200, 28],
          [100, 28]
        ]
      }
    ];
    const terrain = cityTerrain(city);
    const water = createTownWater(city, terrain);
    const channel = water.parent.getObjectByName("ce-water-channel") as import("three").Mesh;
    const positions = channel.geometry.getAttribute("position");
    expect(positions.count).toBeGreaterThan(0);
    // Standing water stays level. Empty land slopes, so the sheet sits the inland drop under the lowest shore
    // rather than tilting with the ground.
    const shores: Point[] = [
      [100, 20],
      [200, 20],
      [200, 28],
      [100, 28]
    ];
    const surface = positions.getY(0);
    for (let i = 0; i < positions.count; i++) expect(positions.getY(i)).toBeCloseTo(surface, 4);
    const lowestShore = Math.min(...shores.map(point => terrain.heightAt(point)));
    expect(surface).toBeLessThanOrEqual(lowestShore + WATER_Y + 1e-3);
    expect(surface).toBeGreaterThan(lowestShore + WATER_Y - 12);
    const roads = createTownRoads(
      [
        {
          centerline: [
            [-60, 20],
            [60, 20]
          ],
          widthMeters: 4,
          surface: "earth"
        }
      ],
      { polygons: [], ribbons: [] },
      terrain.heightAt
    );
    const road = roads.parent.children[0] as import("three").Mesh;
    const roadPositions = road.geometry.getAttribute("position");
    for (let i = 0; i < roadPositions.count; i++) {
      const offset = roadPositions.getY(i) - terrain.heightAt([roadPositions.getX(i), -roadPositions.getZ(i)]);
      expect(offset).toBeGreaterThanOrEqual(-0.181);
      expect(offset).toBeLessThanOrEqual(-0.149);
    }
    water.dispose();
    roads.dispose();
  });

  it("renders the cell-centre hill and grounds the inner terrace above it", () => {
    const city = createFortressStudy();
    const terrain = cityTerrain(city);
    expect(terrain.heightAt([0, 0])).toBeCloseTo(42);
    expect(
      terrain.foundationAt([
        [-30, -30],
        [30, -30],
        [30, 30],
        [-30, 30]
      ])
    ).toBeCloseTo(42);
    const meshes = createTownWater(city, terrain);
    const positions = meshes.land!.geometry.getAttribute("position");
    let highest = -Infinity;
    for (let i = 0; i < positions.count; i++) highest = Math.max(highest, positions.getY(i));
    expect(highest).toBeCloseTo(41.8, 4);
    const parts = modularFortressStructures(city, city.castles![0], terrain)!;
    const top = parts.find(part => part.id.endsWith(":inner-terrace"))!;
    expect(top.baseElevationMeters + top.heightMeters).toBeCloseTo(49);
    const stamp = cityTerrainStamp(city);
    city.mesh.faces.f12.properties.elevation += 20;
    expect(cityTerrainStamp(city)).not.toBe(stamp);
    expect(cityTerrain(city).heightAt([0, 0])).toBeCloseTo(62);
    meshes.dispose();
  });

  it("retains flat legacy land when every cell has the same elevation", () => {
    const city = createFortressStudy();
    for (const face of Object.values(city.mesh.faces)) face.properties.elevation = 40;
    const terrain = cityTerrain(city);
    expect(terrain.relief).toBe(false);
    expect(terrain.heightAt([0, 0])).toBe(0);
    expect(
      terrain.foundationAt([
        [-30, -30],
        [30, -30],
        [30, 30]
      ])
    ).toBe(0);
  });
});
