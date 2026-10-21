import { expect } from "vitest";
import { model } from "./durham";
import { checkLandmark, heightAt } from "./landmarkTestSupport";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 9, 0)).toBeGreaterThan(65);
  expect(heightAt(assembly, -60, -13)).toBeGreaterThan(43);
  expect(heightAt(assembly, -74, 0)).toBeLessThan(13);
  expect(heightAt(assembly, 54, 12)).toBeGreaterThan(19);
  expect(assembly.pickables.filter(mesh => mesh.name === "merlon")).toHaveLength(60);
});
