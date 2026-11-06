import { describe, expect, it } from "vitest";
import cases from "../../../../../docs/plan/data/ce-meshless-m0-cases.json";
import fixture from "../../../data/fixtures/gothengsfeld-20261012.json";
import { renderVectorDocument } from "../../../renderers/vector/documentSvg";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { Point } from "../../../types/primitives";
import { createVectorDocument } from "../document";
import { curveSource, replaceVectorPath } from "../editing/paths";
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { VectorDocumentHistory } from "../history";
import { syntheticVectorInput, vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";

const polygon = (outer: Point[], holes: Point[][] = []) => ({ outer, holes });

describe("M4 regions without cells", () => {
  it("preserves M0 holes, disconnected U arms and a half-square-meter residual", () => {
    const data = cases.cases.find(c => c.id === "holes-and-open-roads")!.input as unknown as {
      outer: Point[];
      hole: Point[];
      uShape: Point[];
      thinSubject: Point[];
      thinReservation: Point[];
    };
    const donut = regionBoolean([polygon(data.outer)], [polygon(data.hole)], "difference");
    expect(donut).toHaveLength(1);
    expect(donut[0].holes).toHaveLength(1);
    expect(regionArea(donut[0])).toBeCloseTo(300, 8);
    expect(containsRegion(donut, [0, 0])).toBe(false);
    const upper = regionBoolean(
      [polygon(data.uShape)],
      [
        polygon([
          [-10, 0],
          [10, 0],
          [10, 10],
          [-10, 10]
        ])
      ],
      "intersection"
    );
    expect(upper).toHaveLength(2);
    expect(upper.reduce((n, p) => n + regionArea(p), 0)).toBeCloseTo(16, 8);
    const thin = regionBoolean([polygon(data.thinSubject)], [polygon(data.thinReservation)], "difference");
    expect(thin.reduce((n, p) => n + regionArea(p), 0)).toBeCloseTo(0.5, 8);
  });
  it("unions overlaps and touches without creating phantom holes or moving input coordinates", () => {
    const a = polygon([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
      ]),
      b = polygon([
        [5, 0],
        [15, 0],
        [15, 10],
        [5, 10]
      ]),
      before = structuredClone([a, b]);
    const result = regionBoolean([a], [b], "union");
    expect(result).toHaveLength(1);
    expect(regionArea(result[0])).toBe(150);
    expect(result[0].holes).toHaveLength(0);
    expect([a, b]).toEqual(before);
  });
});

describe("M4 input and skeleton", () => {
  it("preserves the M0 surveyed crossing, original bank rings, shared route identities and exact fixed paths", () => {
    const descriptor = fixture.descriptor as unknown as BurgSiteDescriptor,
      input = vectorInputFromDescriptor(descriptor),
      original = structuredClone(input),
      result = generateVectorSkeleton(input).document;
    expect(result).not.toHaveProperty("mesh");
    expect(input).toEqual(original);
    expect(result.site!.descriptor).toEqual(descriptor);
    expect(result.site!.crossings).toHaveLength(1);
    expect(result.site!.crossings[0].id).toBe(113);
    expect(result.site!.crossings[0].routeIds).toEqual([10]);
    const physical = result.site!.water.find(w => w.riverPathId)!.polygons[0];
    expect([physical.outer, ...physical.holes]).toEqual(descriptor.fixedCrossings!.rivers[0].rings);
    for (const path of input.site!.fixedPaths) expect(result.paths[path.id]).toEqual(path);
    const crossing = descriptor.fixedCrossings!.crossings[0],
      bridge = result.connections.bridges["fmg-bridge:113"];
    expect(evaluateAnchor(result.paths[bridge.roadPathId], bridge.from)).toEqual(crossing.deckA);
    expect(evaluateAnchor(result.paths[bridge.roadPathId], bridge.to)).toEqual(crossing.deckB);
    const q = evaluateAnchor(result.paths[bridge.riverAnchor.pathId], bridge.riverAnchor);
    expect(Math.hypot(q[0] - crossing.q[0], q[1] - crossing.q[1])).toBeLessThan(1e-7);
    expect(result.generation!.blocks.some(b => b.reachable && b.frontage.length > 0)).toBe(true);
    expect(parseVectorDocument(serializeVectorDocument(result))).toEqual(result);
  });
  it("keeps every shared far-bank branch attached to the original surveyed crossing", () => {
    const descriptor = structuredClone(fixture.descriptor) as unknown as BurgSiteDescriptor;
    const far = descriptor.fixedCrossings!.crossings[0].approachB;
    descriptor.roads[0].sharedBranches = [
      {
        routeId: 99,
        path: [
          [far[0], far[1]],
          [300, -200]
        ],
        nextBurg: null
      }
    ];
    const input = vectorInputFromDescriptor(descriptor),
      branch = input.paths["fmg-branch:10:0:0"];
    expect(input.site!.crossings[0].routeIds).toEqual([10, 99]);
    expect(branch.source).toMatchObject({ segments: [{ from: far, to: [300, -200] }] });
    expect(
      Object.values(input.connections.nodes).some(
        n => n.anchors.some(a => a.pathId === branch.id) && n.anchors.some(a => a.pathId === "fmg-crossing:113")
      )
    ).toBe(true);
    const result = generateVectorSkeleton(input).document;
    expect(result.paths[branch.id]).toEqual(branch);
    expect(parseVectorDocument(serializeVectorDocument(result))).toEqual(result);
  });
  it("uses surveyed coastline closure and excludes unknown FMG surface without changing the source", () => {
    const descriptor = structuredClone(fixture.descriptor) as unknown as BurgSiteDescriptor;
    delete descriptor.fixedCrossings;
    descriptor.rivers = [];
    descriptor.roads = [];
    descriptor.frame.urbanCenterOffsetMeters = [9999, 9999];
    descriptor.waterbody = {
      kind: "ocean",
      isPort: false,
      shoreAzimuthDeg: 90,
      shoreline: [
        [
          [50, -250],
          [50, 250]
        ]
      ]
    };
    descriptor.regionalSurface = {
      features: [],
      unknown: [
        [
          [-250, -250],
          [-100, -250],
          [-100, 250],
          [-250, 250]
        ]
      ]
    };
    const input = vectorInputFromDescriptor(descriptor);
    expect(input.site!.descriptor).toEqual(descriptor);
    expect(input.site!.center).toEqual([0, 0]);
    expect(
      containsRegion(
        input.site!.water.flatMap(w => w.polygons),
        [100, 0]
      )
    ).toBe(true);
    expect(containsRegion(input.site!.domain, [-150, 0])).toBe(false);
    expect(renderVectorDocument(input).querySelector("[data-vector-surveyed-water]")).not.toBeNull();
  });
  it("rejects inconsistent FMG geometry instead of snapping fixed approaches or accepting an illegal crossing", () => {
    const d = structuredClone(fixture.descriptor) as unknown as BurgSiteDescriptor;
    d.roads[0].path.at(-1)![0] += 10;
    expect(() => vectorInputFromDescriptor(d)).toThrow("fixed-route-disconnected");
    const bad = structuredClone(fixture.descriptor) as unknown as BurgSiteDescriptor;
    bad.transport = { ...bad.transport, maxBridgeSkewDegrees: 0 };
    expect(() => vectorInputFromDescriptor(bad)).toThrow("fixed-input-invalid");
    const short = structuredClone(fixture.descriptor) as unknown as BurgSiteDescriptor;
    short.transport = { ...short.transport, maxBridgeCrossingMeters: 1 };
    expect(() => vectorInputFromDescriptor(short)).toThrow("bridge-length");
  });
  it.each(["none", "rectangle", "ellipse"] as const)(
    "generates deterministic dry roads, bridges and blocks with wall=%s",
    wall => {
      const input = syntheticVectorInput("fixed-seed"),
        settings = { ...DEFAULT_VECTOR_GENERATION, seed: "fixed-seed", wall },
        first = generateVectorSkeleton(input, settings),
        second = generateVectorSkeleton(input, settings);
      expect(first.document).toEqual(second.document);
      expect(first.stages.map(s => s.id)).toEqual(["inputs", "skeleton", "regions"]);
      expect(first.document.generation!.blocks.length).toBeGreaterThan(0);
      expect(Object.keys(first.document.connections.bridges)).toHaveLength(1);
      if (wall !== "none")
        expect(Object.values(first.document.connections.gates).filter(g => g.kind === "water")).toHaveLength(2);
      expect(
        first.document.site!.fixedPaths.every(p => JSON.stringify(p) === JSON.stringify(first.document.paths[p.id]))
      ).toBe(true);
    }
  );
  it("regenerates only its own untouched geometry and refuses manual changes atomically", () => {
    const input = syntheticVectorInput(),
      generated = generateVectorSkeleton(input).document,
      again = generateVectorSkeleton(generated).document;
    expect(again.generation!.blocks).toEqual(generated.generation!.blocks);
    for (const p of input.site!.fixedPaths) expect(again.paths[p.id]).toEqual(p);
    const edited = structuredClone(generated),
      id = Object.keys(edited.generation!.pathRevisions).find(id => id.startsWith("auto-road:"))!;
    const candidate = structuredClone(edited.paths[id]);
    candidate.width.leftMeters += 0.01;
    const next = replaceVectorPath(edited, candidate),
      before = structuredClone(next);
    expect(() => generateVectorSkeleton(next)).toThrow("edited-generation");
    expect(next).toEqual(before);
    expect(renderVectorDocument(next).querySelectorAll("[data-vector-block]")).toHaveLength(0);
  });
  it("does not claim success when a required port is isolated by an unbuildable crossing", () => {
    const input = syntheticVectorInput();
    input.regions.blocked = {
      id: "blocked",
      kind: "reservation",
      outer: [
        [-150, 33],
        [150, 33],
        [150, 65],
        [-150, 65]
      ],
      holes: []
    };
    const before = structuredClone(input);
    expect(() => generateVectorSkeleton(input)).toThrow("fixed-port-unreachable");
    expect(input).toEqual(before);
  });
  it("keeps open-road land frontage without requiring a road graph cycle", () => {
    const input = createVectorDocument();
    input.paths.road = {
      id: "road",
      revision: 0,
      role: "road",
      origin: "manual",
      editPolicy: "editable",
      source: curveSource(
        [
          [-15, 8],
          [0, 8]
        ],
        "polyline",
        false
      ),
      width: { leftMeters: 0.5, rightMeters: 0.5, stations: [] }
    };
    input.site = {
      kind: "synthetic",
      id: "manual",
      revision: 0,
      transform: { originMapUnits: [0, 0], metersPerMapUnit: 1, localAxes: "east-north" },
      center: [-8, 8],
      domain: [
        polygon([
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10]
        ])
      ],
      water: [],
      crossings: [],
      fixedPaths: []
    };
    const result = generateVectorSkeleton(input, {
      ...DEFAULT_VECTOR_GENERATION,
      branches: 0,
      roadWidthMeters: 1,
      clearanceMeters: 0
    }).document;
    expect(result.paths.road).toEqual(input.paths.road);
    expect(result.generation!.blocks.some(b => b.frontage.some(f => f.pathId === "road") && b.reachable)).toBe(true);
  });
  it("retains thin unserved land with a diagnostic instead of dropping it or placing buildings", () => {
    const input = createVectorDocument();
    input.site = {
      kind: "synthetic",
      id: "thin",
      revision: 0,
      transform: { originMapUnits: [0, 0], metersPerMapUnit: 1, localAxes: "east-north" },
      center: [0.025, 5],
      domain: [
        polygon([
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10]
        ])
      ],
      water: [],
      fixedPaths: [],
      crossings: []
    };
    input.regions.reserved = {
      id: "reserved",
      kind: "reservation",
      outer: [
        [0.05, 0],
        [10, 0],
        [10, 10],
        [0.05, 10]
      ],
      holes: []
    };
    const result = generateVectorSkeleton(input, {
      ...DEFAULT_VECTOR_GENERATION,
      branches: 0,
      roadWidthMeters: 0.01,
      clearanceMeters: 0
    }).document;
    expect(result.generation!.blocks.reduce((n, b) => n + b.areaMeters2, 0)).toBeCloseTo(0.5, 8);
    expect(result.generation!.diagnostics.some(d => d.code === "land-without-frontage")).toBe(true);
    expect(result.placements).toEqual({});
  });
  it("stores final geometry and reversible adoption, and renders all stages without regenerating", () => {
    const input = syntheticVectorInput(),
      result = generateVectorSkeleton(input).document,
      history = new VectorDocumentHistory(input);
    history.commit(result);
    expect(history.undo()).toEqual(input);
    expect(history.redo()).toEqual(result);
    expect(
      renderVectorDocument(result, undefined, undefined, "inputs").querySelectorAll("[data-vector-path]")
    ).toHaveLength(Object.keys(input.paths).length);
    expect(
      renderVectorDocument(result, undefined, undefined, "inputs").querySelectorAll("[data-vector-node]")
    ).toHaveLength(Object.keys(input.connections.nodes).length);
    expect(
      renderVectorDocument(result, undefined, undefined, "skeleton").querySelectorAll("[data-vector-block]")
    ).toHaveLength(0);
    expect(renderVectorDocument(result).querySelectorAll("[data-vector-block]")).toHaveLength(
      result.generation!.blocks.length
    );
    expect(parseVectorDocument(serializeVectorDocument(result))).toEqual(result);
  });
});
