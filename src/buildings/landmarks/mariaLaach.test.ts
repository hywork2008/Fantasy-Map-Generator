import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./mariaLaach";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -46, 5)).toBe(0);
  expect(heightAt(assembly, -46, 0)).toBeGreaterThan(1.4);
  expect(heightAt(assembly, -23, 0)).toBeGreaterThan(45);
  expect(assembly.pickables.filter(mesh => mesh.name === "east-round-tower")).toHaveLength(2);
  expect(assembly.pickables.filter(mesh => mesh.name === "west-square-tower-shaft")).toHaveLength(2);
  expect(assembly.pickables.filter(mesh => mesh.name === "east-crossing-tower")).toHaveLength(1);
});
