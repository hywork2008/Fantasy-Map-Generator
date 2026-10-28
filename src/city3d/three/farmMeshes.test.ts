import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type { FarmPlot } from "../../city-editor/types/contracts/ruralFields";
import { createTownFarms } from "./farmMeshes";

const farm = (overrides: Partial<FarmPlot> = {}): FarmPlot => ({
  faceId: "field",
  cropState: "spring-crop",
  polygon: [
    [10, 20],
    [30, 20],
    [30, 40],
    [10, 40]
  ],
  rows: [
    [
      [12, 25],
      [28, 25]
    ]
  ],
  boundaries: [],
  ...overrides
});

it("batches field surfaces and rows in plan coordinates at terrain heights, and releases their resources", () => {
  const farms = [
    farm(),
    farm({
      polygon: [
        [40, 20],
        [60, 20],
        [60, 40],
        [40, 40]
      ],
      rows: [],
      cropState: "fallow"
    })
  ];
  const before = JSON.stringify(farms);
  const meshes = createTownFarms(farms, { relief: true, heightAt: ([x, y]) => (x + y) / 10 });
  expect(meshes.parent.children).toHaveLength(2);
  const surface = meshes.parent.getObjectByName("ce-field-surfaces") as THREE.Mesh;
  const rows = meshes.parent.getObjectByName("ce-field-rows-and-boundaries") as THREE.LineSegments;
  for (const [geometry, offset] of [
    [surface.geometry, 0.035],
    [rows.geometry, 0.07]
  ] as const) {
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getX(i)).toBeGreaterThanOrEqual(10);
      expect(positions.getZ(i)).toBeLessThanOrEqual(-20);
      expect(positions.getY(i)).toBeCloseTo((positions.getX(i) - positions.getZ(i)) / 10 + offset, 5);
    }
  }
  expect(rows.geometry.getAttribute("position").count).toBe(4);
  expect(surface.geometry.getAttribute("color").count).toBe(surface.geometry.getAttribute("position").count);
  expect(JSON.stringify(farms)).toBe(before);
  meshes.parent.updateMatrixWorld(true);
  expect(
    new THREE.Raycaster(new THREE.Vector3(20, 50, -30), new THREE.Vector3(0, -1, 0)).intersectObject(
      meshes.parent,
      true
    )
  ).toHaveLength(0);
  const scene = new THREE.Scene();
  scene.add(meshes.parent);
  const resources = [
    surface.geometry,
    surface.material as THREE.Material,
    rows.geometry,
    rows.material as THREE.Material
  ];
  const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
  meshes.dispose();
  expect(scene.children).toHaveLength(0);
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});

it("keeps a concave field notch open instead of filling its bounding box", () => {
  const meshes = createTownFarms([
    farm({
      polygon: [
        [0, 0],
        [30, 0],
        [30, 30],
        [20, 30],
        [20, 10],
        [10, 10],
        [10, 30],
        [0, 30]
      ],
      rows: []
    })
  ]);
  const surface = meshes.parent.children[0] as THREE.Mesh;
  surface.raycast = THREE.Mesh.prototype.raycast;
  surface.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(15, 10, -20), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObject(surface)).toHaveLength(0);
  ray.set(new THREE.Vector3(5, 10, -20), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObject(surface).length).toBeGreaterThan(0);
  meshes.dispose();
});

it("does not invent rows for fallow fields or fences on a clipped frame edge, and handles absent farmland", () => {
  const meshes = createTownFarms([farm({ cropState: "fallow", clippedByFrame: true, boundaries: undefined })]);
  expect(meshes.parent.children).toHaveLength(1);
  meshes.dispose();
  const empty = createTownFarms([]);
  expect(empty.parent.children).toHaveLength(0);
  empty.dispose();
});

it("physically subtracts a narrow river from soil, rows and boundaries while retaining both banks", () => {
  const river: [number, number][] = [
    [19.9, 0],
    [20.1, 0],
    [20.1, 60],
    [19.9, 60]
  ];
  const source = farm({
    boundaries: [
      [
        [10, 35],
        [30, 35]
      ]
    ]
  });
  const before = JSON.stringify(source);
  const meshes = createTownFarms([source], undefined, [river]);
  const surface = meshes.parent.getObjectByName("ce-field-surfaces") as THREE.Mesh;
  surface.raycast = THREE.Mesh.prototype.raycast;
  surface.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(20, 10, -30), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObject(surface)).toHaveLength(0);
  for (const x of [19.8, 20.2]) {
    ray.set(new THREE.Vector3(x, 10, -30), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(surface).length).toBeGreaterThan(0);
  }
  const p = surface.geometry.getAttribute("position");
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i),
      az = p.getZ(i),
      bx = p.getX(i + 1),
      bz = p.getZ(i + 1),
      cx = p.getX(i + 2),
      cz = p.getZ(i + 2);
    area += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
  }
  expect(area).toBeCloseTo(396, 3);
  const lines = (
    meshes.parent.getObjectByName("ce-field-rows-and-boundaries") as THREE.LineSegments
  ).geometry.getAttribute("position");
  expect(lines.count).toBe(8);
  for (let i = 0; i < lines.count; i += 2)
    expect(lines.getX(i + 1) <= 19.90001 || lines.getX(i) >= 20.09999).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
  meshes.dispose();
});

it("leaves no soil or lines when water covers a field completely", () => {
  const water: [number, number][] = [
    [0, 0],
    [50, 0],
    [50, 50],
    [0, 50]
  ];
  const meshes = createTownFarms([farm()], undefined, [water]);
  expect(meshes.parent.children).toHaveLength(0);
  meshes.dispose();
});

it("renders wheat as a raised, batched canopy with bounded geometry rather than individual stalks", () => {
  const plots = [farm({ cropState: "winter-crop" }), farm({ cropState: "crop" })];
  const meshes = createTownFarms(plots, { relief: true, heightAt: ([x]) => x / 10 });
  expect(meshes.parent.children).toHaveLength(1);
  const surface = meshes.parent.children[0] as THREE.Mesh;
  const positions = surface.geometry.getAttribute("position");
  const crop = surface.geometry.getAttribute("crop");
  expect(crop.count).toBe(positions.count);
  expect(positions.count).toBeLessThan(2000);
  let top = 0,
    bottom = 0;
  for (let i = 0; i < positions.count; i++) {
    const offset = positions.getY(i) - positions.getX(i) / 10;
    expect(crop.getX(i)).toBe(1);
    expect(offset >= 0.03499 && offset <= 0.85001).toBe(true);
    if (Math.abs(offset - 0.85) < 0.00001) top++;
    if (Math.abs(offset - 0.035) < 0.00001) bottom++;
  }
  expect(top).toBeGreaterThan(0);
  expect(bottom).toBeGreaterThan(0);
  meshes.dispose();
});

it("drapes fields over cell boundary creases instead of burying them under the bank", () => {
  const triangles = [
    {
      faceId: "low",
      points: [
        [10, 20],
        [20, 20],
        [20, 40]
      ],
      heights: [0, 10, 10]
    },
    {
      faceId: "low",
      points: [
        [10, 20],
        [20, 40],
        [10, 40]
      ],
      heights: [0, 10, 0]
    },
    {
      faceId: "high",
      points: [
        [20, 20],
        [30, 20],
        [30, 40]
      ],
      heights: [10, 0, 0]
    },
    {
      faceId: "high",
      points: [
        [20, 20],
        [30, 40],
        [20, 40]
      ],
      heights: [10, 0, 10]
    }
  ] as import("../../city-editor/types/terrain").TerrainPatch[];
  for (const cropState of ["spring-crop", "winter-crop", "fallow"] as const) {
    const meshes = createTownFarms([farm({ cropState, rows: [] })], {
      relief: true,
      heightAt: ([x]) => 10 - Math.abs(x - 20),
      triangles
    });
    const surface = meshes.parent.getObjectByName("ce-field-surfaces") as THREE.Mesh;
    surface.raycast = THREE.Mesh.prototype.raycast;
    surface.updateMatrixWorld(true);
    for (const x of [19.9, 20, 20.1]) {
      const hits = new THREE.Raycaster(new THREE.Vector3(x, 30, -30), new THREE.Vector3(0, -1, 0)).intersectObject(
        surface
      );
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(10 - Math.abs(x - 20) + (cropState === "winter-crop" ? 0.85 : 0.035), 4);
    }
    meshes.dispose();
  }
});

it("refines farmland relief and draws saved wheat rows above the canopy only when outskirts simplification is off", () => {
  const plots = [farm({ cropState: "winter-crop" })];
  const terrain = { relief: true, heightAt: ([x, y]: [number, number]) => (x + y) / 10 };
  const automatic = createTownFarms(plots, terrain);
  const full = createTownFarms(plots, terrain, [], false);
  const surface = (view: ReturnType<typeof createTownFarms>) =>
    (view.parent.getObjectByName("ce-field-surfaces") as THREE.Mesh).geometry;
  expect(surface(full).getAttribute("position").count).toBeGreaterThan(
    surface(automatic).getAttribute("position").count
  );
  expect(automatic.parent.getObjectByName("ce-field-rows-and-boundaries")).toBeUndefined();
  const rows = (
    full.parent.getObjectByName("ce-field-rows-and-boundaries") as THREE.LineSegments
  ).geometry.getAttribute("position");
  expect(rows.count).toBeGreaterThan(0);
  for (let i = 0; i < rows.count; i++) expect(rows.getY(i)).toBeCloseTo((rows.getX(i) - rows.getZ(i)) / 10 + 0.875, 5);
  automatic.dispose();
  full.dispose();
});
