import { describe, expect, it } from "vitest";
import { smoothCraftWorkers } from "./craftEmployment";

describe("smoothCraftWorkers", () => {
  it("moves 20% of the gap toward this cycle's observed workers", () => {
    expect(smoothCraftWorkers(0, 10)).toBeCloseTo(2, 5);
    expect(smoothCraftWorkers(2, 10)).toBeCloseTo(3.6, 5);
  });

  it("clamps negative observations to zero before blending", () => {
    expect(smoothCraftWorkers(10, -5)).toBeCloseTo(8, 5);
  });

  it("converges toward a sustained observation over repeated cycles", () => {
    let workers = 0;
    for (let i = 0; i < 50; i++) workers = smoothCraftWorkers(workers, 8);
    expect(workers).toBeCloseTo(8, 2);
  });

  it("drops to zero once the smoothed value decays below the tracking floor", () => {
    expect(smoothCraftWorkers(0.01, 0)).toBe(0);
  });
});
