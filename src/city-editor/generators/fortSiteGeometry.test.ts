import { describe, expect, it } from "vitest";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import { createTownWater } from "../../city3d/three/waterMeshes";
import { collectCityStructures } from "../renderers/structureMassing";
import { groundStructures } from "../renderers/terrainMassing";
import { parseDocument } from "../services/io/documentCodec";
import { createGridDocument } from "./document";
import { generateFortOnDocument } from "./fortGeneration";
import { editFortSite, removeFortComponent } from "./fortSiteEditing";
import { auditFortAccess, fortBridgeSkew, fortHeight, fortWaterPolygons } from "./fortSiteGeometry";
import { defaultGenerationSettings } from "./generation/settings";
import { scaleDocument, validate } from "./mesh";
import { intersectConvex, plotArea } from "./parcelGeometry";
import { cityTerrain } from "./terrainElevation";

const generate = () =>
  generateFortOnDocument(
    createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 20, seed: "fort" }),
    { ...defaultGenerationSettings(), mode: "fort" },
    "fort"
  )!;

describe("authored fort assembly", () => {
  it("has a flat summit, explicit side slopes and excavated connected moats at one water level", () => {
    const doc = generate(),
      site = doc.fortSite!,
      center = site.motte.center;
    expect(fortHeight(site, center)).toBeCloseTo(25.24);
    expect(fortHeight(site, [center[0] + 10, center[1]])).toBeCloseTo(25.24);
    expect(fortHeight(site, [center[0] + 21, center[1]])).toBeCloseTo(17.62);
    expect(fortHeight(site, [center[0] + 30, center[1]])).toBeCloseTo(7);
    const polygons = fortWaterPolygons(site);
    expect(polygons.length).toBeGreaterThan(100);
    expect(new Set(polygons.map(p => p.elevationMeters))).toEqual(new Set([8.5]));
    for (let i = 0; i < polygons.length; i++)
      for (let j = i + 1; j < polygons.length; j++)
        expect(plotArea(intersectConvex(polygons[i].polygon, polygons[j].polygon))).toBeLessThan(1e-5);
    const terrain = cityTerrain(doc);
    for (const p of doc.castles![0].parts[0].footprint) expect(terrain.heightAt(p)).toBeCloseTo(15.24);
    const meshes = createTownWater(doc, terrain);
    expect(meshes.land).not.toBeNull();
    expect(meshes.parent.getObjectByName("ce-water-moat")).toBeDefined();
    meshes.dispose();
  });
  it("connects all nine buildings and crosses the moat normally with straight bridges", () => {
    const doc = generate(),
      site = doc.fortSite!;
    expect(site.buildings).toHaveLength(9);
    expect(auditFortAccess(doc)).toEqual([]);
    for (const bridge of site.routes.filter(r => r.kind === "bridge")) {
      expect(bridge.points).toHaveLength(2);
      expect(fortBridgeSkew(site, bridge)).toBeCloseTo(0);
    }
    const stair = site.routes.find(r => r.kind === "stairs")!;
    expect(stair.elevationsMeters[1] - stair.elevationsMeters[0]).toBeGreaterThan(14);
    const parts = collectCityStructures(doc),
      grounded = groundStructures(parts, cityTerrain(doc));
    expect(new Set(parts.map(p => p.id)).size).toBe(parts.length);
    for (const part of grounded) expect(structureSurfaces(part)).not.toBeNull();
    const keep = grounded.find(p => p.id === "fort-site:fort:keep")!;
    expect(keep.baseElevationMeters).toBeCloseTo(15.24);
    expect(keep.heightMeters).toBeCloseTo(21.336);
    expect(parts.filter(p => p.id.startsWith("fort-site:fort:stairs:")).length).toBeGreaterThan(80);
  });
  it("keeps saved editing and scaling consistent and rejects malformed route connections", () => {
    const doc = generate();
    expect(parseDocument(JSON.stringify(doc))).toEqual(doc);
    expect(validate(scaleDocument(doc, 1.5)!)).toEqual([]);
    const withoutKeep = removeFortComponent(doc, "fort:keep")!;
    expect(validate(withoutKeep)).toEqual([]);
    expect(withoutKeep.fortSite!.defenses).toEqual(doc.fortSite!.defenses);
    const edited = editFortSite(doc, site => {
      site.motte.heightMeters = 18;
      site.motte.summitRadiusMeters = 16.5;
      site.motte.baseRadiusMeters = 28;
    })!;
    expect(validate(edited)).toEqual([]);
    expect(auditFortAccess(edited)).toEqual([]);
    expect(edited.fortSite!.routes.find(r => r.id === "fort:stairs")!.elevationsMeters.at(-1)).toBeCloseTo(28.2);
    const bad = structuredClone(doc);
    bad.fortSite!.routes[0].points[0][0] += 5;
    expect(parseDocument(JSON.stringify(bad))).toBeNull();
    const malformed = structuredClone(doc);
    malformed.fortSite!.motte.summitRadiusMeters = 0;
    expect(parseDocument(JSON.stringify(malformed))).toBeNull();
  });
});
