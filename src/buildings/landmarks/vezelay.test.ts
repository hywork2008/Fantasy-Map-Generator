import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./vezelay";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -53, 12)).toBeGreaterThan(heightAt(assembly, -53, -12) + 20);
  expect(heightAt(assembly, 33, 0)).toBeGreaterThan(heightAt(assembly, -10, 0) + 3);
  expect(assembly.pickables.filter(mesh => mesh.name === "round-nave-window")).toHaveLength(28);
  expect(assembly.pickables.filter(mesh => mesh.name === "gothic-choir-lancet")).toHaveLength(12);
});
