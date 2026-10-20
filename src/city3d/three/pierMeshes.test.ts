import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { corridor } from "../../city-editor/generators/parcelGeometry";
import { LAND_Y } from "../core/waterGeometry";
import { createTownPiers } from "./pierMeshes";

it("keeps oblique decks on the SVG footprint, joins raised land and extends piles beneath the water", () => {
  const footprint = corridor([14, 23], [24, 53], 4);
  const piers = createTownPiers(
    [{ id: "river-pier", deck: footprint, depth: 4 }],
    () => -3,
    () => 5
  );
  piers.group.updateMatrixWorld(true);
  const deck = piers.group.getObjectByName("pier-decks") as THREE.Mesh;
  const hit = (x: number, y: number) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 100, -y), new THREE.Vector3(0, -1, 0));
    const hits: THREE.Intersection[] = [];
    THREE.Mesh.prototype.raycast.call(deck, ray, hits);
    return hits;
  };
  expect(hit(19, 38)[0].point.y).toBeCloseTo(LAND_Y + 5 + 0.15);
  expect(hit(12, 38)).toHaveLength(0);
  const positions = deck.geometry.getAttribute("position");
  for (const [x, y] of footprint) {
    expect(
      Array.from({ length: positions.count }, (_, i) => Math.hypot(positions.getX(i) - x, positions.getZ(i) + y)).some(
        d => d < 1e-4
      )
    ).toBe(true);
  }
  const piles = piers.group.getObjectByName("pier-piles") as THREE.InstancedMesh;
  const bounds = new THREE.Box3().setFromObject(piles);
  expect(bounds.min.y).toBeCloseTo(-7.3);
  expect(bounds.max.y).toBeLessThan(hit(19, 38)[0].point.y);
  expect(piers.group.getObjectByName("pier-bollards")).toBeDefined();
  expect(piers.group.getObjectByName("pier-planks")).toBeDefined();
  expect(piers.pickables).toEqual([]);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  piers.group.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    resources.add(object.geometry);
    for (const material of [object.material].flat()) resources.add(material);
    expect([...object.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  });
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  new THREE.Scene().add(piers.group);
  piers.dispose();
  expect(piers.group.parent).toBeNull();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});

it("keeps a deck above high water and creates no geometry when the port has no piers", () => {
  const piers = createTownPiers(
    [{ id: "high-water", deck: corridor([0, 0], [10, 0], 3), depth: 2 }],
    () => 2,
    () => 0
  );
  const deck = piers.group.getObjectByName("pier-decks") as THREE.Mesh;
  deck.geometry.computeBoundingBox();
  expect(deck.geometry.boundingBox!.max.y).toBeCloseTo(2.8);
  piers.dispose();
  const empty = createTownPiers(
    [],
    () => 0,
    () => 0
  );
  expect(empty.group.children).toHaveLength(0);
  empty.dispose();
});
