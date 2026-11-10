import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createTownChurch,
  LARGE_TOWN_PARISH_CHURCH,
  MARKET_TOWN_PARISH_CHURCH,
  type TownChurchSpec
} from "./townChurch";

const TIERS: [string, TownChurchSpec, length: number, width: number, height: number][] = [
  ["T2 market-town parish church", MARKET_TOWN_PARISH_CHURCH, 22, 10, 14],
  ["T3 large town parish church", LARGE_TOWN_PARISH_CHURCH, 36, 20, 28]
];

describe.each(TIERS)("%s", (_name, spec, length, width, height) => {
  it.each(["low", "high"] as const)("is centred on its anchor and near its tier size at %s", detail => {
    const model = createTownChurch(spec, detail);
    model.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.group, true),
      size = box.getSize(new THREE.Vector3());
    expect(box.min.x + box.max.x).toBeCloseTo(0, 1);
    expect(box.min.z + box.max.z).toBeCloseTo(0, 1);
    expect(size.x).toBeGreaterThan(length * 0.95);
    expect(size.x).toBeLessThan(length * 1.05);
    expect(size.z).toBeGreaterThan(width * 0.95);
    expect(size.z).toBeLessThan(width * 1.08);
    expect(size.y).toBeGreaterThan(height * 0.93);
    expect(size.y).toBeLessThan(height * 1.07);
    model.dispose();
  });
});
