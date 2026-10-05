import { describe, expect, it } from "vitest";
import { clipConvex, polygonArea, rectangle, subtractConvex, trimToArea } from "./landUseGeometry";

describe("land-use polygon precision", () => {
  it("cuts the tiny residual that stalled world allocation without duplicating its remainder", () => {
    const poly: [number, number][] = [
      [297.5, 470.75],
      [297.5, 470.75],
      [298.6666666666667, 472.5],
      [297.5, 472.5]
    ];
    const scale = 1624.8994259045573;
    const target = 1.512376002210658e-8;
    const cut = trimToArea(poly, target / scale);
    expect(polygonArea(cut) * scale).toBeGreaterThan(target * 0.99);
    expect(polygonArea(cut) * scale).toBeLessThanOrEqual(target);
    const rest = subtractConvex(poly, cut);
    expect(rest).toHaveLength(1);
    expect(polygonArea(cut) + polygonArea(rest[0])).toBeCloseTo(polygonArea(poly), 12);
    expect(polygonArea(clipConvex(cut, rest[0]))).toBeLessThan(1e-12);
  });
  it("treats repeated vertices and a closed ring as zero-length edges", () => {
    const subject = rectangle(288, 470, 14, 12);
    const clip = rectangle(290, 472, 5, 6);
    clip.splice(1, 0, clip[0]);
    clip.push(clip[0]);
    const rest = subtractConvex(subject, clip);
    expect(rest.reduce((sum, p) => sum + polygonArea(p), polygonArea(clip))).toBeCloseTo(polygonArea(subject), 12);
    for (let i = 0; i < rest.length; i++)
      for (let j = i + 1; j < rest.length; j++) expect(polygonArea(clipConvex(rest[i], rest[j]))).toBe(0);
  });
  it("preserves the subject when subtracting an empty or zero-area cut", () => {
    const poly = rectangle(300, 480, 2, 3);
    expect(subtractConvex(poly, [])).toEqual([poly]);
    expect(
      subtractConvex(poly, [
        [300, 480],
        [300, 480],
        [301, 480]
      ])
    ).toEqual([poly]);
    expect(trimToArea(poly, 0)).toEqual([]);
    expect(trimToArea(poly, Number.MIN_VALUE)).toEqual([]);
  });
});
