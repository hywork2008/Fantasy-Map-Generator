import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import { modelParts } from "../modelParts";
import { models } from "./35-harbor-cranesModels";
import { createGrokHarborCrane, grokHarborCranePartFactories } from "./grokHarborCrane";
import { HARBOR_CRANE_PROFILES, type HarborCraneDimensions } from "./harborCraneDimensions";

function boxOf(meshes: readonly THREE.Object3D[]) {
  const box = new THREE.Box3();
  for (const mesh of meshes) box.union(new THREE.Box3().setFromObject(mesh));
  return box;
}

const STUDY: HarborCraneDimensions = { reach: 4.35, pulleyHeight: 4.45, hookHeight: 1.1, showCargo: false };
const QUAY: HarborCraneDimensions = { ...HARBOR_CRANE_PROFILES.treadwheel, showCargo: false };

it("registers a Grok 4.7 high edition and leaves CE on the Codex high", () => {
  const definition = models.find(model => model.id === "harbor-treadwheel-crane")!;
  const grok = definition.variants!.filter(variant => variant.author === "Grok 4.7");
  expect(grok.map(variant => variant.level)).toEqual(["high"]);
  expect(grok[0].id).toBe("medieval.harbor-treadwheel-crane@high#grok-4.7");
  expect(grok[0].basedOn).toBeUndefined();
  expect(adoptedVariant("medieval.harbor-treadwheel-crane", "high").id).toBe(
    "medieval.harbor-treadwheel-crane@high#codex-gpt-6.1-sol"
  );
  expect(adoptedVariant("medieval.harbor-treadwheel-crane", "low").author).toBe("Codex GPT-6.1 Sol");
  const winch = models.find(model => model.id === "harbor-winch-crane")!;
  expect(winch.variants!.some(variant => variant.author === "Grok 4.7")).toBe(false);
});

it.each([
  ["study", STUDY],
  ["quay", QUAY]
] as const)("fits the %s profile: fall line, clear rope, roof above the wheel", (_name, dims) => {
  const factories = grokHarborCranePartFactories(dims);
  expect(factories.map(part => part.role)).toEqual(["foundation", "frame", "drive", "tackle"]);
  expect(factories.every(part => part.author === "Grok 4.7" && part.quality === "high" && !part.basedOn)).toBe(true);
  const built = factories.map(part => part.create());
  const frame = built[1];
  const drive = built[2];
  const tackle = built[3];
  const rope = tackle.pickables.find(mesh => mesh.name === "vertical-hoist-rope")!;
  const ropeBox = new THREE.Box3().setFromObject(rope);
  expect((ropeBox.min.x + ropeBox.max.x) / 2).toBeCloseTo(dims.reach);
  expect((ropeBox.min.z + ropeBox.max.z) / 2).toBeCloseTo(0);
  expect(ropeBox.min.y).toBeCloseTo(dims.hookHeight);
  expect(ropeBox.max.y).toBeCloseTo(dims.pulleyHeight);
  const treads = boxOf(drive.pickables.filter(mesh => mesh.name === "walkable-wheel-tread"));
  expect(treads.max.z).toBeLessThan(1);
  const winding = new THREE.Box3().setFromObject(tackle.pickables.find(mesh => mesh.name === "wound-drum-rope")!);
  const rising = new THREE.Box3().setFromObject(tackle.pickables.find(mesh => mesh.name === "drum-to-fairlead-rope")!);
  expect(winding.min.z).toBeGreaterThan(treads.max.z);
  expect(rising.min.z).toBeGreaterThan(treads.max.z);
  const roof = boxOf(
    frame.pickables.filter(mesh => mesh.name === "crane-house-roof-board" || mesh.name === "crane-house-rafter")
  );
  const wheel = boxOf(
    drive.pickables.filter(mesh => mesh.name === "laminated-treadwheel-rim" || mesh.name === "walkable-wheel-tread")
  );
  expect(wheel.max.y).toBeLessThan(roof.min.y);
  const mast = boxOf(frame.pickables.filter(mesh => mesh.name === "hewn-mast"));
  expect(roof.max.x).toBeLessThan(mast.min.x);
  const full = createGrokHarborCrane(dims);
  const bounds = new THREE.Box3().setFromObject(full.group, true);
  const size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeGreaterThan(-1e-4);
  expect(bounds.min.y).toBeLessThan(0.02);
  expect(size.x).toBeLessThanOrEqual(15);
  expect(size.z).toBeLessThanOrEqual(7);
  expect(size.y).toBeLessThanOrEqual(10);
  const parts = modelParts(full.group);
  expect(parts.map(part => part.role)).toEqual(["foundation", "frame", "drive", "tackle"]);
  expect(parts.every(part => part.author === "Grok 4.7" && part.triangles > 0)).toBe(true);
  for (const mesh of [...built.flatMap(part => part.pickables), ...full.pickables])
    for (const attr of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attr).array).every(Number.isFinite)).toBe(true);
  const triangles = full.pickables.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
  expect(triangles).toBeGreaterThan(12000);
  expect(triangles).toBeLessThan(160000);
  for (const part of built) part.dispose();
  full.dispose();
});

it("releases one build without disposing another", () => {
  const first = createGrokHarborCrane();
  const second = createGrokHarborCrane();
  const spy = vi.spyOn(second.pickables[0].geometry, "dispose");
  first.dispose();
  expect(spy).not.toHaveBeenCalled();
  second.dispose();
});

it("rejects a hook above the sheave", () => {
  expect(() => createGrokHarborCrane({ reach: 9, pulleyHeight: 8, hookHeight: 9 })).toThrow(/Invalid harbor crane/);
});
