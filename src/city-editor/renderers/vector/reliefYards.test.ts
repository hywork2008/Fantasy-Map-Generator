import { describe, expect, it } from "vitest";
import { reliefPlotWalls, reliefYardTerraces } from "./reliefYards";

describe("levelled burgage yards on relief (natural relief §5.7)", () => {
  // A plot 6 m wide and 40 m deep from its street front at y = 0, the ground falling 0.15 m per metre behind it.
  const ring: [number, number][] = [
      [0, 0],
      [6, 0],
      [6, 40],
      [0, 40]
    ],
    house = {
      ring: [
        [0, 0],
        [6, 0],
        [6, 10],
        [0, 10]
      ] as [number, number][],
      floor: 10.15
    },
    heightAt = (p: [number, number]) => 10 - 0.15 * p[1];

  it("starts the yard at the house's floor and steps the fall behind it into level terraces", () => {
    const { prisms, cuts, levels } = reliefYardTerraces(
      "c",
      [ring],
      [
        [
          [0, 0],
          [6, 0]
        ]
      ],
      [house],
      heightAt,
      "#b5b27f"
    );
    expect(levels[0].level).toBe(10.15);
    // 30 m behind the house fall 4.5 m: three terraces, each lower than the last, each one level surface.
    expect(levels).toHaveLength(4);
    for (let i = 1; i < levels.length; i++) expect(levels[i].level).toBeLessThan(levels[i - 1].level);
    for (const prism of prisms)
      expect(new Set(prism.top.filter((t, i) => t > heightAt(prism.ring[i]))).size).toBeLessThanOrEqual(1);
    expect(cuts).toHaveLength(4);
    // The terraces stay inside the plot and cover it.
    const area = (r: [number, number][]) =>
      Math.abs(r.reduce((n, p, i) => n + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0)) / 2;
    expect(levels.reduce((n, l) => n + area(l.ring as [number, number][]), 0)).toBeCloseTo(240, 0);
  });

  it("stands a plot wall on its lower ground and raises it over the higher yard", () => {
    const { levels } = reliefYardTerraces(
        "c",
        [ring],
        [
          [
            [0, 0],
            [6, 0]
          ]
        ],
        [house],
        heightAt,
        "#b5b27f"
      ),
      [wall] = reliefPlotWalls(
        "w",
        [
          {
            outer: [
              [5.9, 12],
              [6.1, 12],
              [6.1, 13],
              [5.9, 13]
            ],
            holes: []
          }
        ],
        levels,
        heightAt,
        1.1,
        "#8f7d63"
      );
    expect(Math.min(...wall.bottom)).toBeLessThan(Math.min(...wall.ring.map(heightAt)));
    expect(Math.max(...wall.top)).toBeGreaterThan(Math.max(...levels.map(l => l.level).filter(l => l < 10)) + 1);
  });
});
