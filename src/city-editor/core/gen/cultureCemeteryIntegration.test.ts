import { describe, expect, it } from "vitest";
import { BURIAL_CULTURE_PRESETS, getBurialCulturePreset } from "../../../data/burialCultures";
import { decodeShare, encodeShare, shareFromDescriptor } from "../../io/incomingCity";
import { renderCemeteries } from "../../render/svg";
import { createGridDocument, parseDocument } from "../document";
import { insideRing, polygonOverlaps } from "../fortifications";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import type { CemeteryPlan, CityDocument, Point } from "../types";
import { layoutCemetery, syncDocumentCemeteries } from "./cemeteryLayout";
import { DEFAULT_SITE_CONFIG } from "./site/siteConfig";
import { synthSite } from "./site/synthSite";
import { assignWards, type WardInputs } from "./wards";

const plan = (preset: string): CemeteryPlan => ({
  id: "cemetery:1",
  version: 1,
  seed: "culture-layout",
  form: "churchyard",
  faceId: "f1",
  boundary: [
    [-35, -35],
    [35, -35],
    [35, 35],
    [-35, 35]
  ],
  courtyards: [],
  parts: [],
  accesses: [],
  trees: [],
  locked: false,
  provenance: "generated",
  burialProfile: getBurialCulturePreset(preset)
});
const emptyDocument = (): CityDocument =>
  ({ mesh: { faces: {}, edges: {}, vertices: {} }, featureGroups: [] }) as unknown as CityDocument;

function wardInput(zoning: string): WardInputs {
  const positions: Point[] = [
    [0, 0],
    [15, 0],
    [60, 25],
    [120, 25]
  ];
  return {
    cells: positions.map(([x, y], id) => ({
      id,
      site: [x, y],
      centroid: [x, y],
      polygon: [
        [x - 10, y - 10],
        [x + 10, y - 10],
        [x + 10, y + 10],
        [x - 10, y + 10]
      ],
      neighbors: [0, 1, 2, 3].filter(n => n !== id),
      onBorder: false
    })),
    urban: new Set([0, 1]),
    outskirts: new Set([2, 3]),
    sea: new Set(),
    borders: [],
    gates: [],
    precincts: [{ kind: "plaza", cellIds: [0], anchor: [0, 0] }],
    geo: { roadBearings: [], rivers: [], coast: null },
    params: { seed: "zoning", cityRadiusMeters: 50, cellSizeMeters: 20, extentMeters: 600, nPatches: 4 },
    program: { walls: true, citadel: false, plaza: true, temple: false, port: false, shanty: false, capital: false },
    shoreline: null,
    waterPolygon: null,
    streets: [],
    rivers: [],
    burialProfile: { ...getBurialCulturePreset("medieval_parish"), zoning } as WardInputs["burialProfile"]
  } as WardInputs;
}

describe("culture cemetery production path", () => {
  it("carries the FMG descriptor through sharing, generation, save and regeneration", () => {
    const site = synthSite("largeTown", { ...DEFAULT_SITE_CONFIG, rivers: [], coast: "none" }, "culture-handoff");
    site.burialProfile = getBurialCulturePreset("prague_ghetto");
    const decoded = decodeShare(encodeShare(shareFromDescriptor(site)));
    expect(decoded?.descriptor?.burialProfile).toEqual(site.burialProfile);
    const base = createGridDocument({ size: "small", grid: "hex" });
    const settings = { ...defaultGenerationSettings(), descriptor: decoded!.descriptor };
    const city = generateCityOnDocument(base, settings, "cemetery-gen-seed");
    expect(city).not.toBeNull();
    expect(city!.burialProfile).toEqual(site.burialProfile);
    const cemetery = city!.cemeteries?.[0];
    expect(cemetery?.burialProfile).toEqual(site.burialProfile);
    expect(cemetery?.parts.some(p => p.kind === "crowded_jumble")).toBe(true);
    expect(cemetery?.trees).toEqual([]);
    const saved = parseDocument(JSON.stringify(city))!;
    expect(saved).not.toBeNull();
    saved.cemeteries = [];
    syncDocumentCemeteries(saved);
    expect(saved.cemeteries?.[0]?.burialProfile).toEqual(site.burialProfile);
    expect(renderCemeteries(saved).querySelector('[data-burial-profile="prague_ghetto"]')).not.toBeNull();
  }, 30000);

  it("generates each preset's sanctuary and distinct marker shapes inside its parcel", () => {
    for (const preset of Object.values(BURIAL_CULTURE_PRESETS)) {
      const layout = layoutCemetery(emptyDocument(), plan(preset.id))!;
      expect(layout).not.toBeNull();
      const sanctuaries = layout.parts.filter(p => p.role === "sanctuary");
      if (preset.sanctuary === "none_flat_memorial") expect(sanctuaries).toHaveLength(0);
      else expect(sanctuaries.map(p => p.kind)).toEqual([preset.sanctuary]);
      for (const part of layout.parts) expect(part.footprint.every(p => insideRing(p, layout.boundary))).toBe(true);
      for (let i = 0; i < layout.parts.length; i++)
        for (let j = i + 1; j < layout.parts.length; j++)
          expect(polygonOverlaps(layout.parts[i].footprint, layout.parts[j].footprint)).toBe(false);
      const doc = { ...emptyDocument(), cemeteries: [layout] };
      const rendered = renderCemeteries(doc);
      expect(rendered.querySelector(`[data-burial-profile="${preset.id}"]`)).not.toBeNull();
      if (preset.vegetation === "barren_gravel") expect(rendered.querySelectorAll(".ce-cemetery-tree")).toHaveLength(0);
    }
    expect(layoutCemetery(emptyDocument(), plan("varanasi_ghat"))!.parts.some(p => p.role === "monument")).toBe(false);
    expect(
      layoutCemetery(emptyDocument(), plan("zoroastrian_tower"))!.parts.find(p => p.kind === "tower_of_silence")?.holes
    ).toHaveLength(2);
  });

  it("does not move a river ghat inland or an extramural cemetery inside town", () => {
    const ghat = assignWards(wardInput("riverfront_ghat"));
    expect(ghat.wards.some(w => w.kind === "cemetery")).toBe(false);
    const extramural = { ...wardInput("extramural_sanitary"), outskirts: new Set<number>() };
    expect(assignWards(extramural).wards.some(w => w.kind === "cemetery")).toBe(false);
    const hills = {
      ...wardInput("topographic_hill"),
      elevations: new Map([
        [2, 200],
        [3, 10]
      ])
    };
    expect(assignWards(hills).wards.find(w => w.kind === "cemetery")?.cellId).toBe(2);
  });

  it("still gives a roadside-necropolis culture an outskirts cemetery when no cell sits at the ideal road distance", () => {
    // No streets at all, so every outskirts cell misses the 10-50 m roadside band
    // (Combreche burg 799 Jaszsolmasza lost its cemetery this way).
    const cemetery = assignWards(wardInput("extramural_highway")).wards.find(w => w.kind === "cemetery");
    expect(cemetery && [2, 3].includes(cemetery.cellId)).toBe(true);
  });
});
