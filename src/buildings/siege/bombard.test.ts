import * as THREE from "three";
import { expect, it } from "vitest";
import { BOMBARD, createBombard } from "./bombard";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(m => m.name === name);

it.each(["low", "high"] as const)("%s stands on the ground with no degenerate parts", quality => {
  const model = createBombard(quality);
  model.group.updateMatrixWorld(true);
  expect(box(model.group).min.y).toBeGreaterThan(-0.05);
  for (const mesh of model.pickables) expect(box(mesh).isEmpty(), mesh.name).toBe(false);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("matches Mons Meg: 4.06 m overall, 20-in bore, a ball of about 175 kg", () => {
  const model = createBombard("low");
  model.group.updateMatrixWorld(true);
  const gun = box(named(model, "barrel-and-chamber")[0]);
  // Laid at a slight elevation, so the horizontal extent is the length times the cosine.
  expect(gun.max.x - gun.min.x).toBeCloseTo(
    BOMBARD.gunLength * Math.cos(BOMBARD.elevation) + BOMBARD.barrelOuter * Math.sin(BOMBARD.elevation),
    2
  );
  expect(BOMBARD.bore).toBeCloseTo(20 * 0.0254, 2);
  expect(BOMBARD.ballMass).toBeGreaterThan(160);
  expect(BOMBARD.ballMass).toBeLessThan(185);
  // The barrel's outside diameter worked out from 6.6 t lies between the bore and the stated 0.9 m of the larger Dulle Griet.
  expect(BOMBARD.barrelOuter).toBeGreaterThan(BOMBARD.bore + 0.1);
  expect(BOMBARD.barrelOuter).toBeLessThan(0.9);
  model.dispose();
});

it("lays the gun on its saddles above the bed, against the recoil block, behind the raised shield", () => {
  const model = createBombard("low");
  model.group.updateMatrixWorld(true);
  const bedTop = Math.max(...named(model, "bed-beam").map(m => box(m).max.y));
  for (const saddle of named(model, "saddle")) expect(box(saddle).min.y).toBeCloseTo(bedTop, 3);
  const gun = box(named(model, "barrel-and-chamber")[0]);
  expect(gun.min.y).toBeGreaterThan(bedTop);
  const recoil = named(model, "recoil-beam").map(box);
  for (const beam of recoil) expect(beam.max.x).toBeLessThan(gun.min.x + 0.01);
  for (const beam of named(model, "bed-beam").map(box))
    for (const r of recoil) expect(beam.intersectsBox(r)).toBe(false);
  // Raised, the shield's lowest point clears the muzzle line.
  const shield = box(named(model, "shield-plank")[0]);
  expect(shield.min.y).toBeGreaterThan(gun.max.y);
  model.dispose();
});

it("adds hoops, stave joints, lashings and kit on the high tier", () => {
  const low = createBombard("low"),
    high = createBombard("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of [
    "stave-joint",
    "turning-socket",
    "lashing",
    "bed-strap",
    "stake",
    "spare-ball",
    "rammer",
    "shield-prop"
  ])
    expect(names.has(name), name).toBe(true);
  expect(named(high, "stave-joint")).toHaveLength(BOMBARD.staves);
  expect(named(high, "hoop").length).toBeGreaterThan(named(low, "hoop").length * 4);
  low.dispose();
  high.dispose();
});
