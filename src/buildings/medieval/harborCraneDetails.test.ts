import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { modelParts } from "../modelParts";
import { models } from "./35-harbor-cranesModels";
import { createHighHarborCrane, harborCranePartFactories } from "./harborCraneParts";

it.each(models)("$id has independently built Low/High, bounded High parts and owned resources", definition => {
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
  expect(medievalDefinition(definition).variant).toContain("@default#codex-gpt-6.1-sol");
  const high = definition.variants![1].create(),
    other = definition.variants![1].create();
  const bounds = new THREE.Box3().setFromObject(high.group, true),
    size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 5);
  expect(size.x).toBeLessThanOrEqual(definition.size[0]);
  expect(size.z).toBeLessThanOrEqual(definition.size[1]);
  expect(size.y).toBeLessThanOrEqual(definition.size[2]);
  expect(high.pickables.length).toBeLessThanOrEqual(6);
  expect(modelParts(high.group).map(p => p.role)).toEqual(["foundation", "frame", "drive", "tackle"]);
  for (const mesh of high.pickables)
    for (const attr of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attr).array).every(Number.isFinite)).toBe(true);
  for (const view of ["side", "top"] as const) {
    const svg = meshProjection(high, view);
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/NaN|Infinity/);
  }
  const resources = new Set(high.pickables.flatMap(m => [m.geometry, ...[m.material].flat()]));
  const spies = [...resources].map(r => vi.spyOn(r, "dispose"));
  const otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  high.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
  const low = definition.variants![0].create(),
    legacy = definition.create();
  expect(low.pickables.map(m => m.name)).toEqual(legacy.pickables.map(m => m.name));
  low.dispose();
  legacy.dispose();
});

it.each([true, false])("fits individual components to the same dimensioned assembly (treadwheel=%s)", treadwheel => {
  const d = { reach: 9, pulleyHeight: 8, hookHeight: 6.5, showCargo: false };
  const factories = harborCranePartFactories(treadwheel, d);
  const parts = factories.map(p => p.create());
  const drive = parts[2],
    tackle = parts[3];
  expect(drive.pickables.some(m => m.name === "walkable-wheel-tread")).toBe(treadwheel);
  expect(drive.pickables.some(m => m.name === "winch-crank-arm")).toBe(!treadwheel);
  const rope = tackle.pickables.find(m => m.name === "vertical-hoist-rope")!;
  const ropeBox = new THREE.Box3().setFromObject(rope);
  expect((ropeBox.min.x + ropeBox.max.x) / 2).toBeCloseTo(d.reach);
  expect(ropeBox.min.y).toBeCloseTo(d.hookHeight);
  expect(ropeBox.max.y).toBeCloseTo(d.pulleyHeight);
  expect((ropeBox.min.z + ropeBox.max.z) / 2).toBeCloseTo(0);
  const union = new THREE.Box3();
  for (const part of parts) union.union(new THREE.Box3().setFromObject(part.group, true));
  const full = createHighHarborCrane(treadwheel, d);
  const box = new THREE.Box3().setFromObject(full.group, true);
  expect(box.min.distanceTo(union.min)).toBeLessThan(1e-5);
  expect(box.max.distanceTo(union.max)).toBeLessThan(1e-5);
  // The drum and rising rope sit beyond the wheel end, clear of the walking surface.
  if (treadwheel) {
    const winding = new THREE.Box3().setFromObject(tackle.pickables.find(m => m.name === "wound-drum-rope")!);
    const treads = new THREE.Box3();
    for (const m of drive.pickables.filter(m => m.name === "walkable-wheel-tread"))
      treads.union(new THREE.Box3().setFromObject(m));
    expect(winding.min.z).toBeGreaterThan(treads.max.z);
    const rising = new THREE.Box3().setFromObject(tackle.pickables.find(m => m.name === "drum-to-fairlead-rope")!);
    expect(rising.min.z).toBeGreaterThan(treads.max.z);
  }
  for (const part of parts) part.dispose();
  full.dispose();
});

it("rejects nonfinite dimensions and a hook above the sheave", () => {
  expect(() => createHighHarborCrane(true, { reach: NaN, pulleyHeight: 8, hookHeight: 2 })).toThrow();
  expect(() => createHighHarborCrane(true, { reach: 9, pulleyHeight: 8, hookHeight: 9 })).toThrow();
});

it.each(models)("$id exposes the same CE construction dimensions in both BV qualities", definition => {
  const treadwheel = definition.id === "harbor-treadwheel-crane";
  const reach = treadwheel ? 9 : 7,
    pulley = treadwheel ? 8 : 6.5,
    hook = treadwheel ? 6.5 : 5;
  expect(definition.partPresets!.map(p => p.id)).toEqual(["study", "ce-quay"]);
  for (const variant of definition.variants!) {
    const factories = definition.parts!(variant.id, "ce-quay");
    const piece = (variant.level === "high" ? factories.find(p => p.role === "tackle")! : factories[0]).create();
    const rope = piece.pickables.find(
      m => m.name === (variant.level === "high" ? "vertical-hoist-rope" : "hoist-rope")
    )!;
    const ropeBox = new THREE.Box3().setFromObject(rope);
    expect((ropeBox.max.x + ropeBox.min.x) / 2).toBeCloseTo(reach);
    expect(ropeBox.min.y).toBeCloseTo(hook);
    expect(ropeBox.max.y).toBeCloseTo(pulley - (variant.level === "low" ? 0.05 : 0));
    piece.dispose();
    const full = definition.assembleParts!(factories);
    const size = new THREE.Box3().setFromObject(full.group, true).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThanOrEqual(definition.size[0]);
    expect(size.z).toBeLessThanOrEqual(definition.size[1]);
    expect(size.y).toBeLessThanOrEqual(definition.size[2]);
    full.dispose();
  }
});
