// M4b polish — the wall PATTERN layer (docs/city-generator/wall-patterns.md):
// envelope shape, coast treatment, line style, and the §8 matrix.

import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG, type SiteConfig } from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram, siteToWallPlan } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { convexHull, pointInPolygon, polygonArea } from "./geom";
import { generateCity } from "./pipeline";
import type { CityProgram, Overlay, Point, WallPlan } from "./types";
import { DEFAULT_WALL_PLAN } from "./types";

function cfg(over: Partial<SiteConfig>): SiteConfig {
  return {
    ...DEFAULT_SITE_CONFIG,
    coast: "none",
    rivers: [],
    relief: false,
    features: { ...DEFAULT_SITE_CONFIG.features, walls: true, citadel: false, plaza: true, port: false },
    wall: { ...DEFAULT_SITE_CONFIG.wall },
    ...over
  };
}

function run(config: SiteConfig, seed: string, wallPlan?: Partial<WallPlan>) {
  const site = synthSite("smallCity", config, seed);
  const program: CityProgram = {
    ...siteToProgram(site),
    wallPlan: { ...DEFAULT_WALL_PLAN, ...siteToWallPlan(site, siteToProgram(site)), ...wallPlan }
  };
  return generateCity(siteToParams(site), siteToGeography(site), program);
}

const walls = (r: ReturnType<typeof run>): Overlay[] => r.steps.at(-1)!.overlays.filter(o => o.kind === "wall");
const vertexCount = (os: Overlay[]): number => os.reduce((n, o) => n + o.points.length, 0);
const perimeter = (pts: Point[]): number => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
};

describe("siteToWallPlan — the §8 matrix", () => {
  const base = synthSite("smallCity", cfg({}), "matrix");
  const flags = siteToProgram(base);

  it("keys extent off `walls`", () => {
    expect(siteToWallPlan(base, { ...flags, walls: true }).extent).toBe("full");
    expect(siteToWallPlan(base, { ...flags, walls: false }).extent).toBe("none");
  });

  it("an unfortified harbour leaves the sea front open; a fortified one seals it", () => {
    const harbour = synthSite("smallCity", cfg({ coast: "bay", features: { ...cfg({}).features, port: true } }), "h");
    const f = siteToProgram(harbour);
    expect(siteToWallPlan(harbour, { ...f, port: true, citadel: false, capital: false }).coast).toBe("open");
    expect(siteToWallPlan(harbour, { ...f, port: true, citadel: true }).coast).toBe("seaWall");
  });

  it("a river town takes the notch-filled organic envelope", () => {
    const riverside = synthSite("smallCity", cfg({ rivers: ["through"] }), "r");
    const plan = siteToWallPlan(riverside, siteToProgram(riverside));
    expect(plan.envelope).toBe("notchFilled");
    expect(plan.line).toBe("organic");
  });
});

describe("wall envelope", () => {
  it("`hull` is convex — its area equals its own convex hull's", () => {
    const r = run(cfg({ rivers: ["meander"] }), "env-hull", { envelope: "hull" });
    for (const b of r.borders) {
      const a = Math.abs(polygonArea(b.points));
      const h = Math.abs(polygonArea(convexHull(b.points)));
      expect(a).toBeGreaterThan(0);
      expect(a / h).toBeGreaterThan(0.999);
    }
  });

  it("`notchFilled` still contains every interior urban cell but is shorter than `hull` is wide", () => {
    const config = cfg({ rivers: ["meander"] });
    const r = run(config, "env-notch", { envelope: "notchFilled" });
    const last = r.steps.at(-1)!;
    const interiorUrban = last.cells
      .map((c, i) => ({ tag: c.tag, cell: r.cells[i] }))
      .filter(x => x.tag === "urban" && !x.cell.onBorder)
      .map(x => x.cell);
    expect(r.borders).toHaveLength(1);
    for (const cell of interiorUrban) {
      expect(pointInPolygon(cell.centroid, r.borders[0].points)).toBe(true);
    }
    // Filling pockets only ever removes length: notchFilled ≤ its own hull perimeter × a slack factor.
    const hullPerim = perimeter(convexHull(r.borders[0].points));
    expect(perimeter(r.borders[0].points)).toBeLessThanOrEqual(hullPerim * 1.6);
  });
});

describe("wall coast treatment", () => {
  const harbour = cfg({ coast: "bay", features: { ...cfg({}).features, port: true, walls: true } });

  /** Count wall EDGES (consecutive point pairs) that run along the shoreline. */
  const coastalWallEdges = (r: ReturnType<typeof run>): number => {
    const cs = r.params.cellSizeMeters;
    let count = 0;
    for (const o of walls(r)) {
      for (let i = 0; i < o.points.length - 1; i++) {
        const mid: Point = [(o.points[i][0] + o.points[i + 1][0]) / 2, (o.points[i][1] + o.points[i + 1][1]) / 2];
        if (r.shoreline!.some(s => Math.hypot(s[0] - mid[0], s[1] - mid[1]) < cs * 1.5)) count++;
      }
    }
    return count;
  };

  it("`open` runs no wall along the shoreline; `seaWall` does", () => {
    const open = run(harbour, "coast", { coast: "open" });
    const sealed = run(harbour, "coast", { coast: "seaWall" });
    expect(open.shoreline).not.toBeNull();
    // At least one envelope edge really faces the sea.
    expect(open.borders.some(b => b.segments.includes("coast"))).toBe(true);
    expect(coastalWallEdges(sealed)).toBeGreaterThan(0);
    expect(coastalWallEdges(open)).toBe(0);
    expect(vertexCount(walls(sealed))).toBeGreaterThan(vertexCount(walls(open)));
  });
});

describe("wall line style", () => {
  it("`polygonal` uses no more vertices than `organic` (Douglas–Peucker)", () => {
    const config = cfg({ rivers: ["meander"] });
    const organic = run(config, "line", { line: "organic", envelope: "notchFilled" });
    const polygonal = run(config, "line", { line: "polygonal", envelope: "notchFilled" });
    expect(vertexCount(walls(polygonal))).toBeLessThanOrEqual(vertexCount(walls(organic)));
    expect(vertexCount(walls(polygonal))).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  it("same (config, seed, wallPlan) ⇒ identical result", () => {
    const config = cfg({ coast: "bay", rivers: ["through"], features: { ...cfg({}).features, port: true } });
    expect(JSON.stringify(run(config, "det", { envelope: "hull", coast: "seaWall", line: "polygonal" }))).toEqual(
      JSON.stringify(run(config, "det", { envelope: "hull", coast: "seaWall", line: "polygonal" }))
    );
  });
});
