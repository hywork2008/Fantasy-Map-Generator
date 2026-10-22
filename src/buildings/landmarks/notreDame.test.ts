import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./notreDame";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -54, -13)).toBeGreaterThan(68);
  expect(heightAt(assembly, -54, 13)).toBeGreaterThan(68);
  expect(heightAt(assembly, 3, 0)).toBeCloseTo(96, 0);
  expect(heightAt(assembly, -28, 0)).toBeGreaterThan(heightAt(assembly, -28, 12) + 20);
  expect(assembly.pickables.filter(mesh => mesh.name === "west-portal")).toHaveLength(6);
  expect(assembly.pickables.filter(mesh => mesh.name === "flying-buttress").length).toBeGreaterThan(20);
});
