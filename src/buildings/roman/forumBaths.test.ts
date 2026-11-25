import * as THREE from "three";
import { expect, it } from "vitest";
import { createForumBaths, FORUM_BATHS } from "./forumBaths";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) =>
  model.pickables.filter(m => m.name === name).map(box);

it.each(["low", "high"] as const)("%s stands on the ground with no degenerate parts", quality => {
  const model = createForumBaths(quality);
  model.group.updateMatrixWorld(true);
  expect(box(model.group).min.y).toBeCloseTo(0, 3);
  for (const mesh of model.pickables) expect(box(mesh).isEmpty(), mesh.name).toBe(false);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("builds each room round the interior measured from Mau's plan", () => {
  const model = createForumBaths("low");
  model.group.updateMatrixWorld(true);
  const { plan, wall } = FORUM_BATHS;
  for (const room of ["apodyterium", "tepidarium"] as const) {
    const b = named(model, room)[0];
    expect(b.max.x - b.min.x).toBeCloseTo(plan[room].x1 - plan[room].x0 + 2 * wall, 3);
    expect(b.max.z - b.min.z).toBeCloseTo(plan[room].z1 - plan[room].z0 + 2 * wall, 3);
  }
  // Rooms measured from the plan: dressing room about 5.4 × 10.3 m, warm room about 6.6 × 10 m, hot room 4.9 m wide.
  expect(plan.apodyterium.x1 - plan.apodyterium.x0).toBeCloseTo(5.4, 1);
  expect(plan.tepidarium.x1 - plan.tepidarium.x0).toBeCloseTo(6.6, 1);
  expect(plan.caldarium.x1 - plan.caldarium.x0).toBeCloseTo(4.9, 1);
  model.dispose();
});

it("keeps the bathing circuit in order from west to east, with the furnace beyond the hot room", () => {
  const model = createForumBaths("low");
  model.group.updateMatrixWorld(true);
  const centre = (name: string) => named(model, name)[0].getCenter(new THREE.Vector3()).x;
  expect(centre("apodyterium")).toBeLessThan(centre("tepidarium"));
  expect(centre("tepidarium")).toBeLessThan(centre("caldarium"));
  expect(centre("caldarium")).toBeLessThan(centre("furnace-room"));
  // The alveus lies inside the hot room's south end.
  const { alveus, caldarium } = FORUM_BATHS.plan;
  expect(alveus.z1).toBeLessThanOrEqual(caldarium.z1);
  expect(alveus.z0).toBeGreaterThan((caldarium.z0 + caldarium.z1) / 2);
  model.dispose();
});

it("winds every roof face upward and adds facing, windows and boilers on the high tier", () => {
  const low = createForumBaths("low"),
    high = createForumBaths("high");
  for (const roof of low.pickables.filter(m => m.name === "roof" && m.geometry.index && m.geometry.index.count === 6)) {
    roof.geometry.computeVertexNormals();
    const n = roof.geometry.getAttribute("normal");
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0);
  }
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["oculus", "window", "reticulate-joint", "tile-course", "bronze-boiler", "stoking-arch", "imbrex"])
    expect(names.has(name), name).toBe(true);
  expect(high.pickables.filter(m => m.name === "bronze-boiler")).toHaveLength(3);
  low.dispose();
  high.dispose();
});

it("puts the caldarium's apse on its north end, centred on the room", () => {
  const model = createForumBaths("low");
  model.group.updateMatrixWorld(true);
  const apse = named(model, "caldarium-apse")[0];
  const { caldarium } = FORUM_BATHS.plan;
  expect(apse.max.z).toBeCloseTo(caldarium.z0, 2);
  expect((apse.min.x + apse.max.x) / 2).toBeCloseTo((caldarium.x0 + caldarium.x1) / 2, 2);
  model.dispose();
});
