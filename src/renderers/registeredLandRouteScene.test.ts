import { describe, expect, it, vi } from "vitest";
import { createGridDocument, parseDocument } from "../city-editor/core/document";
import {
  adoptFixedCrossingApproaches,
  restoreFixedCrossingApproaches
} from "../city-editor/core/fixedApproachAdoption";
import { findFixedCrossingApproach } from "../city-editor/core/fixedCrossingApproach";
import { buildBlockFabric } from "../city-editor/core/gen/blockInfill";
import { buildCityBuildings } from "../city-editor/core/gen/buildingLots";
import { DEFAULT_SITE_CONFIG } from "../city-editor/core/gen/site/siteConfig";
import { synthSite } from "../city-editor/core/gen/site/synthSite";
import { defaultGenerationSettings, generateStageOnDocument } from "../city-editor/core/generate";
import { DocumentHistory } from "../city-editor/core/history";
import { applyImportedFixedCrossings } from "../city-editor/core/importedFixedCrossings";
import { meshFromCells } from "../city-editor/core/mesh";
import { lineHitsDocumentWater, polygonHitsDocumentWater } from "../city-editor/core/waterGeometry";
import * as cityEditorFiles from "../city-editor/io/cityEditorFile";
import { readCityMap } from "../city-editor/io/cityEditorFile";
import {
  decodeShare,
  encodeShare,
  parseDescriptor,
  parseIncomingPayload,
  shareFromDescriptor
} from "../city-editor/io/incomingCity";
import { drawFixedBurgCrossings } from "../city-editor/render/fixedBurgCrossings";
import { fixedRoadIsDry } from "../city-editor/render/fixedDocumentGeometry";
import { renderFixedSitePreview } from "../city-editor/render/fixedSitePreview";
import { renderStandaloneCitySvg } from "../city-editor/render/svg";
import { mountCityEditor } from "../city-editor/ui/CityEditorPage";
import { type ApproachCorridorInput, findApproachCorridor } from "../generators/approachCorridorSearch";
import {
  buildConstrainedLandNetwork,
  type NetworkConnection,
  type NetworkCorridor,
  type NetworkNode
} from "../generators/constrainedLandNetwork";
import { createLandConnectionRegistry } from "../generators/landConnectionAdoption";
import { type CrossingCandidateInput, createProvisionalRiverCrossing } from "../generators/riverCrossingCandidates";
import { exportFixedBurgCrossings } from "../services/fixedBurgCrossings";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../services/physicalWaterIndex";
import { buildPolylineRiverAxis, type RiverPoint } from "../services/riverGeometry";
import { validFixedBurgCrossings } from "../utils/fixedBurgCrossings";
import { drawRegisteredLandRoutes } from "./draw-registered-land-routes";
import { buildRegisteredLandRouteScene, type RegisteredRouteSceneSettings } from "./registeredLandRouteScene";
import { buildRegisteredLandRouteLayers, type RegisteredRoutePolygon } from "./webgl/registeredLandRouteLayers";

const settings: RegisteredRouteSceneSettings = {
  metresPerUnit: 1,
  originMeters: [0, 0],
  maxChordErrorMeters: 0.05,
  maxArcSections: 100,
  maxPieces: 100,
  maxPaths: 100,
  maxPolygons: 1000
};
function fixture(curved = false) {
  const state = { allows: true, supports: true };
  const source: CrossingCandidateInput = {
    id: 5,
    arcLengthMeters: 100,
    geometry: {
      axis: buildPolylineRiverAxis(7, 1, [
        [0, -100],
        [0, 100]
      ])!,
      water: {
        id: 7,
        rings: [
          [
            [-5, -100],
            [5, -100],
            [5, 100],
            [-5, 100]
          ]
        ],
        bankReferences: [
          [null, { side: "right", arcStart: 0, arcEnd: 200 }, null, { side: "left", arcStart: 200, arcEnd: 0 }]
        ]
      }
    },
    dimensions: { bankSeatMeters: 1, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 5 },
    otherWater: [],
    capability: { depthMeters: 3 },
    supportsDryFootprint: () => true
  };
  const environment = {
    water: PhysicalWaterIndex.build([source.geometry.water], new PhysicalWaterValidationCache())!,
    supportsDryFootprint: () => state.supports,
    allowsBridgeFootprint: () => state.allows,
    crossingInputAt: () => source
  };
  function corridor(points: RiverPoint[], goalTangent: RiverPoint): NetworkCorridor {
    const input: ApproachCorridorInput = {
      nodes: points.map((point, id) => ({ id, point, neighbors: id + 1 < points.length ? [id + 1] : [] })),
      startNodeId: 0,
      goalNodeId: points.length - 1,
      goalTangent,
      settings: {
        roadWidthMeters: 2,
        minimumTurnRadiusMeters: 4,
        minimumStraightMeters: 0,
        minimumFinalStraightMeters: 2,
        turnPenaltyMetersPerRadian: 0,
        maxEnvelopeErrorMeters: 0.05,
        maxArcSections: 100,
        maxNodes: 100,
        maxEdges: 500,
        maxLabels: 2000,
        maxExpansions: 2000
      },
      ...environment
    };
    const result = findApproachCorridor(input);
    if (!("corridor" in result)) throw Error(result.reason);
    return { input, corridor: result.corridor };
  }
  let nodes: NetworkNode[], connections: NetworkConnection[];
  if (curved) {
    nodes = [
      { id: 1, point: [30, 0] },
      { id: 2, point: [30, 10] }
    ];
    connections = [
      {
        id: 1,
        from: 1,
        to: 2,
        bidirectional: false,
        kind: "land",
        land: corridor(
          [
            [30, 0],
            [40, 0],
            [40, 10],
            [30, 10]
          ],
          [-1, 0]
        )
      }
    ];
  } else {
    const made = createProvisionalRiverCrossing({ ...source, waterIndex: environment.water });
    if (!("candidate" in made)) throw Error(made.reason);
    const crossing = made.candidate;
    nodes = [
      { id: 1, point: [30, 0] },
      { id: 2, point: [-30, 0] },
      { id: 3, point: [35, 0] }
    ];
    connections = [1, 3].map((id, i) => ({
      id: i + 1,
      from: id,
      to: 2,
      bidirectional: true,
      kind: "bridge",
      crossing,
      crossingInput: source,
      approachA: corridor([nodes.find(n => n.id === id)!.point, crossing.approachA], [-1, 0]),
      approachB: corridor([[-30, 0], crossing.approachB], [1, 0]),
      constructionCostMeters: 20,
      useCostMeters: 3
    }));
  }
  const input = {
    nodes,
    connections,
    roadWidthMeters: 2,
    maxNodes: 100,
    maxEdges: 100,
    maxCorridorPieces: 1000,
    maxGuideNodes: 1000,
    maxGuideEdges: 5000,
    environment
  };
  const built = buildConstrainedLandNetwork(input);
  if (!("network" in built)) throw Error(built.reason);
  const created = createLandConnectionRegistry(built.network, environment, input);
  if (!("registry" in created)) throw Error(created.reason);
  const snapshot = created.registry.snapshot,
    current = { environment, nodePointAt: (id: number) => nodes.find(n => n.id === id)?.point ?? null };
  return {
    snapshot,
    current,
    state,
    source,
    build: (extra: Partial<RegisteredRouteSceneSettings> = {}) =>
      buildRegisteredLandRouteScene(snapshot, current, { ...settings, ...extra })
  };
}
describe("registered route SVG/WebGL physical geometry", () => {
  it("draws a shared normal deck once and keeps road approaches separated at D", () => {
    const f = fixture(),
      r = f.build();
    if (!("scene" in r)) throw Error(r.reason);
    expect(r.scene.bridges).toHaveLength(1);
    expect(r.scene.roads).toHaveLength(4);
    expect(r.scene.bridges[0].svgPath).toBe("M6,0L-6,0");
    expect(r.scene.bridges[0].polygons).toEqual([
      [
        [6, -1],
        [-6, -1],
        [-6, 1],
        [6, 1]
      ]
    ]);
    expect(r.scene.roads[0].svgPath).toContain("L6,0");
    expect(Object.isFrozen(r.scene.bridges[0].polygons[0])).toBe(true);
  });
  it("projects uniformly without rotating, shortening or rounding the deck", () => {
    const f = fixture(),
      r = f.build({ metresPerUnit: 2, originMeters: [10, 20] });
    if (!("scene" in r)) throw Error(r.reason);
    expect(r.scene.roadWidth).toBe(1);
    expect(r.scene.bridges[0].svgPath).toBe("M-2,-10L-8,-10");
    expect(f.build({ metresPerUnit: 0 })).toMatchObject({ reason: "invalid-input" });
    expect(f.build({ originMeters: [1e100, 1e100] })).toMatchObject({ reason: "invalid-projection" });
  });
  it("preserves exact circular SVG arcs and bounds the WebGL chord error", () => {
    const f = fixture(true),
      r = f.build();
    if (!("scene" in r)) throw Error(r.reason);
    expect(r.scene.bridges).toEqual([]);
    expect(r.scene.roads[0].svgPath).toContain("A4,4 0 0,1");
    expect(r.scene.roads[0].svgPath).not.toContain("C");
    expect(r.scene.roads[0].polygons.length).toBeGreaterThan(3);
    for (const polygon of r.scene.roads[0].polygons)
      expect(f.current.environment.water.touchesWater(polygon)).toBe(false);
    expect(f.build({ maxChordErrorMeters: 1e-100 })).toMatchObject({ reason: "arc-budget" });
  });
  it("rejects water caught by coarse WebGL chords even when the exact SVG arc remains dry", () => {
    const f = fixture(true),
      angle = (-3 * Math.PI) / 8;
    const x = 36 + 2.8 * Math.cos(angle),
      y = 4 + 2.8 * Math.sin(angle),
      d = 0.01;
    const lake = {
      id: 99,
      rings: [
        [
          [x - d, y - d],
          [x + d, y - d],
          [x + d, y + d],
          [x - d, y + d]
        ]
      ] as RiverPoint[][]
    };
    f.current.environment.water = PhysicalWaterIndex.build(
      [f.source.geometry.water, lake],
      new PhysicalWaterValidationCache()
    )!;
    expect(f.build()).toHaveProperty("scene");
    expect(f.build({ maxChordErrorMeters: 1 })).toMatchObject({ reason: "blocked-mesh" });
  });
  it("bounds every scene dimension and returns no partial geometry", () => {
    const f = fixture();
    for (const extra of [{ maxPaths: 1 }, { maxPieces: 1 }, { maxPolygons: 1 }])
      expect(f.build(extra)).not.toHaveProperty("scene");
    expect(fixture(true).build({ maxArcSections: 1 })).toMatchObject({ reason: "arc-budget" });
    expect(f.build({ maxPaths: NaN })).toMatchObject({ reason: "invalid-input" });
  });
  it("refuses copied snapshots, moved nodes and current bridge/terrain rejection", () => {
    const f = fixture();
    expect(buildRegisteredLandRouteScene({ ...f.snapshot }, f.current, settings)).toMatchObject({
      reason: "unregistered-snapshot"
    });
    expect(
      buildRegisteredLandRouteScene(f.snapshot, { ...f.current, nodePointAt: () => null }, settings)
    ).toMatchObject({ reason: "changed-nodes" });
    f.state.allows = false;
    expect(f.build()).toMatchObject({ reason: "invalid-geometry" });
    f.state.allows = true;
    f.state.supports = false;
    expect(f.build()).not.toHaveProperty("scene");
  });
  it("updates only a dedicated SVG group and clears old bridges when validation fails", () => {
    const f = fixture(),
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      group = document.createElementNS(svg.namespaceURI, "g") as SVGGElement;
    const sibling = document.createElementNS(svg.namespaceURI, "path");
    svg.append(sibling, group);
    expect(drawRegisteredLandRoutes(group, f.snapshot, f.current, settings)).toMatchObject({ status: "drawn" });
    expect(group.querySelectorAll('[data-kind="bridge"]')).toHaveLength(1);
    expect(group.querySelectorAll("path")).toHaveLength(5);
    expect(group.querySelector('[data-kind="bridge"]')!.getAttribute("stroke-linecap")).toBe("butt");
    f.state.allows = false;
    expect(drawRegisteredLandRoutes(group, f.snapshot, f.current, settings)).toHaveProperty("reason");
    expect(group.childElementCount).toBe(0);
    expect(sibling.parentNode).toBe(svg);
  });
  it("builds actual deck.gl polygon layers from the same fixed geometry", () => {
    const f = fixture(),
      style = {
        roadColor: [10, 20, 30, 255] as [number, number, number, number],
        bridgeColor: [40, 50, 60, 255] as [number, number, number, number]
      };
    const r = buildRegisteredLandRouteLayers(f.snapshot, f.current, settings, style);
    if (!("layers" in r)) throw Error(r.reason);
    const bridges = r.layers[1].props.data as RegisteredRoutePolygon[];
    expect(bridges).toHaveLength(1);
    expect(bridges[0].id).toBe(5);
    expect(bridges[0].kind).toBe("bridge");
    expect(r.layers[1].props.stroked).toBe(false);
    expect(r.layers[1].props.pickable).toBe(true);
    expect(
      buildRegisteredLandRouteLayers(f.snapshot, f.current, settings, { ...style, roadColor: [256, 0, 0, 255] })
    ).toMatchObject({ reason: "invalid-style" });
    f.state.allows = false;
    expect(buildRegisteredLandRouteLayers(f.snapshot, f.current, settings, style)).not.toHaveProperty("layers");
  });
  it("does not change registered geometry or consume RNG", () => {
    const f = fixture(),
      before = JSON.stringify(f.snapshot),
      random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw Error("RNG");
      });
    try {
      expect(f.build()).toHaveProperty("scene");
      expect(JSON.stringify(f.snapshot)).toBe(before);
    } finally {
      random.mockRestore();
    }
  });
});

describe("CE fixed physical crossing handoff", () => {
  const budgets = { maxFacilities: 10, maxWaterVertices: 1000 };
  function exported() {
    const f = fixture();
    const result = exportFixedBurgCrossings(f.snapshot, f.current, [30, 10], budgets);
    if (!("crossings" in result)) throw Error(result.reason);
    return { ...f, payload: result.crossings };
  }
  it("preserves shared D/W/E and river truth under CE north-up translation", () => {
    const f = exported();
    expect(f.payload.crossings).toHaveLength(1);
    const c = f.payload.crossings[0];
    expect(c.deckA[1]).toBe(10);
    expect(c.deckA[0] + 30).toBeGreaterThan(5);
    expect(validFixedBurgCrossings(JSON.parse(JSON.stringify(f.payload)), budgets)).toBe(true);
    expect(Object.isFrozen(c)).toBe(true);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    expect(drawFixedBurgCrossings(group, f.payload, budgets)).toBe(true);
    const decks = group.querySelectorAll("[data-facility-id]");
    expect(decks).toHaveLength(1);
    expect(group.querySelectorAll("[data-crossing-approach]")).toHaveLength(2);
    expect(decks[0].getAttribute("d")).toBe(`M${c.deckA[0]},${c.deckA[1]}L${c.deckB[0]},${c.deckB[1]}`);
    expect(decks[0].getAttribute("stroke-linecap")).toBe("butt");
  });
  it("round-trips the optional descriptor preview through CE sharing and renders its fixed D ends", () => {
    const f = exported();
    const base = synthSite("largeTown", DEFAULT_SITE_CONFIG, "fixed", { extentMeters: 1500, cityRadiusMeters: 80 });
    const site = {
      ...base,
      fixedCrossings: f.payload,
      frame: {
        ...base.frame,
        originMapUnits: [30, 10] as [number, number],
        metersPerMapUnit: 1,
        requiredBounds: f.payload.requiredBounds
      }
    };
    const parsed = parseDescriptor(JSON.stringify(site))!;
    expect(parsed).not.toBeNull();
    const shared = decodeShare(encodeShare(shareFromDescriptor(parsed)))!;
    expect(shared.descriptor!.fixedCrossings).toEqual(JSON.parse(JSON.stringify(f.payload)));
    expect(parseIncomingPayload(JSON.stringify(shared))!.descriptor!.fixedCrossings).toEqual(
      JSON.parse(JSON.stringify(f.payload))
    );
    const svg = renderFixedSitePreview(shared.descriptor!)!;
    expect(svg.querySelectorAll("[data-facility-id]")).toHaveLength(1);
    expect(svg.querySelector("g")!.getAttribute("transform")).toBe("scale(1,-1)");
    expect(svg.getAttribute("viewBox")).toBe(
      `${-shared.descriptor!.frame.extentMeters / 2} ${-shared.descriptor!.frame.extentMeters / 2} ${shared.descriptor!.frame.extentMeters} ${shared.descriptor!.frame.extentMeters}`
    );
    const changed = structuredClone(site);
    changed.frame.originMapUnits[0]++;
    expect(parseDescriptor(JSON.stringify(changed))).toBeNull();
    expect(renderFixedSitePreview(changed)).toBeNull();
    const missingBounds = structuredClone(site) as typeof site & { frame: { requiredBounds?: unknown } };
    delete missingBounds.frame.requiredBounds;
    expect(parseDescriptor(JSON.stringify(missingBounds))).toBeNull();
    expect(renderFixedSitePreview(base)).toBeNull();
  });
  it("keeps fixed geometry in CE documents and rejects corrupted or cropped file data", () => {
    const f = exported();
    const base = synthSite("largeTown", DEFAULT_SITE_CONFIG, "fixed-doc", { extentMeters: 1500, cityRadiusMeters: 80 });
    const site = {
      ...base,
      fixedCrossings: f.payload,
      frame: {
        ...base.frame,
        originMapUnits: [30, 10] as [number, number],
        metersPerMapUnit: 1,
        requiredBounds: f.payload.requiredBounds
      }
    };
    const doc = createGridDocument({
      size: "small",
      grid: "hex",
      extentMeters: 1500,
      cityRadiusMeters: 80,
      hexSizeMeters: 300,
      seed: "fixed-doc"
    });
    const settings = defaultGenerationSettings();
    settings.descriptor = { ...site, rivers: [], roads: [], waterbody: null };
    const staged = generateStageOnDocument(doc, settings, "fixed-doc-stage", 1);
    expect(staged).not.toBeNull();
    expect(staged!.importedFixedCrossings).toEqual(f.payload);
    expect(doc.importedFixedCrossings).toBeUndefined();
    applyImportedFixedCrossings(doc, site);
    expect(doc.importedFixedCrossings).not.toBe(f.payload);
    const loaded = parseDocument(JSON.stringify(doc))!;
    expect(loaded.importedFixedCrossings).toEqual(JSON.parse(JSON.stringify(f.payload)));
    const broken = JSON.parse(JSON.stringify(doc));
    broken.importedFixedCrossings.crossings[0].deckA[1]++;
    expect(parseDocument(JSON.stringify(broken))).toBeNull();
    const cropped = JSON.parse(JSON.stringify(doc));
    cropped.frame.extentMeters = 1;
    expect(parseDocument(JSON.stringify(cropped))).toBeNull();
    doc.frame.extentMeters = 1;
    const previous = doc.importedFixedCrossings;
    expect(() => applyImportedFixedCrossings(doc, site)).toThrow("City frame");
    expect(doc.importedFixedCrossings).toBe(previous);
    doc.frame.extentMeters = 1500;
    applyImportedFixedCrossings(doc);
    expect(doc.importedFixedCrossings).toBe(previous);
    applyImportedFixedCrossings(doc, base);
    expect(doc.importedFixedCrossings).toBeUndefined();
  });
  it("uses saved fixed geometry in the final city SVG and blocks legacy deck fallback", () => {
    const f = exported();
    const doc = createGridDocument({
      size: "small",
      grid: "hex",
      extentMeters: 1500,
      cityRadiusMeters: 80,
      hexSizeMeters: 300,
      seed: "fixed-render"
    });
    doc.appearance = "town";
    doc.importedFixedCrossings = structuredClone(f.payload);
    doc.riverConnections = [
      {
        sourceIndex: 0,
        farRoad: [
          [-100, 0],
          [-50, 0]
        ],
        townRoad: [
          [50, 0],
          [100, 0]
        ],
        banks: [
          [-50, 0],
          [50, 20]
        ],
        crossing: {
          kind: "fixedBridge",
          widthMeters: 10,
          depthMeters: 3,
          navigationRequired: false,
          clearanceMeters: 0,
          openingMeters: 0,
          reason: "fixedClearance"
        }
      }
    ];
    const before = JSON.stringify(doc);
    const svg = renderStandaloneCitySvg(doc);
    expect(svg.getAttribute("data-fixed-geometry-status")).toBe("ready");
    expect(svg.querySelectorAll(".ce-fixed-crossings [data-facility-id]")).toHaveLength(1);
    const crossing = f.payload.crossings[0];
    const deck = svg.querySelector(".ce-fixed-crossings [data-facility-id]")!;
    expect(deck.getAttribute("d")).toBe(
      `M${crossing.deckA[0]},${crossing.deckA[1]}L${crossing.deckB[0]},${crossing.deckB[1]}`
    );
    expect(deck.getAttribute("stroke-width")).toBe(String(f.payload.roadWidthMeters));
    expect(svg.querySelectorAll(".ce-bridge-deck,.ce-bridge-outline,.ce-ferry-route")).toHaveLength(0);
    expect(svg.querySelectorAll(".ce-fixed-river-water [data-river-id]")).toHaveLength(1);
    expect(JSON.stringify(doc)).toBe(before);
    // A dry centreline whose physical width reaches water is also rejected.
    expect(
      fixedRoadIsDry(
        [
          [-23, 0],
          [-23, 20]
        ],
        6,
        f.payload
      )
    ).toBe(false);
    expect(
      fixedRoadIsDry(
        [
          [0, 0],
          [0, 20]
        ],
        2,
        f.payload
      )
    ).toBe(true);
    expect(
      fixedRoadIsDry(
        [
          [-40, 10],
          [-20, 10]
        ],
        2,
        f.payload
      )
    ).toBe(false);
    doc.importedFixedCrossings.crossings[0].geometryVersion++;
    const invalid = renderStandaloneCitySvg(doc);
    expect(invalid.getAttribute("data-fixed-geometry-status")).toBe("invalid");
    expect(invalid.querySelectorAll("[data-facility-id],.ce-bridge-deck")).toHaveLength(0);
    delete doc.importedFixedCrossings;
    expect(renderStandaloneCitySvg(doc).querySelectorAll(".ce-bridge-deck")).toHaveLength(1);
  });
  it("reserves fixed physical river footprints for actual building and block lots", () => {
    const f = exported();
    const doc = createGridDocument({
      size: "tiny",
      grid: "hex",
      extentMeters: 300,
      cityRadiusMeters: 80,
      hexSizeMeters: 30,
      seed: "fixed-lots"
    });
    for (const face of Object.values(doc.mesh.faces))
      Object.assign(face.properties, { ward: "craftsmen", settlement: "core" });
    const baseline = buildCityBuildings(doc);
    doc.importedFixedCrossings = structuredClone(f.payload);
    expect(baseline.some(lot => polygonHitsDocumentWater(doc, lot.polygon))).toBe(true);
    const dry = buildCityBuildings(doc);
    expect(dry.length).toBeGreaterThan(0);
    expect(dry.length).toBeLessThan(baseline.length);
    expect(dry.every(lot => !polygonHitsDocumentWater(doc, lot.polygon))).toBe(true);
    const fabric = buildBlockFabric(doc);
    expect(fabric.buildings.every(lot => !polygonHitsDocumentWater(doc, lot.polygon))).toBe(true);
    expect(fabric.lanes.every(lane => !lineHitsDocumentWater(doc, lane.points, lane.widthMeters))).toBe(true);
    expect(
      (fabric.parcels ?? []).every(parcel =>
        parcel.access.every(access => !lineHitsDocumentWater(doc, access.points, access.widthMeters))
      )
    ).toBe(true);
    const touching: [number, number][] = [
      [-25, 0],
      [-23, 0],
      [-23, 2],
      [-25, 2]
    ];
    expect(polygonHitsDocumentWater(doc, touching)).toBe(true);
    const island: [number, number][] = [
      [-33, 30],
      [-27, 30],
      [-27, 40],
      [-33, 40]
    ];
    (doc.importedFixedCrossings.rivers[0].rings as (readonly [number, number][])[]).push(island);
    expect(
      polygonHitsDocumentWater(doc, [
        [-32, 32],
        [-28, 32],
        [-28, 38],
        [-32, 38]
      ])
    ).toBe(false);
    doc.importedFixedCrossings.crossings[0].geometryVersion++;
    expect(() => polygonHitsDocumentWater(doc, touching)).toThrow("Invalid fixed water");
  });
  it("rejects whole-width roads and terminal caps without splitting a crossing into dry stubs", () => {
    const f = exported();
    const doc = createGridDocument({
      size: "tiny",
      grid: "hex",
      extentMeters: 300,
      cityRadiusMeters: 80,
      hexSizeMeters: 30,
      seed: "fixed-stroke"
    });
    doc.importedFixedCrossings = structuredClone(f.payload);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [-23, 0],
          [-23, 20]
        ],
        6
      )
    ).toBe(true);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [-23, 0],
          [-23, 20]
        ],
        2
      )
    ).toBe(false);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [-40, 10],
          [-20, 10]
        ],
        2
      )
    ).toBe(true);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [-24, 0],
          [-20, 0]
        ],
        3
      )
    ).toBe(true);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [-30, 0],
          [-30, 0]
        ],
        2
      )
    ).toBe(true);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [0, 0],
          [0, 20]
        ],
        2
      )
    ).toBe(false);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [0, 0],
          [0, 20]
        ],
        Infinity
      )
    ).toBe(true);
  });
  it("routes to the exact fixed E portal with a normal final tangent and no mesh mutation", async () => {
    const f = exported(),
      c = f.payload.crossings[0];
    const doc = createGridDocument({
      size: "tiny",
      grid: "hex",
      extentMeters: 300,
      cityRadiusMeters: 80,
      hexSizeMeters: 30,
      seed: "fixed-portal"
    });
    doc.importedFixedCrossings = structuredClone(f.payload);
    const n = c.normal,
      e = c.approachA;
    doc.mesh.vertices = {
      start: { id: "start", point: [e[0] - n[0] * 20, e[1] - n[1] * 20], locked: false },
      lead: { id: "lead", point: [e[0] - n[0] * 10, e[1] - n[1] * 10], locked: false }
    };
    doc.mesh.edges = { edge: { id: "edge", a: "start", b: "lead", leftFace: null, rightFace: null, locked: false } };
    doc.mesh.faces = {};
    const input = {
      facilityId: c.id,
      side: "A" as const,
      startVertexId: "start",
      maxTerminalConnectors: 10,
      maxConnectorMeters: 15,
      maxWaterVertices: 1000,
      otherWater: [],
      supportsDryFootprint: () => true,
      allowsMeshEdge: () => true,
      settings: {
        roadWidthMeters: 2,
        minimumTurnRadiusMeters: 2,
        minimumStraightMeters: 0,
        minimumFinalStraightMeters: 2,
        turnPenaltyMetersPerRadian: 0,
        maxEnvelopeErrorMeters: 0.05,
        maxArcSections: 100,
        maxNodes: 100,
        maxEdges: 100,
        maxLabels: 100,
        maxExpansions: 100
      }
    };
    const before = JSON.stringify(doc);
    const result = findFixedCrossingApproach(doc, input);
    if (!("corridor" in result)) throw Error(result.reason);
    expect(result.endpoint).toEqual(c.approachA);
    expect(result.corridor.pieces.at(-1)!.end).toEqual(c.approachA);
    expect(result.guideVertexIds.at(-1)).toBeNull();
    const { otherWater, supportsDryFootprint, allowsMeshEdge, ...request } = input;
    let supports = true;
    const provider = () => ({ otherWater, supportsDryFootprint: () => supports, allowsMeshEdge });
    const adopted = adoptFixedCrossingApproaches(doc, [{ id: "city-A", request }], provider);
    if (!("document" in adopted)) throw Error(adopted.reason);
    expect(doc.fixedCrossingApproaches).toBeUndefined();
    const svg = renderStandaloneCitySvg(adopted.document);
    const path = svg.querySelector("[data-fixed-approach-id='city-A']")!;
    expect(path).not.toBeNull();
    expect(path.getAttribute("d")).toContain(`L${e[0]} ${-e[1]}`);
    const curvedDoc = structuredClone(doc);
    curvedDoc.mesh.vertices.start.point[1] += 10;
    curvedDoc.mesh.vertices.corner = {
      id: "corner",
      point: [curvedDoc.mesh.vertices.lead.point[0], curvedDoc.mesh.vertices.lead.point[1] + 10],
      locked: false
    };
    curvedDoc.mesh.edges = {
      first: { id: "first", a: "start", b: "corner", leftFace: null, rightFace: null, locked: false },
      second: { id: "second", a: "corner", b: "lead", leftFace: null, rightFace: null, locked: false }
    };
    const curved = adoptFixedCrossingApproaches(curvedDoc, [{ id: "curve-A", request }], provider);
    if (!("document" in curved)) throw Error(curved.reason);
    expect(curved.document.fixedCrossingApproaches![0].corridor.pieces.some(p => p.kind === "arc")).toBe(true);
    expect(
      renderStandaloneCitySvg(curved.document).querySelector("[data-fixed-approach-id='curve-A']")!.getAttribute("d")
    ).toContain("A2 2");
    const copied = structuredClone(adopted.document);
    expect(renderStandaloneCitySvg(copied).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(0);
    expect(restoreFixedCrossingApproaches(copied, provider)).toHaveProperty("document");
    const fileDoc = structuredClone(doc);
    const a = doc.mesh.vertices.start.point,
      lead = doc.mesh.vertices.lead.point;
    fileDoc.mesh = meshFromCells([
      {
        id: 0,
        polygon: [a, lead, [lead[0], lead[1] + 5], [a[0], a[1] + 5]],
        site: [(a[0] + lead[0]) / 2, a[1] + 2.5],
        centroid: [(a[0] + lead[0]) / 2, a[1] + 2.5],
        neighbors: [],
        onBorder: true
      }
    ]);
    const fileRequest = { ...request, startVertexId: "v0" };
    const fileAdopted = adoptFixedCrossingApproaches(fileDoc, [{ id: "file-A", request: fileRequest }], provider);
    if (!("document" in fileAdopted)) throw Error(fileAdopted.reason);
    const loaded = parseDocument(JSON.stringify(fileAdopted.document))!;
    expect(loaded).not.toBeNull();
    expect(renderStandaloneCitySvg(loaded).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(0);
    const restored = restoreFixedCrossingApproaches(loaded, provider);
    if (!("document" in restored)) throw Error(restored.reason);
    expect(renderStandaloneCitySvg(restored.document).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(1);
    const currentProvider: Parameters<typeof restoreFixedCrossingApproaches>[1] = (_request, current) => ({
      otherWater,
      supportsDryFootprint: () => current.frame.blockSizeMeters === fileDoc.frame.blockSizeMeters,
      allowsMeshEdge: edgeId => !!current.mesh.edges[edgeId]
    });
    const currentLoaded = parseDocument(JSON.stringify(fileAdopted.document), currentProvider)!;
    expect(renderStandaloneCitySvg(currentLoaded).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(1);
    const read = await readCityMap(new File([JSON.stringify(fileAdopted.document)], "city.json"), currentProvider);
    expect(read?.source).toBe("city-editor");
    expect(renderStandaloneCitySvg(read!.document).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(1);
    const history = new DocumentHistory(fileDoc, "Initial", 2, currentProvider);
    history.commit(fileAdopted.document);
    const removed = structuredClone(fileAdopted.document);
    delete removed.importedFixedCrossings;
    delete removed.fixedCrossingApproaches;
    history.commit(removed);
    const undone = history.undo(removed)!;
    expect(undone.importedFixedCrossings).toEqual(fileAdopted.document.importedFixedCrossings);
    expect(undone.fixedCrossingApproaches).toEqual(fileAdopted.document.fixedCrossingApproaches);
    expect(renderStandaloneCitySvg(undone).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(1);
    expect(history.undo(undone)!.fixedCrossingApproaches).toBeUndefined();
    expect(history.redo(fileDoc)!.fixedCrossingApproaches).toEqual(fileAdopted.document.fixedCrossingApproaches);
    expect(history.jumpTo(2)!.importedFixedCrossings).toBeUndefined();
    const blocked = structuredClone(fileAdopted.document);
    blocked.frame.blockSizeMeters += 1;
    history.jumpTo(1);
    history.commit(blocked);
    expect(renderStandaloneCitySvg(history.undo(blocked)!).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(
      1
    );
    expect(renderStandaloneCitySvg(history.redo(undone)!).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(0);
    const amended = structuredClone(fileAdopted.document);
    amended.importedFixedCrossings!.revision += 1;
    amended.fixedCrossingApproaches = [];
    history.amendTop(amended);
    history.undo(amended);
    const redone = history.redo(undone)!;
    expect(redone.importedFixedCrossings).toEqual(amended.importedFixedCrossings);
    expect(redone.fixedCrossingApproaches).toEqual([]);
    const unauthenticatedHistory = new DocumentHistory(fileDoc);
    unauthenticatedHistory.commit(fileAdopted.document);
    unauthenticatedHistory.commit(removed);
    expect(
      renderStandaloneCitySvg(unauthenticatedHistory.undo(removed)!).querySelectorAll("[data-fixed-approach-id]")
    ).toHaveLength(0);
    const blockedLoaded = parseDocument(JSON.stringify(blocked), currentProvider)!;
    expect(blockedLoaded.fixedCrossingApproaches).toEqual(blocked.fixedCrossingApproaches);
    expect(renderStandaloneCitySvg(blockedLoaded).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(0);
    expect(
      restoreFixedCrossingApproaches(loaded, () => {
        throw Error("unavailable");
      })
    ).toHaveProperty("reason", "current-contract-failed");
    expect(
      restoreFixedCrossingApproaches(loaded, (_request, current) => {
        current.mesh.vertices.v0.point[0] += 1;
        return null;
      })
    ).toHaveProperty("reason", "current-contract-failed");
    expect(loaded.mesh.vertices.v0.point).toEqual(fileDoc.mesh.vertices.v0.point);
    const editorRoot = document.createElement("div");
    document.body.append(editorRoot);
    let uiSupports = true;
    const uiProvider: Parameters<typeof restoreFixedCrossingApproaches>[1] = (q, current) => {
      const contract = currentProvider(q, current)!;
      return { ...contract, supportsDryFootprint: footprint => uiSupports && contract.supportsDryFootprint(footprint) };
    };
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    const svgExport = vi.spyOn(cityEditorFiles, "exportCitySvg").mockImplementation(() => {});
    try {
      mountCityEditor(editorRoot, { fixedApproachProvider: uiProvider });
      const drop = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(drop, "dataTransfer", {
        value: { files: [new File([JSON.stringify(fileAdopted.document)], "city.json")] }
      });
      editorRoot.querySelector(".ce-map")!.dispatchEvent(drop);
      await vi.waitFor(() => expect(editorRoot.querySelectorAll("[data-fixed-approach-id]")).toHaveLength(1));
      const scaleLabel = [...editorRoot.querySelectorAll("label")].find(label => label.textContent?.trim() === "Scale");
      const scale = scaleLabel!.querySelector("input")!;
      scale.value = "2";
      editorRoot.querySelector<HTMLButtonElement>("button[title='Scale all map geometry']")!.click();
      expect(editorRoot.querySelectorAll("[data-fixed-approach-id]")).toHaveLength(0);
      editorRoot.querySelector<HTMLButtonElement>("button[title='Undo']")!.click();
      expect(editorRoot.querySelectorAll("[data-fixed-approach-id]")).toHaveLength(1);
      editorRoot.querySelector<HTMLButtonElement>("button[title='Export city map as SVG']")!.click();
      expect(
        renderStandaloneCitySvg(svgExport.mock.calls.at(-1)![0]).querySelectorAll("[data-fixed-approach-id]")
      ).toHaveLength(1);
      uiSupports = false;
      editorRoot.querySelector<HTMLButtonElement>("button[title='Export city map as SVG']")!.click();
      expect(
        renderStandaloneCitySvg(svgExport.mock.calls.at(-1)![0]).querySelectorAll("[data-fixed-approach-id]")
      ).toHaveLength(0);
      expect(editorRoot.querySelectorAll("[data-fixed-approach-id]")).toHaveLength(0);
      editorRoot.querySelector<HTMLButtonElement>("button[title='Redo']")!.click();
      editorRoot.querySelector<HTMLButtonElement>("button[title='Undo']")!.click();
      expect(editorRoot.querySelectorAll("[data-fixed-approach-id]")).toHaveLength(0);
      expect(editorRoot.querySelector("svg.ce-svg")!.getAttribute("data-fixed-approach-status")).toBe("unvalidated");
    } finally {
      svgExport.mockRestore();
      editorRoot.remove();
    }
    const malformed = JSON.parse(JSON.stringify(loaded));
    malformed.fixedCrossingApproaches[0].request.settings.maxNodes = 1000000;
    expect(parseDocument(JSON.stringify(malformed))).toBeNull();
    expect(
      adoptFixedCrossingApproaches(
        doc,
        [
          { id: "first", request },
          { id: "second", request: { ...request, facilityId: 999 } }
        ],
        provider
      )
    ).toHaveProperty("reason");
    expect(doc.fixedCrossingApproaches).toBeUndefined();
    copied.fixedCrossingApproaches![0].corridor.pieces[0].end = [999, 999];
    expect(restoreFixedCrossingApproaches(copied, provider)).toHaveProperty("reason", "changed-approaches");
    supports = false;
    expect(renderStandaloneCitySvg(adopted.document).querySelectorAll("[data-fixed-approach-id]")).toHaveLength(0);
    expect(adoptFixedCrossingApproaches(doc, [{ id: "city-A", request }], provider)).toHaveProperty("reason");

    expect(JSON.stringify(doc)).toBe(before);
    const opposite = structuredClone(doc),
      b = c.approachB;
    opposite.mesh.vertices.start.point = [b[0] + n[0] * 20, b[1] + n[1] * 20];
    opposite.mesh.vertices.lead.point = [b[0] + n[0] * 10, b[1] + n[1] * 10];
    expect(findFixedCrossingApproach(opposite, { ...input, side: "B" })).toHaveProperty("endpoint", c.approachB);
    expect(findFixedCrossingApproach(doc, { ...input, allowsMeshEdge: () => false })).toHaveProperty("reason");
    expect(findFixedCrossingApproach(doc, { ...input, supportsDryFootprint: () => false })).toHaveProperty("reason");
    expect(findFixedCrossingApproach(doc, { ...input, maxTerminalConnectors: 0 })).toHaveProperty("reason");
    const mid = [e[0] - n[0] * 5, e[1] - n[1] * 5];
    expect(
      findFixedCrossingApproach(doc, {
        ...input,
        otherWater: [
          {
            id: 99,
            rings: [
              [
                [mid[0] - 1, mid[1] - 2],
                [mid[0] + 1, mid[1] - 2],
                [mid[0] + 1, mid[1] + 2],
                [mid[0] - 1, mid[1] + 2]
              ]
            ]
          }
        ]
      })
    ).toHaveProperty("reason");
    expect(
      findFixedCrossingApproach(doc, {
        ...input,
        supportsDryFootprint: () => {
          doc.mesh.vertices.start.point[0] += 0.1;
          return true;
        }
      })
    ).toHaveProperty("reason", "changed-source");
    doc.mesh.vertices.start.point = [e[0] - n[0] * 20, e[1] - n[1] * 20];
    const offsetDoc = structuredClone(doc);
    offsetDoc.mesh.vertices.start.point[1] += 7;
    offsetDoc.mesh.vertices.lead.point[1] += 7;
    const leadResult = findFixedCrossingApproach(offsetDoc, { ...input, terminalLeadMeters: 10 });
    if (!("corridor" in leadResult)) throw Error(leadResult.reason);
    expect(leadResult.corridor.pieces.some(p => p.kind === "arc")).toBe(true);
    expect(leadResult.corridor.pieces.at(-1)!.end).toEqual(e);
    expect(leadResult.guideVertexIds.slice(-2)).toEqual([null, null]);
    const leadAdopted = adoptFixedCrossingApproaches(
      offsetDoc,
      [{ id: "lead-A", request: { ...request, terminalLeadMeters: 10 } }],
      provider
    );
    // The provider above is intentionally disabled; reject instead of bypassing support.
    expect(leadAdopted).toHaveProperty("reason");
    const leadProvider = () => ({ otherWater: [], supportsDryFootprint: () => true, allowsMeshEdge: () => true });
    const acceptedLead = adoptFixedCrossingApproaches(
      offsetDoc,
      [{ id: "lead-A", request: { ...request, terminalLeadMeters: 10 } }],
      leadProvider
    );
    if (!("document" in acceptedLead)) throw Error(acceptedLead.reason);
    const leadSvg = renderStandaloneCitySvg(acceptedLead.document);
    expect(leadSvg.querySelector("[data-fixed-approach-id='lead-A']")!.getAttribute("d")).toContain("A2 2");
    expect(
      restoreFixedCrossingApproaches(JSON.parse(JSON.stringify(acceptedLead.document)), leadProvider)
    ).toHaveProperty("document");
    expect(
      findFixedCrossingApproach(offsetDoc, { ...input, terminalLeadMeters: 10, maxTerminalConnectors: 1 })
    ).toHaveProperty("reason", "terminal-budget");
    expect(
      findFixedCrossingApproach(offsetDoc, {
        ...input,
        terminalLeadMeters: 10,
        settings: { ...input.settings, maxNodes: 3 }
      })
    ).toHaveProperty("reason", "graph-budget");
    expect(findFixedCrossingApproach(offsetDoc, { ...input, terminalLeadMeters: 1 })).toHaveProperty(
      "reason",
      "invalid-input"
    );

    doc.mesh.vertices.lead.point[1] += 0.1;
    expect(findFixedCrossingApproach(doc, input)).toHaveProperty("reason", "no-terminal-connector");
  });
  it("rejects oblique decks, moved banks, stale versions and insufficient bounds", () => {
    const f = exported();
    for (const mutate of [
      (a: typeof f.payload) => {
        (a.crossings[0].deckA as number[])[1] += 1;
      },
      (a: typeof f.payload) => {
        (a.crossings[0].waterA as number[])[0] += 1;
      },
      (a: typeof f.payload) => {
        a.crossings[0].geometryVersion += 1;
      },
      (a: typeof f.payload) => {
        a.requiredBounds.minX += 1;
      }
    ]) {
      const raw = structuredClone(f.payload);
      mutate(raw);
      expect(validFixedBurgCrossings(raw, budgets)).toBe(false);
    }
  });
  it("clears obsolete preview on malformed data or budget failure", () => {
    const f = exported(),
      group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    drawFixedBurgCrossings(group, f.payload, budgets);
    expect(drawFixedBurgCrossings(group, f.payload, { ...budgets, maxWaterVertices: 1 })).toBe(false);
    expect(group.childNodes).toHaveLength(0);
    expect(validFixedBurgCrossings(null, budgets)).toBe(false);
    f.state.allows = false;
    expect(exportFixedBurgCrossings(f.snapshot, f.current, [30, 10], budgets)).toHaveProperty("reason");
  });
});
