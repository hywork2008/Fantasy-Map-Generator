import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./sainteChapelle";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 0, 0)).toBeCloseTo(75, 0);
  expect(assembly.pickables.filter(mesh => mesh.name === "upper-glazing")).toHaveLength(30);
  expect(heightAt(assembly, 0, 12)).toBe(0);
});
