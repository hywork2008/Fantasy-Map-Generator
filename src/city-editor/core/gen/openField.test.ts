import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { openFieldPlots } from "./openField";

function rect(width: number, height: number): Point[] {
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height]
  ];
}

function rowLength(row: Point[]): number {
  return Math.hypot(row[1][0] - row[0][0], row[1][1] - row[0][1]);
}

function rowAngle(row: Point[]): number {
  return Math.atan2(row[1][1] - row[0][1], row[1][0] - row[0][0]);
}

describe("open-field furlongs", () => {
  it("keeps a small close as one furlong of selions about four metres apart", () => {
    const plots = openFieldPlots(rect(40, 28), 0, "close");
    expect(plots.length).toBe(1);
    const rows = plots[0].rows;
    const angle = rowAngle(rows[0]);
    const normalX = -Math.sin(angle);
    const normalY = Math.cos(angle);
    const offsets = rows
      .map(row => {
        const midX = (row[0][0] + row[1][0]) / 2;
        const midY = (row[0][1] + row[1][1]) / 2;
        return midX * normalX + midY * normalY;
      })
      .sort((a, b) => a - b);
    const gaps = offsets.slice(1).map((offset, index) => offset - offsets[index]);
    expect(gaps.length).toBeGreaterThan(3);
    for (const gap of gaps) expect(gap).toBeGreaterThan(3.2);
    for (const gap of gaps) expect(gap).toBeLessThan(5);
  });

  it("breaks a holding much larger than a house into turned furlongs of short ridges", () => {
    const plots = openFieldPlots(rect(240, 180), 0.4, "holding");
    expect(plots.length).toBeGreaterThan(4);
    const angles = plots.map(plot => rowAngle(plot.rows[0]));
    const turned = angles.some(angle =>
      angles.some(other => {
        const delta = Math.abs(angle - other) % Math.PI;
        const fold = Math.min(delta, Math.PI - delta);
        return fold > (20 * Math.PI) / 180;
      })
    );
    expect(turned).toBe(true);
    for (const plot of plots) {
      for (const row of plot.rows) expect(rowLength(row)).toBeLessThan(120);
    }
  });
});
