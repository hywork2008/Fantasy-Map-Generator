import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { type ModelPartRange, modelParts } from "../modelParts";
import { models } from "./36-gallowsModels";
import { assembleGallowsParts, gallowsPartFactories } from "./gallowsParts";
import { createTimberLadder } from "./timberLadder";

const definition = models[0];

it("registers an explicit Codex High while retaining the original Low and default adoption", () => {
  expect(definition.variants!.map(variant => variant.level)).toEqual(["low", "high"]);
  const high = definition.variants![1];
  expect(high.author).toBe("Codex GPT-6.1 Sol");
  expect(adoptedVariant(high.family, "high").id).toBe(high.id);
  expect(medievalDefinition(definition).variant).toContain("@default#codex-gpt-6.1-sol");
  const low = definition.variants![0].create();
  try {
    expect(landmarkFingerprint(low.group)).toBe("17486207b629a73fe0ace5a9d2282730e5701f9eafe40bcb44c7a8ed63cd21c6");
  } finally {
    low.dispose();
  }
});

it("fits the High frame, projects both views and owns independent disposable resources", () => {
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
    expect(collectModelMetrics(first.group).triangles).toBeGreaterThan(3000);
    expect(collectModelMetrics(first.group).triangles).toBeLessThan(15000);
    expect(first.pickables.length).toBeLessThanOrEqual(5);
    for (const mesh of first.pickables)
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    for (const view of ["top", "side"] as const) expect(meshProjection(first, view)).not.toMatch(/NaN|Infinity/);
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

it("retains all four component ranges and constructs only the selected component", () => {
  const parts = gallowsPartFactories(),
    whole = assembleGallowsParts(parts);
  try {
    const ledger = modelParts(whole.group);
    expect(ledger.map(part => part.role)).toEqual(["foundation", "frame", "rope-dressing", "access-ladder"]);
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
    expect(ledger.reduce((sum, part) => sum + part.triangles, 0)).toBe(collectModelMetrics(whole.group).triangles);
    const spies = parts.map(part => vi.spyOn(part, "create"));
    const solo = assembleGallowsParts([parts[3]]);
    try {
      for (const [i, spy] of spies.entries()) expect(spy).toHaveBeenCalledTimes(i === 3 ? 1 : 0);
    } finally {
      solo.dispose();
    }
  } finally {
    whole.dispose();
  }
});

it("embeds the posts in continuous foundations and connects the ladder to ground shoes and the crossbeam", () => {
  const sources = gallowsPartFactories().map(part => part.create());
  try {
    const [foundation, frame, , ladder] = sources;
    for (const source of sources) source.group.updateMatrixWorld(true);
    for (const x of [-2.4, 2.4]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(x, 1, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
        foundation.pickables
      )[0];
      expect(hit.point.y).toBeCloseTo(0.55);
      const post = frame.pickables.find(
        mesh =>
          mesh.name === "chamfered-upright" &&
          new THREE.Box3().setFromObject(mesh).containsPoint(new THREE.Vector3(x, 0.5, 0))
      )!;
      expect(post).toBeDefined();
    }
    const beam = frame.pickables.find(mesh => mesh.name === "continuous-crossbeam")!;
    const beamBounds = new THREE.Box3().setFromObject(beam);
    const rails = ladder.pickables.filter(mesh => mesh.name === "ladder-stile");
    expect(rails).toHaveLength(2);
    for (const x of [1.575, 2.175]) {
      expect(beamBounds.containsPoint(new THREE.Vector3(x, 4.22, 0.17))).toBe(true);
      const foot = new THREE.Raycaster(new THREE.Vector3(x, 0.07, 2.3), new THREE.Vector3(0, -1, 0)).intersectObjects(
        ladder.pickables.filter(mesh => mesh.name === "ladder-contact-shoe")
      )[0];
      expect(foot).toBeDefined();
    }
    expect(ladder.pickables.filter(mesh => mesh.name === "ladder-through-rung")).toHaveLength(12);
    const loops = sources[2].pickables.filter(mesh => mesh.name === "empty-rope-loop");
    expect(loops).toHaveLength(2);
    for (const loop of loops) expect(new THREE.Box3().setFromObject(loop).max.y).toBeGreaterThan(2.7);
  } finally {
    for (const source of sources) source.dispose();
  }
});

it("fits the reusable ladder in a rotated plan and keeps rungs supported by both stiles", () => {
  const foot: [number, number, number] = [1, 0.1, 1],
    head: [number, number, number] = [2, 3, -2],
    width = 0.6;
  const ladder = createTimberLadder({ foot, head, width, rungs: 8 });
  try {
    ladder.group.updateMatrixWorld(true);
    const rails = ladder.pickables.filter(mesh => mesh.name === "ladder-stile");
    const direction = new THREE.Vector3(-(head[2] - foot[2]), 0, head[0] - foot[0]).normalize();
    for (const rung of ladder.pickables.filter(mesh => mesh.name === "ladder-through-rung"))
      for (const side of [-1, 1]) {
        const hit = new THREE.Raycaster(
          rung.position.clone(),
          direction.clone().multiplyScalar(side),
          0,
          width
        ).intersectObjects(rails)[0];
        expect(hit).toBeDefined();
        expect(hit.distance).toBeCloseTo(width / 2 - 0.06, 4);
      }
    expect(new THREE.Box3().setFromObject(ladder.group).min.y).toBeCloseTo(0);
  } finally {
    ladder.dispose();
  }
  expect(() => createTimberLadder({ foot, head: [1, NaN, 1], width, rungs: 8 })).toThrow();
});
