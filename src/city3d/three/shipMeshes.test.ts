import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createBarge } from "../../buildings/ships/barge";
import { createCaravel } from "../../buildings/ships/caravel";
import { createGalleon } from "../../buildings/ships/galleon";
import { createSloop } from "../../buildings/ships/sloop";
import type { ShipSite } from "../../city-editor/renderers/shipSites";
import { getShipRotationHandlePoint } from "../../city-editor/renderers/shipSvg";
import { createTownShips } from "./shipMeshes";

it("places all four ship models at SVG centers with matching bow directions, hull lengths and waterlines", () => {
  const factories = { small: createSloop, medium: createCaravel, large: createGalleon, barge: createBarge };
  const sites: ShipSite[] = [
    { id: "sloop", type: "small", point: [21, 42], rotation: 0, length: 20 },
    { id: "caravel", type: "medium", point: [-51, 12], rotation: Math.PI / 2, length: 28 },
    { id: "galleon", type: "large", point: [70, -30], rotation: -Math.PI / 2, length: 40 },
    { id: "barge", type: "barge", point: [-30, -45], rotation: 0.73, length: 18 },
    { id: "second-sloop", type: "small", point: [5, -10], rotation: Math.PI, length: 10 }
  ];
  const ships = createTownShips(sites, ([x]) => x / 10 - 2);
  const matrix = new THREE.Matrix4();
  for (const site of sites) {
    const mesh = ships.pickables.find(mesh => mesh.name === `ship-${site.type}`) as THREE.InstancedMesh;
    expect(mesh).toBeDefined();
    mesh.getMatrixAt(mesh.userData.shipIds.indexOf(site.id), matrix);
    const reference = factories[site.type]();
    const hull = reference.pickables.find(
      mesh => mesh.name === (site.type === "barge" ? "hull-sides" : "hull-topsides")
    )!;
    hull.geometry.computeBoundingBox();
    const bounds = hull.geometry.boundingBox!;
    const cx = (bounds.min.x + bounds.max.x) / 2;
    const center = new THREE.Vector3(cx, 0, 0).applyMatrix4(matrix);
    expect(center.x).toBeCloseTo(site.point[0], 5);
    expect(center.z).toBeCloseTo(-site.point[1], 5);
    expect(center.y).toBeCloseTo(site.point[0] / 10 - 2, 5);
    const bow = new THREE.Vector3(bounds.max.x, 0, 0).applyMatrix4(matrix);
    const stern = new THREE.Vector3(bounds.min.x, 0, 0).applyMatrix4(matrix);
    expect(bow.distanceTo(stern)).toBeCloseTo(site.length, 4);
    const handle = getShipRotationHandlePoint(site.point, site.length, site.rotation);
    const expectedDirection = new THREE.Vector3(handle[0] - site.point[0], 0, -handle[1] + site.point[1]).normalize();
    expect(bow.sub(stern).normalize().distanceTo(expectedDirection)).toBeLessThan(1e-6);
    reference.dispose();
  }
  expect((ships.pickables.find(mesh => mesh.name === "ship-small") as THREE.InstancedMesh).count).toBe(2);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  ships.group.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    resources.add(object.geometry);
    for (const material of [object.material].flat()) resources.add(material);
    expect([...object.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  });
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  ships.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});

it("creates an empty group when all ships are removed", () => {
  const ships = createTownShips([], () => 0);
  expect(ships.group.children).toHaveLength(0);
  ships.dispose();
});

it("separates sailing states in one fleet and draws the closed-gunport BV geometry for each", () => {
  const fleet = createTownShips(
    [
      {
        id: "pier-1",
        type: "large",
        length: 47,
        point: [0, 0],
        rotation: 0,
        state: { sails: "furled", gunports: "closed" }
      },
      {
        id: "brush",
        type: "large",
        length: 47,
        point: [100, 0],
        rotation: 0,
        state: { sails: "set", gunports: "closed" }
      },
      {
        id: "pier-2",
        type: "large",
        length: 47,
        point: [200, 0],
        rotation: 0,
        state: { sails: "furled", gunports: "closed" }
      }
    ],
    () => 0
  );
  for (const sails of ["set", "furled"] as const) {
    const meshes = fleet.pickables.filter(m => m.userData.shipState.sails === sails) as THREE.InstancedMesh[];
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.userData.shipState.gunports).toBe("closed");
      expect(mesh.count).toBe(sails === "furled" ? 2 : 1);
      expect(mesh.userData.shipIds).toEqual(sails === "furled" ? ["pier-1", "pier-2"] : ["brush"]);
    }
    const source = createGalleon({ sails, gunports: "closed" });
    const triangles = source.pickables.reduce(
      (n, m) => n + (m.geometry.index?.count ?? m.geometry.getAttribute("position").count) / 3,
      0
    );
    expect(meshes.reduce((n, m) => n + m.geometry.getAttribute("position").count / 3, 0)).toBe(triangles);
    source.dispose();
  }
  fleet.dispose();
});
