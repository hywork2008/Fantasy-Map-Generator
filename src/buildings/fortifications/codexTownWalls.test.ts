import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { BUILDING_PALETTES } from "../appearance/palette";
import { CODEX_TOWN_WALLS } from "./codexTownWalls";

function hits(
  model: ReturnType<(typeof CODEX_TOWN_WALLS)[number]["create"]>,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  far = 20
) {
  model.group.updateMatrixWorld(true);
  return new THREE.Raycaster(origin, direction, 0, far).intersectObjects(model.pickables);
}

describe("Codex late medieval town walls", () => {
  for (const definition of CODEX_TOWN_WALLS.slice(1)) {
    it(`${definition.task} applies the housing palette to every roof surface only`, () => {
      const original = definition.create();
      const terracotta = definition.create("mediterranean");
      try {
        const swatches = BUILDING_PALETTES.terracotta.map(hex => new THREE.Color(hex));
        for (const mesh of terracotta.pickables) {
          const colors = mesh.geometry.getAttribute("color");
          if (/roof|slate/.test(mesh.name) && mesh.name !== "roof-finial" && mesh.name !== "roof-bearing-post") {
            for (let i = 0; i < colors.count; i++) {
              const color = new THREE.Color().fromBufferAttribute(colors, i);
              expect(
                swatches.some(
                  swatch =>
                    Math.abs(color.r - swatch.r) + Math.abs(color.g - swatch.g) + Math.abs(color.b - swatch.b) < 1e-6
                )
              ).toBe(true);
            }
          } else {
            const before = original.pickables.find(candidate => candidate.name === mesh.name)!;
            expect(colors.array).toEqual(before.geometry.getAttribute("color").array);
          }
        }
      } finally {
        original.dispose();
        terracotta.dispose();
      }
    });
  }

  for (const definition of CODEX_TOWN_WALLS) {
    it(`${definition.task} has finite coloured geometry within its envelope and batches its stones`, () => {
      const model = definition.create();
      try {
        const bounds = new THREE.Box3().setFromObject(model.group);
        const size = bounds.getSize(new THREE.Vector3());
        expect(bounds.min.y).toBeCloseTo(0, 3);
        expect(size.x).toBeLessThanOrEqual(definition.size[0]);
        expect(size.z).toBeLessThanOrEqual(definition.size[1]);
        expect(bounds.max.y).toBeLessThanOrEqual(definition.size[2]);
        // Individual ashlar and roof tiles must not become thousands of draw calls.
        expect(model.pickables.length).toBeLessThan(45);
        let triangles = 0;
        for (const mesh of model.pickables) {
          const position = mesh.geometry.getAttribute("position");
          expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
          expect(mesh.geometry.getAttribute("color").count).toBe(position.count);
          triangles += position.count / 3;
        }
        expect(triangles).toBeGreaterThan(1000);
        expect(triangles).toBeLessThan(180000);
      } finally {
        model.dispose();
      }
    });
  }

  it("keeps arrow loops physically open while adjacent ashlar stops a ray", () => {
    const model = CODEX_TOWN_WALLS[0].create();
    try {
      const direction = new THREE.Vector3(0, 0, -1);
      expect(hits(model, new THREE.Vector3(-2.8, 4.6, 5), direction)).toHaveLength(0);
      expect(hits(model, new THREE.Vector3(-2.4, 4.6, 5), direction).length).toBeGreaterThan(0);
    } finally {
      model.dispose();
    }
  });

  it("opens both tower doors at the connecting wall-walk and leaves the drum hollow", () => {
    const model = CODEX_TOWN_WALLS[1].create();
    try {
      for (const side of [-1, 1]) {
        expect(hits(model, new THREE.Vector3(side * 4.5, 9, 0.55), new THREE.Vector3(-side, 0, 0), 4.5)).toHaveLength(
          0
        );
      }
      expect(hits(model, new THREE.Vector3(0, 3, 0.55), new THREE.Vector3(0, 0, 1))[0]?.distance).toBeGreaterThan(2);
      expect(hits(model, new THREE.Vector3(0, 4.6, 6), new THREE.Vector3(0, 0, -1), 5.5)).toHaveLength(0);
    } finally {
      model.dispose();
    }
  });

  it("has a clear cart passage and a continuous pointed vault above it", () => {
    const model = CODEX_TOWN_WALLS[2].create();
    try {
      for (const x of [-1.2, 0, 1.2])
        for (const y of [0.5, 1.8, 3.2])
          expect(hits(model, new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1), 12), `${x}, ${y}`).toHaveLength(
            0
          );
      const up = new THREE.Vector3(0, 1, 0);
      const crown = hits(model, new THREE.Vector3(0, 3, 0), up)[0]?.point.y;
      expect(crown).toBeCloseTo(3.75 + 1.9 * Math.sqrt(3), 2);
    } finally {
      model.dispose();
    }
  });

  it("releases every batched geometry and its shared material once", () => {
    const model = CODEX_TOWN_WALLS[2].create();
    const resources = new Set(model.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
