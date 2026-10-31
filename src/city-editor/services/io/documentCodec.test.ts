import { describe, expect, it } from "vitest";
import { historicLandmarkPrototypes } from "../../assets/catalog";
import { withBuildingAppearance } from "../../generators/buildingAppearance";
import { createDocument } from "../../generators/document";
import { parseDocument, serializeDocument } from "./documentCodec";

// These are the same bytes used by exportCityMap, not a test-only JSON path.
describe("native document codec", () => {
  it("round-trips appearance snapshots without upgrading old cities on load", () => {
    const document = createDocument("appearance-codec", 400);
    delete document.buildingAppearanceVersion;
    const legacy = parseDocument(serializeDocument(document))!;
    expect(legacy.buildingAppearanceVersion).toBeUndefined();
    expect(legacy.buildingAppearanceContext).toBeUndefined();
    const upgraded = withBuildingAppearance(
      { ...legacy, buildingAppearanceClimate: "wet-forest", buildingWallFinish: "limewash" },
      "stone-upland"
    );
    expect(parseDocument(serializeDocument(upgraded))).toEqual(upgraded);
    for (const invalid of [
      { buildingAppearanceVersion: 2 },
      { buildingAppearanceProfile: "unknown" },
      { buildingAppearanceClimate: "unknown" },
      { buildingAppearanceClimate: 3 },
      { buildingWallFinish: "unknown" },
      { buildingWallFinish: 3 },
      { buildingAppearanceContext: { period: "highMedieval", forest: "yes" } }
    ])
      expect(parseDocument(JSON.stringify({ ...document, ...invalid }))).toBeNull();
  });
  it.each([2, 3, 4] as const)("preserves persisted fields and order for schema %i", version => {
    const document = createDocument("codec-phase6", 400);
    document.buildingPattern = "medieval";
    document.regionalSurface = {
      features: [
        {
          kind: "land",
          ring: [
            [0, 0],
            [10, 0],
            [0, 10]
          ]
        }
      ],
      unknown: [
        [
          [20, 20],
          [30, 20],
          [20, 30]
        ]
      ]
    };
    document.riverFlows = [
      {
        riverId: 7,
        points: [
          [0, 0],
          [0, 20]
        ],
        widthMeters: 4
      }
    ];
    if (version >= 3) document.landmarkAssets = structuredClone(historicLandmarkPrototypes);
    if (version === 4)
      document.sceneRegions = {
        version: 1,
        coreBoundary: [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100]
        ],
        regionalContext: {
          version: 1,
          sourceRevision: "codec-test",
          coverageBounds: { minX: -200, minY: -200, maxX: 200, maxY: 200 },
          roads: [],
          settlements: []
        },
        connectors: []
      };
    const before = JSON.stringify(document);
    const encoded = serializeDocument(document);
    const loaded = parseDocument(encoded);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual({ ...document, version });
    expect(serializeDocument(loaded!)).toBe(encoded);
    expect(JSON.stringify(document)).toBe(before);
  });
  it("keeps legacy defaults and rejects malformed input", () => {
    const document = createDocument("codec-legacy", 400);
    const legacy = JSON.parse(JSON.stringify(document));
    legacy.version = 1;
    delete legacy.gates;
    delete legacy.frame.blockSizeMeters;
    const loaded = parseDocument(JSON.stringify(legacy));
    expect(loaded?.gates).toEqual([]);
    expect(loaded?.frame.blockSizeMeters).toBe(50);
    expect(parseDocument("{")).toBeNull();
    expect(parseDocument(JSON.stringify({ ...document, version: 99 }))).toBeNull();
  });
});

it("persists the elevation tint switch and rejects invalid values", () => {
  const document = createDocument("elevation-tint-codec", 400);
  for (const showElevationTint of [false, true]) {
    expect(parseDocument(serializeDocument({ ...document, showElevationTint }))?.showElevationTint).toBe(
      showElevationTint
    );
  }
  expect(parseDocument(JSON.stringify({ ...document, showElevationTint: "false" }))).toBeNull();
});
