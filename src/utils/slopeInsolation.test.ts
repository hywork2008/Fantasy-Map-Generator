import { describe, expect, it } from "vitest";
import {
  getAnnualMeanOfMonthlyC,
  getDailyClearSkyInsolationWm2,
  getMonthlySlopeTemperatureOffsetsC,
  MAX_SLOPE_TEMPERATURE_OFFSET_C
} from "./slopeInsolation";

describe("slope insolation", () => {
  it("is zero for flat ground", () => {
    expect(Array.from(getMonthlySlopeTemperatureOffsetsC(46, 0, 0))).toEqual(new Array(12).fill(0));
  });

  it("matches the equivalent-latitude rule for a pole-facing slope (beam + diffuse geometry aside)", () => {
    const declination = 0; // equinox: equal day length, so the true horizon does not clip the slope
    const north = getDailyClearSkyInsolationWm2(45, 10, 0, declination);
    const flatPoleward = getDailyClearSkyInsolationWm2(55, 0, 0, declination);
    // Diffuse sky-view differs slightly, so compare within a few percent.
    expect(Math.abs(north - flatPoleward) / flatPoleward).toBeLessThan(0.05);
  });

  it("cools the shaded face in either hemisphere: north at 46°N, south at 46°S", () => {
    const northFace = getMonthlySlopeTemperatureOffsetsC(46, 25, 0);
    const southFace = getMonthlySlopeTemperatureOffsetsC(46, 25, 180);
    const southHemiSouthFace = getMonthlySlopeTemperatureOffsetsC(-46, 25, 180);
    expect(getAnnualMeanOfMonthlyC(northFace)).toBeLessThan(0);
    expect(getAnnualMeanOfMonthlyC(southFace)).toBeGreaterThan(0);
    expect(getAnnualMeanOfMonthlyC(southHemiSouthFace)).toBeLessThan(0);
    // January north face at 46°N mirrors July south face at 46°S.
    expect(southHemiSouthFace[6]).toBeCloseTo(northFace[0], 0);
  });

  it("is stronger in winter than summer at mid latitudes, within the Alpine 1–3 °C range", () => {
    const northFace = getMonthlySlopeTemperatureOffsetsC(46, 25, 0);
    expect(Math.abs(northFace[0])).toBeGreaterThan(Math.abs(northFace[6]));
    expect(northFace[0]).toBeLessThan(-1);
    expect(northFace[0]).toBeGreaterThan(-3.5);
  });

  it("treats east and west faces symmetrically and keeps offsets bounded", () => {
    const east = getMonthlySlopeTemperatureOffsetsC(46, 25, 90);
    const west = getMonthlySlopeTemperatureOffsetsC(46, 25, 270);
    for (let m = 0; m < 12; m++) expect(east[m]).toBeCloseTo(west[m], 6);
    for (const v of getMonthlySlopeTemperatureOffsetsC(80, 35, 0))
      expect(Math.abs(v)).toBeLessThanOrEqual(MAX_SLOPE_TEMPERATURE_OFFSET_C);
  });

  it("gives no offset during polar night", () => {
    expect(getMonthlySlopeTemperatureOffsetsC(85, 30, 0)[11]).toBe(0);
  });

  it("small slopes give small offsets (low hills are not cut off, just weak)", () => {
    const gentle = getMonthlySlopeTemperatureOffsetsC(46, 3, 0);
    expect(gentle[0]).toBeLessThan(0);
    expect(gentle[0]).toBeGreaterThan(-0.5);
  });

  it("prints representative magnitudes", () => {
    const rows = [
      ["46N N25", getMonthlySlopeTemperatureOffsetsC(46, 25, 0)],
      ["46N S25", getMonthlySlopeTemperatureOffsetsC(46, 25, 180)],
      ["46N N5", getMonthlySlopeTemperatureOffsetsC(46, 5, 0)],
      ["10N N25", getMonthlySlopeTemperatureOffsetsC(10, 25, 0)],
      ["65N N25", getMonthlySlopeTemperatureOffsetsC(65, 25, 0)]
    ] as const;
    for (const [label, v] of rows)
      console.info(label, Array.from(v, x => x.toFixed(1)).join(" "), "annual", getAnnualMeanOfMonthlyC(v).toFixed(2));
  });
});
