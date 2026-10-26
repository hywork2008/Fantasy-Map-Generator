import * as THREE from "three";
import { expect, it } from "vitest";
import { createHipThatchRoof, hipRoofHeight } from "./hipThatchRoof";
import { createRegionalHouseGeometry, defaultRegionalHouseSpec } from "./regionalHouses";

it.each([false, true])(
  "keeps the hipped thatch coat continuous, closed and close to the roof planes (detailed=%s)",
  detailed => {
    const options = { run: 3, rise: 3, zBack: -5, zFront: 5, detailed };
    const coat = createHipThatchRoof(options);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(coat.body, material);
    try {
      // Main ridge, hip junctions, faces and cut eaves: no floating ridge-sized cylinders.
      for (const [x, z] of [
        [0, 0],
        [-1.5, -3.5],
        [1.5, 3.5],
        [1.5, 0],
        [2.99, 0],
        [0, -4.99]
      ]) {
        const hit = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObject(
          mesh
        )[0];
        const base = hipRoofHeight(3, 3, -5, 5, x, z);
        expect(hit).toBeDefined();
        expect(hit.point.y - base).toBeGreaterThan(0.12);
        expect(hit.point.y - base).toBeLessThanOrEqual(0.301);
        expect(hit.face!.normal.y).toBeGreaterThan(0);
        const below = new THREE.Raycaster(new THREE.Vector3(x, -30, z), new THREE.Vector3(0, 1, 0)).intersectObject(
          mesh
        )[0];
        expect(below).toBeDefined();
        expect(below.face!.normal.y).toBeLessThan(0);
        expect(below.point.y).toBeLessThan(hit.point.y);
      }
      const vertices = coat.grain.reduce((sum, geometry) => sum + geometry.getAttribute("position").count, 0);
      expect(detailed ? vertices > 0 : vertices === 0).toBe(true);
      for (const geometry of [coat.body, ...coat.grain]) {
        const position = geometry.getAttribute("position"),
          normals = geometry.getAttribute("normal");
        expect(normals.count).toBe(position.count);
        expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      }
    } finally {
      for (const geometry of [coat.body, ...coat.grain]) geometry.dispose();
      material.dispose();
    }
  }
);

it.each(["thatch", "tile", "shingle", "slate", "turf", "lead", "stone"] as const)(
  "fits %s hip coverings onto the roof instead of raised logs",
  cover => {
    const spec = {
      ...defaultRegionalHouseSpec("atlantic", 0),
      cover,
      roofForm: "hip" as const,
      attached: true,
      jetty: 0
    };
    const geometry = createRegionalHouseGeometry(spec, "high");
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    try {
      const slope = Math.tan((48 * Math.PI) / 180),
        run = 2.62,
        rise = slope * run;
      const baseY = 6.1 - slope * 0.12;
      for (const [x, z] of [
        [0, 0],
        [-run / 2, -4.1 + run / 2],
        [run / 2, 4.1 - run / 2]
      ]) {
        const hit = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObject(
          mesh
        )[0];
        expect(hit).toBeDefined();
        const surface = baseY + hipRoofHeight(run, rise, -4.1, 4.1, x, z);
        expect(hit.point.y - surface).toBeLessThan(cover === "thatch" ? 0.31 : 0.13);
      }
    } finally {
      geometry.dispose();
      material.dispose();
    }
  }
);
