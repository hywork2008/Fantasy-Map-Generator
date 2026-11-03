import { describe, expect, it } from "vitest";
import { planBox, planBoxCorners } from "../../buildings/placementContract";
import { placementFootprint } from "../../buildings/placementModels";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import type { CityDocument, Point } from "../types/document";
import { buildBlockFabric } from "./blockInfill";
import { createGridDocument } from "./document";
import { polygonOverlaps } from "./fortifications";
import { removePlacement } from "./freeform/commitPlacement";
import { createFreeformCity, materializeFreeform } from "./freeform/freeformCity";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { nearestOnPolyline, pointInPolygon } from "./geom";
import { DocumentHistory } from "./history";
import { meshFromCells, scaleDocument } from "./mesh";
import { corridor } from "./parcelGeometry";
import { placePlazaMarket } from "./plazaMarket";
import { convertCellsToField } from "./terrainField/cellsToField";

function plaza(width = 40, depth = 30): CityDocument {
  const polygon: Point[] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2]
  ];
  const mesh = meshFromCells([{ id: 0, polygon, site: [0, 0], centroid: [0, 0], neighbors: [], onBorder: false }]);
  mesh.faces.f0.properties = {
    ...mesh.faces.f0.properties,
    water: "land",
    ward: "market",
    settlement: "core",
    buildable: false
  };
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 50 },
    buildingPattern: "medieval",
    historicalPeriod: "highMedieval",
    mesh,
    featureGroups: [],
    gates: [],
    elements: [{ id: "plaza", kind: "plaza", faceIds: ["f0"], point: [0, 0], locked: false }],
    terrain: {
      version: 1,
      features: [],
      field: { version: 1, template: "noise", seed: 1, sampleMeters: 2, parts: [{ kind: "offset", meters: 4 }] }
    }
  };
}

function assertReservations(document: CityDocument) {
  const market = document.markets![0];
  for (const id of market.stallElementIds) {
    const stall = document.elements.find(item => item.id === id)!;
    const footprint = placementFootprint(stall.objectType!, stall.objectQuality)!;
    const plot = planBoxCorners(
      planBox(stall.point!, { halfX: footprint.halfX + 1.2, halfZ: footprint.halfZ + 1.2 }, stall.rotation!)
    );
    expect(plot.every(point => pointInPolygon(point, market.boundary))).toBe(true);
    expect(market.reservedAreas.some(area => polygonOverlaps(plot, area))).toBe(false);
    for (const path of market.accessPaths)
      for (let i = 1; i < path.length; i++)
        expect(polygonOverlaps(plot, corridor(path[i - 1], path[i], 4))).toBe(false);
  }
}

describe("explicit plaza market", () => {
  it("places six reproducible High stalls inside the plaza, faces the aisles and commits one saved operation", () => {
    const source = plaza();
    const before = serializeDocument(source);
    const result = placePlazaMarket(source);
    expect(result.reason).toBeUndefined();
    expect(result.placed).toBe(6);
    expect(serializeDocument(source)).toBe(before);
    expect(placePlazaMarket(source).document).toEqual(result.document);
    assertReservations(result.document);
    const stalls = result.document.elements.filter(item => item.kind === "object");
    expect(stalls.filter(item => item.objectType === "market-produce-stall")).toHaveLength(4);
    expect(stalls.filter(item => item.objectType === "market-goods-booth")).toHaveLength(2);
    for (const stall of stalls) {
      expect(stall.objectQuality).toBe("high");
      expect(Math.cos(stall.rotation!) * -1 * stall.point![1]).toBeLessThan(0);
    }
    const saved = parseDocument(serializeDocument(result.document))!;
    expect(saved).not.toBeNull();
    expect(saved.markets).toEqual(result.document.markets);
    expect(placePlazaMarket(saved)).toMatchObject({ placed: 0, reason: "existing", document: saved });
    const history = new DocumentHistory(source);
    history.commit(result.document);
    expect(history.undo(result.document)?.markets).toBeUndefined();
    expect(history.redo(source)?.markets).toEqual(result.document.markets);
    const removed = removePlacement(saved, saved.markets![0].stallElementIds[0]);
    expect(removed.markets![0].stallElementIds).toHaveLength(5);
    expect(placePlazaMarket(removed).reason).toBe("existing");
    const scaled = scaleDocument(result.document, 2)!;
    expect(scaled.markets![0].boundary[0][0]).toBeCloseTo(saved.markets![0].boundary[0][0] * 2);
    expect(saved.markets).toEqual(result.document.markets);
  });

  it("reduces the stall count in a small plaza and refuses unbounded, missing, locked or Freeform plazas", () => {
    const small = placePlazaMarket(plaza(24, 22));
    expect(small.placed).toBeGreaterThan(0);
    expect(small.placed).toBeLessThan(6);
    assertReservations(small.document);
    const tiny = plaza(8, 8);
    expect(placePlazaMarket(tiny).document).toBe(tiny);
    const none = plaza();
    none.elements = [];
    expect(placePlazaMarket(none).reason).toBe("plaza");
    const locked = plaza();
    locked.elements[0].locked = true;
    expect(placePlazaMarket(locked).reason).toBe("locked");
    const marker = plaza();
    marker.elements[0].faceIds = [];
    expect(placePlazaMarket(marker).reason).toBe("space");
    marker.elements[0].sizeMeters = 56;
    const declared = placePlazaMarket(marker);
    expect(declared.placed).toBeGreaterThan(0);
    assertReservations(declared.document);
    expect(declared.document.markets![0].boundary.every(point => Math.hypot(...point) <= 28)).toBe(true);
    const noField = plaza();
    delete noField.terrain;
    expect(placePlazaMarket(noField).reason).toBe("field");
    expect(placePlazaMarket(materializeFreeform(createFreeformCity(96))).reason).toBe("freeform");
  });

  it("keeps a well, a crossing road and its access clear, routing the four-metre aisles around the well", () => {
    const source = plaza(56, 40);
    source.elements.push({
      id: "well",
      kind: "object",
      objectType: "medievalWell",
      point: [0, 0],
      faceIds: [],
      locked: true
    });
    const well = source.elements[1];
    source.mesh.vertices.r0 = { id: "r0", point: [-28, 6], locked: false };
    source.mesh.vertices.r1 = { id: "r1", point: [28, 6], locked: false };
    source.mesh.edges.road = { id: "road", a: "r0", b: "r1", leftFace: null, rightFace: null, locked: false };
    source.featureGroups.push({
      id: "road",
      kind: "road",
      name: "Market access",
      segments: [{ edgeId: "road", forward: true }],
      style: { widthMeters: 4, color: "#999" },
      locked: false
    });
    const result = placePlazaMarket(source);
    expect(result.placed).toBeGreaterThan(0);
    assertReservations(result.document);
    expect(result.document.elements.find(item => item.id === "well")).toEqual(well);
    const footprint = placementFootprint("medievalWell")!;
    const reserve = planBoxCorners(planBox([0, 0], { halfX: footprint.halfX + 1, halfZ: footprint.halfZ + 1 }, 0));
    for (const path of result.document.markets![0].accessPaths)
      for (let i = 1; i < path.length; i++)
        expect(polygonOverlaps(corridor(path[i - 1], path[i], 4), reserve)).toBe(false);
  });

  it("uses real plaza-edge intersections in a generated hex town and preserves its houses and waterworks", () => {
    const seed = "market-m1-inland";
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = [];
    settings.config.relief = false;
    settings.config.features = { walls: false, citadel: false, plaza: true, temple: true, port: false, shanty: false };
    settings.layout = "organic";
    settings.config.layout = "organic";
    const generated = generateCityOnDocument(createGridDocument({ size: "tiny", grid: "hex", seed }), settings, seed)!;
    const source = convertCellsToField({ ...generated, buildingPattern: "medieval" })!;
    const before = buildBlockFabric(source);
    const result = placePlazaMarket(source);
    expect(result.placed).toBe(6);
    assertReservations(result.document);
    const after = buildBlockFabric(result.document);
    expect(after.buildings).toEqual(before.buildings);
    expect(after.aerialLandmarks?.domesticWater).toEqual(before.aerialLandmarks?.domesticWater);
    const market = result.document.markets![0];
    for (const path of market.accessPaths.slice(0, 4))
      expect(nearestOnPolyline(path[0], [...market.boundary, market.boundary[0]]).dist).toBeLessThan(1e-6);
    expect(parseDocument(serializeDocument(result.document))?.markets).toEqual(result.document.markets);
  });

  it("does not use wet or steep ground and does not replace hand-placed objects", () => {
    const wet = plaza();
    wet.mesh.faces.f0.properties.water = "sea";
    expect(placePlazaMarket(wet).placed).toBe(0);
    const slope = plaza();
    slope.terrain!.field!.parts = [
      {
        kind: "coarse",
        origin: [-100, -100],
        spacingMeters: 200,
        columns: 2,
        rows: 2,
        elevationsMeters: [-100, 100, -100, 100]
      }
    ];
    expect(placePlazaMarket(slope).placed).toBe(0);
    const river = plaza();
    river.waterAreas = [
      {
        kind: "river",
        polygon: [
          [-2, -16],
          [2, -16],
          [2, 16],
          [-2, 16]
        ]
      }
    ];
    expect(placePlazaMarket(river).placed).toBe(0);
    const blocked = plaza();
    blocked.elements.push({
      id: "hand",
      kind: "object",
      objectType: "catalogue:unknown",
      point: [0, 0],
      faceIds: [],
      locked: true
    });
    blocked.terrain!.features.push({
      kind: "platform",
      id: "plot:hand",
      ownerId: "hand",
      role: "pad",
      summit: {
        kind: "polygon",
        points: [
          [-19, -14],
          [19, -14],
          [19, 14],
          [-19, 14]
        ]
      },
      levelMeters: 4,
      edge: { kind: "slope", runMeters: 0 }
    });
    expect(placePlazaMarket(blocked).document).toBe(blocked);
    const file = JSON.parse(serializeDocument(plaza()));
    file.markets = [{ version: 1, setting: "plaza", boundary: [[NaN, 0]] }];
    expect(parseDocument(JSON.stringify(file))).toBeNull();
  });
});
