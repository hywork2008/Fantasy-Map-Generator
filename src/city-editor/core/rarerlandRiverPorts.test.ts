import { describe, expect, it } from "vitest";
import { shareFromDescriptor } from "../io/incomingCity";
import { serializeCitySvg } from "../render/svg";
import sites from "./fixtures/rarerland-river-ports-20261004.json";
import { buildBlockFabric } from "./gen/blockInfill";
import { pointInPolygon } from "./gen/geom";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { facePoints, validate } from "./mesh";
import { polygonHitsDocumentWater, waterPolygons } from "./waterGeometry";

describe("Rarerland imported river ports", () => {
  it.each(sites as unknown as BurgSiteDescriptor[])(
    "connects piers and river boats for $burg.id ($burg.name)",
    descriptor => {
      const share = shareFromDescriptor(structuredClone(descriptor));
      const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed);
      expect(city).not.toBeNull();
      if (!city) return;
      expect(validate(city)).toEqual([]);
      const wet = waterPolygons(city);
      const harbors = Object.values(city.mesh.faces).filter(f => f.properties.ward === "harbor");
      expect(harbors.length).toBeGreaterThan(0);
      const piers = buildBlockFabric(city).harbor!.piers;
      expect(piers.length).toBeGreaterThan(0);
      for (const pier of piers) {
        expect(harbors.some(f => pointInPolygon(pier.start!, facePoints(city.mesh, f)))).toBe(true);
        expect(wet.some(p => pointInPolygon(pier.start!, p))).toBe(false);
        expect(wet.some(p => pointInPolygon(pier.end!, p))).toBe(true);
      }
      const boats = city.elements.filter(e => e.kind === "ship");
      expect(boats.length).toBeGreaterThan(0);
      expect(boats.every(e => e.shipType === "barge" && wet.some(p => pointInPolygon(e.point!, p)))).toBe(true);
      for (const cemetery of city.cemeteries ?? [])
        expect(polygonHitsDocumentWater(city, cemetery.boundary)).toBe(false);
      for (const castle of city.castles ?? []) {
        for (const part of castle.parts) expect(polygonHitsDocumentWater(city, part.footprint)).toBe(false);
      }
      const svg = new DOMParser().parseFromString(serializeCitySvg(city), "image/svg+xml");
      expect(svg.querySelector("parsererror")).toBeNull();
      expect(svg.querySelectorAll(".ce-pier").length).toBeGreaterThan(0);
      for (const road of svg.querySelectorAll(".ce-frame-road, .ce-river-connection-road")) {
        expect(road.getAttribute("stroke")).not.toBe("#735238");
      }
    }
  );
});
