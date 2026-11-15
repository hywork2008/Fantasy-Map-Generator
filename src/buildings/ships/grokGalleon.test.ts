import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { adopt } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { createGrokGalleon, GROK_GALLEON, grokGalleonParts, grokGunportMounts, grokWindowMounts } from "./grokGalleon";
import { SHIP_VARIANTS } from "./shipVariants";

const mountBasis = (normal: THREE.Vector3) => {
  const n = normal.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(n);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  return { right, up: n.clone().cross(right).normalize(), normal: n };
};

it("fills the advertised envelope without crossing the draft or the sparred length", () => {
  const model = createGrokGalleon();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const span = bounds.max.x - bounds.min.x;
  expect(span).toBeLessThanOrEqual(GROK_GALLEON.length);
  expect(span).toBeGreaterThan(GROK_GALLEON.length * 0.9);
  expect(bounds.max.y).toBeLessThanOrEqual(GROK_GALLEON.height);
  expect(bounds.max.y).toBeGreaterThan(GROK_GALLEON.height * 0.8);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-GROK_GALLEON.draft - 0.02);
  const decks = grokGalleonParts()
    .find(part => part.id === "decks")!
    .create();
  decks.group.updateMatrixWorld(true);
  const deck = new THREE.Raycaster(new THREE.Vector3(2, 20, 0.4), new THREE.Vector3(0, -1, 0)).intersectObjects(
    decks.pickables.filter(mesh => mesh.name === "main-deck")
  );
  expect(deck[0].point.y).toBeGreaterThan(3);
  expect(deck[0].point.y).toBeLessThan(4);
  const sails = grokGalleonParts().filter(
    part => part.id.includes("course") || part.id.includes("sail") || part.id.endsWith("lateen")
  );
  expect(sails.filter(part => part.create().pickables.some(mesh => mesh.name === "square-sail"))).toHaveLength(5);
  expect(sails.filter(part => part.create().pickables.some(mesh => mesh.name === "lateen-sail"))).toHaveLength(2);
  const armament = grokGalleonParts()
    .find(part => part.id === "armament")!
    .create();
  const lights = grokGalleonParts()
    .find(part => part.id === "window-leaves")!
    .create();
  expect(armament.pickables.filter(mesh => mesh.name === "cannon-run-out")).toHaveLength(GROK_GALLEON.guns);
  expect(lights.pickables.filter(mesh => mesh.name === "window-glass")).toHaveLength(GROK_GALLEON.windows);
  decks.dispose();
  armament.dispose();
  lights.dispose();
  model.dispose();
});

it("keeps the hull, spars, rigging and frames fixed across sail, gun and window states", () => {
  const fixed = ["hull", "decks", "fittings", "spars", "rigging", "flags", "gun-frames", "window-frames"];
  const base = grokGalleonParts();
  const hashes = new Map(
    fixed.map(id => {
      const model = base.find(part => part.id === id)!.create();
      const hash = landmarkFingerprint(model.group);
      model.dispose();
      return [id, hash] as const;
    })
  );
  for (const sails of ["set", "furled"] as const)
    for (const gunports of ["open", "closed"] as const)
      for (const windows of ["open", "closed"] as const) {
        const parts = grokGalleonParts({ sails, gunports, windows });
        for (const id of fixed) {
          const model = parts.find(part => part.id === id)!.create();
          expect(landmarkFingerprint(model.group)).toBe(hashes.get(id));
          model.dispose();
        }
      }
});

it("opens a real port in the topsides and shuts every lid over a stowed barrel", () => {
  const ports = grokGunportMounts();
  expect(ports).toHaveLength(26);
  expect(ports.filter(port => port.id.startsWith("stern"))).toHaveLength(2);
  const hull = grokGalleonParts()
    .find(part => part.id === "hull")!
    .create();
  hull.group.updateMatrixWorld(true);
  const closed = grokGalleonParts({ gunports: "closed" })
    .find(part => part.id === "armament")!
    .create();
  closed.group.updateMatrixWorld(true);
  for (const port of ports) {
    const point = new THREE.Vector3(...port.point);
    const normal = new THREE.Vector3(...port.normal);
    const { right, up } = mountBasis(normal);
    const through = new THREE.Raycaster(point.clone().addScaledVector(normal, 2), normal.clone().negate(), 0, 2.2);
    expect(
      through.intersectObjects(hull.pickables.filter(mesh => mesh.name === "hull-topsides" || mesh.name === "transom"))
    ).toHaveLength(0);
    for (const x of [-0.35, 0, 0.35])
      for (const y of [-0.35, 0, 0.35]) {
        const sample = point
          .clone()
          .addScaledVector(normal, 2)
          .addScaledVector(right, x * port.width)
          .addScaledVector(up, y * port.height);
        const hit = new THREE.Raycaster(sample, normal.clone().negate(), 0, 3).intersectObjects(
          closed.pickables.filter(mesh => mesh.name === "gunport-lid-closed")
        );
        expect(hit.length).toBeGreaterThan(0);
      }
  }
  for (const mesh of closed.pickables.filter(item => item.name === "cannon-stowed")) {
    mesh.updateMatrixWorld(true);
    const centre = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const port = ports.reduce(
      (nearest, item) => {
        const distance = new THREE.Vector3(...item.point).distanceTo(centre);
        return distance < nearest.distance ? { item, distance } : nearest;
      },
      { item: ports[0], distance: Infinity }
    ).item;
    const point = new THREE.Vector3(...port.point);
    const normal = new THREE.Vector3(...port.normal);
    let max = -Infinity;
    const position = mesh.geometry.getAttribute("position");
    mesh.updateMatrixWorld(true);
    for (let i = 0; i < position.count; i++)
      max = Math.max(
        max,
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).sub(point).dot(normal)
      );
    expect(max).toBeLessThan(-0.2);
  }
  hull.dispose();
  closed.dispose();
});

it("swaps stern and gallery lights for shutters that cover the opening", () => {
  const lights = grokWindowMounts();
  expect(lights).toHaveLength(14);
  const open = grokGalleonParts({ windows: "open" })
    .find(part => part.id === "window-leaves")!
    .create();
  const shut = grokGalleonParts({ windows: "closed" })
    .find(part => part.id === "window-leaves")!
    .create();
  open.group.updateMatrixWorld(true);
  shut.group.updateMatrixWorld(true);
  for (const light of lights) {
    const point = new THREE.Vector3(...light.point);
    const normal = new THREE.Vector3(...light.normal);
    const { right, up } = mountBasis(normal);
    const origin = point
      .clone()
      .addScaledVector(normal, 1.5)
      .addScaledVector(right, light.width * 0.22);
    const glass = new THREE.Raycaster(origin, normal.clone().negate(), 0, 2).intersectObjects(open.pickables);
    expect(glass[0]?.object.name).toBe("window-glass");
    for (const x of [-0.3, 0, 0.3])
      for (const y of [-0.3, 0, 0.3]) {
        const sample = origin
          .clone()
          .addScaledVector(right, x * light.width)
          .addScaledVector(up, y * light.height);
        const hit = new THREE.Raycaster(sample, normal.clone().negate(), 0, 2.2).intersectObjects(
          shut.pickables.filter(mesh => mesh.name === "window-shutter-closed")
        );
        expect(hit.length).toBeGreaterThan(0);
        const outward = hit[0].point.clone().sub(point).dot(normal);
        expect(outward).toBeGreaterThan(0.02);
        expect(outward).toBeLessThan(0.28);
      }
    const blocked = new THREE.Raycaster(origin, normal.clone().negate(), 0, 2).intersectObjects(shut.pickables);
    expect(blocked.some(hit => hit.object.name === "window-glass")).toBe(false);
  }
  open.dispose();
  shut.dispose();
});

it("replaces every set sail with a tied bundle and drops the sheets", () => {
  for (const sails of ["set", "furled"] as const) {
    const course = grokGalleonParts({ sails })
      .find(part => part.id === "main-course")!
      .create();
    course.group.updateMatrixWorld(true);
    const cloth = course.pickables.filter(mesh => mesh.name === "square-sail" || mesh.name === "furled-sail");
    expect(cloth.map(mesh => mesh.name)).toEqual([sails === "furled" ? "furled-sail" : "square-sail"]);
    const belly = new THREE.Raycaster(new THREE.Vector3(-8, 12, 0), new THREE.Vector3(1, 0, 0), 0, 12).intersectObjects(
      course.pickables
    );
    expect(belly.some(hit => hit.object.name === "square-sail")).toBe(sails === "set");
    // The set course bellies aft of the yard plane, so the cloth ray sits inside that belly.
    // The furled bundle is centred on the yard; offset it off the axis so the hit is not the cap vertex.
    const yard = new THREE.Raycaster(
      new THREE.Vector3(sails === "furled" ? -0.1 : -0.8, sails === "furled" ? 18.25 : 14, 14),
      new THREE.Vector3(0, 0, -1),
      0,
      16
    ).intersectObjects(course.pickables);
    expect(yard.some(hit => hit.object.name === (sails === "furled" ? "furled-sail" : "square-sail"))).toBe(true);
    expect(course.group.getObjectByName("sheet") === undefined).toBe(sails === "furled");
    course.dispose();
  }
});

it("embeds the beakhead knees in the hull and keeps the lateen cloth on opposite sides", () => {
  const parts = grokGalleonParts();
  const hull = parts.find(part => part.id === "hull")!.create();
  const decks = parts.find(part => part.id === "decks")!.create();
  hull.group.updateMatrixWorld(true);
  decks.group.updateMatrixWorld(true);
  const knees = decks.pickables.filter(mesh => mesh.name === "beakhead-knee");
  expect(knees).toHaveLength(2);
  for (const knee of knees) {
    const a = new THREE.Vector3(0, -0.5, 0).applyMatrix4(knee.matrixWorld);
    const b = new THREE.Vector3(0, 0.5, 0).applyMatrix4(knee.matrixWorld);
    const hits = new THREE.Raycaster(a, b.clone().sub(a).normalize(), 0, a.distanceTo(b)).intersectObjects(
      hull.pickables
    );
    expect(hits.length).toBeGreaterThan(0);
  }
  const lateens = parts.filter(part => part.id.endsWith("lateen")).map(part => part.create());
  const bounds = lateens.map(model =>
    new THREE.Box3().setFromObject(model.pickables.find(mesh => mesh.name === "lateen-sail")!)
  );
  expect(bounds[0].max.z).toBeLessThan(bounds[1].min.z);
  hull.dispose();
  decks.dispose();
  for (const model of lateens) model.dispose();
});

describe.each(["set", "furled"] as const)("sails %s", sails => {
  it.each(["open", "closed"] as const)("owns every part and releases resources with windows %s", windows => {
    for (const gunports of ["open", "closed"] as const) {
      const model = createGrokGalleon({ sails, gunports, windows });
      const ids = new Set(modelParts(model.group).map(part => part.id));
      expect(ids.size).toBe(grokGalleonParts().length);
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      model.group.traverse(object => {
        const draw = object as THREE.Mesh;
        if (!draw.isMesh && !(object as THREE.LineSegments).isLineSegments) return;
        resources.add(draw.geometry);
        for (const material of [draw.material].flat()) resources.add(material);
        expect([...draw.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
        if (draw.isMesh) {
          const ranges = draw.userData.modelPartRanges as ModelPartRange[];
          expect(ranges.every(range => ids.has(range.partId))).toBe(true);
          expect(ranges.reduce((sum, range) => sum + range.count, 0)).toBe(
            draw.geometry.getAttribute("position").count
          );
        }
      });
      const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
      model.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});

it("registers a BV-only high variant and leaves CE on the Codex default", () => {
  const variant = SHIP_VARIANTS.find(entry => entry.id === "ship.galleon@high#grok-4.7");
  expect(variant?.author).toBe("Grok 4.7");
  expect(adopt(SHIP_VARIANTS, "ship.galleon", "default").author).toBe("Codex GPT-6.1 Sol");
  expect(adopt(SHIP_VARIANTS, "ship.galleon", "high").author).toBe("Codex GPT-6.1 Sol");
});
