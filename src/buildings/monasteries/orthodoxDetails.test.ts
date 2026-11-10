import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { models } from "../medieval/41-orthodox-monasteriesModels";
import { type ModelPartRange, modelParts } from "../modelParts";
import { MONASTERY_VARIANTS } from "../siteVariants";
import { createMonastery, monasteryPartFactories, monasteryPreviewPlan } from "./friary";
import { monasteryContext } from "./monasteryComponents";

const plan = monasteryPreviewPlan("orthodoxMonastery"),
  definition = models[0];

it("preserves the original Orthodox Low and default while registering explicit Low and High", () => {
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
  const legacy = MONASTERY_VARIANTS.find(
    v => v.family === "monastery.orthodoxMonastery" && v.level === "default"
  )!.create();
  const low = definition.variants![0].create();
  try {
    expect(landmarkFingerprint(low.group)).toBe("2960c1188d26f1befdd52de94d65416fc9ade8423c84d41529bb457d4c0e62df");
    expect(landmarkFingerprint(legacy.group)).toBe(landmarkFingerprint(low.group));
  } finally {
    legacy.dispose();
    low.dispose();
  }
});

it.each([0, 0.43])(
  "opens all twelve drum windows and embeds its continuous base below the church roof (rotation %s)",
  angle => {
    const fitted = structuredClone(plan);
    const rotate = (p: readonly [number, number]): [number, number] => [
      p[0] * Math.cos(angle) - p[1] * Math.sin(angle),
      p[0] * Math.sin(angle) + p[1] * Math.cos(angle)
    ];
    for (const building of fitted.buildings) {
      building.polygon = building.polygon.map(rotate);
      if (building.ridge) building.ridge = [rotate(building.ridge[0]), rotate(building.ridge[1])];
    }
    const context = monasteryContext(fitted, 0, 0),
      s = context.scale;
    const parts = monasteryPartFactories(fitted, 0, 0, { architectureQuality: "high" });
    const drum = parts.find(p => p.role === "dome")!.create();
    const church = parts.find(p => p.role === "church")!.create();
    try {
      drum.group.updateMatrixWorld(true);
      const ring = fitted.buildings.find(b => b.role === "dome")!.polygon;
      const center = ring.reduce(
        (a, p) => a.add(new THREE.Vector3(p[0] / ring.length, 0, -p[1] / ring.length)),
        new THREE.Vector3()
      );
      const masonry = drum.pickables.filter(m => m.name === "friary-open-masonry");
      const glazing = drum.pickables.filter(m => m.name === "recessed-lancet-glazing");
      expect(masonry).toHaveLength(12);
      expect(glazing).toHaveLength(12);
      for (let i = 0; i < 12; i++) {
        const a = ((i + 0.5) * Math.PI) / 6 - context.azimuth,
          outward = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const origin = center.clone().addScaledVector(outward, 4 * s);
        origin.y = context.churchTop + 0.7 * s;
        const ray = new THREE.Raycaster(origin, outward.clone().negate(), 0, 3 * s);
        expect(ray.intersectObjects(masonry)).toHaveLength(0);
        expect(ray.intersectObjects(glazing).length).toBeGreaterThan(0);
      }
      expect(new THREE.Box3().setFromObject(drum.group).min.y).toBeLessThan(
        new THREE.Box3().setFromObject(church.group).max.y - s
      );
      const dome = drum.pickables.find(m => m.name === "bulbous-church-dome")!;
      const cornice = drum.pickables.find(m => m.name === "drum-upper-cornice")!;
      expect(new THREE.Box3().setFromObject(dome).intersectsBox(new THREE.Box3().setFromObject(cornice))).toBe(true);
    } finally {
      drum.dispose();
      church.dispose();
    }
  }
);

it("hangs a hollow bell from its yoke without sealing the mouth", () => {
  const source = monasteryPartFactories(plan, 0, 0, { architectureQuality: "high" })
    .find(p => p.role === "bell-tower")!
    .create();
  try {
    source.group.updateMatrixWorld(true);
    const bell = source.pickables.find(m => m.name === "hollow-orthodox-bell")!;
    const hanger = source.pickables.find(m => m.name === "bell-hanger")!;
    const yoke = source.pickables.find(m => m.name === "bell-load-bearing-yoke")!;
    const box = new THREE.Box3().setFromObject(bell),
      c = box.getCenter(new THREE.Vector3());
    expect(box.intersectsBox(new THREE.Box3().setFromObject(hanger))).toBe(true);
    expect(new THREE.Box3().setFromObject(hanger).intersectsBox(new THREE.Box3().setFromObject(yoke))).toBe(true);
    const hit = new THREE.Raycaster(
      new THREE.Vector3(c.x + 0.02, box.min.y - 0.1, c.z),
      new THREE.Vector3(0, 1, 0)
    ).intersectObject(bell)[0];
    expect(hit?.point.y ?? Infinity).toBeGreaterThan(box.min.y + 0.5);
    expect(source.pickables.filter(m => m.name === "friary-open-masonry")).toHaveLength(4);
  } finally {
    source.dispose();
  }
});

it("keeps fitted High parts bounded and independently disposable with explicit Low vegetation and well", () => {
  const saved = JSON.stringify(plan),
    high = definition.variants![1],
    first = high.create(),
    second = high.create();
  try {
    const ledger = modelParts(first.group),
      factories = definition.parts!(high.id);
    expect(ledger).toHaveLength(factories.length);
    for (const p of ledger) {
      if (["church", "range", "dome", "bell-tower", "gatehouse", "precinct-wall"].includes(p.role))
        expect(p.quality).toBe("high");
      if (["vegetation", "well"].includes(p.role)) expect(p.quality).toBe("low");
    }
    const size = new THREE.Box3().setFromObject(first.group).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(definition.size[0]);
    expect(size.z).toBeLessThan(definition.size[1]);
    expect(size.y).toBeLessThan(definition.size[2]);
    expect(collectModelMetrics(first.group).triangles).toBeLessThan(80000);
    expect(collectModelMetrics(first.group).meshes).toBeLessThanOrEqual(16);
    for (const mesh of first.pickables) {
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      const ranges = mesh.userData.modelPartRanges as ModelPartRange[];
      expect(ranges.reduce((sum, range) => sum + range.count, 0)).toBe(mesh.geometry.getAttribute("position").count);
    }
    const resources = new Set(first.pickables.flatMap(m => [m.geometry, ...[m.material].flat()]));
    expect(
      second.pickables.every(m => !resources.has(m.geometry) && ![m.material].flat().some(mat => resources.has(mat)))
    ).toBe(true);
    const spies = [...resources].map(r => vi.spyOn(r, "dispose"));
    first.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    const domeId = factories.find(p => p.role === "dome")!.id;
    const solo = createMonastery(plan, 3, -1, { architectureQuality: "high", partIds: [domeId] });
    try {
      expect(modelParts(solo.group).map(p => p.role)).toEqual(["dome"]);
    } finally {
      solo.dispose();
    }
    expect(JSON.stringify(plan)).toBe(saved);
  } finally {
    second.dispose();
  }
});

it("provides an open courtyard entrance to each domestic range", () => {
  const parts = monasteryPartFactories(plan, 0, 0, { architectureQuality: "high" }).filter(p => p.role === "range");
  expect(parts).toHaveLength(4);
  for (const part of parts) {
    const model = part.create();
    try {
      model.group.updateMatrixWorld(true);
      expect(model.pickables.filter(m => m.name === "open-friary-door")).toHaveLength(2);
      const leaves = model.pickables.filter(m => m.name === "open-friary-door");
      const midpoint = leaves.reduce(
        (sum, leaf) => sum.add(new THREE.Box3().setFromObject(leaf).getCenter(new THREE.Vector3()).multiplyScalar(0.5)),
        new THREE.Vector3()
      );
      const masonry = model.pickables.filter(m => m.name === "friary-open-masonry");
      // The two open leaves define a passage axis perpendicular to their separation.
      const a = new THREE.Box3().setFromObject(leaves[0]).getCenter(new THREE.Vector3());
      const b = new THREE.Box3().setFromObject(leaves[1]).getCenter(new THREE.Vector3());
      const normal = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
      expect(
        new THREE.Raycaster(
          midpoint.clone().addScaledVector(normal, 1),
          normal.clone().negate(),
          0,
          2
        ).intersectObjects(masonry)
      ).toHaveLength(0);
    } finally {
      model.dispose();
    }
  }
});
