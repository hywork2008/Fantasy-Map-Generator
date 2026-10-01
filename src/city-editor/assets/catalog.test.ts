import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDocument, parseDocument } from "../core/document";
import { nearestOnPolyline, pointInPolygon } from "../core/gen/geom";
import { placeLandmark, validateLandmarks } from "../core/landmarks";
import { meshFromCells } from "../core/mesh";
import type { CityDocument, Point } from "../core/types";
import { historicLandmarkPrototypes } from "./catalog";

describe("historic landmark prototypes", () => {
  it("keeps each saved source byte-for-byte tied to its provenance record", () => {
    const sourceDirectory = resolve(process.cwd(), "docs/data/city-landmarks/sources");
    const manifest = JSON.parse(readFileSync(resolve(sourceDirectory, "manifest.json"), "utf8")) as {
      items: Array<{
        assetId: string;
        filePageRevisionId: number;
        localOriginal: string;
        originalBytes: number;
        commonsSha1: string;
        originalSha256: string;
        localPreview: string;
        previewSha256: string;
      }>;
    };
    expect(manifest.items.map(item => item.assetId)).toEqual(historicLandmarkPrototypes.map(asset => asset.id));
    for (const item of manifest.items) {
      expect(item.filePageRevisionId).toBeGreaterThan(0);
      const original = readFileSync(resolve(sourceDirectory, item.localOriginal));
      const preview = readFileSync(resolve(sourceDirectory, item.localPreview));
      expect(original.length).toBe(item.originalBytes);
      expect(createHash("sha1").update(original).digest("hex")).toBe(item.commonsSha1);
      expect(createHash("sha256").update(original).digest("hex")).toBe(item.originalSha256);
      expect(createHash("sha256").update(preview).digest("hex")).toBe(item.previewSha256);
    }
  });
  it("bundles three distinct offline assets accepted by the document format", () => {
    expect(historicLandmarkPrototypes).toHaveLength(3);
    expect(new Set(historicLandmarkPrototypes.map(asset => asset.id)).size).toBe(3);
    for (const asset of historicLandmarkPrototypes) {
      const document = {
        ...createDocument(`prototype-${asset.id}`, 300),
        version: 3 as const,
        landmarkAssets: [asset],
        landmarks: []
      };
      expect(validateLandmarks(document)).toEqual([]);
      expect(parseDocument(JSON.stringify(document))?.landmarkAssets?.[0]).toEqual(asset);
      expect(asset.renderSvg).not.toMatch(/<image|<script|href=/i);
      const allPoints = asset.footprint.flatMap(part => part.outer);
      const bounds = [
        Math.max(...allPoints.map(point => point[0])) - Math.min(...allPoints.map(point => point[0])),
        Math.max(...allPoints.map(point => point[1])) - Math.min(...allPoints.map(point => point[1]))
      ];
      expect(bounds[0]).toBeCloseTo(asset.referenceSizeMeters[0], 1);
      expect(bounds[1]).toBeCloseTo(asset.referenceSizeMeters[1], 1);
      for (const [index, footprint] of asset.footprint.entries())
        expect(
          footprint.outer.every(point => asset.minimumSite.some(site => pointInPolygon(point, site.outer))),
          `${asset.id} part ${index} extends beyond its site`
        ).toBe(true);
      for (const entrance of asset.entrances)
        expect(
          asset.footprint.some(part => nearestOnPolyline(entrance.point, [...part.outer, part.outer[0]]).dist < 1e-6)
        ).toBe(true);
    }
  });
  it("places and reloads every prototype against a public road", () => {
    const boundary: Point[] = [
      [-150, -150],
      [150, -150],
      [150, 150],
      [-150, 150]
    ];
    const mesh = meshFromCells([
      { id: 0, polygon: boundary, site: [0, 0], centroid: [0, 0], neighbors: [], onBorder: true }
    ]);
    const edge = Object.values(mesh.edges).find(
      item => mesh.vertices[item.a].point[1] === -150 && mesh.vertices[item.b].point[1] === -150
    )!;
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      frame: { extentMeters: 300, cityRadiusMeters: 120, blockSizeMeters: 50 },
      mesh,
      featureGroups: [
        {
          id: "road",
          kind: "road",
          name: "Road",
          segments: [{ edgeId: edge.id, forward: true }],
          style: { widthMeters: 6, color: "#555" },
          locked: false
        }
      ],
      gates: [],
      elements: []
    };
    for (const asset of historicLandmarkPrototypes) {
      const placed = placeLandmark(document, asset, {
        id: `placed-${asset.id}`,
        position: [0, -60],
        rotation: 0,
        scale: 1
      });
      expect(placed.reasons).toEqual([]);
      expect(placed.document?.landmarks?.[0].accesses[0].target.id).toBe("road");
      expect(parseDocument(JSON.stringify(placed.document))?.landmarks?.[0].id).toBe(`placed-${asset.id}`);
    }
  });
});
