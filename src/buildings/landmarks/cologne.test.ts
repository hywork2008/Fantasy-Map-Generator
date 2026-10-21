import { expect } from "vitest";
import { model } from "./cologne";
import { checkLandmark, heightAt } from "./landmarkTestSupport";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -57, -18)).toBeCloseTo(157.22, 1);
  expect(heightAt(assembly, -57, 18)).toBeCloseTo(157.22, 1);
  expect(heightAt(assembly, 7, 39)).toBeGreaterThan(50);
  expect(assembly.pickables.filter(mesh => mesh.name === "open-west-spire")).toHaveLength(16);
});
