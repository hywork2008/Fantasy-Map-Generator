import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { pointInPolygon } from "./geom";
import { generateCity } from "./pipeline";

function run(seed: string, walls = true) {
  const config = {
    ...DEFAULT_SITE_CONFIG,
    coast: "none" as const,
    rivers: [],
    relief: false,
    features: { ...DEFAULT_SITE_CONFIG.features, walls, plaza: true, citadel: true }
  };
  const site = synthSite("smallCity", config, seed);
  return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
}

describe("S4 interior perimeter", () => {
  it("makes deterministic, simple closed borders that contain the urban core", () => {
    const result = run("s4-border");
    expect(JSON.stringify(result)).toEqual(JSON.stringify(run("s4-border")));
    expect(result.borders.length).toBeGreaterThan(0);
    const urban = result.steps[3].cells.flatMap((c, i) =>
      c.tag === "urban" && !result.cells[i].onBorder ? [result.cells[i]] : []
    );
    for (const border of result.borders) {
      expect(border.points.length).toBeGreaterThan(3);
      expect(new Set(border.points.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`)).size).toBe(border.points.length);
    }
    // This dry configuration has one component, so every interior urban centroid
    // must sit inside its single outer circumference.
    expect(result.borders).toHaveLength(1);
    for (const cell of urban) expect(pointInPolygon(cell.centroid, result.borders[0].points)).toBe(true);
  });

  it("matches FMG's suggested gate count and reserves distinct plaza/citadel cells", () => {
    const result = run("s4-gates");
    const site = synthSite(
      "smallCity",
      {
        ...DEFAULT_SITE_CONFIG,
        coast: "none",
        rivers: [],
        relief: false,
        features: { ...DEFAULT_SITE_CONFIG.features, walls: true, plaza: true, citadel: true }
      },
      "s4-gates"
    );
    expect(result.gates).toHaveLength(site.suggestedGates);
    expect(new Set(result.gates.map(g => `${g.borderIndex}:${g.point.join(",")}`)).size).toBe(result.gates.length);
    const plaza = result.precincts.find(p => p.kind === "plaza");
    const citadel = result.precincts.find(p => p.kind === "citadel");
    expect(plaza).toBeTruthy();
    expect(citadel).toBeTruthy();
    expect(citadel!.cellIds[0]).not.toBe(plaza!.cellIds[0]);
    const citadelCell = result.cells.find(c => c.id === citadel!.cellIds[0])!;
    const urbanIds = new Set(result.steps[3].cells.flatMap((c, i) => (c.tag === "urban" ? [result.cells[i].id] : [])));
    expect(citadelCell.neighbors.some(id => urbanIds.has(id))).toBe(true);
    expect(Math.hypot(...citadelCell.centroid)).toBeGreaterThanOrEqual(result.params.cityRadiusMeters * 0.15);
  });

  it("does not emit a drawn town wall or towers for an open settlement, but still rings the citadel", () => {
    const open = run("s4-open", false);
    const overlays = open.steps.at(-1)!.overlays;
    expect(overlays.some(o => o.kind === "wall" || o.kind === "tower")).toBe(false);
    // The citadel keeps its enceinte even when the town itself is unwalled (design §4.2).
    expect(overlays.some(o => o.kind === "citadelWall")).toBe(true);
    expect(open.borders.length).toBeGreaterThan(0);
    expect(open.gates.length).toBeGreaterThan(0);
  });
});
