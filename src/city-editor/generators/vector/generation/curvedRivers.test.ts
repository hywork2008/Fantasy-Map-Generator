import { describe, expect, it } from "vitest";
import type { Point } from "../../../types/primitives";
import { DEFAULT_SITE_CONFIG } from "../../site/siteConfig";
import { synthSite } from "../../site/synthSite";
import { curveSynthesizedRivers, smoothCourse } from "./curvedRivers";

const heading = (a: Point, b: Point) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const turn = (x: number, y: number) => Math.abs(Math.atan2(Math.sin(y - x), Math.cos(y - x)));

describe("meshless meandering rivers", () => {
  it("lays a meander through the town, clear of its centre, from window edge to window edge", () => {
    const config = { ...DEFAULT_SITE_CONFIG, rivers: ["meander" as const] };
    for (const seed of ["a", "b", "c", "d"]) {
      const site = synthSite("largeTown", config, seed, { extentMeters: 1600, cityRadiusMeters: 396 });
      curveSynthesizedRivers(site, config, seed);
      const { points } = site.rivers[0].segments[0],
        half = 800,
        onEdge = (p: Point) => Math.abs(Math.max(Math.abs(p[0]), Math.abs(p[1])) - half) < 1e-6;
      expect(onEdge(points[0]) && onEdge(points.at(-1)!), seed).toBe(true);
      const nearest = Math.min(...points.map(p => Math.hypot(p[0], p[1])));
      expect(nearest, seed).toBeGreaterThan(site.rivers[0].widthMeters / 2 + 30);
      expect(nearest, seed).toBeLessThan(396);
      // Kinoshita loops: the channel turns well past a right angle somewhere in view.
      const headings = points.slice(1).map((p, i) => heading(points[i], p));
      expect(Math.max(...headings) - Math.min(...headings), seed).toBeGreaterThan(Math.PI / 2);
    }
  });

  it("smooths a course into a polyline that turns only a few degrees per vertex", () => {
    const course: Point[] = [
        [0, 0],
        [100, 0],
        [150, 80],
        [100, 160],
        [0, 160]
      ],
      { points, widths } = smoothCourse(course, [10, 12, 14, 16, 18]);
    expect(points.length).toBe(widths.length);
    for (const p of course) expect(points.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9)).toBe(true);
    for (let i = 2; i < points.length; i++)
      expect(turn(heading(points[i - 2], points[i - 1]), heading(points[i - 1], points[i]))).toBeLessThan(
        (8 * Math.PI) / 180
      );
  });
});
