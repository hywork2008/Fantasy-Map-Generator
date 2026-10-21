import { expect } from "vitest";
import { model } from "./chartres";
import { checkLandmark, heightAt } from "./landmarkTestSupport";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -54, -13)).toBeGreaterThan(heightAt(assembly, -54, 13) + 9);
  expect(heightAt(assembly, 7, 29)).toBeGreaterThan(40);
  expect(assembly.pickables.filter(mesh => mesh.name === "royal-portal")).toHaveLength(6);
});
