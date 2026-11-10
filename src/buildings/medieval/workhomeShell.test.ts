import { readFileSync } from "node:fs";
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import { modelParts } from "../modelParts";
import { models } from "./50-workhome-shellsModels";
import { assembleWorkhomeShell, WORKHOME_FORMS, type WorkhomeForm, workhomeShellParts } from "./workhomeShell";

const ray = (
  model: ReturnType<typeof assembleWorkhomeShell>,
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
const rectArea = ([x0, z0, x1, z1]: number[]) => (x1 - x0) * (z1 - z0);

it("retains the planned residential floor without crediting unverified equipment", () => {
  const previous = JSON.parse(readFileSync("docs/plan/data/ce-medieval-trade-forms-v1.json", "utf8"));
  for (const p of Object.values(WORKHOME_FORMS)) {
    const old = previous.forms.find((f: { id: string }) => f.id === p.formId);
    const built = JSON.parse(readFileSync("docs/plan/data/ce-medieval-workhome-shells-v2.json", "utf8")).forms.find(
      (f: { id: string }) => f.id === p.formId
    );
    expect(p.placementSpecVersion).toBe(built.placementSpecVersion);
    expect(p.floors).toEqual(built.floors);
    expect(p.stair.hole).toEqual(built.stairs.boundsXZ);
    expect(p.stair.flights).toEqual(built.stairs.flights);
    expect(p.main).toEqual(built.ports.main);
    expect(p.service).toEqual(built.ports.service);
    expect(p.workZoneXZ).toEqual(built.operations.minimumDryWorkZoneXZ);
    expect(p.envelope).toEqual(built.envelope);
    expect(p.capacity.netResidentialAreaM2).toBeCloseTo(old.capacity.netResidentialAreaM2);
    expect(Math.floor(p.capacity.netResidentialAreaM2 / 40)).toBe(1);
    expect(p.operationalStatus).toBe("skeleton-only");
    expect(p.equipmentVerified).toBe(false);
    for (const f of p.floors) {
      expect(f.cells.reduce((n, c) => n + rectArea(c.rect), 0)).toBeCloseTo(f.clearFloorAreaM2);
      expect(f.netUseAreaM2 + Object.values(f.deductionsM2).reduce((a, b) => a + b, 0)).toBeCloseTo(f.clearFloorAreaM2);
      expect(f.deductionsM2.stair).toBeCloseTo(7.48);
      const a = p.workZoneXZ;
      if (f.level === 0)
        for (const c of f.cells.filter(c => c.use !== "net-use")) {
          const b = c.rect;
          expect(
            Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
              Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
          ).toBeCloseTo(0);
        }
    }
    expect(p.floors[0].deductionsM2.circulation).toBeCloseTo(p.form === "narrow" ? 10.2 : 11.8);
  }
  expect(models.every(m => m.cePlacementStatus === "preview-only")).toBe(true);
});

it.each(models.flatMap(m => m.variants!.map(variant => ({ model: m, variant }))))(
  "$model.id/$variant.level has clear doorways, floor holes, stair headroom and connections",
  ({ model, variant }) => {
    const form = model.id.split(".")[1].replace("workhome-", "") as WorkhomeForm,
      p = WORKHOME_FORMS[form],
      output = variant.create();
    output.group.updateMatrixWorld(true);
    try {
      expect(adoptedVariant(variant.family, variant.level).id).toBe(variant.id);
      expect(output.group.userData.placementSpec).toEqual(p);
      expect(modelParts(output.group)).toHaveLength(4);
      const box = new THREE.Box3().setFromObject(output.group, true);
      for (let axis = 0; axis < 3; axis++) {
        expect(box.min.getComponent(axis)).toBeGreaterThanOrEqual(p.envelope.min[axis] - 1e-5);
        expect(box.max.getComponent(axis)).toBeLessThanOrEqual(p.envelope.max[axis] + 1e-5);
      }
      // The complete front-to-rear spine must remain clear over its full 1 m width.
      for (const dx of [-0.48, 0, 0.48])
        for (const h of [0.15, 0.7, 1.5, 2.05])
          expect(ray(output, p.spine.centerX + dx, 0.15 + h, p.depth / 2 + 0.2, 0, 0, -1, p.depth + 0.4)).toHaveLength(
            0
          );
      for (const f of p.stair.flights) {
        const base = p.floors[f.fromLevel].elevation,
          mid = base + f.rise / 2,
          r = f.rise / f.risers;
        for (let i = 0; i < f.treadsPerFlight; i++)
          for (const [x, z, top] of [
            [f.lowerEntry[0], 1.7 - (i + 0.5) * f.tread, base + (i + 1) * r],
            [f.upperExit[0], f.turnZ + (i + 0.5) * f.tread, mid + (i + 1) * r]
          ]) {
            expect(ray(output, x, top + 0.04, z, 0, -1, 0, 0.1)[0]?.point.y).toBeCloseTo(top, 4);
            for (const dx of [-0.47, 0, 0.47]) expect(ray(output, x + dx, top + 0.12, z, 0, 1, 0, 2.1)).toHaveLength(0);
          }
        for (const dz of [-0.45, 0, 0.45]) {
          const z = -1.1 + dz;
          expect(ray(output, f.lowerEntry[0], mid + 1, z, 1, 0, 0, f.upperExit[0] - f.lowerEntry[0])).toHaveLength(0);
          for (const x of [f.lowerEntry[0], (f.lowerEntry[0] + f.upperExit[0]) / 2, f.upperExit[0]]) {
            expect(ray(output, x, mid + 0.04, z, 0, -1, 0, 0.1)[0]?.point.y).toBeCloseTo(mid);
            expect(ray(output, x, mid + 0.12, z, 0, 1, 0, 2.1)).toHaveLength(0);
          }
        }
        // Turn and arrival are supported, not capped by the upper slab.
        expect(ray(output, f.lowerEntry[0], mid + 0.04, -1.1, 0, -1, 0, 0.1)[0]?.point.y).toBeCloseTo(mid);
        for (const x of [f.lowerEntry[0], f.upperExit[0]])
          expect(ray(output, x, mid + 0.12, -1.1, 0, 1, 0, 2.1)).toHaveLength(0);
        expect(ray(output, f.upperExit[0], base + f.rise + 0.04, 2.1, 0, -1, 0, 0.1)[0]?.point.y).toBeCloseTo(
          base + f.rise
        );
        // Ground approach, upper dwelling access and (narrow only) the next flight share a level landing.
        const paths = [
          {
            points: [
              [p.spine.centerX, 2.2],
              [f.lowerEntry[0], 2.2],
              [f.lowerEntry[0], 1.7]
            ],
            floor: base
          },
          { points: p.upperAccess[f.fromLevel], floor: base + f.rise }
        ];
        if (f.fromLevel > 0)
          paths.push({
            points: [
              [f.upperExit[0], 2.2],
              [f.lowerEntry[0], 2.2]
            ],
            floor: base
          });
        for (const { points, floor } of paths)
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1],
              b = points[i],
              length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            for (const offset of [-0.45, 0, 0.45])
              for (const h of [0.2, 1, 2.05])
                expect(
                  ray(
                    output,
                    a[0] - ((b[1] - a[1]) * offset) / length,
                    floor + h,
                    a[1] + ((b[0] - a[0]) * offset) / length,
                    b[0] - a[0],
                    0,
                    b[1] - a[1],
                    length
                  )
                ).toHaveLength(0);
          }
      }
      // All reserved dry work area remains empty for the next stage's trade equipment.
      const [x0, z0, x1, z1] = p.workZoneXZ;
      for (const x of [x0 + 0.1, (x0 + x1) / 2, x1 - 0.1])
        for (const z of [z0 + 0.1, 0, z1 - 0.1]) expect(ray(output, x, 0.3, z, 0, 1, 0, 2.1)).toHaveLength(0);
    } finally {
      output.dispose();
    }
  }
);

it.each(Object.keys(WORKHOME_FORMS) as WorkhomeForm[])("%s treads are carried by the stringers", form => {
  const p = WORKHOME_FORMS[form],
    model = workhomeShellParts(form, "high")
      .find(part => part.role === "internal-stair")!
      .create();
  model.group.updateMatrixWorld(true);
  try {
    for (const f of p.stair.flights)
      for (let i = 0; i < f.treadsPerFlight; i++)
        for (const [name, x, z, top] of [
          [
            "lower-stair-carriage",
            f.lowerEntry[0] - 0.42,
            1.7 - (i + 0.5) * f.tread,
            p.floors[f.fromLevel].elevation + ((i + 1) * f.rise) / f.risers
          ],
          [
            "upper-stair-carriage",
            f.upperExit[0] - 0.42,
            f.turnZ + (i + 0.5) * f.tread,
            p.floors[f.fromLevel].elevation + f.rise / 2 + ((i + 1) * f.rise) / f.risers
          ]
        ] as const) {
          const hit = new THREE.Raycaster(
            new THREE.Vector3(x, top + 0.2, z),
            new THREE.Vector3(0, -1, 0),
            0,
            0.5
          ).intersectObjects(model.pickables.filter(m => m.name === name))[0];
          expect(hit?.point.y).toBeGreaterThanOrEqual(top - 0.11);
          expect(hit?.point.y).toBeLessThanOrEqual(top);
        }
  } finally {
    model.dispose();
  }
});

it("owns and releases each quality's resources independently", () => {
  const low = assembleWorkhomeShell("narrow", "low"),
    high = assembleWorkhomeShell("narrow", "high"),
    resources = new Set(low.pickables.flatMap(m => [m.geometry, ...[m.material].flat()]));
  const spies = [...resources].map(r => vi.spyOn(r, "dispose")),
    untouched = vi.spyOn(high.pickables[0].geometry, "dispose");
  low.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(untouched).not.toHaveBeenCalled();
  high.dispose();
});
