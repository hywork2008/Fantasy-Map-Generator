import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import { models as civic } from "./26-civic-hallsModels";
import { models as cloth } from "./27-cloth-hallsModels";
import { models as guilds } from "./28-craft-guild-hallsModels";
import { models } from "./49-market-guild-hallsModels";
import { ENCLOSED_GUILD_TRADES } from "./enclosedGuildTrades";
import { assembleMarketGuildHall, marketGuildHallParts, MARKET_GUILD_HALL as profile } from "./marketGuildHall";

const spec = JSON.parse(readFileSync("docs/plan/data/ce-medieval-market-hall-v2.json", "utf8"));
const ray = (
  model: ReturnType<typeof assembleMarketGuildHall>,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  far: number
) =>
  new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz).normalize(), 0, far).intersectObjects(
    model.pickables
  );

it("uses version 2 ports and distinguishes physical tread width, clear width and the roof bearing", () => {
  expect(models).toHaveLength(10);
  expect(profile.placementSpecVersion).toBe(spec.placementSpecVersion);
  expect(profile.formId).toBe(spec.id);
  expect(profile.envelope).toEqual(spec.envelope);
  expect(profile.main).toEqual(spec.ports.main);
  expect(profile.upper).toEqual(spec.ports.upper);
  expect(profile.stairFoot).toEqual(spec.ports.stairFoot);
  expect(profile.groundFloor).toBe(spec.floors[0].elevation);
  expect(profile.upperWallTop + profile.roofBearingOffset).toBeCloseTo(spec.body.eaveHeight);
  expect(profile.capacity).toEqual(spec.capacity);
  for (const key of ["risers", "flightTreads", "flightRun", "treadDepth", "treadWidth", "clearWidth"] as const)
    expect(profile.stair[key]).toBeCloseTo(spec.stairs[key]);
  expect(models.map(model => model.id.split(".").at(-1))).toEqual(ENCLOSED_GUILD_TRADES.map(trade => trade.id));
  expect(models.every(model => model.cePlacementStatus === "preview-only")).toBe(true);
});

it.each(models.flatMap(model => model.variants!.map(variant => ({ model, variant }))))(
  "$model.id/$variant.level retains full-size anchors, passages and supported stair treads",
  ({ variant }) => {
    const output = variant.create();
    output.group.updateMatrixWorld(true);
    try {
      const box = new THREE.Box3().setFromObject(output.group, true);
      for (let axis = 0; axis < 3; axis++) {
        expect(box.min.getComponent(axis)).toBeGreaterThanOrEqual(profile.envelope.min[axis] - 1e-5);
        expect(box.max.getComponent(axis)).toBeLessThanOrEqual(profile.envelope.max[axis] + 1e-5);
      }
      expect(output.group.userData.placementSpec).toEqual(profile);
      expect(adoptedVariant(variant.family, variant.level).id).toBe(variant.id);
      expect(ray(output, 0, 1, 4, 0, 0, -1, 1).length).toBeGreaterThan(0); // The rejected draft entrance hits a pier.
      for (const dx of [-0.8, 0, 0.8])
        for (const h of [0.4, 1.3, 2.1]) expect(ray(output, 5.625 + dx, 0.14 + h, 3.9, 0, 0, -1, 0.8)).toHaveLength(0);
      expect(ray(output, 5.625, 0.24, 3.4, 0, -1, 0, 0.2)[0]?.point.y).toBeCloseTo(0.14);
      for (const dz of [-0.4, 0, 0.4])
        for (const h of [0.4, 1.2, 2.05]) expect(ray(output, 7.95, 3.32 + h, -2.3 + dz, -1, 0, 0, 1)).toHaveLength(0);
      for (const x of [7.3, 7.65]) expect(ray(output, x, 3.6, -2.3, 0, -1, 0, 0.4)[0]?.point.y).toBeCloseTo(3.32);
      const tread = profile.stair.treadDepth;
      for (let i = 0; i < profile.stair.flightTreads; i++) {
        const z = -2.3 + 0.2 + 5.7 - (i + 0.5) * tread,
          top = ((i + 1) * 3.32) / 18;
        expect(ray(output, 8.36, top + 0.035, z, 0, -1, 0, 0.08)[0]?.point.y).toBeCloseTo(top, 4);
        for (const dx of [-0.5, 0, 0.5]) expect(ray(output, 8.36 + dx, top + 0.13, z, 0, 1, 0, 2.1)).toHaveLength(0);
      }
      expect(ray(output, 8.36, 3.36, -2.3, 0, -1, 0, 0.1)[0]?.point.y).toBeCloseTo(3.32);
      for (const [path, y] of [
        [profile.groundAccess, 0.14],
        [profile.upperAccess, 3.32]
      ] as const)
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1],
            b = path[i],
            length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const nx = -(b[1] - a[1]) / length,
            nz = (b[0] - a[0]) / length;
          for (const offset of [-0.45, 0, 0.45])
            for (const h of [0.35, 1, 2.05])
              expect(
                ray(output, a[0] + nx * offset, y + h, a[1] + nz * offset, b[0] - a[0], 0, b[1] - a[1], length)
              ).toHaveLength(0);
        }
    } finally {
      output.dispose();
    }
  }
);

it("excludes all pier pads from the conservative floor and provides exactly 36 seats in both tiers", () => {
  expect(profile.floorLedger.groundPierFootprintsXZ).toHaveLength(12);
  let area = 0;
  for (const [x0, z0, x1, z1] of profile.floorLedger.groundPierFootprintsXZ) {
    area += (x1 - x0) * (z1 - z0);
    const overlap =
      Math.max(0, Math.min(x1, 7.2) - Math.max(x0, -7.2)) * Math.max(0, Math.min(z1, 3.2) - Math.max(z0, -3.2));
    expect(overlap).toBe(0);
  }
  expect(area).toBeCloseTo(profile.floorLedger.pierFootprintAreaM2);
  const [x0, z0, x1, z1] = profile.assemblyAreaXZ;
  expect((x1 - x0) * (z1 - z0)).toBeCloseTo(72.16);
  for (const quality of ["low", "high"] as const) {
    const fittings = marketGuildHallParts("textiles", quality)
      .find(part => part.role === "trade-furnishings")!
      .create();
    expect(fittings.pickables.filter(mesh => mesh.name === "three-seat-assembly-bench")).toHaveLength(12);
    fittings.dispose();
  }
});

it("preserves legacy geometry and materials when shared builders use their default High detail", () => {
  const baseline = JSON.parse(readFileSync("docs/analytics/ce-market-guild-legacy-baseline-20261104.json", "utf8"));
  for (const variant of [...civic, ...cloth, ...guilds].flatMap(model => model.variants!)) {
    const output = variant.create(),
      hash = createHash("sha256");
    try {
      for (const mesh of output.pickables) {
        for (const name of ["position", "normal"]) {
          const a = mesh.geometry.getAttribute(name).array;
          hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
        }
        hash.update(
          JSON.stringify((mesh.material as THREE.Material).toJSON(), (key, value) =>
            key === "uuid" ? undefined : value
          )
        );
      }
      expect(hash.digest("hex")).toBe(
        baseline.entries.find((row: { variant: string }) => row.variant === variant.id).geometryAndMaterialSha256
      );
    } finally {
      output.dispose();
    }
  }
});

it("owns resources independently and disposes each rendered resource once", () => {
  const low = assembleMarketGuildHall("textiles", "low"),
    high = assembleMarketGuildHall("textiles", "high");
  const resources = new Set(low.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  const other = vi.spyOn(high.pickables[0].geometry, "dispose");
  low.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
  high.dispose();
});
