import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./santAmbrogio";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -37, 0)).toBe(0);
  expect(heightAt(assembly, -16, -18)).toBeGreaterThan(heightAt(assembly, -15, 17) + 10);
  expect(heightAt(assembly, 21, 0)).toBeGreaterThan(35);
  expect(assembly.pickables.filter(mesh => mesh.name.endsWith("apse"))).toHaveLength(3);
  expect(assembly.pickables.filter(mesh => mesh.name === "upper-west-loggia-arch")).toHaveLength(5);
});
