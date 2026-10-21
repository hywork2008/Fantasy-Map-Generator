import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./salisbury";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -5, 0)).toBeCloseTo(123, 0);
  expect(heightAt(assembly, -5, 30)).toBeGreaterThan(30);
  expect(heightAt(assembly, 33, 22)).toBeGreaterThan(25);
  expect(heightAt(assembly, -37, 45)).toBe(0);
  expect(heightAt(assembly, -7, 58)).toBeGreaterThan(17);
});
