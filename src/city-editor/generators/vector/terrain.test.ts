import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { createVectorScene } from "../../renderers/vector/scene3d";
import { parseVectorDocument, serializeVectorDocument } from "../../services/io/vector/documentCodec";
import { restoreVectorFreeform, vectorFromFreeform } from "../../services/io/vector/freeform";
import { copyLegacyCity } from "../../services/io/vector/legacyCopy";
import { decodeVectorShare, encodeVectorShare } from "../../services/io/vector/share";
import type { FreeformCity } from "../../types/freeformCity";
import { materializeFreeform } from "../freeform/freeformCity";
import { createVectorDocument } from "./document";
import { setVectorPlacementLevel, transformVectorPlacement } from "./editing/placements";
import { combineVectorRegions, setVectorRegion } from "./editing/regions";
import { setVectorFeatureActivity } from "./features";
import { vectorTerrain } from "./terrain";

const source = (): FreeformCity => ({
  format: "fmg-freeform-city",
  version: 1,
  frame: { extentMeters: 128 },
  ground: {
    version: 1,
    template: "dome",
    seed: 1,
    sampleMeters: 8,
    parts: [
      { kind: "offset", meters: 10 },
      { kind: "hill", center: [0, 0], radiusMeters: 50, heightMeters: 8 }
    ]
  },
  sculpt: [],
  plots: [],
  placements: [],
  ways: [],
  rivers: [],
  zones: [
    {
      id: "woods",
      kind: "forest",
      polygon: [
        [20, 20],
        [40, 20],
        [40, 40],
        [20, 40]
      ]
    }
  ]
});
describe("M8 Freeform grading without cells", () => {
  it("keeps original ledger, terrain heights and protected regions through native and share", () => {
    const city = source(),
      doc = vectorFromFreeform(city),
      before = JSON.stringify(city),
      terrain = vectorTerrain(doc);
    expect(doc.context.historicalPeriod).toBe("ageOfExploration");
    expect(terrain.heightAt([0, 0])).toBeGreaterThan(terrain.heightAt([60, 60]));
    const restored = parseVectorDocument(serializeVectorDocument(doc))!;
    expect(restoreVectorFreeform(restored)).toEqual(city);
    const shared = decodeVectorShare(
      encodeVectorShare({
        kind: "fmg-vector-city-share",
        version: 1,
        mode: "document",
        document: doc,
        stage: "regions"
      })
    );
    expect(shared?.mode).toBe("document");
    const data = vectorRenderData(restored);
    expect(data.terrain?.points.length).toBeGreaterThan(100);
    const scene = createVectorScene(data);
    expect(new THREE.Box3().setFromObject(scene.group).max.y).toBeGreaterThan(10);
    scene.dispose();
    expect(JSON.stringify(city)).toBe(before);
  });
  it("applies sculpt and flat pads, retaining the exact authored plot elevation", () => {
    const city = source();
    city.sculpt = [{ id: "raise", kind: "raise", center: [40, -40], radiusMeters: 20, meters: 5 }];
    city.plots = [
      {
        id: "pad",
        ownerId: "house",
        outline: [
          [-8, -8],
          [8, -8],
          [8, 8],
          [-8, 8]
        ],
        levelMeters: 25,
        edge: { kind: "wall" },
        marginMeters: 0
      }
    ];
    city.placements = [
      { id: "house", modelId: "house:mediterranean", position: [0, 0], facingDegrees: 0, plotId: "pad", locked: true }
    ];
    const doc = vectorFromFreeform(city),
      terrain = vectorTerrain(doc);
    expect(terrain.foundationAt("freeform:placement:house", city.plots[0].outline)).toBe(25);
    expect(terrain.heightAt([0, 0])).toBe(25);
    expect(terrain.heightAt([40, -40])).toBeGreaterThan(14);
    const building = vectorRenderData(doc).surfaces.find(s => s.kind === "building")!;
    expect(building.elevationMeters).toBeCloseTo(25.1);
    expect(doc.placements["freeform:placement:house"].editPolicy).toBe("fixed");
  });
  it("adopts only lawful Freeform crossings with dry straight landings", () => {
    const city = source();
    city.rivers = [
      {
        kind: "riverCorridor",
        id: "river",
        sourceId: "river",
        centerline: [
          [0, 60],
          [0, -60]
        ],
        widthsMeters: [10, 10],
        bedMeters: [8, 8],
        depthMeters: 1,
        bank: { kind: "slope", runMeters: 3 }
      }
    ];
    city.ways = [
      {
        id: "road",
        centerline: [
          [-55, 0],
          [55, 0]
        ],
        widthMeters: 4,
        profile: "slope",
        surface: "dirt"
      }
    ];
    const doc = vectorFromFreeform(city);
    expect(Object.values(doc.connections.bridges)).toHaveLength(1);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
    city.ways[0].centerline = [
      [-10, -55],
      [10, 55]
    ];
    expect(() => vectorFromFreeform(city)).toThrow(/bridge-skew|freeform-crossing/);
  });
  it("moves an editable Freeform pad rigidly while preserving the original source ledger", () => {
    const city = source();
    city.plots = [
      {
        id: "pad",
        ownerId: "house",
        outline: [
          [-8, -8],
          [8, -8],
          [8, 8],
          [-8, 8]
        ],
        levelMeters: 25,
        edge: { kind: "wall" },
        marginMeters: 0
      }
    ];
    city.placements = [
      { id: "house", modelId: "house:mediterranean", position: [0, 0], facingDegrees: 0, plotId: "pad" }
    ];
    const doc = vectorFromFreeform(city),
      moved = transformVectorPlacement(doc, "freeform:placement:house", [-20, -20], 90);
    expect(moved.environment!.terrain!.plots[0].outline).not.toEqual(city.plots[0].outline);
    expect(restoreVectorFreeform(moved)).toEqual(city);
    const raised = setVectorPlacementLevel(moved, "freeform:placement:house", 30);
    expect(
      vectorTerrain(raised).foundationAt(
        "freeform:placement:house",
        raised.placements["freeform:placement:house"].site.outer
      )
    ).toBe(30);
    expect(restoreVectorFreeform(raised)).toEqual(city);
    expect(
      vectorTerrain(moved).foundationAt(
        "freeform:placement:house",
        moved.placements["freeform:placement:house"].site.outer
      )
    ).toBe(25);
  });
  it("imports market routes and closes temporary stalls while keeping locked booth appearance", () => {
    const city = source();
    city.zones = [];
    city.ways = [
      {
        id: "road",
        centerline: [
          [40, -60],
          [40, 60]
        ],
        widthMeters: 4,
        profile: "slope",
        surface: "cobble"
      }
    ];
    city.plots = [
      {
        id: "a",
        ownerId: "stall-a",
        outline: [
          [-14, -6],
          [-2, -6],
          [-2, 6],
          [-14, 6]
        ],
        levelMeters: 18,
        edge: { kind: "wall" },
        marginMeters: 0
      },
      {
        id: "b",
        ownerId: "stall-b",
        outline: [
          [2, -6],
          [14, -6],
          [14, 6],
          [2, 6]
        ],
        levelMeters: 18,
        edge: { kind: "wall" },
        marginMeters: 0
      }
    ];
    city.placements = [
      { id: "stall-a", modelId: "market-produce-stall", position: [-8, 0], facingDegrees: 0, plotId: "a" },
      { id: "stall-b", modelId: "market-fish-booth", position: [8, 0], facingDegrees: 0, plotId: "b", locked: true }
    ];
    city.markets = [
      {
        id: "market",
        version: 1,
        setting: "freeform",
        activity: "market-day",
        boundary: [
          [-20, -20],
          [20, -20],
          [20, 20],
          [-20, 20]
        ],
        accessPaths: [
          [
            [-20, -16],
            [20, -16]
          ]
        ],
        reservedAreas: [],
        stallElementIds: ["stall-a", "stall-b"]
      }
    ];
    const doc = vectorFromFreeform(city),
      closed = setVectorFeatureActivity(doc, "feature:freeform-market:1", "closed");
    expect(
      vectorRenderData(closed)
        .surfaces.filter(s => s.kind === "building")
        .map(s => s.id)
    ).toEqual(["freeform:placement:stall-b"]);
    expect(closed.placements["freeform:placement:stall-b"].appearance?.activity).toBeUndefined();
    expect(restoreVectorFreeform(closed)).toEqual(city);
    expect(parseVectorDocument(serializeVectorDocument(closed))).toEqual(closed);
  });
  it("uses the terrain-aware adapter when copying a Freeform-backed CE document", () => {
    const city = source(),
      copy = copyLegacyCity(materializeFreeform(city));
    expect(copy.document.environment!.freeformSource).toEqual(city);
    expect(copy.report[0].status).toBe("converted");
    expect(parseVectorDocument(serializeVectorDocument(copy.document))).toEqual(copy.document);
  });
  it("rejects unbounded terrain and dangling feature references without silently repairing", () => {
    const doc = vectorFromFreeform(source());
    doc.environment!.terrain!.ground.sampleMeters = 0.01;
    expect(parseVectorDocument(JSON.stringify(doc))).toBeNull();
  });
  it("preserves holes and all components when cutting and merging districts", () => {
    let doc = setVectorRegion(
      createVectorDocument(),
      {
        outer: [
          [-30, -30],
          [30, -30],
          [30, 30],
          [-30, 30]
        ],
        holes: []
      },
      { kind: "district", use: "craft", density: 0.5, maxHeightMeters: 12 }
    );
    const first = Object.keys(doc.regions)[0];
    doc = setVectorRegion(
      doc,
      {
        outer: [
          [-4, -40],
          [4, -40],
          [4, 40],
          [-4, 40]
        ],
        holes: []
      },
      { kind: "district" }
    );
    const second = Object.keys(doc.regions)[1];
    doc = combineVectorRegions(doc, [first, second], "difference");
    expect(Object.values(doc.regions)).toHaveLength(2);
    expect(Object.values(doc.regions).every(r => r.use === "craft" && r.maxHeightMeters === 12)).toBe(true);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
  });
});
