import * as THREE from "three";
import { expect, it } from "vitest";
import { createRegionalHouseGeometry, defaultRegionalHouseSpec } from "./regionalHouses";

function fixture(width: number, storeys: number, craft = false) {
  const geometry = createRegionalHouseGeometry(
    {
      ...defaultRegionalHouseSpec("atlantic", 0),
      width,
      depth: 8,
      storeys,
      jetty: 0,
      cover: "tile",
      attached: true,
      groundUse: craft ? "craft" : "residential"
    },
    "high"
  );
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  const hit = (offset: number) =>
    new THREE.Raycaster(new THREE.Vector3(0.7 + offset, 100, -2.1), new THREE.Vector3(0, -1, 0)).intersectObject(
      mesh
    )[0];
  const color = (hit: THREE.Intersection) =>
    new THREE.Color().fromBufferAttribute(geometry.getAttribute("color"), hit.face!.a).getHexString();
  return {
    geometry,
    mesh,
    hit,
    color,
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}

it.each([
  { width: 5, storeys: 2, craft: false, offsets: [0] },
  { width: 8, storeys: 2, craft: false, offsets: [-0.16, 0.16] },
  { width: 8, storeys: 1, craft: false, offsets: [0] },
  { width: 5, storeys: 2, craft: true, offsets: [-0.16, 0.16] }
])(
  "leaves actual open bores for a $width m, $storeys storey house (craft=$craft)",
  ({ width, storeys, craft, offsets }) => {
    const sample = fixture(width, storeys, craft);
    try {
      for (const offset of offsets) {
        const centre = sample.hit(offset),
          rim = sample.hit(offset + 0.1);
        expect(sample.color(centre)).toBe("171512");
        expect(sample.color(rim)).toBe("985c45");
        expect(rim.point.y - centre.point.y).toBeGreaterThan(0.5);
        expect(rim.face!.normal.y).toBeGreaterThan(0.99);
        const inner = new THREE.Raycaster(
          new THREE.Vector3(0.7 + offset, rim.point.y + 0.03, -2.1),
          new THREE.Vector3(0.4, -1, 0).normalize()
        ).intersectObject(sample.mesh)[0];
        expect(sample.color(inner)).toBe("25201b");
        expect(inner.face!.normal.x).toBeLessThan(0);
      }
      // A two-flue stack retains the masonry divider instead of one oversized black depression.
      if (offsets.length === 2) expect(sample.color(sample.hit(0))).not.toBe("171512");
      else expect(sample.color(sample.hit(0.16))).not.toBe("171512");
    } finally {
      sample.dispose();
    }
  }
);

it("keeps the wooded region's masonry outlet open, and supports regional cowls above a real lateral gap", () => {
  for (const profile of ["northern-wooded", "mediterranean", "stone-upland"] as const) {
    const geometry = createRegionalHouseGeometry(
      {
        ...defaultRegionalHouseSpec(profile, 0),
        cover: "tile",
        jetty: 0,
        attached: true
      },
      "high"
    );
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geometry, material);
    try {
      const top = new THREE.Raycaster(new THREE.Vector3(0.7, 100, -2.1), new THREE.Vector3(0, -1, 0)).intersectObject(
        mesh
      )[0];
      const colors = geometry.getAttribute("color");
      if (profile === "northern-wooded") {
        expect(new THREE.Color().fromBufferAttribute(colors, top.face!.a).getHexString()).toBe("171512");
      } else {
        // From inside the air space, a horizontal ray can leave the covered outlet without hitting a sealed coping.
        const clearanceY = top.point.y - (profile === "mediterranean" ? 0.22 : 0.1) - 0.08;
        const side = new THREE.Raycaster(
          new THREE.Vector3(0.7, clearanceY, -2.1),
          new THREE.Vector3(1, 0, 0),
          0,
          0.5
        ).intersectObject(mesh);
        expect(side).toHaveLength(0);
      }
    } finally {
      geometry.dispose();
      material.dispose();
    }
  }
});
