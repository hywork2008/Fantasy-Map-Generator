import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createLandscapeTree, type TreeSpecies } from "../../buildings/landscape/trees";
import { CE_ADOPTION, sceneVariants } from "../adoption";
import { createForestTreeDetails, type ForestTreeSite } from "./forestTreeDetails";

it("limits simultaneously selected species, evicts inactive prototypes and admits species from later views", () => {
  const parent = new THREE.Group();
  const details = createForestTreeDetails(parent);
  const geometry = new THREE.BoxGeometry(1, 10, 1);
  const material = new THREE.MeshLambertMaterial();
  const base = new THREE.InstancedMesh(geometry, material, 5);
  const species: TreeSpecies[] = ["black_alder", "mediterranean_cypress", "oriental_evergreen", "canary_pine", "rowan"];
  const sites = species.map((species, index): ForestTreeSite => {
    base.setMatrixAt(index, new THREE.Matrix4().makeScale(3, 1, 3));
    return { id: String(index), point: [0, 0], radius: 3, size: 1, species, mesh: base, index };
  });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 5, 70);
  camera.lookAt(0, 5, 0);
  const budget = { triangles: Infinity, calls: Infinity, shadowTriangles: 0 };
  try {
    const first = details.update(camera, 720, sites, budget);
    expect(first.trees).toBe(4);
    expect(first.species).not.toContain("rowan");
    const firstMesh = parent.getObjectByName("forest-bv-black_alder-ultra-plain") as THREE.InstancedMesh;
    const freedGeometry = vi.spyOn(firstMesh.geometry, "dispose");
    const freedInstance = vi.spyOn(firstMesh, "dispose");
    details.reset();
    expect(details.update(camera, 720, sites.slice(4), budget).species).toEqual(["rowan"]);
    expect(freedGeometry).toHaveBeenCalledOnce();
    expect(freedInstance).toHaveBeenCalledOnce();
    expect(firstMesh.parent).toBeNull();
    details.reset();
    expect(details.update(camera, 720, sites.slice(0, 1), budget).species).toEqual(["black_alder"]);
    expect(parent.getObjectByName(firstMesh.name)).not.toBe(firstMesh);
    details.dispose();
    expect(freedGeometry).toHaveBeenCalledOnce();
    expect(freedInstance).toHaveBeenCalledOnce();
  } finally {
    details.dispose();
    base.dispose();
    geometry.dispose();
    material.dispose();
  }
});

it("prioritizes an on-screen crown over a closer off-screen tree and restores its base instance", () => {
  const parent = new THREE.Group(),
    details = createForestTreeDetails(parent);
  const geometry = new THREE.BoxGeometry(1, 10, 1),
    material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  parent.add(mesh);
  const matrices = [
    new THREE.Matrix4().makeScale(3, 1, 3).setPosition(5, 0, 26),
    new THREE.Matrix4().makeScale(3, 1, 3)
  ];
  matrices.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
  });
  const sites: ForestTreeSite[] = matrices.map((m, index) => ({
    id: String(index),
    point: [m.elements[12], -m.elements[14]],
    radius: 3,
    size: 1,
    species: "sacred_yew",
    mesh,
    index
  }));
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 7, 30);
  camera.lookAt(0, 7, 0);
  camera.updateMatrixWorld(true);
  const source = createLandscapeTree("sacred_yew");
  let triangles = 0;
  source.group.traverse(o => {
    if (o instanceof THREE.Mesh)
      triangles += (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3;
  });
  source.dispose();
  const result = details.update(camera, 720, sites, { triangles, calls: 2, shadowTriangles: 0 });
  expect(result.trees).toBe(1);
  const first = new THREE.Matrix4(),
    second = new THREE.Matrix4();
  mesh.getMatrixAt(0, first);
  mesh.getMatrixAt(1, second);
  expect(first.elements).toEqual(matrices[0].elements);
  expect(new THREE.Vector3().setFromMatrixScale(second).length()).toBe(0);
  details.reset();
  mesh.getMatrixAt(1, second);
  expect(second.elements).toEqual(matrices[1].elements);
  details.dispose();
  geometry.dispose();
  material.dispose();
  mesh.dispose();
});

it("grows full-detail instance buffers without losing transforms or leaking shared geometry", () => {
  const group = new THREE.Group();
  const details = createForestTreeDetails(group);
  const geometry = new THREE.BoxGeometry(1, 10, 1);
  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 40);
  const sites: ForestTreeSite[] = Array.from({ length: 40 }, (_, index) => {
    mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(index * 0.1, 0, 0));
    return { id: String(index), point: [index * 0.1, 0], radius: 3, size: 1, species: "garden_parkland", mesh, index };
  });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20000);
  camera.position.set(0, 10000, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const budget = { triangles: Infinity, calls: Infinity, shadowTriangles: Infinity };
  expect(details.update(camera, 720, sites.slice(0, 20), budget, false).trees).toBe(20);
  const old = group.getObjectByName("forest-bv-garden_parkland-ultra-shadow") as THREE.InstancedMesh;
  let freed = 0;
  old.geometry.addEventListener("dispose", () => freed++);
  details.reset();
  expect(details.update(camera, 720, sites, budget, false).trees).toBe(40);
  const grown = group.getObjectByName("forest-bv-garden_parkland-ultra-shadow") as THREE.InstancedMesh;
  expect(grown).not.toBe(old);
  expect(grown.geometry).toBe(old.geometry);
  expect(grown.count).toBe(40);
  expect(grown.instanceMatrix.count).toBeGreaterThanOrEqual(40);
  expect(freed).toBe(0);
  details.reset();
  const restored = new THREE.Matrix4();
  mesh.getMatrixAt(39, restored);
  expect(restored.elements[12]).toBeCloseTo(3.9);
  details.dispose();
  details.dispose();
  expect(freed).toBe(1);
  geometry.dispose();
  material.dispose();
  mesh.dispose();
});

it("switches an adopted medium variant without reusing the previous author's cached model", () => {
  const group = new THREE.Group();
  const details = createForestTreeDetails(group);
  const geometry = new THREE.BoxGeometry(1, 10, 1);
  const material = new THREE.MeshLambertMaterial();
  const base = new THREE.InstancedMesh(geometry, material, 1);
  base.setMatrixAt(0, new THREE.Matrix4().makeScale(3, 1, 3));
  const site: ForestTreeSite = {
    id: "lime",
    point: [0, 0],
    radius: 3,
    size: 1,
    species: "garden_parkland",
    mesh: base,
    index: 0
  };
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 5, 200);
  camera.lookAt(0, 5, 0);
  const budget = { triangles: Infinity, calls: Infinity, shadowTriangles: 0 };
  const adoption = CE_ADOPTION["tree.garden-parkland"].medium;
  const original = adoption.variant;
  try {
    expect(details.update(camera, 720, [site], budget).tiers.medium).toBe(1);
    expect(sceneVariants(group)).toEqual([original]);
    adoption.variant = "tree.garden-parkland@medium#codex-gpt-6.1-sol";
    details.reset();
    expect(details.update(camera, 720, [site], budget).tiers.medium).toBe(1);
    expect(sceneVariants(group)).toEqual([adoption.variant]);
  } finally {
    adoption.variant = original;
    details.dispose();
    base.dispose();
    geometry.dispose();
    material.dispose();
  }
});

it("keeps the exact distance tier for every lime despite size variation, geometry budgets and the old 256-tree cap", () => {
  const group = new THREE.Group();
  const details = createForestTreeDetails(group);
  const geometry = new THREE.BoxGeometry(1, 10, 1);
  const material = new THREE.MeshLambertMaterial();
  const base = new THREE.InstancedMesh(geometry, material, 270);
  const sites: ForestTreeSite[] = Array.from({ length: 270 }, (_, index) => {
    const size = index % 2 ? 0.8 : 1.2;
    base.setMatrixAt(index, new THREE.Matrix4().makeScale(3, size, 3).setPosition(index * 0.001, 0, 0));
    return {
      id: String(index),
      point: [index * 0.001, 0],
      radius: 3,
      size,
      species: "garden_parkland",
      mesh: base,
      index
    };
  });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  try {
    for (const [distance, tier] of [
      [35, "ultra"],
      [70, "high"],
      [200, "medium"],
      [500, "low"],
      [35, "ultra"]
    ] as const) {
      details.reset();
      camera.position.set(0, 5, distance);
      camera.lookAt(0, 5, 0);
      const stats = details.update(camera, 720, sites, { triangles: 1, calls: 0, shadowTriangles: 0 });
      expect(stats.trees).toBe(270);
      expect(stats.tiers[tier]).toBe(270);
      expect(stats.shadowTriangles).toBe(0);
    }
  } finally {
    details.dispose();
    base.dispose();
    geometry.dispose();
    material.dispose();
  }
});
