import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { meshProjection } from "../meshProjection";
import type { MedievalModel } from "./modelKit";

const modules = import.meta.glob<{ models: MedievalModel[] }>("./*Models.ts", { eager: true });
const requested = process.env.MEDIEVAL_MODEL_TASK?.split(",").map(Number);
const models = Object.values(modules)
  .flatMap(module => module.models)
  .filter(model => !requested || requested.includes(model.task));
// Authored assemblies with roots or equipment extending beyond the catalogue body envelope.
// Values are ground Y, width, depth and height in metres.
const authoredBounds: Record<string, readonly [number, number, number, number]> = {
  abbey: [-0.35, 72.5, 54.4, 16.91],
  "mendicant-friary": [-0.35, 59.1, 48, 13.384347],
  "orthodox-monastery": [-0.35, 56.5, 46.9, 16.974347],
  "arabica-coffee": [-0.35, 1.869471, 1.7724, 2.75],
  cacao: [-0.35, 5.659722, 5.561593, 4.489071],
  "sweet-chestnut": [-0.35, 8.892857, 8.309878, 9.038201],
  lemon: [-0.35, 3.933932, 3.869251, 3.969653],
  "common-fig": [-0.35, 8.108747, 8.019517, 5.110239],
  "european-plum": [-0.35, 5.180125, 5.104138, 6.269582],
  "european-pear": [-0.35, 5.608077, 5.173441, 9.065575],
  "domestic-apple": [-0.35, 7.229742, 6.927756, 6.407844],
  "scots-pine": [-0.35, 8.86272, 9.5035, 21.018915],
  "european-hornbeam": [-0.35, 8.703013, 8.734983, 16.887687],
  "pedunculate-oak": [-0.35, 14.227588, 13.929433, 17.76407],
  "european-beech": [-0.35, 12.173933, 11.921139, 20.553651],
  "garden-parkland": [-0.35, 10.615676, 10.897277, 11.593591],
  "norway-spruce": [-0.35, 5.541765, 5.627256, 12.39],
  "silver-birch": [-0.35, 7.868714, 7.770953, 11.539739],
  "sacred-yew": [-0.35, 11.348359, 10.752605, 7.902562],
  "date-palm": [-0.35, 9.204118, 8.695337, 12.209519],
  "date-palm-orchard": [-0.35, 9.277704, 9.150337, 11.508662],
  "date-palm-orchard-male": [-0.35, 9.277704, 9.150337, 11.508662],
  "date-palm-orchard-young": [-0.35, 6.637841, 6.130406, 3.400039],
  "umbrella-thorn": [-0.35, 12.542081, 12.602131, 8.122594],
  saxaul: [-0.35, 5.598715, 5.382262, 4.428103],
  kapok: [-0.35, 18.536648, 18.146065, 18.558265],
  "western-red-cedar": [-0.35, 9.827651, 10.055384, 18.95],
  "black-alder": [-0.35, 7.921614, 7.621076, 13.493989],
  olive: [-0.35, 9.679613, 8.409501, 6.465582],
  "olive-orchard": [-0.35, 7.214406, 7.174542, 4.416137],
  "silver-fir": [-0.35, 7.95739, 7.915129, 19.899999],
  "red-mangrove": [-0.35, 7.949866, 8.358242, 8.083224],
  tamarisk: [-0.35, 7.839221, 6.942975, 5.166387],
  rowan: [-0.35, 6.897541, 6.851748, 9.850325],
  "canary-pine": [-0.35, 10.512109, 10.077986, 15.882021],
  "mediterranean-cypress": [-0.35, 2.31616, 2.301959, 14.748396],
  "oriental-evergreen": [-0.35, 4.893466, 4.896794, 9.985855],
  "sacred-bodhi-and-fig": [-0.35, 14.987223, 15.952994, 10.691321],
  "peaceful-willow": [-0.35, 12.065911, 12.908688, 9.725225],
  "trade-workshop.dedicated-ropewalk": [0, 7.4, 54, 4.16],
  "trade-workshop.dedicated-butchery": [0, 16, 13, 4.76],
  "trade-workshop.dedicated-chandlery": [0, 12, 10, 4.46],
  "trade-workshop.dedicated-metalwares": [0, 14, 12, 4.46],
  "trade-workshop.dedicated-fishmongery": [0, 14, 12, 4.46],
  "trade-workshop.dedicated-cutlery": [-0.03, 12, 10, 4.49],
  "trade-workshop.dedicated-glaziers-workshop": [0, 12, 10, 4.46]
};
expect(models.length).toBeGreaterThan(0);
describe.each(models)("$id", definition => {
  it("has finite, pickable, grounded geometry inside the declared meter envelope and valid drawings", () => {
    const model = definition.create();
    const bounds = new THREE.Box3().setFromObject(model.group, true);
    const size = bounds.getSize(new THREE.Vector3());
    const authored = authoredBounds[definition.id];
    if (authored) {
      for (const [index, value] of [bounds.min.y, size.x, size.z, size.y].entries())
        expect(value).toBeCloseTo(authored[index], 5);
    } else {
      // The newer dedicated workshops declare width, height, depth.
      const [width, depth, height] =
        definition.id.startsWith("trade-workshop.dedicated-") && definition.task >= 56
          ? [definition.size[0], definition.size[2], definition.size[1]]
          : definition.size;
      expect(Math.abs(bounds.min.y)).toBeLessThan(0.0001);
      expect(size.x).toBeLessThanOrEqual(width + 0.0001);
      expect(size.z).toBeLessThanOrEqual(depth + 0.0001);
      expect(size.y).toBeLessThanOrEqual(height + 0.0001);
    }
    // A slab or continuous boundary may legitimately be a single rendered mesh.
    expect(model.pickables.length).toBeGreaterThan(0);
    for (const mesh of model.pickables)
      expect(Array.from(mesh.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    for (const view of ["side", "top"] as const) {
      const drawing = meshProjection(model, view);
      expect(drawing).toContain("<path");
      expect(drawing).not.toMatch(/NaN|Infinity|undefined/);
    }
    model.dispose();
  });
  it("owns its resources and disposes each rendered geometry and material exactly once", () => {
    const model = definition.create(),
      other = definition.create();
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const mesh of model.pickables) {
      resources.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material);
    }
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    const otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(otherDispose).not.toHaveBeenCalled();
    other.dispose();
  });
});
