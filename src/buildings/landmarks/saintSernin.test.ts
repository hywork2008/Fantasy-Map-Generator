import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./saintSernin";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 18, 0)).toBeCloseTo(64, 0);
  expect(assembly.pickables.filter(mesh => mesh.name === "octagonal-belfry-tier")).toHaveLength(5);
  expect(assembly.pickables.filter(mesh => mesh.name === "radiating-chapel")).toHaveLength(5);
  expect(heightAt(assembly, -28, 0)).toBeGreaterThan(heightAt(assembly, -28, 13) + 15);
});
