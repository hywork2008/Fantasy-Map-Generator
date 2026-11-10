import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./notreDame";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -54, -13)).toBeGreaterThan(68);
  expect(heightAt(assembly, -54, 13)).toBeGreaterThan(68);
  expect(heightAt(assembly, 3, 0)).toBeCloseTo(96, 0);
  expect(heightAt(assembly, -28, 0)).toBeGreaterThan(heightAt(assembly, -28, 12) + 20);
  for (const role of ["west-front", "longitudinal-body"]) {
    const source = model.parts!()
      .find(part => part.role === role)!
      .create();
    try {
      if (role === "west-front") expect(source.pickables.filter(mesh => mesh.name === "west-portal")).toHaveLength(6);
      else expect(source.pickables.filter(mesh => mesh.name === "flying-buttress").length).toBeGreaterThan(20);
    } finally {
      source.dispose();
    }
  }
});
