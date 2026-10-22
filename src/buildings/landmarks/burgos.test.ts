import { expect } from "vitest";
import { model } from "./burgos";
import { checkLandmark, heightAt } from "./landmarkTestSupport";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -33, -12)).toBeCloseTo(88, 0);
  expect(heightAt(assembly, 3, 0)).toBeGreaterThan(60);
  expect(heightAt(assembly, 43, 0)).toBeGreaterThan(31);
  expect(assembly.pickables.filter(mesh => mesh.name === "open-west-spire")).toHaveLength(16);
});
