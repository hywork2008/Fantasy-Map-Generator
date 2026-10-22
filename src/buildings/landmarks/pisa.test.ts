import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./pisa";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 14, 0)).toBeGreaterThan(52);
  expect(heightAt(assembly, 14, 36)).toBeGreaterThan(28);
  expect(assembly.pickables.filter(mesh => mesh.name === "facade-loggia-arch")).toHaveLength(44);
  expect(assembly.pickables.some(mesh => /campanile|leaning-tower/.test(mesh.name))).toBe(false);
});
