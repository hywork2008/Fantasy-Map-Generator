import * as THREE from "three";
import { expect, it } from "vitest";
import { createFordCarrier, FORD_CARRIER } from "./fordCarrier";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);

it.each(["low", "high"] as const)("%s matches the published envelope with the waterline at zero", quality => {
  const model = createFordCarrier(quality);
  model.group.updateMatrixWorld(true);
  const bounds = box(model.group),
    size = bounds.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(FORD_CARRIER.length, 2);
  expect(size.z).toBeCloseTo(FORD_CARRIER.beam, 2);
  expect(size.y).toBeCloseTo(FORD_CARRIER.height, 2);
  expect(bounds.min.y).toBeCloseTo(-FORD_CARRIER.draft, 2);
  // Waterline beam, the island to starboard and the angled deck to port.
  const hull = box(model.pickables.find(mesh => mesh.name === "hull-bottom")!);
  expect(hull.max.z - hull.min.z).toBeCloseTo(FORD_CARRIER.waterlineBeam, 1);
  const island = model.pickables.filter(mesh => mesh.name === "island").map(box);
  expect(island.every(b => b.min.z > 0 && b.max.x < 0)).toBe(true);
  expect(box(model.pickables.find(mesh => mesh.name === "flight-deck")!).min.z).toBeCloseTo(-44, 2);
  expect(model.pickables.filter(mesh => mesh.name === "elevator")).toHaveLength(3);
  expect(model.pickables.filter(mesh => mesh.name.startsWith("radar-array"))).toHaveLength(6);
  // The flight deck is the top of the hull everywhere except the island and the deck fittings.
  const deckTop = box(model.pickables.find(mesh => mesh.name === "flight-deck")!).max.y;
  expect(deckTop).toBeCloseTo(FORD_CARRIER.flightDeckHeight, 3);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("adds deck markings, catapults, wires, weapons and running gear on the high tier", () => {
  const low = createFordCarrier("low"),
    high = createFordCarrier("high");
  const count = (name: string) => high.pickables.filter(mesh => mesh.name === name).length;
  expect(count("catapult")).toBe(4);
  expect(count("jet-blast-deflector")).toBe(4);
  expect(count("arresting-wire")).toBe(3);
  expect(count("mk29-launcher")).toBe(4);
  expect(count("propeller-blade")).toBe(20);
  expect(count("rudder")).toBe(2);
  for (const name of ["landing-area-edge", "bridge-window", "pri-fly-window", "ciws", "ram-launcher", "hangar-opening"])
    expect(count(name), name).toBeGreaterThan(0);
  // Propellers stay under the hull and above the keel line.
  for (const mesh of high.pickables.filter(m => m.name === "propeller-blade")) {
    const b = box(mesh);
    expect(b.max.y).toBeLessThan(-4);
    expect(b.min.y).toBeGreaterThan(-FORD_CARRIER.draft);
  }
  expect(low.pickables.some(mesh => mesh.name === "catapult")).toBe(false);
  expect(high.pickables.length).toBeGreaterThan(low.pickables.length * 4);
  low.dispose();
  high.dispose();
});
