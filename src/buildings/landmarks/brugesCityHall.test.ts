import { expect } from "vitest";
import { model } from "./brugesCityHall";
import { checkLandmark, heightAt } from "./landmarkTestSupport";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 0, 10)).toBeGreaterThan(32);
  expect(heightAt(assembly, 0, 0)).toBeGreaterThan(26);
  expect(assembly.pickables.filter(mesh => mesh.name === "great-hall-window")).toHaveLength(12);
  expect(assembly.pickables.filter(mesh => mesh.name === "front-turret")).toHaveLength(3);
});
