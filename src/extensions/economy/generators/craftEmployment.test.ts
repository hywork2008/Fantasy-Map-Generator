import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { smoothCraftWorkers } from "./craftEmployment";
import { peopleToPoints } from "./craftScale";

describe("smoothCraftWorkers", () => {
  // These top-level tests exercise the pre-PR-3 legacy tracking floor (MIN_TRACKED_WORKERS)
  // deliberately — PR 4 no longer runs it by default. The real-people floor has its own tests below.
  beforeEach(() => setEconomyCalibrationState({ applyCalibration: false }));

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

  describe("applyCalibration real-people floor (docs/plan/craft-demand-calibration.md §2.0 P11, PR 3)", () => {
    afterEach(() => setEconomyCalibrationState({ applyCalibration: false }));

    it("keeps a 3-person craft chapter tracked instead of decaying it toward the legacy 10-people-equivalent floor", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      const threePeopleInPoints = peopleToPoints(3, 1000);

      let workers = 0;
      for (let i = 0; i < 100; i++) workers = smoothCraftWorkers(workers, threePeopleInPoints, 1000);

      expect(workers).toBeGreaterThan(0);
      expect(workers).toBeCloseTo(threePeopleInPoints, 5);
    });

    it("still drops to zero once fully decayed below the tighter real-people floor (0.5 person)", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      const underFloor = peopleToPoints(0.4, 1000);

      let workers = underFloor;
      for (let i = 0; i < 100; i++) workers = smoothCraftWorkers(workers, underFloor, 1000);

      expect(workers).toBe(0);
    });
  });
});
