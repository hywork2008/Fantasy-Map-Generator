import { expect } from "vitest";
import { model } from "./conques";
import { checkLandmark, heightAt } from "./landmarkTestSupport";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 5, 0)).toBeGreaterThan(37);
  expect(heightAt(assembly, 5, 16)).toBeGreaterThan(26);
  expect(assembly.pickables.filter(mesh => mesh.name === "radiating-chapel")).toHaveLength(3);
  expect(assembly.pickables.filter(mesh => mesh.name === "tympanum-figure-marker")).toHaveLength(7);
});
