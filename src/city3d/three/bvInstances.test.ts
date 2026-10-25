import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createGridDocument } from "../../city-editor/generators/document";
import { pointInPolygon } from "../../city-editor/generators/geom";
import { createRotatedRect } from "../../city-editor/renderers/castleLayoutBuilder";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import { createBvInstances, createBvPrototypeCache } from "./bvInstances";
import { fitBvBuilding } from "./bvPlacement";
import { CE_CHAPEL, createTownSpecialBuildings } from "./specialBuildingMeshes";
import { createTownWells } from "./wellMeshes";

function fixture() {
  const geometry = new THREE.BoxGeometry(2, 4, 6);
  const material = new THREE.MeshLambertMaterial({ color: "#886644", vertexColors: true });
  const colors = new Float32Array(geometry.getAttribute("position").count * 3).fill(0.5);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(2, 5, 3);
  group.add(mesh);
  return {
    group,
    pickables: [mesh],
    dispose: vi.fn(() => {
      geometry.dispose();
      material.dispose();
    })
  };
}

describe("shared BV city instances", () => {
  it("takes ownership of direct geometry without constructing a source model", () => {
    const source = fixture();
    const geometry = source.pickables[0].geometry.toNonIndexed();
    const definition = { id: "direct", create: vi.fn(), createGeometry: vi.fn(() => geometry) };
    const cache = createBvPrototypeCache();
    const first = cache.acquire(definition)!,
      second = cache.acquire(definition)!;
    const dispose = vi.spyOn(geometry, "dispose");
    expect(first.geometry).toBe(geometry);
    expect(definition.createGeometry).toHaveBeenCalledOnce();
    expect(definition.create).not.toHaveBeenCalled();
    first.release();
    expect(dispose).not.toHaveBeenCalled();
    second.release();
    second.release();
    expect(dispose).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    source.dispose();
  });

  it("bakes nested transforms and linear vertex/material colors, sharing resources until the last owner releases them", () => {
    const source = fixture();
    const definition = { id: "fixture", create: vi.fn(() => source) };
    const cache = createBvPrototypeCache();
    const sites = [{ id: "a", definition, matrix: new THREE.Matrix4() }];
    const a = createBvInstances(sites, cache),
      b = createBvInstances(sites, cache);
    expect(definition.create).toHaveBeenCalledOnce();
    expect(source.dispose).toHaveBeenCalledOnce();
    const geometry = a.pickables[0].geometry,
      material = a.pickables[0].material as THREE.Material;
    expect(b.pickables[0].geometry).toBe(geometry);
    expect(geometry.boundingBox!.min.toArray()).toEqual([1, 3, 0]);
    expect(geometry.getAttribute("color").getX(0)).toBeCloseTo(new THREE.Color("#886644").r * 0.5);
    expect(Object.keys(geometry.attributes).sort()).toEqual(["color", "normal", "position"]);
    const freeGeometry = vi.spyOn(geometry, "dispose"),
      freeMaterial = vi.spyOn(material, "dispose");
    a.dispose();
    a.dispose();
    expect(freeGeometry).not.toHaveBeenCalled();
    expect(cache.size).toBe(1);
    b.dispose();
    b.dispose();
    expect(freeGeometry).toHaveBeenCalledOnce();
    expect(freeMaterial).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
  });

  it("rejects unsupported transparency without keeping source resources", () => {
    const source = fixture();
    (source.pickables[0].material as THREE.Material).transparent = true;
    const cache = createBvPrototypeCache();
    const layer = createBvInstances(
      [{ id: "a", definition: { id: "glass", create: () => source }, matrix: new THREE.Matrix4() }],
      cache
    );
    expect(layer.accepted).toHaveLength(0);
    expect(source.dispose).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    layer.dispose();
  });

  it("fits the complete real chapel envelope, keeps proportions and grounds its lowest point", () => {
    const cache = createBvPrototypeCache(),
      prototype = cache.acquire(CE_CHAPEL)!;
    for (const angle of [-0.7, 0, 1.2]) {
      const ring = createRotatedRect([37, -29], 24, 14, angle).reverse();
      const fit = fitBvBuilding(prototype.bounds, ring, angle, 18)!;
      const rotation = new THREE.Quaternion(),
        scale = new THREE.Vector3(),
        position = new THREE.Vector3();
      fit.matrix.decompose(position, rotation, scale);
      expect(scale.x).toBeCloseTo(scale.y);
      expect(scale.y).toBeCloseTo(scale.z);
      const direction = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
      expect(Math.atan2(-direction.z, direction.x)).toBeCloseTo(angle);
      const attribute = prototype.geometry.getAttribute("position");
      let low = Infinity;
      for (let i = 0; i < attribute.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(fit.matrix);
        expect(pointInPolygon([p.x, -p.z], ring)).toBe(true);
        low = Math.min(low, p.y);
      }
      expect(low).toBeCloseTo(18);
    }
    expect(fitBvBuilding(prototype.bounds, createRotatedRect([0, 0], 1, 1, 0), 0, 0)).toBeUndefined();
    expect(
      fitBvBuilding(
        prototype.bounds,
        [
          [0, 0],
          [20, 0],
          [20, 3],
          [3, 3],
          [3, 20],
          [0, 20]
        ],
        0,
        0
      )
    ).toBeUndefined();
    prototype.release();
  });

  it("replaces only fitting supported chapels and preserves fallback/legacy/non-European structures", () => {
    const city = createGridDocument({ size: "tiny", grid: "hex", seed: "bv-special" });
    city.historicalPeriod = "highMedieval";
    city.buildingAppearanceVersion = 1;
    city.buildingAppearanceProfile = "atlantic";
    city.elements = ["fit", "small", "basilica"].map(id => ({
      id,
      kind: "temple",
      point: [0, 0],
      templeType: id === "basilica" ? "basilica" : "chapel"
    }));
    const base: StructureMassing = {
      id: "temple:fit",
      kind: "landmark",
      material: "stone",
      footprint: createRotatedRect([0, 0], 24, 14, 0),
      heightMeters: 7,
      baseElevationMeters: 12,
      roof: "gable",
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: true
    };
    const parts = [
      base,
      { ...base, id: "temple:small", footprint: createRotatedRect([30, 0], 1, 1, 0) },
      { ...base, id: "temple:basilica" }
    ];
    const cache = createBvPrototypeCache();
    const layer = createTownSpecialBuildings(city, parts, cache);
    expect([...layer.replaced]).toEqual(["temple:fit"]);
    expect(parts[0]).toBe(base);
    layer.dispose();
    for (const profile of ["legacy", undefined] as const) {
      const fallback = createTownSpecialBuildings(
        { ...city, buildingAppearanceProfile: profile, civilization: undefined },
        parts,
        cache
      );
      expect(fallback.replaced.size).toBe(0);
      fallback.dispose();
    }
    const modern = createTownSpecialBuildings({ ...city, historicalPeriod: "steamEra" }, parts, cache);
    expect(modern.replaced.size).toBe(0);
    modern.dispose();
    expect(cache.size).toBe(0);
  });

  it("swaps every catalogue basilica part for the detailed model, keeping terrain foundations", () => {
    const city = createGridDocument({ size: "tiny", grid: "hex", seed: "bv-basilica" });
    city.elements = [
      { id: "b", kind: "temple", point: [10, 20], templeType: "basilica", sizeMeters: 54, rotation: 0.3 }
    ];
    const base: StructureMassing = {
      id: "temple:b:nave",
      kind: "landmark",
      material: "stone",
      footprint: createRotatedRect([10, 20], 20, 10, 0.3),
      heightMeters: 12,
      baseElevationMeters: 4,
      roof: "gable",
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: false
    };
    const parts = [base, { ...base, id: "temple:b:apse" }, { ...base, id: "temple:b:nave:foundation" }];
    const cache = createBvPrototypeCache();
    const layer = createTownSpecialBuildings(city, parts, cache);
    expect([...layer.replaced].sort()).toEqual(["temple:b:apse", "temple:b:nave"]);
    const mesh = layer.pickables[0];
    expect(mesh.name).toBe("basilica-temple:low-instances");
    mesh.updateMatrixWorld(true);
    mesh.computeBoundingBox();
    const bounds = mesh.boundingBox!;
    expect(bounds.min.y).toBeGreaterThan(3.5);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(10, -1);
    expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(-20, -1);
    layer.dispose();
    expect(cache.size).toBe(0);
  });

  it("raycasts repeated wells to their original CE IDs, independent of batch order", () => {
    const layer = createTownWells(
      [
        { id: "well-a", point: [0, 0] },
        { id: "basin", point: [12, 0], kind: "publicBasin" },
        { id: "well-b", point: [24, 0] }
      ],
      () => 9
    );
    expect(layer.pickables).toHaveLength(2);
    layer.group.updateMatrixWorld(true);
    for (const [x, id] of [
      [0, "well-a"],
      [12, "basin"],
      [24, "well-b"]
    ] as const) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 30, 0), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(layer.pickables, false)[0];
      expect(hit).toBeDefined();
      expect(layer.resolve(hit)?.id).toBe(id);
    }
    layer.dispose();
  });
});
