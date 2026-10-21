import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./milan";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, 17, 0)).toBeGreaterThan(108);
  expect(heightAt(assembly, -40, 0)).toBeGreaterThan(heightAt(assembly, -40, 15) + 10);
  expect(heightAt(assembly, -40, 15)).toBeGreaterThan(heightAt(assembly, -40, 26) + 8);
  expect(assembly.pickables.filter(mesh => mesh.name === "facade-door")).toHaveLength(10);
});
