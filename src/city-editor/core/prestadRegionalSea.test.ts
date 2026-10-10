import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import { parseDocument } from "./document";
import input from "./fixtures/prestad-20261010.json";
import { pointInPolygon } from "./gen/geom";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { regionalCoastalWaterPolygons, regionalSurfaceLayers } from "./regionalCoast";
import type { Point } from "./types";

type Payload = typeof input;

function generate(edit?: (payload: Payload) => void) {
  const payload = structuredClone(input) as Payload;
  edit?.(payload);
  const value = parseIncomingPayload(JSON.stringify(payload))!;
  return generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed)!;
}

const inSea = (city: ReturnType<typeof generate>, point: Point) =>
  regionalCoastalWaterPolygons(city).some(poly => pointInPolygon(point, poly));

// Prestad: the town mesh's farthest vertex reaches the display frame, but the
// rounded mesh leaves the frame's seaward corners uncovered. FMG has open sea
// there; the corners must not fall back to the burg's biome as phantom land.
describe("Prestad (mesh touches the frame, corners are open sea)", () => {
  const h = input.frame.extentMeters / 2 - 5;

  it("carries the regional sea into the uncovered frame corners", () => {
    const city = generate();
    expect(city.regionalWaterAreas?.length).toBeGreaterThan(0);
    // Bottom-left and bottom-right corners (local Y north-positive); the
    // north-west corner is FMG land.
    expect(inSea(city, [-h + 60, -h])).toBe(true);
    expect(inSea(city, [h, -h])).toBe(true);
    expect(inSea(city, [-h, h])).toBe(false);
  }, 120000);

  it("closes a second run of the coast on its FMG water side", () => {
    const city = generate(payload => {
      const wb = payload.waterbody!;
      // A cape's tip cut off across the north-west corner, travelling with
      // the water on its left (toward the corner).
      wb.shoreline.push([
        [-771, 600],
        [-600, 771]
      ]);
      (wb as { shorelineWaterSide?: string[] }).shorelineWaterSide = wb.shoreline.map((_, i) =>
        i === wb.shoreline.length - 1 ? "left" : "right"
      );
    });
    // The mesh covers that corner here, so check the closed area itself.
    const extra = city.regionalWaterAreas!.filter(ring => pointInPolygon([-h, h], ring));
    expect(extra).toHaveLength(1);
    expect(pointInPolygon([-500, 500], extra[0])).toBe(false);
    expect(pointInPolygon([0, 0], extra[0])).toBe(false);
  }, 120000);

  it("leaves a second run without a recorded water side unpainted", () => {
    const city = generate(payload => {
      payload.waterbody!.shoreline.push([
        [-771, 600],
        [-600, 771]
      ]);
    });
    expect(city.regionalWaterAreas!.some(ring => pointInPolygon([-h, h], ring))).toBe(false);
  }, 120000);

  it("paints FMG lakes and the off-map area beyond the mesh, and keeps them through save", () => {
    const city = generate(payload => {
      (payload as Record<string, unknown>).regionalSurface = {
        features: [
          {
            kind: "water",
            ring: [
              [600, -760],
              [760, -760],
              [760, -640],
              [600, -640]
            ]
          }
        ],
        unknown: [
          [
            [-771, -771],
            [771, -771],
            [771, -740],
            [-771, -740]
          ]
        ]
      };
    });
    const layers = regionalSurfaceLayers(city);
    expect(layers.at(-1)!.parts.some(part => pointInPolygon([-h, -h + 2], part))).toBe(true);
    expect(layers.map(l => l.kind)).toEqual(["water", "unknown"]);
    expect(layers[0].parts.some(part => pointInPolygon([740, -700], part))).toBe(true);
    const reloaded = parseDocument(JSON.stringify(city))!;
    expect(reloaded.regionalSurface).toEqual(city.regionalSurface);
    const svg = renderStandaloneCitySvg(city).outerHTML;
    expect(svg).toContain('data-regional-surface="water"');
    expect(svg).toContain('data-regional-surface="unknown"');
  }, 120000);
});
