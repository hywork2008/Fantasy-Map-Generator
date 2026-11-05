import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { modelParts } from "../modelParts";
import { models as oldCloth } from "./27-cloth-hallsModels";
import { models } from "./48-trade-guild-hallsModels";
import { assembleEnclosedGuildHall, enclosedGuildHallParts, ENCLOSED_GUILD_HALL as profile } from "./enclosedGuildHall";
import { ENCLOSED_GUILD_TRADES } from "./enclosedGuildTrades";

const spec = JSON.parse(readFileSync("docs/plan/data/ce-medieval-trade-forms-v1.json", "utf8")).forms.find(
  (form: { id: string }) => form.id === "guild-enclosed"
);
const ray = (
  model: ReturnType<typeof assembleEnclosedGuildHall>,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number
) => new THREE.Raycaster(origin, direction, 0, distance).intersectObjects(model.pickables);

it("implements the specified body, main origin, ports, floors and capacity", () => {
  expect(profile.formId).toBe(spec.id);
  expect(profile.width).toBe(spec.body.width);
  expect(profile.depth).toBe(spec.body.depth);
  expect(profile.wall).toBe(spec.body.wallThickness);
  expect(profile.envelope).toEqual(spec.envelope);
  expect(profile.main).toEqual(spec.ports.main);
  expect(profile.stair.hole).toEqual(spec.stairs.boundsXZ);
  expect(profile.stair.lowerEntry).toEqual(spec.stairs.flights[0].lowerEntry);
  expect(profile.stair.upperExit).toEqual(spec.stairs.flights[0].upperExit);
  expect(profile.capacity).toMatchObject(spec.capacity);
  expect(profile.floors).toEqual(spec.floors);
});

it("registers exactly the ten planned guild roles and preserves the first four geometry signatures", () => {
  const planned = JSON.parse(readFileSync("docs/plan/data/ce-medieval-trade-forms-v1.json", "utf8"));
  expect(ENCLOSED_GUILD_TRADES.map(trade => trade.id)).toEqual(planned.hallRoles);
  expect(models).toHaveLength(10);
  const baseline = JSON.parse(readFileSync("docs/analytics/ce-enclosed-guild-hall-t1b-20261103.json", "utf8"));
  for (const row of baseline.entries) {
    const variant = models.flatMap(model => model.variants!).find(variant => variant.id === row.variant)!;
    const output = variant.create(),
      hash = createHash("sha256");
    try {
      for (const mesh of output.pickables)
        for (const name of ["position", "normal"]) {
          const array = mesh.geometry.getAttribute(name).array;
          hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
        }
      expect(hash.digest("hex")).toBe(row.geometrySha256);
    } finally {
      output.dispose();
    }
  }
});

it.each(ENCLOSED_GUILD_TRADES.slice(2))(
  "$id has its own samples and emblem with quality-invariant inventory",
  ({ id }) => {
    const inventory = [];
    for (const quality of ["low", "high"] as const) {
      const furniture = enclosedGuildHallParts(id, quality)
        .find(part => part.role === "trade-furnishings")!
        .create();
      try {
        const names = furniture.pickables.map(mesh => mesh.name);
        expect(names.some(name => name.startsWith("guild-sample-"))).toBe(true);
        expect(names.some(name => name.startsWith("guild-symbol-"))).toBe(true);
        expect(names.some(name => /inspected-leather|hide-sign|printing|press|furnace|kiln/.test(name))).toBe(false);
        inventory.push(
          names.filter(name => name.startsWith("guild-sample-") || name.startsWith("guild-symbol-")).sort()
        );
      } finally {
        furniture.dispose();
      }
    }
    expect(inventory[0]).toEqual(inventory[1]);
  }
);

it.each(models.flatMap(model => model.variants!.map(variant => ({ model, variant }))))(
  "$model.id/$variant.level fits its fixed envelope and has usable doors, floors and stairs",
  ({ variant }) => {
    const model = variant.create();
    model.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.group, true);
    for (let axis = 0; axis < 3; axis++) {
      expect(box.min.getComponent(axis)).toBeGreaterThanOrEqual(profile.envelope.min[axis] - 1e-5);
      expect(box.max.getComponent(axis)).toBeLessThanOrEqual(profile.envelope.max[axis] + 1e-5);
    }
    expect(box.min.y).toBeCloseTo(0);
    expect(model.group.userData.placementSpec).toEqual(profile);
    expect(modelParts(model.group)).toHaveLength(5);
    expect(adoptedVariant(variant.family, variant.level).id).toBe(variant.id);
    const forward = new THREE.Vector3(0, 0, -1),
      up = new THREE.Vector3(0, 1, 0),
      down = new THREE.Vector3(0, -1, 0);
    for (const x of [-0.55, 0, 0.55]) expect(ray(model, new THREE.Vector3(x, 1.3, 4.5), forward, 1)).toHaveLength(0);
    expect(ray(model, new THREE.Vector3(-3, 0.7, 4.5), forward, 1).length).toBeGreaterThan(0);
    expect(ray(model, new THREE.Vector3(-4, 1.3, -4.5), new THREE.Vector3(0, 0, 1), 1)).toHaveLength(0);
    for (let i = 0; i < 8; i++) {
      const lowerZ = 1.7 - (i + 0.5) * 0.27,
        upperZ = 1.7 - 8 * 0.27 + (i + 0.5) * 0.27;
      for (const [x, z, expected] of [
        [4, lowerZ, 0.2 + ((i + 1) * 3.2) / 18],
        [5.2, upperZ, 1.8 + ((i + 1) * 3.2) / 18]
      ]) {
        const support = ray(model, new THREE.Vector3(x, expected + 0.04, z), down, 0.1)[0];
        expect(support?.point.y).toBeCloseTo(expected, 4);
        for (const dx of [-0.4, 0, 0.4])
          expect(ray(model, new THREE.Vector3(x + dx, expected + 0.13, z), up, 2.1)).toHaveLength(0);
      }
    }
    expect(ray(model, new THREE.Vector3(4, 1.84, -1.2), down, 0.1)[0]?.point.y).toBeCloseTo(1.8);
    expect(ray(model, new THREE.Vector3(5.2, 3.5, 2), down, 0.2)[0]?.point.y).toBeCloseTo(3.4);
    for (const [path, floor] of [
      [profile.groundAccess, 0.2],
      [profile.serviceAccess, 0.2],
      [profile.upperAccess, 3.4]
    ] as const) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const direction = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
        for (const height of [0.4, 1, 2]) {
          expect(ray(model, new THREE.Vector3(a[0], floor + height, a[1]), direction, length)).toHaveLength(0);
        }
      }
    }
    model.dispose();
  }
);

it("shares geometry layout and capacity across roles and qualities without sharing resources", () => {
  const low = assembleEnclosedGuildHall("textiles", "low"),
    high = assembleEnclosedGuildHall("leather", "high");
  expect(low.group.userData.placementSpec).toEqual(high.group.userData.placementSpec);
  const resources = new Set(low.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  const untouched = vi.spyOn(high.pickables[0].geometry, "dispose");
  low.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(untouched).not.toHaveBeenCalled();
  high.dispose();
});

it("embeds stair carriages into every tread instead of leaving floating steps", () => {
  const staircase = enclosedGuildHallParts("textiles", "high")
    .find(part => part.role === "internal-stair")!
    .create();
  staircase.group.updateMatrixWorld(true);
  for (let i = 0; i < 8; i++) {
    for (const [name, x, z, top] of [
      ["lower-stair-carriage", 3.56, 1.7 - (i + 0.5) * 0.27, 0.2 + ((i + 1) * 3.2) / 18],
      ["upper-stair-carriage", 4.76, 1.7 - 8 * 0.27 + (i + 0.5) * 0.27, 1.8 + ((i + 1) * 3.2) / 18]
    ] as const) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, top + 0.2, z),
        new THREE.Vector3(0, -1, 0),
        0,
        0.5
      ).intersectObjects(staircase.pickables.filter(mesh => mesh.name === name))[0];
      expect(hit?.point.y).toBeGreaterThanOrEqual(top - 0.11);
      expect(hit?.point.y).toBeLessThanOrEqual(top);
    }
  }
  staircase.dispose();
  expect(models.every(model => model.cePlacementStatus === undefined)).toBe(true);
});

it("exposes the internal stair and floors as separately inspectable parts, keeping legacy adoption", () => {
  for (const quality of ["low", "high"] as const) {
    const factories = enclosedGuildHallParts("textiles", quality);
    expect(factories.map(part => part.role)).toEqual([
      "architecture",
      "floors",
      "roof",
      "internal-stair",
      "trade-furnishings"
    ]);
    const staircase = factories.find(part => part.role === "internal-stair")!.create();
    expect(staircase.pickables.filter(mesh => mesh.name === "lower-flight-tread")).toHaveLength(8);
    expect(staircase.pickables.filter(mesh => mesh.name === "upper-flight-tread")).toHaveLength(8);
    staircase.dispose();
  }
  expect(medievalDefinition(oldCloth[0]).variant).toBe("medieval.cloth-guild-hall@default#codex-gpt-6.1-sol");
});
