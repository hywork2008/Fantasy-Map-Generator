import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createHangingSign, createHangingSignModel, HANGING_SIGN_TEMPLATES, SIGN_SHAPES } from "./hangingSign";

describe("hanging shop sign templates", () => {
  it("keeps every template clear of the facade and depicts its trade on both sides", () => {
    for (const template of HANGING_SIGN_TEMPLATES) {
      const model = createHangingSignModel(template);
      model.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.group);
      expect(bounds.min.x).toBeGreaterThan(-1e-6);
      expect(bounds.max.x).toBeLessThan(1.6);
      expect(bounds.min.y).toBeGreaterThan(-1.4);
      const panel = model.group.getObjectByName("sign-panel")!;
      const board = new THREE.Box3().setFromObject(panel);
      const icons = model.pickables.filter(mesh => mesh.name === `symbol-${template.symbol}`);
      expect(icons.some(mesh => mesh.position.z > board.max.z)).toBe(true);
      expect(icons.some(mesh => mesh.position.z < board.min.z)).toBe(true);
      for (const icon of icons) {
        const iconBounds = new THREE.Box3().setFromObject(icon);
        expect(iconBounds.min.x).toBeGreaterThan(board.min.x);
        expect(iconBounds.max.x).toBeLessThan(board.max.x);
        expect(iconBounds.min.y).toBeGreaterThan(board.min.y);
        expect(iconBounds.max.y).toBeLessThan(board.max.y);
      }
      model.dispose();
    }
  });

  it("allows independent shape changes and leaves blank templates free of trade symbols", () => {
    for (const shape of SIGN_SHAPES) {
      const model = createHangingSign({ shape, material: "copper", symbol: "blank" });
      expect(model.pickables.some(mesh => mesh.name.startsWith("symbol-"))).toBe(false);
      expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
      expect(model.elevation).toContain("<path");
      model.dispose();
    }
  });

  it("releases owned resources once without disposing another sign's resources", () => {
    const first = createHangingSignModel();
    const second = createHangingSignModel();
    const geometry = vi.spyOn(first.pickables[0].geometry, "dispose");
    const surface = vi.spyOn(first.pickables[0].material as THREE.Material, "dispose");
    const other = vi.spyOn(second.pickables[0].geometry, "dispose");
    first.dispose();
    first.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(surface).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    second.dispose();
  });
});
