import { expect, it } from "vitest";
import { ForestAutoQuality } from "./forestAutoQuality";

it("starts at standard and reduces only after sustained slow motion and a cooldown", () => {
  const quality = new ForestAutoQuality();
  expect(quality.effective).toBe("standard");
  for (let i = 0; i < 29; i++) expect(quality.sample(40, i * 200)).toBe(false);
  expect(quality.sample(40, 5800)).toBe(true);
  expect(quality.effective).toBe("light");
  expect(quality.snapshot).toMatchObject({ requested: "auto", motionSamples: 30, motionIntervalP95Ms: 40 });
  for (let i = 0; i < 200; i++) quality.sample(40, 6000 + i * 40);
  expect(quality.effective).toBe("light");
});

it("recovers slowly, rejects invalid samples and keeps manual quality fixed", () => {
  const quality = new ForestAutoQuality();
  quality.sample(16, 0);
  for (let i = 1; i < 120; i++) quality.sample(16, i * 16);
  expect(quality.effective).toBe("standard");
  expect(quality.sample(16, 20000)).toBe(true);
  expect(quality.effective).toBe("high");
  expect(quality.sample(Number.NaN, 21000)).toBe(false);
  expect(quality.sample(Infinity, 22000)).toBe(false);
  quality.setPreference("high");
  for (let i = 0; i < 200; i++) quality.sample(50, 30000 + i * 50);
  expect(quality.effective).toBe("high");
  expect(quality.snapshot.motionSamples).toBe(0);
  quality.setPreference("auto");
  expect(quality.effective).toBe("standard");
});

it("interrupts a slow streak when frames recover and discards old samples on scene changes", () => {
  const quality = new ForestAutoQuality();
  for (let i = 0; i < 29; i++) quality.sample(40, i * 200);
  quality.sample(16, 6000);
  expect(quality.sample(40, 6200)).toBe(false);
  quality.resetSamples();
  expect(quality.snapshot.motionSamples).toBe(0);
  expect(quality.sample(40, 6400)).toBe(false);
});
