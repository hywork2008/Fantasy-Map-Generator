import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { adopt } from "../../city3d/adoption";
import { collectModelMetrics } from "../../model-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import {
  createGrokShipOfTheLine,
  GROK_SHIP_OF_THE_LINE,
  grokShipOfTheLineParts,
  shipOfTheLineGunports,
  shipOfTheLinePoint,
  shipOfTheLineWindows
} from "./grokShipOfTheLine";
import { SHIP_VARIANTS } from "./shipVariants";

const mountBasis = (normal: THREE.Vector3) => {
  const n = normal.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(n);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  return { right, up: n.clone().cross(right).normalize(), normal: n };
};
const skinOf = (model: { pickables: THREE.Mesh[] }) =>
  model.pickables.filter(mesh => /^(hull-|transom|stem|keel)/.test(mesh.name));

it("fills the advertised envelope and carries the Trafalgar gun and window count", () => {
  const model = createGrokShipOfTheLine();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const span = bounds.max.x - bounds.min.x;
  expect(span).toBeLessThanOrEqual(GROK_SHIP_OF_THE_LINE.length);
  expect(span).toBeGreaterThan(GROK_SHIP_OF_THE_LINE.length * 0.9);
  expect(bounds.max.y).toBeLessThanOrEqual(GROK_SHIP_OF_THE_LINE.height);
  expect(bounds.max.y).toBeGreaterThan(GROK_SHIP_OF_THE_LINE.height * 0.8);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-GROK_SHIP_OF_THE_LINE.draft - 0.02);
  expect(bounds.max.z - bounds.min.z).toBeGreaterThan(GROK_SHIP_OF_THE_LINE.beam);
  const decks = grokShipOfTheLineParts()
    .find(part => part.id === "decks")!
    .create();
  decks.group.updateMatrixWorld(true);
  const deck = new THREE.Raycaster(new THREE.Vector3(8, 30, 0.4), new THREE.Vector3(0, -1, 0)).intersectObjects(
    decks.pickables.filter(mesh => mesh.name === "upper-deck")
  );
  expect(deck[0].point.y).toBeGreaterThan(5.2);
  expect(deck[0].point.y).toBeLessThan(5.7);
  const parts = grokShipOfTheLineParts();
  const squares = parts.filter(part => part.create().pickables.some(mesh => mesh.name === "square-sail"));
  const jibs = parts.filter(part => part.create().pickables.some(mesh => mesh.name === "jib-sail"));
  const spanker = parts.find(part => part.id === "spanker")!.create();
  expect(squares).toHaveLength(9);
  expect(jibs).toHaveLength(2);
  expect(spanker.pickables.some(mesh => mesh.name === "spanker")).toBe(true);
  const armament = parts.find(part => part.id === "armament")!.create();
  const lights = parts.find(part => part.id === "window-leaves")!.create();
  expect(armament.pickables.filter(mesh => mesh.name === "cannon-run-out")).toHaveLength(GROK_SHIP_OF_THE_LINE.guns);
  expect(lights.pickables.filter(mesh => mesh.name === "window-glass")).toHaveLength(GROK_SHIP_OF_THE_LINE.windows);
  expect(collectModelMetrics(model.group).triangles).toBeGreaterThan(20_000);
  decks.dispose();
  spanker.dispose();
  armament.dispose();
  lights.dispose();
  for (const part of [...squares, ...jibs]) part.create().dispose();
  model.dispose();
});

it("keeps the hull, spars, rigging and frames fixed across sail, gun and window states", () => {
  const fixed = ["hull", "decks", "fittings", "spars", "rigging", "flags", "gun-frames", "window-frames"];
  const base = grokShipOfTheLineParts();
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
        const parts = grokShipOfTheLineParts({ sails, gunports, windows });
        for (const id of fixed) {
          const model = parts.find(part => part.id === id)!.create();
          expect(landmarkFingerprint(model.group)).toBe(hashes.get(id));
          model.dispose();
        }
      }
});

it("paints the Nelson chequer and cuts every port through the topsides", () => {
  const ports = shipOfTheLineGunports();
  expect(ports).toHaveLength(104);
  expect(ports.filter(port => port.id.startsWith("stern"))).toHaveLength(2);
  expect(ports.filter(port => port.id.startsWith("carronade"))).toHaveLength(2);
  expect(ports.filter(port => port.id.startsWith("broadside-lower"))).toHaveLength(30);
  const hull = grokShipOfTheLineParts()
    .find(part => part.id === "hull")!
    .create();
  hull.group.updateMatrixWorld(true);
  const skin = skinOf(hull);
  const names = new Set(skin.map(mesh => mesh.name));
  for (const band of ["hull-band-lower", "hull-band-middle", "hull-band-upper", "hull-topsides", "hull-underwater"])
    expect(names.has(band), band).toBe(true);
  const bandRay = (y: number, expected: string) => {
    const origin = shipOfTheLinePoint(-8.4, y, 1).add(new THREE.Vector3(0, 0, 4));
    const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1), 0, 6).intersectObjects(skin);
    expect(hit[0]?.object.name, `y ${y}`).toBe(expected);
  };
  bandRay(LOWER_SAMPLE, "hull-band-lower");
  bandRay(3.15, "hull-topsides");
  bandRay(-2, "hull-underwater");
  const closed = grokShipOfTheLineParts({ gunports: "closed" })
    .find(part => part.id === "armament")!
    .create();
  closed.group.updateMatrixWorld(true);
  for (const port of ports) {
    const point = new THREE.Vector3(...port.point);
    const normal = new THREE.Vector3(...port.normal);
    const { right, up } = mountBasis(normal);
    const through = new THREE.Raycaster(point.clone().addScaledVector(normal, 2), normal.clone().negate(), 0, 2.2);
    expect(through.intersectObjects(skin), port.id).toHaveLength(0);
    const beside = point
      .clone()
      .addScaledVector(right, port.width * 0.78)
      .addScaledVector(normal, 2.2);
    expect(
      new THREE.Raycaster(beside, normal.clone().negate(), 0, 3.4).intersectObjects(skin).length,
      port.id
    ).toBeGreaterThan(0);
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
        expect(hit.length, port.id).toBeGreaterThan(0);
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
    for (let i = 0; i < position.count; i++)
      max = Math.max(
        max,
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).sub(point).dot(normal)
      );
    expect(max, port.id).toBeLessThan(-0.2);
  }
  hull.dispose();
  closed.dispose();
});

const LOWER_SAMPLE = 1.9;

it("swaps stern and gallery lights for shutters that cover the opening", () => {
  const lights = shipOfTheLineWindows();
  expect(lights).toHaveLength(23);
  const open = grokShipOfTheLineParts({ windows: "open" })
    .find(part => part.id === "window-leaves")!
    .create();
  const shut = grokShipOfTheLineParts({ windows: "closed" })
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
    expect(glass[0]?.object.name, light.id).toBe("window-glass");
    for (const x of [-0.3, 0, 0.3])
      for (const y of [-0.3, 0, 0.3]) {
        const sample = origin
          .clone()
          .addScaledVector(right, x * light.width)
          .addScaledVector(up, y * light.height);
        const hit = new THREE.Raycaster(sample, normal.clone().negate(), 0, 2.2).intersectObjects(
          shut.pickables.filter(mesh => mesh.name === "window-shutter-closed")
        );
        expect(hit.length, light.id).toBeGreaterThan(0);
        const outward = hit[0].point.clone().sub(point).dot(normal);
        expect(outward, light.id).toBeGreaterThan(0.02);
        expect(outward, light.id).toBeLessThan(0.28);
      }
    const blocked = new THREE.Raycaster(origin, normal.clone().negate(), 0, 2).intersectObjects(shut.pickables);
    expect(
      blocked.some(hit => hit.object.name === "window-glass"),
      light.id
    ).toBe(false);
  }
  open.dispose();
  shut.dispose();
});

it("replaces the main course with a tied bundle and drops the sheets", () => {
  for (const sails of ["set", "furled"] as const) {
    const course = grokShipOfTheLineParts({ sails })
      .find(part => part.id === "main-course")!
      .create();
    course.group.updateMatrixWorld(true);
    const cloth = course.pickables.filter(mesh => mesh.name === "square-sail" || mesh.name === "furled-sail");
    expect(cloth.map(mesh => mesh.name)).toEqual([sails === "furled" ? "furled-sail" : "square-sail"]);
    const box = new THREE.Box3().setFromObject(cloth[0]);
    const size = box.getSize(new THREE.Vector3());
    if (sails === "set") {
      expect(size.y).toBeGreaterThan(8);
      expect(size.x).toBeGreaterThan(0.8);
    } else {
      expect(size.y).toBeLessThan(1.4);
      expect(size.x).toBeLessThan(1.4);
    }
    expect(course.group.getObjectByName("sheet") === undefined).toBe(sails === "furled");
    course.dispose();
  }
});

it("embeds the beakhead knees in the hull and sets the jibs on opposite sides of the stay", () => {
  const parts = grokShipOfTheLineParts();
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
  const jibs = parts.filter(part => part.id.endsWith("jib")).map(part => part.create());
  const bounds = jibs.map(model =>
    new THREE.Box3().setFromObject(model.pickables.find(mesh => mesh.name === "jib-sail")!)
  );
  expect(bounds[0].max.z).toBeGreaterThan(0.2);
  expect(bounds[1].min.z).toBeLessThan(-0.2);
  hull.dispose();
  decks.dispose();
  for (const model of jibs) model.dispose();
});

describe.each(["set", "furled"] as const)("sails %s", sails => {
  it.each(["open", "closed"] as const)("owns every part and releases resources with windows %s", windows => {
    for (const gunports of ["open", "closed"] as const) {
      const model = createGrokShipOfTheLine({ sails, gunports, windows });
      const ids = new Set(modelParts(model.group).map(part => part.id));
      expect(ids.size).toBe(grokShipOfTheLineParts().length);
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

it("registers a BV-only high variant and leaves the CE galleon on Codex", () => {
  const variants = SHIP_VARIANTS.filter(entry => entry.family === "ship.ship-of-the-line");
  expect(variants.map(entry => entry.id)).toEqual([
    "ship.ship-of-the-line@high#grok-4.7",
    "ship.ship-of-the-line@high#claude-opus-5.5"
  ]);
  // CE keeps drawing the Grok 4.7 ship; the Opus HMS Victory is a BV comparison edition.
  expect(adopt(SHIP_VARIANTS, "ship.ship-of-the-line", "high").author).toBe("Grok 4.7");
  expect(adopt(SHIP_VARIANTS, "ship.galleon", "default").author).toBe("Codex GPT-6.1 Sol");
  expect(adopt(SHIP_VARIANTS, "ship.galleon", "high").author).toBe("Codex GPT-6.1 Sol");
  expect(adopt(SHIP_VARIANTS, "ship.sloop", "default").author).toBe("Codex GPT-6.1 Sol");
});
