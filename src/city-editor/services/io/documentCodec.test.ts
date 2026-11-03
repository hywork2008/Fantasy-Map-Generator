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

it("preserves cargo berth assignments while legacy ships need no new fields", () => {
  const document = createDocument("cargo-berth-codec", 400);
  const point: [number, number] = [10, 20];
  const assignment = {
    kind: "cargo-quay" as const,
    shipType: "barge" as const,
    berthId: "q",
    craneId: "c",
    cargoAccessId: "barge:deck-handover",
    point,
    rotation: 0,
    length: 18,
    hook: point,
    landDrop: [28, 20] as [number, number],
    swingAngleRad: Math.PI
  };
  document.elements.push({
    id: "cargo-barge",
    kind: "ship",
    locked: false,
    faceIds: [Object.keys(document.mesh.faces)[0]],
    point,
    rotation: 0,
    sizeMeters: 18,
    shipType: "barge",
    harborOperation: assignment
  });
  const saved = parseDocument(serializeDocument(document))!;
  expect(saved).not.toBeNull();
  expect(saved.elements.find(e => e.id === "cargo-barge")?.harborOperation).toEqual(assignment);
  delete document.elements.find(e => e.id === "cargo-barge")!.harborOperation;
  expect(
    parseDocument(serializeDocument(document))!.elements.find(e => e.id === "cargo-barge")?.harborOperation
  ).toBeUndefined();
});

it("persists ship state and rejects malformed states while accepting legacy ships", () => {
  const city = createDocument("ship-state-codec", 400);
  city.elements.push({
    id: "ship-state",
    kind: "ship",
    faceIds: [],
    point: [0, 0],
    locked: false,
    shipType: "large",
    shipState: { sails: "furled", gunports: "closed" }
  });
  expect(parseDocument(serializeDocument(city))!.elements.find(e => e.id === "ship-state")!.shipState).toEqual({
    sails: "furled",
    gunports: "closed"
  });
  for (const invalid of [
    null,
    "furled",
    { sails: "broken", gunports: "closed" },
    { sails: "set", gunports: "ajar" },
    { sails: "set" }
  ]) {
    const copy = JSON.parse(JSON.stringify(city));
    copy.elements.find((e: { id: string }) => e.id === "ship-state").shipState = invalid;
    expect(parseDocument(JSON.stringify(copy))).toBeNull();
  }
  delete city.elements.find(e => e.id === "ship-state")!.shipState;
  expect(parseDocument(serializeDocument(city))).not.toBeNull();
});
