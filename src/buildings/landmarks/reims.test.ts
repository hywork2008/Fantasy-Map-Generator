import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./reims";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -60, -15)).toBeGreaterThan(80);
  expect(heightAt(assembly, -60, 15)).toBeGreaterThan(80);
  expect(assembly.pickables.filter(mesh => mesh.name === "portal-gable")).toHaveLength(3);
  expect(assembly.pickables.filter(mesh => mesh.name === "radiating-chapel")).toHaveLength(5);
});
