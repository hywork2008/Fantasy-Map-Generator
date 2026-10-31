import * as THREE from "three";
import { expect, it } from "vitest";
import { createDocument } from "../../city-editor/generators/document";
import { hydraulicWaterAt, solveRiverHydraulics } from "../../city-editor/generators/riverHydraulics";
import { cityTerrain } from "../../city-editor/generators/terrainElevation";
import { LAND_Y } from "../core/waterGeometry";
import { createRiverHydraulicMesh } from "./riverHydraulicMesh";
import { createTownWater, townWaterHeightAt } from "./waterMeshes";

it("renders paired horizontal bank sections and matches hydraulic queries at bends", () => {
  const profile = solveRiverHydraulics({
    corridor: {
      kind: "riverCorridor",
      id: "r",
      sourceId: "r",
      centerline: [
        [0, 0],
        [0, 40],
        [30, 70]
      ],
      widthsMeters: [10, 10, 10],
      bedMeters: [20, 15, 10],
      depthMeters: 1.4,
      bank: { kind: "slope", runMeters: 6 }
    },
    bankDropMeters: 4,
    landAt: ([x, y]) => 50 + x * 0.2 - y * 0.3
  })!;
  const mesh = createRiverHydraulicMesh([profile], 10, 0x527f8b)!;
  const positions = mesh.geometry.getAttribute("position");
  for (let i = 0; i < profile.stations.length; i++) {
    expect(positions.getY(i * 2)).toBe(positions.getY(i * 2 + 1));
    const station = profile.stations[i];
    expect(positions.getY(i * 2)).toBeCloseTo(LAND_Y + station.surfaceMeters - 10, 4);
  }
  mesh.updateMatrixWorld(true);
  for (let i = 1; i < profile.stations.length; i++) {
    const a = profile.stations[i - 1],
      b = profile.stations[i];
    const point: [number, number] = [(a.point[0] + b.point[0]) / 2, (a.point[1] + b.point[1]) / 2];
    const hits: THREE.Intersection[] = [];
    const ray = new THREE.Raycaster(new THREE.Vector3(point[0], 1000, -point[1]), new THREE.Vector3(0, -1, 0));
    THREE.Mesh.prototype.raycast.call(mesh, ray, hits);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.y).toBeCloseTo(LAND_Y + hydraulicWaterAt([profile], point)! - 10, 4);
  }
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
});

it("applies River depth below the lower bank in Three.js and recuts the bed without changing the saved recipe", () => {
  const document = createDocument("river-depth-slider", 200);
  document.mesh.vertices.up = { id: "up", point: [0, -80], locked: false };
  document.mesh.vertices.down = { id: "down", point: [0, 80], locked: false };
  document.featureGroups = [
    {
      id: "river",
      kind: "river",
      name: "River",
      vertices: ["up", "down"],
      source: null,
      mouth: null,
      style: { widthMeters: 20, color: "#527f8b" },
      locked: false
    }
  ];
  document.terrain = {
    version: 1,
    features: [
      {
        kind: "riverCorridor",
        id: "corridor",
        sourceId: "river",
        centerline: [
          [0, -80],
          [0, 80]
        ],
        widthsMeters: [20, 20],
        bedMeters: [95, 95],
        depthMeters: 2,
        bank: { kind: "slope", runMeters: 6 }
      }
    ],
    field: {
      version: 1,
      template: "noise",
      seed: 0,
      sampleMeters: 5,
      parts: [
        {
          kind: "coarse",
          origin: [-100, -100],
          spacingMeters: 200,
          columns: 2,
          rows: 2,
          elevationsMeters: [90, 110, 90, 110]
        }
      ]
    }
  };
  const before = JSON.stringify(document);
  const terrain = cityTerrain(document);
  const shallow = createTownWater(document, terrain, 1);
  const deep = createTownWater(document, terrain, 5);
  for (const x of [-5, 0, 5]) {
    // Lower bank x=-10 is 99 m; do not apply the old extra 1 m drawing offset.
    expect(townWaterHeightAt(deep, [x, 0])).toBeCloseTo(LAND_Y + 99 - 5 - terrain.datumMeters, 4);
    expect(townWaterHeightAt(shallow, [x, 0]) - townWaterHeightAt(deep, [x, 0])).toBeCloseTo(4, 4);
  }
  expect(JSON.stringify(document)).toBe(before);
  shallow.dispose();
  deep.dispose();
});
