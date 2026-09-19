// M6 — S6 wards (design §4.2 S6, burg-feature-options.md §4.4–4.6).
// Citadel = Castle, plaza = Market, Cathedral sits by the plaza, Slums sit far
// from the centre, harbour needs a waterbody, shanty is 3–6 cells outside the
// border.

import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { pointInPolygon } from "./geom";
import { close } from "./interior";
import { generateCity } from "./pipeline";
import type { CityProgram, WardKind } from "./types";

function run(
  seed: string,
  coast: "none" | "bay" = "none",
  features: Partial<CityProgram> = {}
): ReturnType<typeof generateCity> {
  const config = {
    ...DEFAULT_SITE_CONFIG,
    coast,
    rivers: coast === "none" ? [] : DEFAULT_SITE_CONFIG.rivers,
    relief: false,
    features: {
      ...DEFAULT_SITE_CONFIG.features,
      walls: true,
      plaza: true,
      citadel: true,
      temple: true,
      port: coast !== "none",
      shanty: true,
      ...features
    }
  };
  const site = synthSite("smallCity", config, seed);
  return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
}

function kindOf(r: ReturnType<typeof generateCity>, id: number): WardKind | undefined {
  return r.wards.find(w => w.cellId === id)?.kind;
}

describe("S6 wards", () => {
  it("assigns Castle to the citadel and Market to the plaza", () => {
    const r = run("s6-named");
    const plaza = r.precincts.find(p => p.kind === "plaza");
    const citadel = r.precincts.find(p => p.kind === "citadel");
    expect(plaza).toBeTruthy();
    expect(citadel).toBeTruthy();
    for (const id of plaza!.cellIds) expect(kindOf(r, id)).toBe("market");
    for (const id of citadel!.cellIds) expect(kindOf(r, id)).toBe("castle");
  });

  it("places Cathedral next to the plaza, on a different cell", () => {
    const r = run("s6-temple");
    const plaza = r.precincts.find(p => p.kind === "plaza");
    const temple = r.precincts.find(p => p.kind === "temple");
    expect(plaza).toBeTruthy();
    expect(temple).toBeTruthy();
    expect(temple!.cellIds.some(id => plaza!.cellIds.includes(id))).toBe(false);
    expect(kindOf(r, temple!.cellIds[0])).toBe("cathedral");
    expect(Math.hypot(temple!.anchor[0] - plaza!.anchor[0], temple!.anchor[1] - plaza!.anchor[1])).toBeLessThan(
      r.params.cityRadiusMeters * 0.4
    );
  });

  it("sits Slums farther from the centre than Merchant wards", () => {
    const r = run("s6-slum");
    const byId = new Map(r.cells.map(c => [c.id, c]));
    const mean = (kind: WardKind): number => {
      const ids = r.wards.filter(w => w.kind === kind).map(w => w.cellId);
      expect(ids.length, `${kind} present`).toBeGreaterThan(0);
      return ids.reduce((s, id) => s + Math.hypot(...byId.get(id)!.centroid), 0) / ids.length;
    };
    expect(mean("slum")).toBeGreaterThan(mean("merchant"));
  });

  it("requires a waterbody for the harbour precinct, and sits it on the sea", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // synthSite collapses `port` without water; force the flag through so the
    // pipeline itself logs the FMG-inconsistent case (burg-feature-options §8).
    const drySite = synthSite(
      "smallCity",
      {
        ...DEFAULT_SITE_CONFIG,
        coast: "none",
        rivers: [],
        relief: false,
        features: { ...DEFAULT_SITE_CONFIG.features, port: true, walls: true, plaza: true }
      },
      "s6-port-dry"
    );
    const dry = generateCity(siteToParams(drySite), siteToGeography(drySite), {
      ...siteToProgram(drySite),
      port: true
    });
    expect(dry.precincts.some(p => p.kind === "harbor")).toBe(false);
    expect(warn).toHaveBeenCalledWith("port set but no waterbody");
    warn.mockRestore();

    const wet = run("s6-port-bay", "bay", { port: true });
    const harbor = wet.precincts.find(p => p.kind === "harbor");
    expect(harbor).toBeTruthy();
    const sea = new Set(wet.steps[1].cells.filter(c => c.tag === "sea").map(c => c.id));
    const byId = new Map(wet.cells.map(c => [c.id, c]));
    expect(harbor!.cellIds.some(id => byId.get(id)!.neighbors.some(n => sea.has(n)))).toBe(true);
    const s6 = wet.steps.find(s => s.label === "S6 · Wards");
    expect(s6?.overlays.some(o => o.kind === "quay")).toBe(true);
  });

  it("tags 3–6 shanty cells outside the border", () => {
    const r = run("s6-shanty");
    const shanty = r.wards.filter(w => w.kind === "shanty");
    expect(shanty.length).toBeGreaterThanOrEqual(3);
    expect(shanty.length).toBeLessThanOrEqual(6);
    const s6 = r.steps.find(s => s.label === "S6 · Wards")!;
    const shantyIds = new Set(shanty.map(w => w.cellId));
    expect(s6.cells.filter(c => c.tag === "shanty")).toHaveLength(shanty.length);
    const byId = new Map(r.cells.map(c => [c.id, c]));
    for (const { cellId } of shanty) {
      const cell = byId.get(cellId)!;
      expect(r.borders.some(b => pointInPolygon(cell.centroid, close(b.points)))).toBe(false);
      expect(shantyIds.has(cellId)).toBe(true);
    }
  });

  it("does not place temple or shanty when those flags are off", () => {
    const r = run("s6-off", "none", { temple: false, shanty: false, port: false });
    expect(r.precincts.some(p => p.kind === "temple" || p.kind === "harbor")).toBe(false);
    expect(r.wards.some(w => w.kind === "cathedral" || w.kind === "shanty" || w.kind === "harbor")).toBe(false);
    expect(r.steps.at(-1)?.cells.some(c => c.tag === "shanty")).toBe(false);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(run("s6-det").wards)).toEqual(JSON.stringify(run("s6-det").wards));
    expect(JSON.stringify(run("s6-det").precincts)).toEqual(JSON.stringify(run("s6-det").precincts));
  });

  it("exposes S6 with ward-tagged cells", () => {
    const r = run("s6-step");
    expect(r.steps.map(s => s.label)).toContain("S6 · Wards");
    const s6 = r.steps.find(s => s.label === "S6 · Wards")!;
    expect(s6).toBeTruthy();
    expect(s6.cells.some(c => c.ward === "market")).toBe(true);
    expect(s6.cells.some(c => c.ward === "castle")).toBe(true);
    expect(s6.precincts.some(p => p.kind === "plaza")).toBe(true);
    expect(s6.precincts.some(p => p.kind === "temple")).toBe(true);
  });
});
