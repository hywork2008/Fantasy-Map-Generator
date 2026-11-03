import { describe, expect, it } from "vitest";
import { planBox, planBoxCorners } from "../../buildings/placementContract";
import { placementFootprint } from "../../buildings/placementModels";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import type { CityDocument, Point } from "../types/document";
import { buildBlockFabric } from "./blockInfill";
import { createSizedDocument } from "./document";
import { polygonOverlaps } from "./fortifications";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { pointInPolygon, polygonCentroid } from "./geom";
import { type CargoQuay, solveCargoBerth } from "./harborCargo";
import { pruneInvalidHarbors } from "./harborLand";
import { placeHarborMarket } from "./harborMarket";
import { DocumentHistory } from "./history";
import { marketHarborReservations } from "./marketHarborReservations";
import { meshFromCells } from "./mesh";
import { corridor } from "./parcelGeometry";
import { placePlazaMarket } from "./plazaMarket";
import { convertCellsToField } from "./terrainField/cellsToField";

function fixture(river = false): CityDocument {
  const rect = (x0: number, x1: number, y0 = -80, y1 = 80): Point[] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1]
  ];
  const polygons = [rect(-120, 0), rect(0, 100), rect(100, 180), rect(180, 240, -20, 20)];
  const mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: false
    }))
  );
  for (const [i, face] of Object.values(mesh.faces).entries())
    Object.assign(face.properties, {
      water: i === 0 ? (river ? "openWater" : "sea") : "land",
      ward: i === 1 ? "harbor" : i === 3 ? "market" : "merchant",
      buildable: i !== 0 && i !== 3,
      settlement: "core",
      elevation: i ? 4 : 0,
      depth: 6
    });
  const roadEdges = Object.values(mesh.edges).filter(
    edge => mesh.vertices[edge.a].point[0] === 100 && mesh.vertices[edge.b].point[0] === 100
  );
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 600, cityRadiusMeters: 250, blockSizeMeters: 50 },
    historicalPeriod: "highMedieval",
    buildingPattern: "legacy",
    buildingHeightLimit: { maxStoreys: 0 },
    mesh,
    gates: [],
    featureGroups: [
      {
        id: "street",
        kind: "road",
        name: "Back street",
        segments: roadEdges.map(edge => ({ edgeId: edge.id, forward: true })),
        style: { widthMeters: 5, color: "#999" },
        locked: false
      }
    ],
    elements: [
      {
        id: "harbor",
        kind: "harbor",
        point: [50, 0],
        faceIds: ["f1"],
        harborKind: river ? "river" : "sea",
        locked: false
      },
      { id: "plaza", kind: "plaza", point: [210, 0], faceIds: ["f3"], locked: false }
    ],
    terrain: {
      version: 1,
      features: [],
      field: { version: 1, template: "noise", seed: 1, sampleMeters: 4, parts: [{ kind: "offset", meters: 4 }] }
    },
    ...(river
      ? {
          waterAreas: [{ kind: "river" as const, polygon: polygons[0] }],
          waterAccess: {
            river: true,
            sea: false,
            lake: false,
            riverId: 1,
            seaFeatureIds: [],
            lakeFeatureIds: [],
            port: { river: true, sea: false, lake: false }
          }
        }
      : {})
  };
}

describe("harbor market", () => {
  it.each([false, true])(
    "keeps %s port freight clear, preserves the harbor plan, and reloads alongside a central market",
    river => {
      const source = fixture(river);
      source.elements.push({
        id: "manual-barge",
        kind: "ship",
        point: [-30, 0],
        faceIds: ["f0"],
        harborFaceId: "f1",
        shipType: "barge",
        sizeMeters: 18,
        rotation: 0,
        locked: true
      });
      const before = buildBlockFabric(source);
      expect(before.harbor?.piers.length).toBeGreaterThan(0);
      const central = placePlazaMarket(source);
      expect(central.placed).toBeGreaterThan(0);
      const result = placeHarborMarket(central.document);
      expect(result.reason).toBeUndefined();
      expect(result.placed).toBeGreaterThan(0);
      expect(result.document.markets).toHaveLength(2);
      const market = result.document.markets!.find(site => site.setting !== "plaza")!;
      expect(market.setting).toBe(river ? "river-port" : "sea-port");
      const freight = marketHarborReservations(source, before);
      for (const id of market.stallElementIds) {
        const stall = result.document.elements.find(item => item.id === id)!;
        expect(stall.harborFaceId).toBe("f1");
        const footprint = placementFootprint(stall.objectType!, stall.objectQuality)!;
        const plot = planBoxCorners(
          planBox(stall.point!, { halfX: footprint.halfX + 1.2, halfZ: footprint.halfZ + 1.2 }, stall.rotation!)
        );
        expect(freight.areas.some(area => polygonOverlaps(plot, area))).toBe(false);
      }
      for (const path of market.accessPaths)
        for (let i = 1; i < path.length; i++)
          expect(freight.areas.some(area => polygonOverlaps(corridor(path[i - 1], path[i], 4), area))).toBe(false);
      const after = buildBlockFabric(result.document);
      expect(after.harbor).toEqual(before.harbor);
      expect(after.aerialLandmarks?.quayWarehouses).toEqual(before.aerialLandmarks?.quayWarehouses);
      expect(result.document.elements.filter(item => item.kind === "ship")).toEqual(
        source.elements.filter(item => item.kind === "ship")
      );
      const saved = parseDocument(serializeDocument(result.document))!;
      expect(saved.markets).toEqual(result.document.markets);
      expect(placeHarborMarket(saved).reason).toBe("existing");
      const history = new DocumentHistory(central.document);
      history.commit(result.document);
      expect(history.undo(result.document)?.markets).toHaveLength(1);
      expect(history.redo(central.document)?.markets).toHaveLength(2);
    }
  );

  it("reserves cargo berth water, the full swept load, stock piles and every warehouse side", () => {
    const source = fixture();
    const base = buildBlockFabric(source);
    const quay: CargoQuay = {
      id: "working-quay",
      craneId: "working-crane",
      landFaceId: "f1",
      waterFaceId: "f0",
      a: [0, -40],
      b: [0, 40],
      outward: [-1, 0],
      water: [
        [-120, -80],
        [0, -80],
        [0, 80],
        [-120, 80]
      ],
      depth: 6,
      axis: [3.6, 0],
      reach: 9,
      pulleyHeight: 8,
      waterBelowQuay: 1,
      transferHeight: 6.5,
      landDrop: [12.6, 0],
      swingDirections: [-1, 1],
      reservedWater: [
        [-12, -40],
        [-1, -40],
        [-1, 40],
        [-12, 40]
      ]
    };
    const operation = solveCargoBerth(quay, "barge", 18, () => true)!;
    source.elements.push({
      id: "loading",
      kind: "ship",
      faceIds: ["f0"],
      point: operation.point,
      rotation: operation.rotation,
      shipType: "barge",
      sizeMeters: 18,
      harborOperation: operation.assignment,
      locked: false
    });
    const fabric = {
      ...base,
      harbor: {
        ...base.harbor!,
        cargoQuays: [quay],
        cranes: [
          {
            id: "working-crane",
            kind: "treadwheel" as const,
            point: [3.6, 0] as Point,
            armAngleRad: Math.PI,
            radiusMeters: 4,
            armLengthMeters: 9
          }
        ],
        cargoPiles: [
          {
            id: "stock",
            kind: "crates" as const,
            point: [22, 20] as Point,
            widthMeters: 4,
            heightMeters: 2,
            rotation: 0
          }
        ]
      },
      aerialLandmarks: {
        ...base.aerialLandmarks!,
        quayWarehouses: [
          {
            id: "store",
            layout: "quayRow" as const,
            name: "Store",
            footprint: [
              [30, -30],
              [50, -30],
              [50, -10],
              [30, -10]
            ] as Point[],
            areaM2: 400,
            storeys: 2,
            mainGoods: [],
            queuedSlots: 0,
            year: 1250
          }
        ]
      }
    };
    const result = marketHarborReservations(source, fabric);
    for (const point of [
      [-8, 30],
      [3.6, 9],
      [22, 20],
      [30, -20],
      [50, -20]
    ] as Point[])
      expect(result.areas.some(area => pointInPolygon(point, area))).toBe(true);
    expect(result.cargoAccessPaths).toContainEqual([operation.assignment.hook, operation.assignment.landDrop]);
    expect(result.cargoAccessPaths.some(path => path.some(point => point[0] === 50))).toBe(true);
  });

  it("leaves an occupied generated port intact when its remaining land cannot take a market", () => {
    const settings = defaultGenerationSettings();
    settings.config.coast = "straight";
    settings.config.rivers = [];
    settings.config.relief = false;
    settings.config.features = { walls: false, citadel: false, plaza: true, temple: true, port: true, shanty: false };
    settings.buildingPattern = "medieval";
    settings.historicalPeriod = "highMedieval";
    const raw = generateCityOnDocument(createSizedDocument("tiny", "crane-port"), settings, "reference-town")!;
    const city = convertCellsToField(raw)!;
    const result = placeHarborMarket(city);
    expect(result).toMatchObject({ placed: 0, reason: "space" });
    expect(result.document).toBe(city);
    expect(buildBlockFabric(city).harbor!.cranes.length).toBeGreaterThan(0);
  });

  it("removes unpinned port stalls and their pads when their harbor land is flooded, preserving the central market", () => {
    const source = placePlazaMarket(fixture()).document;
    const result = placeHarborMarket(source).document;
    const flooded = structuredClone(result);
    const port = flooded.markets!.find(market => market.setting === "sea-port")!;
    flooded.mesh.faces.f1.properties.water = "sea";
    pruneInvalidHarbors(flooded);
    expect(flooded.markets).toHaveLength(1);
    expect(flooded.markets![0].setting).toBe("plaza");
    expect(flooded.elements.some(element => port.stallElementIds.includes(element.id))).toBe(false);
    expect(
      flooded.terrain!.features.some(
        feature => feature.kind === "platform" && port.stallElementIds.includes(feature.ownerId ?? "")
      )
    ).toBe(false);
    expect(flooded.elements.filter(element => element.kind === "object")).toHaveLength(6);
  });

  it("requires a served dry harbor and respects locks and the height-field prerequisite", () => {
    const noMarker = fixture();
    noMarker.elements = noMarker.elements.filter(item => item.kind !== "harbor");
    expect(placeHarborMarket(noMarker).reason).toBe("harbor");
    const noBerth = fixture();
    noBerth.featureGroups = [];
    expect(placeHarborMarket(noBerth).placed).toBe(0);
    const locked = fixture();
    locked.elements[0].locked = true;
    expect(placeHarborMarket(locked).reason).toBe("locked");
    const wet = fixture();
    wet.mesh.faces.f1.properties.water = "sea";
    expect(placeHarborMarket(wet).placed).toBe(0);
    const unauthorized = fixture(true);
    unauthorized.waterAccess!.port.river = false;
    expect(placeHarborMarket(unauthorized).reason).toBe("harbor");
    const field = fixture();
    delete field.terrain;
    expect(placeHarborMarket(field).reason).toBe("field");
  });
});
