import { describe, expect, it, vi } from "vitest";
import { createGridDocument, parseDocument } from "../city-editor/core/document";
import { DEFAULT_SITE_CONFIG } from "../city-editor/core/gen/site/siteConfig";
import { synthSite } from "../city-editor/core/gen/site/synthSite";
import { defaultGenerationSettings, generateStageOnDocument } from "../city-editor/core/generate";
import { applyImportedFixedCrossings } from "../city-editor/core/importedFixedCrossings";
import {
  decodeShare,
  encodeShare,
  parseDescriptor,
  parseIncomingPayload,
  shareFromDescriptor
} from "../city-editor/io/incomingCity";
import { drawFixedBurgCrossings } from "../city-editor/render/fixedBurgCrossings";
import { renderFixedSitePreview } from "../city-editor/render/fixedSitePreview";
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
