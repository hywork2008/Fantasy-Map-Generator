import { describe, expect, it } from "vitest";
import fixture from "../../data/fixtures/vector-manual-v1.json";
import { parseVectorDocument, serializeVectorDocument } from "../../services/io/vector/documentCodec";
import type { CurveAnchor } from "../../types/vector/document";
import { createVectorDocument, createVectorExample } from "./document";
import { remapSplitAnchor, splitVectorPath } from "./editing/splitPath";
import { evaluateAnchor, pathSegmentIds, segmentTangent } from "./geometry/curves";
import { VectorDocumentHistory } from "./history";
import { validateVectorDocument } from "./validation/document";

describe("vector document contract", () => {
  it("round-trips the authored circle, ellipse, rectangle, line, cubic, widths and shared gate without a mesh", () => {
    const document = createVectorExample();
    expect(document).toEqual({
      ...fixture,
      version: 3,
      connections: {
        ...fixture.connections,
        bridges: {},
        wallRoads: {},
        gates: { east: { ...fixture.connections.gates.east, kind: "passage", circuitId: "outer" } }
      }
    });
    expect("mesh" in document).toBe(false);
    expect(parseVectorDocument(serializeVectorDocument(document))).toEqual(document);
    expect(parseVectorDocument(JSON.stringify(fixture))).toEqual(document);
    expect(pathSegmentIds(document.paths.circle)).toEqual(["arc:0", "arc:1", "arc:2", "arc:3"]);
    const point = evaluateAnchor(document.paths.outer, document.connections.gates.east.anchor);
    expect(point[0]).toBeCloseTo(110, 10);
    expect(point[1]).toBeCloseTo(0, 10);
    expect(evaluateAnchor(document.paths.outer, document.connections.gates.east.anchor, true)[0]).toBeCloseTo(0, 10);
  });

  it("evaluates the authored cubic and rejects a dangling anchor instead of choosing a nearby segment", () => {
    const document = createVectorExample();
    const path = document.paths.water;
    const anchor = path.width.stations[0].anchor;
    expect(evaluateAnchor(path, anchor)).toEqual([0, 95]);
    if (path.source.kind !== "curve") throw new Error("Expected an authored curve");
    expect(segmentTangent(path.source.segments[0], 0)).toEqual([300, 120]);
    expect(() => evaluateAnchor(path, { ...anchor, segmentId: "missing" })).toThrow();
    expect(() => evaluateAnchor(path, { ...anchor, pathId: "main" })).toThrow();
  });

  it.each([
    "format",
    "version",
    "mesh",
    "nonfinite",
    "duplicate-id",
    "node-position",
    "missing-segment",
    "width-path",
    "edge-node",
    "gate-path",
    "circuit-cycle",
    "disconnected-segment",
    "open-loop",
    "unknown-source",
    "coerced-role"
  ])("rejects invalid persisted geometry or references (%s)", failure => {
    const doc = createVectorExample();
    const value = doc as unknown as Record<string, unknown>;
    if (failure === "format") value.format = "fmg-city-editor";
    if (failure === "version") value.version = 4;
    if (failure === "mesh") value.mesh = { vertices: {}, edges: {}, faces: {} };
    if (failure === "nonfinite") doc.frame.extentMeters = Number.POSITIVE_INFINITY;
    if (failure === "duplicate-id") doc.paths.water.id = "main";
    if (failure === "node-position") doc.connections.nodes.eastGate.position[0] += 1;
    if (failure === "missing-segment") doc.connections.nodes.eastGate.anchors[0].segmentId = "lost";
    if (failure === "width-path")
      doc.paths.water.width.stations[0].anchor = { pathId: "main", segmentId: "main-line", t: 0 };
    if (failure === "edge-node") doc.connections.edges.main.toNodeId = "lost";
    if (failure === "gate-path") doc.connections.gates.east.wallPathId = "main";
    if (failure === "circuit-cycle") doc.connections.circuits.outer.parentCircuitId = "outer";
    if (failure === "disconnected-segment" && doc.paths.main.source.kind === "curve")
      doc.paths.main.source.segments.push({ id: "extra", kind: "line", from: [115, 0], to: [150, 0] });
    if (failure === "open-loop" && doc.paths.main.source.kind === "curve") doc.paths.main.source.closed = true;
    if (failure === "unknown-source") (doc.paths.water.source as unknown as Record<string, unknown>).kind = "unknown";
    if (failure === "coerced-role") (doc.paths.water as unknown as Record<string, unknown>).role = ["river"];
    expect(validateVectorDocument(doc).length).toBeGreaterThan(0);
    expect(parseVectorDocument(JSON.stringify(doc))).toBeNull();
    expect(() => serializeVectorDocument(doc)).toThrow();
  });

  it("preserves hole geometry and rejects holes that cross the outer ring", () => {
    const document = createVectorDocument();
    document.regions.park = {
      id: "park",
      kind: "park",
      outer: [
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10]
      ],
      holes: [
        [
          [-5, -5],
          [5, -5],
          [5, 5],
          [-5, 5]
        ]
      ]
    };
    expect(parseVectorDocument(serializeVectorDocument(document))).toEqual(document);
    document.regions.park.holes[0][0] = [-15, -5];
    expect(validateVectorDocument(document)).toContain("region:park");
  });
});

describe("stable curve references and atomic history", () => {
  it("splits a cubic without moving it and remaps nodes, width stations and placement access in one document", () => {
    const document = createVectorExample();
    const anchor: CurveAnchor = { pathId: "water", segmentId: "water-bend", t: 0.3 };
    document.connections.nodes.riverPoint = {
      id: "riverPoint",
      position: evaluateAnchor(document.paths.water, anchor),
      anchors: [anchor]
    };
    document.placements.workshop = {
      id: "workshop",
      modelId: "workshop:baking",
      position: [0, 10],
      facingDegrees: 90,
      origin: "manual",
      editPolicy: "editable",
      site: {
        outer: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10]
        ],
        holes: []
      },
      accesses: [anchor]
    };
    const original = structuredClone(document);
    const split = { pathId: "water", segmentId: "water-bend", t: 0.3, leftId: "water-left", rightId: "water-right" };
    const next = splitVectorPath(document, split);
    expect(document).toEqual(original);
    expect(pathSegmentIds(next.paths.water)).toEqual(["water-left", "water-right"]);
    expect(next.paths.main).toEqual(document.paths.main);
    expect(next.paths.water.width.stations[0].anchor.segmentId).toBe("water-right");
    expect(next.connections.nodes.riverPoint.anchors[0]).toEqual({ pathId: "water", segmentId: "water-left", t: 1 });
    expect(next.placements.workshop.accesses).toEqual(next.connections.nodes.riverPoint.anchors);
    for (let i = 0; i <= 20; i++) {
      const before = { pathId: "water", segmentId: "water-bend", t: i / 20 };
      const a = evaluateAnchor(document.paths.water, before);
      const b = evaluateAnchor(next.paths.water, remapSplitAnchor(before, split));
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-10);
    }
    expect(parseVectorDocument(serializeVectorDocument(next))).toEqual(next);
    const history = new VectorDocumentHistory(document);
    history.commit(next, "Split river");
    expect(history.undo()).toEqual(document);
    expect(history.redo()).toEqual(next);
  });

  it("keeps road endpoints and the shared gate connected after splitting the road", () => {
    const document = createVectorExample();
    const next = splitVectorPath(document, {
      pathId: "main",
      segmentId: "main-line",
      t: 0.5,
      leftId: "main-line",
      rightId: "main-east"
    });
    expect(next.connections.edges.main.from.segmentId).toBe("main-line");
    expect(next.connections.edges.main.to.segmentId).toBe("main-east");
    expect(next.connections.nodes.eastGate.position).toEqual([110, 0]);
    expect(next.connections.nodes.eastGate.anchors[0]).toEqual(next.connections.edges.main.to);
    expect(validateVectorDocument(next)).toEqual([]);
  });

  it("rejects fixed curves and invalid splits without mutating the original", () => {
    const document = createVectorExample();
    document.paths.water.editPolicy = "fixed";
    const original = structuredClone(document);
    const split = { pathId: "water", segmentId: "water-bend", t: 0.5, leftId: "a", rightId: "b" };
    expect(() => splitVectorPath(document, split)).toThrow("not editable");
    expect(document).toEqual(original);
    document.paths.water.editPolicy = "editable";
    expect(() => splitVectorPath(document, { ...split, t: 0 })).toThrow();
    expect(() => splitVectorPath(document, { ...split, rightId: "a" })).toThrow();
    expect(() => splitVectorPath(document, { ...split, rightId: "" })).toThrow();
  });

  it("isolates snapshots, preserves a failed transaction, and removes redo when branching or amending", () => {
    const initial = createVectorDocument();
    const example = createVectorExample();
    const history = new VectorDocumentHistory(initial);
    const firstKey = history.currentEntryKey;
    const returned = history.commit(example, "Example");
    returned.paths.main.width.leftMeters = 999;
    example.paths.main.width.leftMeters = 888;
    expect(history.document.paths.main.width.leftMeters).toBe(2);
    expect(history.currentEntryKey).not.toBe(firstKey);
    const valid = history.document;
    const invalid = structuredClone(valid);
    invalid.connections.gates.east.nodeId = "missing";
    expect(() => history.commit(invalid)).toThrow();
    expect(history.entries).toHaveLength(2);
    expect(history.document).toEqual(valid);
    expect(history.undo()).toEqual(initial);
    expect(history.currentEntryKey).toBe(firstKey);
    history.commit(createVectorDocument("branch"), "Branch");
    expect(history.canRedo).toBe(false);
    history.commit(valid, "Another example");
    history.undo();
    history.amendTop(createVectorDocument("amended"));
    expect(history.canRedo).toBe(false);
    expect(history.document.recipe.seed).toBe("amended");
    history.reset(initial);
    expect(history.index).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(history.jumpTo(10)).toBeNull();
  });
});
