import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { CEMETERY_VARIANTS } from "../siteVariants";
import { models } from "./44-cemetery-facilitiesModels";
import { addCurvedMasonryBay } from "./curvedMasonry";
import { MAUSOLEUM_PORTAL_Z, MAUSOLEUM_PROFILE, mausoleumPartFactories } from "./mausoleumParts";
import { ModelKit } from "./modelKit";

const definition = models.find(m => m.id === "mausoleum-dome")!;
it("preserves the original Low and default while registering real cemetery High", () => {
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
  expect(adoptedVariant("cemetery.mausoleum_dome", "high").id).toBe(definition.variants![1].id);
  for (const variant of CEMETERY_VARIANTS.filter(v => v.family === "cemetery.mausoleum_dome" && v.level !== "high")) {
    const model = variant.create();
    try {
      expect(landmarkFingerprint(model.group)).toBe("427cacb173b6750d3b8432ece18097329c5e3caba79fc72b839e6a0827ca90b0");
    } finally {
      model.dispose();
    }
  }
});

it("leaves the portal and rotunda interior genuinely open", () => {
  const parts = mausoleumPartFactories(),
    body = parts[1].create(),
    door = parts[3].create();
  try {
    body.group.updateMatrixWorld(true);
    door.group.updateMatrixWorld(true);
    for (const y of [0.65, 1.2, 1.9]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(0, y, MAUSOLEUM_PORTAL_Z + 1),
        new THREE.Vector3(0, 0, -1),
        0,
        1.8
      );
      expect(ray.intersectObjects(body.pickables)).toHaveLength(0);
      expect(ray.intersectObjects(door.pickables)).toHaveLength(0);
    }
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(0, 1.2, 0),
          new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)),
          0,
          2.4
        ).intersectObjects(body.pickables)
      ).toHaveLength(0);
  } finally {
    body.dispose();
    door.dispose();
  }
});

it("keeps curved window apertures, glazing and smooth normals aligned at arbitrary bay angles", () => {
  for (const angle of [0.37, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const k = new ModelKit("curved-window-check");
    addCurvedMasonryBay(
      k,
      3,
      angle,
      Math.PI / 4,
      3.78,
      [{ u: 0, base: 1.55, width: 0.65, height: 1.25, pointed: false, glass: true }],
      0.24
    );
    const model = k.finish();
    try {
      model.group.updateMatrixWorld(true);
      // Avoid casting exactly onto a shared tessellation edge.
      const sampleAngle = angle + 0.02 / 3;
      const radial = new THREE.Vector3(Math.sin(sampleAngle), 0, Math.cos(sampleAngle));
      const origin = radial.clone().multiplyScalar(4);
      origin.y = 2.05;
      const ray = new THREE.Raycaster(origin, radial.clone().negate(), 0, 2);
      expect(ray.intersectObjects(model.pickables.filter(m => m.name === "curved-arched-stone-wall"))).toHaveLength(0);
      const glass = model.pickables.find(m => m.name === "curved-recessed-lancet-glass")!;
      const hit = ray.intersectObject(glass)[0];
      expect(Math.hypot(hit.point.x, hit.point.z)).toBeCloseTo(2.88, 2);
      const position = glass.geometry.getAttribute("position"),
        normal = glass.geometry.getAttribute("normal");
      for (let i = 0; i < position.count; i++) {
        const out = new THREE.Vector3(position.getX(i), 0, position.getZ(i)).normalize();
        expect(out.dot(new THREE.Vector3().fromBufferAttribute(normal, i))).toBeGreaterThan(0.999);
      }
    } finally {
      model.dispose();
    }
  }
});

it("keeps a hollow closed dome shell seated on an open cornice ring", () => {
  const parts = mausoleumPartFactories(),
    body = parts[1].create(),
    roof = parts[2].create(),
    p = MAUSOLEUM_PROFILE;
  try {
    body.group.updateMatrixWorld(true);
    roof.group.updateMatrixWorld(true);
    const shell = roof.pickables.find(m => m.name === "hollow-stone-dome")!;
    const inner = new THREE.Raycaster(new THREE.Vector3(0.3, 4, 0.1), new THREE.Vector3(0, 1, 0)).intersectObject(
      shell
    )[0];
    const outer = new THREE.Raycaster(new THREE.Vector3(0.3, 8, 0.1), new THREE.Vector3(0, -1, 0)).intersectObject(
      shell
    )[0];
    expect(inner.point.y).toBeGreaterThan(6.4);
    expect(outer.point.y - inner.point.y).toBeGreaterThan(0.18);
    expect(outer.point.y - inner.point.y).toBeLessThan(0.23);
    const ring = body.pickables.find(m => m.name === "continuous-annular-cornice")!;
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, 3.4, 0), new THREE.Vector3(0, 1, 0), 0, 0.5).intersectObject(ring)
    ).toHaveLength(0);
    expect(new THREE.Box3().setFromObject(shell).min.y).toBeCloseTo(p.domeBase);
    expect(new THREE.Box3().setFromObject(ring).max.y).toBeGreaterThan(p.domeBase);
  } finally {
    body.dispose();
    roof.dispose();
  }
});

it("grounds the chest and preserves five selectable bounded finite and independently owned High parts", () => {
  const high = definition.variants![1],
    first = high.create(),
    second = high.create(),
    parts = definition.parts!(high.id);
  try {
    const chest = parts.find(p => p.role === "memorial-chest")!.create();
    try {
      expect(new THREE.Box3().setFromObject(chest.group).min.y).toBeCloseTo(MAUSOLEUM_PROFILE.floorTop);
    } finally {
      chest.dispose();
    }
    const bounds = new THREE.Box3().setFromObject(first.group),
      size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(size.x).toBeLessThan(definition.size[0]);
    expect(size.z).toBeLessThan(definition.size[1]);
    expect(size.y).toBeLessThan(definition.size[2]);
    expect(collectModelMetrics(first.group).triangles).toBeLessThan(50000);
    expect(collectModelMetrics(first.group).meshes).toBeLessThanOrEqual(8);
    expect(parts.map(p => p.role)).toEqual(["platform", "rotunda", "dome", "door", "memorial-chest"]);
    const counts = new Map<string, number>();
    for (const mesh of first.pickables) {
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      let offset = 0;
      for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
        expect(range.start).toBe(offset);
        offset += range.count;
        counts.set(range.partId, (counts.get(range.partId) ?? 0) + range.count / 3);
      }
      expect(offset).toBe(mesh.geometry.getAttribute("position").count);
      expect(second.pickables.some(m => m.geometry === mesh.geometry || m.material === mesh.material)).toBe(false);
    }
    const ledger = modelParts(first.group);
    expect(ledger).toHaveLength(5);
    for (const p of ledger) expect(counts.get(p.id)).toBe(p.triangles);
    const spies = parts.map(p => vi.spyOn(p, "create")),
      solo = definition.assembleParts!([parts[2]]);
    try {
      for (const [i, spy] of spies.entries()) expect(spy).toHaveBeenCalledTimes(i === 2 ? 1 : 0);
    } finally {
      solo.dispose();
    }
    const owned = new Set(first.pickables.flatMap(m => [m.geometry, ...[m.material].flat()])),
      disposal = [...owned].map(r => vi.spyOn(r, "dispose"));
    first.dispose();
    for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    second.dispose();
  }
});
