import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./santiago";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 8, 30)).toBeGreaterThan(25);
  expect(assembly.pickables.filter(mesh => mesh.name === "platerias-portal")).toHaveLength(4);
  expect(assembly.pickables.filter(mesh => mesh.name === "conjectural-west-tower-shaft")).toHaveLength(2);
  expect(assembly.pickables.some(mesh => /obradoiro|baroque/.test(mesh.name))).toBe(false);
});
