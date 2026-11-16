import { describe, expect, it } from "vitest";
import { getEarthDistanceScale } from "../data/earthConfig";
import { getTemplateDistanceScale } from "../data/earthRegions";
import { FOOT_SPEED_KM_PER_DAY } from "../generators/regimentMovement";
import { CAMPAIGN_FOOT_DAYS, CAMPAIGN_FOOT_KM_PER_DAY, campaignWindow, kmPerMapPixel } from "./campaignWindow";

const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 540;
const SPACING_PX = Math.sqrt((GRAPH_WIDTH * GRAPH_HEIGHT) / 10000);

describe("campaignWindow", () => {
  it("keeps the foot pace locked to regiment movement", () => {
    expect(CAMPAIGN_FOOT_KM_PER_DAY).toBe(FOOT_SPEED_KM_PER_DAY);
  });

  it("covers about ten cells and 392 km on the default world scale", () => {
    const kmPerPx = getEarthDistanceScale(12.9, GRAPH_WIDTH);
    const box = campaignWindow({
      centerX: GRAPH_WIDTH / 2,
      centerY: GRAPH_HEIGHT / 2,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      kmPerPx,
      spacingPx: SPACING_PX
    });

    expect(box.sideKm).toBeCloseTo(2 * CAMPAIGN_FOOT_DAYS * CAMPAIGN_FOOT_KM_PER_DAY, 5);
    expect(box.sideKm).toBeCloseTo(392, 5);
    expect(box.cellsAlongSide).toBeGreaterThan(9);
    expect(box.cellsAlongSide).toBeLessThan(11);
    expect(box.maxX - box.minX).toBeCloseTo(box.sideKm / kmPerPx, 5);
    expect(box.maxY - box.minY).toBeCloseTo(box.sideKm / kmPerPx, 5);
  });

  it("keeps the same kilometres and spans tens of cells on the Britain scale", () => {
    const kmPerPx = getTemplateDistanceScale("britain", 4.0278, GRAPH_WIDTH);
    const box = campaignWindow({
      centerX: GRAPH_WIDTH / 2,
      centerY: GRAPH_HEIGHT / 2,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      kmPerPx,
      spacingPx: SPACING_PX
    });

    expect(box.sideKm).toBeCloseTo(392, 5);
    expect(box.cellsAlongSide).toBeGreaterThan(40);
    expect(box.cellsAlongSide).toBeLessThan(80);
  });

  it("clips a window centred on the map edge without moving the nominal cell count", () => {
    const kmPerPx = getEarthDistanceScale(12.9, GRAPH_WIDTH);
    const open = campaignWindow({
      centerX: GRAPH_WIDTH / 2,
      centerY: GRAPH_HEIGHT / 2,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      kmPerPx,
      spacingPx: SPACING_PX
    });
    const clipped = campaignWindow({
      centerX: 0,
      centerY: GRAPH_HEIGHT / 2,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      kmPerPx,
      spacingPx: SPACING_PX
    });

    expect(clipped.minX).toBe(0);
    expect(clipped.maxX).toBeLessThan(open.maxX - open.minX);
    expect(clipped.cellsAlongSide).toBeCloseTo(open.cellsAlongSide, 5);
    expect(clipped.sideKm).toBe(open.sideKm);
  });

  it("shrinks the pixel window when the distance unit is miles", () => {
    const distanceScale = getEarthDistanceScale(12.9, GRAPH_WIDTH);
    const kilometres = campaignWindow({
      centerX: GRAPH_WIDTH / 2,
      centerY: GRAPH_HEIGHT / 2,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      kmPerPx: kmPerMapPixel(distanceScale, "km"),
      spacingPx: SPACING_PX
    });
    const miles = campaignWindow({
      centerX: GRAPH_WIDTH / 2,
      centerY: GRAPH_HEIGHT / 2,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      kmPerPx: kmPerMapPixel(distanceScale, "mi"),
      spacingPx: SPACING_PX
    });

    expect(miles.maxX - miles.minX).toBeLessThan(kilometres.maxX - kilometres.minX);
    expect(miles.sideKm).toBe(kilometres.sideKm);
  });

  it("collapses to the centre when the scale is missing", () => {
    const box = campaignWindow({
      centerX: 100,
      centerY: 80,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      kmPerPx: 0,
      spacingPx: SPACING_PX
    });

    expect(box.minX).toBe(100);
    expect(box.maxX).toBe(100);
    expect(box.cellsAlongSide).toBe(0);
  });
});
