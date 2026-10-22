import * as THREE from "three";
import { expect, it } from "vitest";
import { createPublicWaterBasin, PUBLIC_WATER_BASINS, WATER_BASIN_KINDS } from "./publicWaterBasin";

it.each(WATER_BASIN_KINDS)("grounds %s at full scale and leaves the pool open below the coping", kind => {
  const model = createPublicWaterBasin(kind);
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  const spec = PUBLIC_WATER_BASINS[kind];
  expect(bounds.min.y).toBeCloseTo(0, 6);
  expect(size.x).toBeLessThanOrEqual(spec.width);
  expect(size.z).toBeLessThanOrEqual(spec.depth);
  expect(size.y).toBeLessThanOrEqual(spec.height);
  const ray = new THREE.Raycaster(new THREE.Vector3(0.6, 4, 0.1), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObjects(model.pickables);
  expect(hits[0].object.name).toBe("basin-water");
  expect(hits[0].point.y).toBeLessThan(0.79);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  model.dispose();
});
