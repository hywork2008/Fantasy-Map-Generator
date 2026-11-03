import { describe, expect, it } from "vitest";
import { planBox, planBoxCorners } from "../../buildings/placementContract";
import { placementFootprint } from "../../buildings/placementModels";
import { createTownObjects } from "../../city3d/three/objectMeshes";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import type { CityDocument, Point } from "../types/document";
import { type DesignatedMarket, placeDesignatedMarket, setMarketActivity } from "./designatedMarket";
import { polygonOverlaps } from "./fortifications";
import { commitPlacement, removePlacement } from "./freeform/commitPlacement";
import {
  convertDocumentToFreeform,
  createFreeformCity,
  materializeFreeform,
  parseFreeformCity,
  serializeFreeform
} from "./freeform/freeformCity";
import { pointInPolygon } from "./geom";
import { DocumentHistory } from "./history";
import { meshFromCells } from "./mesh";
import { corridor } from "./parcelGeometry";

function fixture(freeform = true): CityDocument {
  const doc = materializeFreeform(createFreeformCity(160, 1, 8));
  doc.historicalPeriod = "highMedieval";
  doc.terrain!.field = {
    version: 1,
    template: "noise",
    seed: 1,
    sampleMeters: 8,
    parts: [{ kind: "offset", meters: 4 }]
  };
  doc.terrain!.ways = [
    {
      id: "main-street",
      centerline: [
        [0, -60],
        [0, 18]
      ],
      widthMeters: 4,
      profile: "slope",
      surface: "dirt",
      grade: "cart"
    }
  ];
  if (!freeform) {
    delete doc.freeform;
    doc.mesh = meshFromCells([
      {
        id: 0,
        site: [0, 0],
        centroid: [0, 0],
        neighbors: [],
        onBorder: true,
        polygon: [
          [-80, -80],
          [80, -80],
          [80, 80],
          [-80, 80]
        ]
      }
    ]);
    doc.mesh.faces.f0.properties = {
      ...doc.mesh.faces.f0.properties,
      water: "land",
      buildable: false,
      ward: null,
      elevation: 4
    };
  }
  return doc;
}
const area: DesignatedMarket = {
  id: "survey",
  setting: "street",
  center: [0, 0],
  widthMeters: 40,
  depthMeters: 30,
  rotationDegrees: 0
};

describe("surveyed market areas", () => {
  it.each([false, true])(
    "saves a street market on %s freeform without creating a false plaza or overlapping its four-metre aisles",
    freeform => {
      const source = fixture(freeform),
        before = JSON.stringify(source);
      const result = placeDesignatedMarket(source, area);
      expect(result.reason).toBeUndefined();
      expect(result.placed).toBe(6);
      expect(JSON.stringify(source)).toBe(before);
      expect(result.document.elements.some(e => e.kind === "plaza")).toBe(false);
      const market = result.document.markets![0];
      expect(market.anchorElementId).toBeUndefined();
      for (const id of market.stallElementIds) {
        const e = result.document.elements.find(e => e.id === id)!;
        const f = placementFootprint(e.objectType!, e.objectQuality)!;
        const plot = planBoxCorners(planBox(e.point!, { halfX: f.halfX + 1.2, halfZ: f.halfZ + 1.2 }, e.rotation!));
        expect(plot.every(p => pointInPolygon(p, market.boundary))).toBe(true);
        for (const path of market.accessPaths)
          for (let i = 1; i < path.length; i++)
            expect(polygonOverlaps(plot, corridor(path[i - 1], path[i], 4))).toBe(false);
      }
      const restored = freeform
        ? materializeFreeform(parseFreeformCity(serializeFreeform(result.document))!)
        : parseDocument(serializeDocument(result.document))!;
      expect(restored.markets).toEqual(result.document.markets);
      expect(placeDesignatedMarket(restored, { ...area, id: "another" }).reason).toBe("existing");
      const history = new DocumentHistory(source);
      history.commit(result.document);
      expect(history.undo(result.document)?.markets).toBeUndefined();
      expect(history.redo(source)?.markets).toEqual(result.document.markets);
      const removed = removePlacement(restored, market.stallElementIds[0]);
      const after = freeform
        ? materializeFreeform(parseFreeformCity(serializeFreeform(removed))!)
        : parseDocument(serializeDocument(removed))!;
      expect(after.markets![0].stallElementIds).toHaveLength(5);
    }
  );

  it("requires a real street, finite bounded land and respects existing private freeform zones", () => {
    const noWay = fixture();
    noWay.terrain!.ways = [];
    expect(placeDesignatedMarket(noWay, area).reason).toBe("street");
    expect(placeDesignatedMarket(fixture(), { ...area, widthMeters: 121 }).reason).toBe("area");
    expect(placeDesignatedMarket(fixture(), { ...area, center: [Infinity, 0] }).reason).toBe("area");
    expect(placeDesignatedMarket(fixture(), { ...area, center: [70, 0] }).reason).toBe("area");
    const privateLand = fixture();
    privateLand.freeform!.zones = [
      {
        id: "field",
        kind: "farm",
        polygon: [
          [-30, -25],
          [30, -25],
          [30, 25],
          [-30, 25]
        ]
      }
    ];
    expect(placeDesignatedMarket(privateLand, area).placed).toBe(0);
    expect(placeDesignatedMarket(fixture(false), { ...area, setting: "freeform" }).reason).toBe("freeform");
  });

  it.each([false, true])(
    "keeps hall entrances clear and preserves %s freeform ownership through removal and conversion",
    freeform => {
      const source = commitPlacement(fixture(freeform), {
        id: "hall",
        modelId: "covered-market-hall",
        quality: "high",
        position: [0, 38],
        facingDegrees: 180,
        footprint: placementFootprint("covered-market-hall", "high")!
      }).document;
      const front = { ...area, setting: "hall-front" as const, hallId: "hall" };
      const result = placeDesignatedMarket(source, front);
      expect(result.reason).toBeUndefined();
      expect(result.placed).toBeGreaterThan(0);
      expect(result.document.markets![0].anchorElementId).toBe("hall");
      const wrong = { ...front, center: [0, 65] as Point, widthMeters: 25, depthMeters: 20 };
      expect(placeDesignatedMarket(source, wrong).placed).toBe(0);
      expect(placeDesignatedMarket(source, { ...front, center: [0, 20], depthMeters: 40 }).reason).toBe("hall");
      const loaded = freeform
        ? materializeFreeform(parseFreeformCity(serializeFreeform(result.document))!)
        : parseDocument(serializeDocument(result.document))!;
      expect(loaded.markets).toEqual(result.document.markets);
      const removed = removePlacement(loaded, "hall");
      expect(removed.markets![0].anchorElementId).toBeUndefined();
      expect(removed.markets![0].setting).toBe(freeform ? "freeform" : "street");
      if (!freeform) {
        const converted = convertDocumentToFreeform(result.document)!;
        const reload = materializeFreeform(parseFreeformCity(serializeFreeform(converted))!);
        expect(reload.markets![0].anchorElementId).toBe("hall");
        expect(reload.elements.some(e => e.id === "hall")).toBe(true);
      }
    }
  );

  it("closes only owned unlocked stalls, keeps plots and states through the freeform ledger, and reopens in place", () => {
    const populated = placeDesignatedMarket(fixture(), { ...area, setting: "freeform" }).document;
    const market = populated.markets![0];
    populated.elements[0].locked = true;
    const closed = setMarketActivity(populated, market.id, "closed")!;
    const restored = materializeFreeform(parseFreeformCity(serializeFreeform(closed))!);
    expect(restored.markets![0].activity).toBe("closed");
    expect(restored.elements[0].locked).toBe(true);
    expect(restored.elements.filter(e => e.objectMarketActivity === "closed")).toHaveLength(5);
    expect(restored.terrain!.features).toEqual(populated.terrain!.features);
    const objects = createTownObjects(restored.elements);
    expect(objects.accepted).toHaveLength(1);
    objects.dispose();
    const reopened = setMarketActivity(restored, market.id, "market-day")!;
    expect(reopened.elements.map(e => e.point)).toEqual(populated.elements.map(e => e.point));
    expect(reopened.elements.map(e => e.objectQuality)).toEqual(populated.elements.map(e => e.objectQuality));
    const old = fixture().freeform!;
    expect(parseFreeformCity(JSON.stringify(old))!.markets).toBeUndefined();
    restored.markets![0].activity = "invalid" as "closed";
    expect(parseFreeformCity(serializeFreeform(restored))).toBeNull();
  });
});
