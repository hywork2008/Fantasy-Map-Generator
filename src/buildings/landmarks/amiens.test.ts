import { expect } from "vitest";
import { model } from "./amiens";
import { checkLandmark, heightAt } from "./landmarkTestSupport";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -59, -14)).toBeGreaterThan(heightAt(assembly, -59, 14) + 6);
  expect(heightAt(assembly, 4, 0)).toBeGreaterThan(110);
  expect(heightAt(assembly, 28, 0)).toBeGreaterThan(heightAt(assembly, 28, 18) + 25);
  expect(assembly.pickables.filter(mesh => mesh.name === "radiating-chapel")).toHaveLength(7);
});
