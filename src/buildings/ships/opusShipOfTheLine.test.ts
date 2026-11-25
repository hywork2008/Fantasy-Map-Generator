import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { modelParts } from "../modelParts";
import {
  createOpusShipOfTheLine,
  OPUS_SHIP_OF_THE_LINE,
  OPUS_SHIP_OF_THE_LINE_PARTS,
  opusShipOfTheLineParts
} from "./opusShipOfTheLine";

const triangles = (model: { pickables: THREE.Mesh[] }) =>
  model.pickables.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);

describe("Opus ship of the line", () => {
  it("stays within the advertised envelope with finite geometry", () => {
    const model = createOpusShipOfTheLine();
    const bounds = new THREE.Box3().setFromObject(model.group);
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(OPUS_SHIP_OF_THE_LINE.length + 0.5);
    expect(bounds.max.y).toBeLessThanOrEqual(OPUS_SHIP_OF_THE_LINE.height + 0.01);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-OPUS_SHIP_OF_THE_LINE.draft - 0.01);
    for (const mesh of model.pickables)
      expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
    // The hull is closed from above: a ray dropped into the waist lands on the upper deck, not in the hold.
    const hull = model.pickables.find(mesh => mesh.name.endsWith("hull-and-fittings"))!;
    const hit = new THREE.Raycaster(new THREE.Vector3(-1, 20, 3.6), new THREE.Vector3(0, -1, 0)).intersectObject(hull);
    expect(hit[0].point.y).toBeGreaterThan(5);
    model.dispose();
  });

  it("carries 104 guns and 33 lights, in either state", () => {
    for (const gunports of ["open", "closed"] as const) {
      const model = createOpusShipOfTheLine({ gunports, windows: gunports });
      expect(model.group.userData.gunports).toHaveLength(OPUS_SHIP_OF_THE_LINE.guns);
      expect(model.group.userData.windows).toBe(OPUS_SHIP_OF_THE_LINE.windows);
      model.dispose();
    }
  });

  it("builds each assembly part on its own, and the parts add up to the whole ship", () => {
    const state = { sails: "furled", gunports: "closed", windows: "closed" } as const;
    const whole = createOpusShipOfTheLine(state);
    expect(modelParts(whole.group).map(part => part.id)).toEqual([...OPUS_SHIP_OF_THE_LINE_PARTS]);
    let sum = 0;
    for (const factory of opusShipOfTheLineParts(state)) {
      const part = factory.create();
      expect(modelParts(part.group).map(entry => entry.id)).toEqual([factory.id]);
      sum += triangles(part);
      part.dispose();
    }
    expect(sum).toBe(triangles(whole));
    whole.dispose();
  });

  it("changes only the state-bearing parts between states", () => {
    const ledger = (state: Parameters<typeof createOpusShipOfTheLine>[0]) => {
      const model = createOpusShipOfTheLine(state);
      const parts = Object.fromEntries(modelParts(model.group).map(part => [part.id, part.triangles]));
      model.dispose();
      return parts;
    };
    const a = ledger({}),
      b = ledger({ sails: "furled", gunports: "closed", windows: "closed" });
    for (const id of ["hull", "decks", "head", "boats", "masts"]) expect(b[id]).toBe(a[id]);
    for (const id of ["sails", "armament", "stern"]) expect(b[id]).not.toBe(a[id]);
  });

  it("releases each geometry and material exactly once", () => {
    const model = createOpusShipOfTheLine();
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    model.group.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
      resources.add(object.geometry);
      for (const material of [object.material].flat()) resources.add(material);
    });
    const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    model.dispose();
    for (const spy of disposals) expect(spy).toHaveBeenCalledTimes(1);
  });
});
