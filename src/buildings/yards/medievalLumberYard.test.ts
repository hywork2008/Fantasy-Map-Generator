import * as THREE from "three";
import { expect, it } from "vitest";
import { createMedievalLumberYard, MEDIEVAL_LUMBER_YARD } from "./medievalLumberYard";

it("keeps stock inside the yard, separates drying boards and leaves a loading aisle open", () => {
  const model = createMedievalLumberYard();
  try {
    model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.group);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThanOrEqual(MEDIEVAL_LUMBER_YARD.height);
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(MEDIEVAL_LUMBER_YARD.width);
    expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(MEDIEVAL_LUMBER_YARD.depth);
    const boards = model.pickables.filter(mesh => mesh.name === "stacked-board");
    const sample = boards[0];
    const above = boards.find(
      mesh =>
        mesh.position.x === sample.position.x &&
        mesh.position.z === sample.position.z &&
        mesh.position.y > sample.position.y
    )!;
    const lowerBounds = new THREE.Box3().setFromObject(sample);
    const upperBounds = new THREE.Box3().setFromObject(above);
    expect(upperBounds.min.y - lowerBounds.max.y).toBeCloseTo(0.08);
    const stickers = model.pickables.filter(
      mesh => mesh.name === "drying-sticker" && Math.abs(mesh.position.y - (lowerBounds.max.y + 0.04)) < 0.001
    );
    expect(
      stickers.some(mesh => {
        const support = new THREE.Box3().setFromObject(mesh);
        return (
          support.min.x >= lowerBounds.min.x &&
          support.max.x <= lowerBounds.max.x &&
          support.min.z <= sample.position.z &&
          support.max.z >= sample.position.z
        );
      })
    ).toBe(true);
    const aisle = new THREE.Box3(new THREE.Vector3(-0.9, 0.1, -1.3), new THREE.Vector3(0.9, 2.6, 6.9));
    for (const mesh of model.pickables.filter(mesh => mesh.name !== "yard-earth")) {
      expect(new THREE.Box3().setFromObject(mesh).intersectsBox(aisle), mesh.name).toBe(false);
    }
    expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
    expect(model.plan).toContain("<path");
    expect(model.elevation).toContain("<path");
  } finally {
    model.dispose();
  }
});
