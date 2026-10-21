import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { models } from "./15-breweriesModels";

describe.each(models)("$id", definition => {
  it("keeps the copper shelter and its equipment clear of the main hall roof", () => {
    const model = definition.create();
    try {
      const roof = model.group.children.find(child => child.name === "pitched-roof");
      const shelter = model.group.getObjectByName("copper-shelter");
      expect(roof).toBeDefined();
      expect(shelter).toBeDefined();
      model.group.updateMatrixWorld(true);
      const hallBounds = new THREE.Box3().setFromObject(roof!, true);
      const shelterBounds = new THREE.Box3().setFromObject(shelter!, true);
      expect(shelterBounds.min.x - hallBounds.max.x).toBeGreaterThan(0.5);
    } finally {
      model.dispose();
    }
  });
});
