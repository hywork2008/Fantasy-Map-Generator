import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./speyer";

checkLandmark(model, assembly => {
  expect(assembly.pickables.filter(mesh => mesh.name === "imperial-tower-shaft")).toHaveLength(4);
  expect(heightAt(assembly, 32, 0)).toBeGreaterThan(62);
  expect(heightAt(assembly, -20, 0)).toBeGreaterThan(heightAt(assembly, -20, 12) + 20);
  expect(assembly.pickables.some(mesh => mesh.name === "flying-buttress")).toBe(false);
});
