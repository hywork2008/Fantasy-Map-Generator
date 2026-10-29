import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type { BurgSiteDescriptor } from "../city-editor/types/contracts/burgSiteDescriptor";
import { forestCanopyTint } from "./three/forestMeshes";
import { createForestTreeDetails, type ForestTreeSite } from "./three/forestTreeDetails";
import { treeSeason } from "./treeSeason";

const TEMPERATE = [0.9, 2.0, 5.6, 9.6, 14.0, 17.2, 19.3, 18.8, 14.8, 10.0, 5.4, 2.1];
const site = (month?: number, temperatures: number[] | null = TEMPERATE) =>
  ({
    ...(month ? { date: { year: 1200, month } } : {}),
    climate: { temperatureC: 10, biomeId: 6, ...(temperatures ? { monthlyMeanTemperatureC: temperatures } : {}) }
  }) as unknown as BurgSiteDescriptor;

it("draws the descriptor's month or the viewer's, and keeps default looks without monthly climate", () => {
  expect(treeSeason(site(7, null))).toBeUndefined();
  expect(treeSeason(site(undefined))).toBeUndefined();
  const january = treeSeason(site(1))!;
  expect(january.look("european_beech")?.appearance).toBe("bare");
  // Summer foliage is the default model, shared with views that have no season.
  expect(treeSeason(site(1), 7)!.look("european_beech")).toBeUndefined();
  expect(january.look("scots_pine")).toBeUndefined();
});

it("swaps detailed trees to the month's look, releases the previous prototypes and keeps placement", () => {
  const parent = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 10, 1);
  const material = new THREE.MeshLambertMaterial();
  const base = new THREE.InstancedMesh(geometry, material, 1);
  base.setMatrixAt(0, new THREE.Matrix4().makeScale(3, 1, 3));
  const sites: ForestTreeSite[] = [
    { id: "0", point: [0, 0], radius: 3, size: 1, species: "european_beech", mesh: base, index: 0 }
  ];
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 5, 70);
  camera.lookAt(0, 5, 0);
  const budget = { triangles: Infinity, calls: Infinity, shadowTriangles: 0 };
  const details = createForestTreeDetails(parent, undefined, treeSeason(site(7)));
  const drawn = () =>
    parent
      .getObjectByName("forest-bv-trees")!
      .children.filter((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh)
      .filter(mesh => mesh.count > 0);
  try {
    details.update(camera, 720, sites, budget);
    const [summer] = drawn();
    expect(summer.userData.treeAppearance).toBeUndefined();
    const freed = vi.spyOn(summer.geometry, "dispose");
    expect(details.setSeason(treeSeason(site(7)))).toBe(false);
    expect(details.setSeason(treeSeason(site(1)))).toBe(true);
    expect(freed).toHaveBeenCalledOnce();
    details.update(camera, 720, sites, budget);
    const [winter] = drawn();
    expect(winter.userData.treeAppearance).toBe("bare");
    const matrix = new THREE.Matrix4();
    winter.getMatrixAt(0, matrix);
    const before = new THREE.Matrix4();
    summer.getMatrixAt(0, before);
    expect(matrix.elements).toEqual(before.elements);
  } finally {
    details.dispose();
    base.dispose();
    geometry.dispose();
    material.dispose();
  }
});

it("tints the aggregate canopy by the share of bare and turning trees", () => {
  const winter = treeSeason(site(1));
  expect(forestCanopyTint(["scots_pine"], winter).toArray()).toEqual([1, 1, 1]);
  const bare = forestCanopyTint(["european_beech"], winter);
  const half = forestCanopyTint(["european_beech", "scots_pine"], winter);
  expect(bare.r).toBeGreaterThan(1);
  expect(bare.g).toBeLessThan(1);
  expect(half.r).toBeCloseTo((bare.r + 1) / 2, 6);
  expect(forestCanopyTint(["european_beech"], undefined).toArray()).toEqual([1, 1, 1]);
});
