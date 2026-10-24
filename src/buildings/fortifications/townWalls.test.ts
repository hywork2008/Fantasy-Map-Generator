import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { meshProjection } from "../meshProjection";
import { TOWN_WALL_AUTHOR, TOWN_WALL_RESOLUTIONS, TOWN_WALLS } from "./townWalls";

function heightAt(meshes: THREE.Mesh[], x: number, z: number): number {
  const hit = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObjects(meshes)[0];
  return hit?.point.y ?? 0;
}

describe("town wall studies", () => {
  it("ships only the high tier, authored for the viewer", () => {
    expect(TOWN_WALL_AUTHOR).toBe("Grok");
    expect(TOWN_WALL_RESOLUTIONS).toEqual(["high"]);
    expect(TOWN_WALLS.map(model => model.task)).toEqual(["W01", "W02", "W03"]);
  });

  for (const model of TOWN_WALLS) {
    it(`${model.task} grounds ${model.name}, stays inside its envelope and disposes its resources`, () => {
      const assembly = model.create();
      let disposed = false;
      try {
        assembly.group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(assembly.group);
        const size = bounds.getSize(new THREE.Vector3());
        expect(bounds.min.y).toBeCloseTo(0, 3);
        expect(size.x).toBeGreaterThan(1);
        expect(size.x).toBeLessThanOrEqual(model.size[0] + 0.01);
        expect(size.z).toBeLessThanOrEqual(model.size[1] + 0.01);
        expect(bounds.max.y).toBeLessThanOrEqual(model.size[2] + 0.01);
        for (const mesh of assembly.pickables) {
          const vertices = mesh.geometry.getAttribute("position");
          expect(vertices.count).toBeGreaterThan(0);
          expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);
        }
        for (const view of ["top", "side"] as const) {
          const svg = meshProjection(assembly, view);
          expect(svg).toContain("<path");
          expect(svg).not.toMatch(/NaN|Infinity/);
        }
        const geometries = new Set(assembly.pickables.map(mesh => mesh.geometry));
        const materials = new Set(assembly.pickables.flatMap(mesh => mesh.material));
        const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, "dispose"));
        assembly.dispose();
        disposed = true;
        for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        if (!disposed) assembly.dispose();
      }
    });
  }

  it("breaks the curtain parapet into merlons and crenels", () => {
    const curtain = TOWN_WALLS[0].create();
    try {
      curtain.group.updateMatrixWorld(true);
      let merlons = 0;
      let crenels = 0;
      for (let x = -6; x <= 6; x += 0.25) {
        const y = heightAt(curtain.pickables, x, 1.02);
        if (y > 9.2) merlons += 1;
        else if (y > 8.2 && y < 8.9) crenels += 1;
      }
      expect(merlons).toBeGreaterThan(3);
      expect(crenels).toBeGreaterThan(3);
    } finally {
      curtain.dispose();
    }
  });

  it("keeps the mural tower hollow below the wall-walk and open at both doors", () => {
    const tower = TOWN_WALLS[1].create();
    try {
      tower.group.updateMatrixWorld(true);
      const blocked = new THREE.Raycaster(new THREE.Vector3(6, 4, 0.55), new THREE.Vector3(-1, 0, 0), 0, 8);
      expect(blocked.intersectObjects(tower.pickables)[0]?.point.x).toBeGreaterThan(2);
      for (const origin of [new THREE.Vector3(6, 9, 0.55), new THREE.Vector3(-6, 9, 0.55)]) {
        const direction = origin.x > 0 ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(1, 0, 0);
        const hit = new THREE.Raycaster(origin, direction, 0, 12).intersectObjects(tower.pickables)[0];
        expect(hit?.point.x ?? 0).toBeLessThan(1.2);
        expect(Math.abs(hit?.point.x ?? 99)).toBeGreaterThan(1.5);
      }
    } finally {
      tower.dispose();
    }
  });

  it("leaves the town-gate passage clear up to cart height", () => {
    const gate = TOWN_WALLS[2].create();
    try {
      gate.group.updateMatrixWorld(true);
      for (const y of [0.6, 1.7, 2.85]) {
        for (const x of [-0.7, 0, 0.7]) {
          const ray = new THREE.Raycaster(new THREE.Vector3(x, y, -8), new THREE.Vector3(0, 0, 1), 0, 16);
          expect(ray.intersectObjects(gate.pickables), `x ${x}, y ${y}`).toHaveLength(0);
        }
      }
      const names = new Set(gate.pickables.map(mesh => mesh.name));
      expect(names.has("gate-arch")).toBe(true);
      expect(names.has("portcullis-bar")).toBe(true);
      expect(names.has("gate-door")).toBe(true);
      expect(names.has("tower-roof")).toBe(true);
    } finally {
      gate.dispose();
    }
  });
});
