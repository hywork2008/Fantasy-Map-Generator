import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { type ModelPartRange, modelParts } from "../modelParts";
import { models } from "./39-instrument-makers-hallsModels";
import { GUILD_HALL_PROFILE } from "./civicHallProfile";
import { guildHallPartFactories } from "./guildHallParts";
import { createHighHarpDisplay, createHighLute } from "./instrumentGuildDressing";

const definition = models[0];

it("registers instruments High and retains the Low shape and CE default identity", () => {
  expect(definition.variants!.map(variant => variant.level)).toEqual(["low", "high"]);
  const high = definition.variants![1];
  expect(adoptedVariant(high.family, "high").id).toBe(high.id);
  expect(medievalDefinition(definition).variant).toBe(
    "medieval.instrument-makers-guild-hall@default#codex-gpt-6.1-sol"
  );
  const low = definition.variants![0].create();
  try {
    expect(landmarkFingerprint(low.group)).toBe("40bb823c47bea68eab5a8d0b36aa8ac03571d7fcc0009b9ae17a9410e29aeb86");
  } finally {
    low.dispose();
  }
});

it("uses the exact shared guild architecture and east stair instead of a trade-specific shell", () => {
  const instrument = guildHallPartFactories("instruments"),
    reference = guildHallPartFactories("woodworking");
  for (const role of ["architecture", "exterior-stair"]) {
    const a = instrument.find(part => part.role === role)!.create(),
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
    expect(metrics.meshes).toBeLessThanOrEqual(13);
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

it("retains the four component ranges and constructs trade dressing independently", () => {
  const parts = guildHallPartFactories("instruments"),
    whole = definition.assembleParts!(parts);
  try {
    const ledger = modelParts(whole.group);
    expect(ledger.map(part => part.role)).toEqual(["architecture", "exterior-stair", "trade-dressing", "harp-display"]);
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

it("leaves the lute soundhole open and connects every course to the bridge and nut", () => {
  const lute = createHighLute();
  try {
    lute.group.updateMatrixWorld(true);
    const face = lute.pickables.find(m => m.name === "lute-pierced-soundboard")!;
    const down = new THREE.Vector3(0, -1, 0);
    expect(new THREE.Raycaster(new THREE.Vector3(0, 1, -0.09), down).intersectObject(face)).toHaveLength(0);
    expect(new THREE.Raycaster(new THREE.Vector3(0.16, 1, 0.1), down).intersectObject(face).length).toBeGreaterThan(0);
    const bridge = new THREE.Box3()
      .setFromObject(lute.pickables.find(m => m.name === "lute-bridge")!)
      .expandByScalar(0.002);
    const nut = new THREE.Box3().setFromObject(lute.pickables.find(m => m.name === "lute-nut")!).expandByScalar(0.002);
    const strings = lute.pickables.filter(m => m.name === "lute-course");
    expect(strings).toHaveLength(6);
    for (const string of strings) {
      expect(bridge.containsPoint(new THREE.Vector3(0, -0.5, 0).applyMatrix4(string.matrixWorld))).toBe(true);
      expect(nut.containsPoint(new THREE.Vector3(0, 0.5, 0).applyMatrix4(string.matrixWorld))).toBe(true);
    }
    expect(collectModelMetrics(lute.group).triangles).toBeLessThan(4000);
  } finally {
    lute.dispose();
  }
});

it("supports the lute samples and connects harp strings to anchors and tuning pins", () => {
  const dressing = guildHallPartFactories("instruments")
    .find(p => p.role === "trade-dressing")!
    .create();
  const harp = createHighHarpDisplay();
  try {
    dressing.group.updateMatrixWorld(true);
    const bowls = dressing.pickables.filter(
      m => m.name === "lute-bowl" && m.parent?.name === "lute-high" && m.parent.scale.x === 1
    );
    expect(bowls).toHaveLength(3);
    const pads = dressing.pickables.filter(m => m.name === "lute-rest-pad").map(m => new THREE.Box3().setFromObject(m));
    for (const bowl of bowls)
      expect(pads.some(pad => pad.intersectsBox(new THREE.Box3().setFromObject(bowl)))).toBe(true);
    harp.group.updateMatrixWorld(true);
    const anchors = harp.pickables
      .filter(m => m.name === "harp-string-anchor")
      .map(m => new THREE.Box3().setFromObject(m).expandByScalar(0.002));
    const pins = harp.pickables
      .filter(m => m.name === "harp-tuning-pin")
      .map(m => new THREE.Box3().setFromObject(m).expandByScalar(0.002));
    const strings = harp.pickables.filter(m => m.name === "harp-string");
    expect(strings).toHaveLength(14);
    for (const string of strings) {
      expect(
        anchors.some(box => box.containsPoint(new THREE.Vector3(0, -0.5, 0).applyMatrix4(string.matrixWorld)))
      ).toBe(true);
      expect(pins.some(box => box.containsPoint(new THREE.Vector3(0, 0.5, 0).applyMatrix4(string.matrixWorld)))).toBe(
        true
      );
    }
    expect(new THREE.Box3().setFromObject(harp.group).min.y).toBeCloseTo(0);
    expect(new THREE.Box3().setFromObject(harp.group).max.y).toBeLessThan(3.12);
  } finally {
    dressing.dispose();
    harp.dispose();
  }
});
