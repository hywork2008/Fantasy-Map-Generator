import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import { modelParts } from "../modelParts";
import { models as textile } from "./20-textile-leather-workshopsModels";
import { models as woodworking } from "./21-woodworking-workshopsModels";
import { models } from "./51-trade-workhomesModels";
import { WORKHOME_FORMS } from "./workhomeShell";
import {
  assembleWorkhomeTrade,
  WORKHOME_TRADE_COMBINATIONS,
  WORKHOME_TRADES,
  workhomeTradeParts,
  workhomeTradeProfile
} from "./workhomeTrades";

const ray = (meshes: THREE.Mesh[], x: number, y: number, z: number, dx: number, dy: number, dz: number, far: number) =>
  new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz).normalize(), 0, far).intersectObjects(
    meshes
  );
const planned = JSON.parse(readFileSync("docs/plan/data/ce-medieval-trade-forms-v1.json", "utf8"));
it("covers exactly ten planned trades, their permitted forms and unresolved processes", () => {
  expect(WORKHOME_TRADES.map(t => t.id)).toEqual(planned.occupationProfiles.map((t: { pool: string }) => t.pool));
  expect(models).toHaveLength(13);
  const built = JSON.parse(readFileSync("docs/plan/data/ce-medieval-workhome-equipment-v1.json", "utf8"));
  expect(built.entries).toHaveLength(13);
  for (const { role, form } of WORKHOME_TRADE_COMBINATIONS) {
    const p = workhomeTradeProfile(role, form),
      entry = built.entries.find((e: { role: string; formId: string }) => e.role === role && e.formId === p.formId);
    expect(p.operations).toEqual(entry.operations);
    expect(p.equipmentLayoutVersion).toBe(entry.equipmentLayoutVersion);
  }
  for (const t of WORKHOME_TRADES) {
    const old = planned.occupationProfiles.find((p: { pool: string }) => p.pool === t.id);
    expect(`workhome-${t.form}`).toBe(old.defaultForm);
    expect(t.optional.map(f => `workhome-${f}`)).toEqual(old.optionalForms);
    expect(t.equipment).toEqual(old.requiredEquipment);
    expect(t.dependencies).toEqual(old.externalDependencies);
    expect(t.complete).toBe(old.completeOccupationalRow);
  }
  expect(() => workhomeTradeProfile("weaving", "narrow")).toThrow(/Unsupported/);
  expect(models.every(m => m.cePlacementStatus === undefined)).toBe(true);
});

it.each(WORKHOME_TRADE_COMBINATIONS.flatMap(pair => (["low", "high"] as const).map(quality => ({ ...pair, quality }))))(
  "$role/$form/$quality preserves its shell, three free workplaces and access",
  ({ role, form, quality }) => {
    const p = workhomeTradeProfile(role, form),
      shell = WORKHOME_FORMS[form],
      parts = workhomeTradeParts(role, form, quality),
      raw = parts.map(part => part.create());
    for (const model of raw) model.group.updateMatrixWorld(true);
    const equipment = raw.slice(-2).flatMap(m => m.pickables),
      all = raw.flatMap(m => m.pickables),
      bodies: THREE.Box3[] = [];
    const output = assembleWorkhomeTrade(role, form, quality);
    output.group.updateMatrixWorld(true);
    try {
      expect(p.floors).toEqual(shell.floors);
      expect(p.main).toEqual(shell.main);
      expect(p.stair).toEqual(shell.stair);
      expect(p.capacity).toEqual(shell.capacity);
      expect(p.equipmentVerified).toBe(true);
      expect(p.operations.supplyChainVerified).toBe(false);
      expect(output.group.userData.placementSpec).toEqual(p);
      expect(modelParts(output.group)).toHaveLength(6);
      const definition = models.find(m => m.id === `trade-workhome.${shell.formId}.${role}`)!,
        variant = definition.variants!.find(v => v.level === quality)!;
      expect(adoptedVariant(variant.family, quality).id).toBe(variant.id);
      const box = new THREE.Box3().setFromObject(output.group, true);
      for (let i = 0; i < 3; i++) {
        expect(box.min.getComponent(i)).toBeGreaterThanOrEqual(p.envelope.min[i] - 1e-5);
        expect(box.max.getComponent(i)).toBeLessThanOrEqual(p.envelope.max[i] + 1e-5);
      }
      // Every item stays inside the shell's reserved work or storage area at full scale.
      for (const [partIndex, model] of raw.slice(-2).entries())
        for (const mesh of model.pickables) {
          const b = new THREE.Box3().setFromObject(mesh, true);
          expect(b.min.y).toBeGreaterThanOrEqual(0.15 - 1e-5);
          expect(b.max.y).toBeLessThan(3.19);
          if (partIndex === 0) {
            expect(b.min.x, mesh.name).toBeGreaterThanOrEqual(p.workZoneXZ[0] - 1e-5);
            expect(b.max.x, mesh.name).toBeLessThanOrEqual(p.workZoneXZ[2] + 1e-5);
            expect(b.min.z, mesh.name).toBeGreaterThanOrEqual(p.workZoneXZ[1] - 1e-5);
            expect(b.max.z, mesh.name).toBeLessThanOrEqual(p.workZoneXZ[3] + 1e-5);
          } else {
            const covered = p.floors[0].cells
              .filter(c => c.use === "storage")
              .reduce(
                (sum, c) =>
                  sum +
                  Math.max(0, Math.min(b.max.x, c.rect[2]) - Math.max(b.min.x, c.rect[0])) *
                    Math.max(0, Math.min(b.max.z, c.rect[3]) - Math.max(b.min.z, c.rect[1])),
                0
              );
            expect(covered, mesh.name).toBeCloseTo((b.max.x - b.min.x) * (b.max.z - b.min.z), 5);
          }
        }
      expect(p.operations.stations).toHaveLength(3);
      for (const s of p.operations.stations) {
        const body = new THREE.Box3(
          new THREE.Vector3(s.x - 0.324, s.base + 0.002, s.z - 0.324),
          new THREE.Vector3(s.x + 0.324, s.base + s.height, s.z + 0.324)
        );
        for (const previous of bodies) expect(body.intersectsBox(previous)).toBe(false);
        bodies.push(body);
        for (const mesh of all)
          expect(
            body.intersectsBox(new THREE.Box3().setFromObject(mesh, true)),
            `${role}/${form} ${s.id}: ${mesh.name}`
          ).toBe(false);
        expect(body.min.x).toBeGreaterThanOrEqual(p.workZoneXZ[0]);
        expect(body.max.x).toBeLessThanOrEqual(p.workZoneXZ[2]);
        expect(body.min.z).toBeGreaterThanOrEqual(p.workZoneXZ[1]);
        expect(body.max.z).toBeLessThanOrEqual(p.workZoneXZ[3]);
        const approachZ = s.posture === "seated" ? 2.3 : s.z;
        for (const dz of [-0.3, 0, 0.3])
          for (const h of [0.2, 1, 1.7])
            expect(ray(all, p.spine.centerX, 0.15 + h, approachZ + dz, -1, 0, 0, p.spine.centerX - s.x)).toHaveLength(
              0
            );
        for (const dx of [-0.3, 0, 0.3])
          expect(ray(all, s.x + dx, 0.2, approachZ, 0, -1, 0, 0.1)[0]?.point.y).toBeCloseTo(0.15);
      }
      for (const dx of [-0.48, 0, 0.48])
        for (const h of [0.2, 1, 2.05])
          expect(ray(all, p.spine.centerX + dx, 0.15 + h, p.depth / 2 + 0.2, 0, 0, -1, p.depth + 0.4)).toHaveLength(0);
      for (const flight of p.stair.flights)
        expect(ray(equipment, flight.lowerEntry[0], 0.4, 2.7, 0, 0, -1, 1)).toHaveLength(0);
      const names = equipment.map(m => m.name).join(" ");
      expect(names).not.toMatch(/printing|furnace|kiln|tanning|wet-vat/);
      if (role === "bookTrades") expect(names).toMatch(/binding-press/);
      if (role === "weaving") expect(names).toMatch(/mortised-loom-post/);
    } finally {
      for (const model of raw) model.dispose();
      output.dispose();
    }
  }
);

it("preserves legacy textile and woodworking geometry and materials", () => {
  const baseline = JSON.parse(readFileSync("docs/analytics/ce-workhome-trades-legacy-baseline-20261104.json", "utf8"));
  for (const v of [...textile, ...woodworking].flatMap(m => m.variants!)) {
    const output = v.create(),
      hash = createHash("sha256");
    try {
      for (const mesh of output.pickables) {
        for (const n of ["position", "normal"]) {
          const a = mesh.geometry.getAttribute(n).array;
          hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
        }
        hash.update(
          JSON.stringify((mesh.material as THREE.Material).toJSON(), (key, value) =>
            key === "uuid" ? undefined : value
          )
        );
      }
      expect(hash.digest("hex")).toBe(
        baseline.entries.find((row: { variant: string }) => row.variant === v.id).geometryAndMaterialSha256
      );
    } finally {
      output.dispose();
    }
  }
});

it("keeps both quality inventories and all three workplaces, with independent resource ownership", () => {
  for (const { role, form } of WORKHOME_TRADE_COMBINATIONS) {
    const inventories = (["low", "high"] as const).map(q => {
      const parts = workhomeTradeParts(role, form, q)
        .slice(-2)
        .map(p => p.create());
      try {
        return parts
          .flatMap(p => p.pickables.map(m => m.name))
          .filter(n =>
            /wooden-shoe-last|saddle-tree|material-stock|book-stock|dressed-fur-stock|fine-metal-pad|binding-press-bed|mortised-loom-post|working-bow-stave/.test(
              n
            )
          )
          .sort();
      } finally {
        for (const part of parts) part.dispose();
      }
    });
    expect(inventories[0]).toEqual(inventories[1]);
  }
  const low = assembleWorkhomeTrade("weaving", "wide", "low"),
    high = assembleWorkhomeTrade("weaving", "wide", "high"),
    resources = new Set(low.pickables.flatMap(m => [m.geometry, ...[m.material].flat()]));
  const spies = [...resources].map(r => vi.spyOn(r, "dispose")),
    other = vi.spyOn(high.pickables[0].geometry, "dispose");
  low.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
  high.dispose();
});
