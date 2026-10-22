import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./modena";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 0, 0)).toBeGreaterThan(27);
  expect(heightAt(assembly, 0, 9)).toBeLessThan(15);
  expect(assembly.pickables.filter(mesh => mesh.name.endsWith("apse") && mesh.name !== "central-nave")).toHaveLength(3);
  expect(assembly.pickables.filter(mesh => mesh.name === "lion-plinth")).toHaveLength(2);
});
