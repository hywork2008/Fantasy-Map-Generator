import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { type ModelPartRange, modelParts } from "../modelParts";
import { models } from "./37-glassworkers-hallsModels";
import { GUILD_HALL_PROFILE } from "./civicHallProfile";
import { guildHallPartFactories } from "./guildHallParts";

const definition = models[0];

it("registers glassworking High and retains the Low shape and CE default identity", () => {
  expect(definition.variants!.map(variant => variant.level)).toEqual(["low", "high"]);
  const high = definition.variants![1];
  expect(adoptedVariant(high.family, "high").id).toBe(high.id);
  expect(medievalDefinition(definition).variant).toBe("medieval.glassworkers-guild-hall@default#codex-gpt-6.1-sol");
  const low = definition.variants![0].create();
  try {
    expect(landmarkFingerprint(low.group)).toBe("9e23da63c47e369a6e466879c1bb2476414c4805bf3cfde7ed4ca38e28f8cf8a");
  } finally {
    low.dispose();
  }
});

it("uses the exact shared guild architecture and east stair instead of a trade-specific shell", () => {
  const glass = guildHallPartFactories("glassworking"),
    reference = guildHallPartFactories("woodworking");
  for (const role of ["architecture", "exterior-stair"]) {
    const a = glass.find(part => part.role === role)!.create(),
      b = reference.find(part => part.role === role)!.create();
    try {
      expect(landmarkFingerprint(a.group)).toBe(landmarkFingerprint(b.group));
    } finally {
      a.dispose();
      b.dispose();
    }
  }
  expect(GUILD_HALL_PROFILE).toMatchObject({
    width: 15,
    depth: 7,
    upperFloor: 3.32,
    upperWall: 3.25,
    roofRise: 2.2,
    stairSide: "east",
    doorZ: -2.3,
    support: "masonry-arcade"
  });
});

it("fits and projects the High guild hall and owns independently disposable resources", () => {
  const first = definition.variants![1].create(),
    second = definition.variants![1].create();
  try {
    const bounds = new THREE.Box3().setFromObject(first.group),
      size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    for (const [actual, limit] of [
      [size.x, definition.size[0]],
      [size.z, definition.size[1]],
      [size.y, definition.size[2]]
    ])
      expect(actual).toBeLessThanOrEqual(limit);
    const metrics = collectModelMetrics(first.group);
    expect(metrics.triangles).toBeGreaterThan(10000);
    expect(metrics.triangles).toBeLessThan(50000);
    expect(metrics.meshes).toBeLessThanOrEqual(12);
    for (const mesh of first.pickables)
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    for (const view of ["top", "side"] as const) {
      const svg = meshProjection(first, view);
      expect(svg).toContain("<path");
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
    first.group.updateMatrixWorld(true);
    for (const z of [-2.8, -2.3, -1.8])
      for (const y of [3.7, 4.1, 4.27, 4.5])
        expect(
          new THREE.Raycaster(new THREE.Vector3(8.36, y, z), new THREE.Vector3(-1, 0, 0), 0, 0.855).intersectObjects(
            first.pickables
          )
        ).toHaveLength(0);
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, 5.3, 4), new THREE.Vector3(0, 0, -1), 0, 0.7).intersectObjects(
        first.pickables
      )
    ).toHaveLength(0);
    const resources = (assembly: typeof first) =>
      new Set(assembly.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const owned = resources(first),
      other = resources(second);
    for (const resource of owned) expect(other.has(resource)).toBe(false);
    const spies = [...owned].map(resource => vi.spyOn(resource, "dispose"));
    first.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(collectModelMetrics(second.group).triangles).toBeGreaterThan(0);
  } finally {
    second.dispose();
  }
});

it("retains the three component ranges and constructs trade dressing independently", () => {
  const parts = guildHallPartFactories("glassworking"),
    whole = definition.assembleParts!(parts);
  try {
    const ledger = modelParts(whole.group);
    expect(ledger.map(part => part.role)).toEqual(["architecture", "exterior-stair", "trade-dressing"]);
    expect(ledger.every(part => part.quality === "high" && part.author === "Codex GPT-6.1 Sol")).toBe(true);
    const triangles = new Map<string, number>();
    for (const mesh of whole.pickables) {
      let offset = 0;
      for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
        expect(range.start).toBe(offset);
        offset += range.count;
        triangles.set(range.partId, (triangles.get(range.partId) ?? 0) + range.count / 3);
      }
      expect(offset).toBe(mesh.geometry.getAttribute("position").count);
    }
    for (const part of ledger) expect(triangles.get(part.id)).toBe(part.triangles);
    const spies = parts.map(part => vi.spyOn(part, "create")),
      solo = definition.assembleParts!([parts[2]]);
    try {
      for (const [i, spy] of spies.entries()) expect(spy).toHaveBeenCalledTimes(i === 2 ? 1 : 0);
    } finally {
      solo.dispose();
    }
  } finally {
    whole.dispose();
  }
});

it("supports all open glass samples on their benches and mounts the inspection panel on its own rack", () => {
  const source = guildHallPartFactories("glassworking")
    .find(part => part.role === "trade-dressing")!
    .create();
  try {
    source.group.updateMatrixWorld(true);
    const vessels = source.pickables.filter(mesh => mesh.name.startsWith("glass-sample-"));
    expect(vessels).toHaveLength(7);
    const planks = source.pickables.filter(mesh => mesh.name === "workbench-plank");
    for (const vessel of vessels) {
      const bounds = new THREE.Box3().setFromObject(vessel);
      expect(bounds.min.y).toBeCloseTo(0.95);
      const origin = new THREE.Vector3(vessel.position.x, 2, vessel.position.z);
      const support = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObjects(planks)[0];
      expect(support.point.y).toBeCloseTo(bounds.min.y);
      origin.x += 0.004;
      const inside = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObject(vessel)[0];
      expect(inside).toBeDefined();
      expect(inside.point.y).toBeLessThan(bounds.max.y - 0.02);
    }
    expect(source.pickables.filter(mesh => mesh.name === "sample-rack-upright")).toHaveLength(2);
    expect(source.pickables.filter(mesh => mesh.name === "inspection-glass-pane")).toHaveLength(8);
    const backing = source.pickables.find(mesh => mesh.name === "inspection-panel-backing")!;
    for (const upright of source.pickables.filter(mesh => mesh.name === "sample-rack-upright"))
      expect(new THREE.Box3().setFromObject(backing).intersectsBox(new THREE.Box3().setFromObject(upright))).toBe(true);
  } finally {
    source.dispose();
  }
});
