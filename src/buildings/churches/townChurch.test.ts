import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createTownChurch, MARKET_TOWN_PARISH_CHURCH } from "./townChurch";

describe("market-town parish church (T2)", () => {
  it.each(["low", "high"] as const)("is centred on its anchor and near the 22 x 10 m tier at %s", detail => {
    const model = createTownChurch(MARKET_TOWN_PARISH_CHURCH, detail);
    model.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.group, true),
      size = box.getSize(new THREE.Vector3());
    expect(box.min.x + box.max.x).toBeCloseTo(0, 1);
    expect(box.min.z + box.max.z).toBeCloseTo(0, 1);
    expect(size.x).toBeGreaterThan(22 * 0.95);
    expect(size.x).toBeLessThan(22 * 1.05);
    expect(size.z).toBeGreaterThan(10 * 0.95);
    expect(size.z).toBeLessThan(10 * 1.08);
    expect(size.y).toBeGreaterThan(13);
    expect(size.y).toBeLessThan(15);
    model.dispose();
  });
});
