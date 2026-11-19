import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adopt } from "../../city3d/adoption";
import { collectModelMetrics } from "../../model-viewer/modelMetrics";
import {
  createOpusShipOfTheLine,
  OPUS_SHIP_OF_THE_LINE,
  OPUS_SHIP_OF_THE_LINE_QUALITIES,
  opusShipOfTheLineGunports,
  opusShipOfTheLineParts,
  opusShipOfTheLineWindows
} from "./opusShipOfTheLine";
import { SHIP_VARIANTS } from "./shipVariants";

const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(mesh => mesh.name === name);

it.each(OPUS_SHIP_OF_THE_LINE_QUALITIES)("fills the advertised envelope and carries 104 guns (%s)", quality => {
  const model = createOpusShipOfTheLine(quality);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(OPUS_SHIP_OF_THE_LINE.length);
  expect(bounds.max.x - bounds.min.x).toBeGreaterThan(OPUS_SHIP_OF_THE_LINE.length * 0.95);
  expect(bounds.max.y).toBeLessThanOrEqual(OPUS_SHIP_OF_THE_LINE.height);
  expect(bounds.max.y).toBeGreaterThan(OPUS_SHIP_OF_THE_LINE.height - 0.5);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-OPUS_SHIP_OF_THE_LINE.draft);
  for (const mesh of model.pickables)
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite), mesh.name).toBe(true);
  model.dispose();
  const armament = opusShipOfTheLineParts(quality)
    .find(part => part.id === "armament")!
    .create();
  expect(named(armament, "cannon-run-out")).toHaveLength(OPUS_SHIP_OF_THE_LINE.guns);
  armament.dispose();
});

it("cuts each high-tier port through the side and covers it with a lid when closed", () => {
  const parts = opusShipOfTheLineParts("high", { gunports: "closed" });
  const hull = parts.find(part => part.id === "hull")!.create();
  const closed = parts.find(part => part.id === "armament")!.create();
  hull.group.updateMatrixWorld(true);
  closed.group.updateMatrixWorld(true);
  const skin = hull.pickables.filter(mesh => mesh.name.startsWith("hull-"));
  const lids = named(closed, "gunport-lid-closed");
  const ports = opusShipOfTheLineGunports();
  expect(ports).toHaveLength(104);
  expect(lids).toHaveLength(88);
  for (const port of ports) {
    const point = new THREE.Vector3(...port.point);
    const normal = new THREE.Vector3(...port.normal);
    const ray = new THREE.Raycaster(point.clone().addScaledVector(normal, 1.5), normal.clone().negate(), 0, 1.7);
    expect(ray.intersectObjects(skin), port.id).toHaveLength(0);
    const beside = point.clone().addScaledVector(new THREE.Vector3(...port.right), port.width * 0.9);
    const solid = new THREE.Raycaster(beside.addScaledVector(normal, 1.5), normal.clone().negate(), 0, 2);
    expect(solid.intersectObjects(skin).length, port.id).toBeGreaterThan(0);
    if (port.tier === "lower" || port.tier === "middle" || port.tier === "upper")
      expect(ray.intersectObjects(lids).length, port.id).toBeGreaterThan(0);
  }
  expect(named(closed, "cannon-housed")).toHaveLength(88);
  hull.dispose();
  closed.dispose();
});

it("swaps sails for bundles and glass for deadlights without moving the spars", () => {
  const ids = (sails: "set" | "furled", windows: "open" | "closed") => {
    const parts = opusShipOfTheLineParts("high", { sails, windows });
    const names = new Map<string, number>();
    for (const part of parts.filter(p => p.id !== "hull")) {
      const model = part.create();
      for (const mesh of model.pickables) names.set(mesh.name, (names.get(mesh.name) ?? 0) + 1);
      model.dispose();
    }
    return names;
  };
  const set = ids("set", "open");
  const furled = ids("furled", "closed");
  expect(set.get("square-sail")).toBe(11);
  expect(set.get("jib-sail")).toBe(3);
  expect(set.get("spanker")).toBe(1);
  expect(furled.get("furled-sail")).toBe(15);
  expect(furled.has("square-sail")).toBe(false);
  expect(set.get("window-glass")).toBe(opusShipOfTheLineWindows().length);
  expect(furled.get("window-deadlight")).toBe(opusShipOfTheLineWindows().length);
  expect(set.get("yard")).toBe(furled.get("yard"));
});

it("keeps the low tier substantially lighter and releases every resource once", () => {
  const triangles = OPUS_SHIP_OF_THE_LINE_QUALITIES.map(quality => {
    const model = createOpusShipOfTheLine(quality);
    const count = collectModelMetrics(model.group).triangles;
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    model.group.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
      resources.add(object.geometry);
      for (const material of [object.material].flat()) resources.add(material);
    });
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    return count;
  });
  expect(triangles[1]).toBeLessThan(triangles[0] * 0.6);
});

it("registers BV comparison tiers and leaves CE on the Grok 4.7 ship of the line", () => {
  const ids = SHIP_VARIANTS.filter(variant => variant.family === "ship.ship-of-the-line").map(variant => variant.id);
  expect(ids).toContain("ship.ship-of-the-line@high#claude-opus-5.5");
  expect(ids).toContain("ship.ship-of-the-line@low#claude-opus-5.5");
  expect(adopt(SHIP_VARIANTS, "ship.ship-of-the-line", "high").author).toBe("Grok 4.7");
});
