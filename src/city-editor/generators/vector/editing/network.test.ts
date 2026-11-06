import { describe, expect, it } from "vitest";
import fixtures from "../../../../../docs/plan/data/ce-meshless-m0-cases.json";
import { bridgeSkewDegrees } from "../../../../utils/bridgeSkewPolicy";
import { renderVectorDocument } from "../../../renderers/vector/documentSvg";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { Point } from "../../../types/primitives";
import type { VectorBridge, VectorCityDocument, VectorPath } from "../../../types/vector/document";
import { createVectorDocument, createVectorExample } from "../document";
import { evaluateAnchor } from "../geometry/curves";
import { bridgeGeometry, distance } from "../geometry/network";
import { pathSurface } from "../geometry/surfaces";
import { VectorDocumentHistory } from "../history";
import { validateVectorDocument } from "../validation/document";
import {
  adoptVectorBridge,
  connectVectorAnchors,
  createInnerWall,
  createVectorGate,
  createWallGapRoad,
  disconnectVectorNode,
  proposeSquareBridge,
  removeVectorBridge,
  removeVectorGate,
  setWallCircuit
} from "./network";
import { curveSource, replaceVectorPath, reverseVectorPath } from "./paths";
import { splitVectorPath } from "./splitPath";

const path = (id: string, role: VectorPath["role"], points: Point[], closed = false, half = 1): VectorPath => ({
  id,
  role,
  revision: 0,
  origin: "manual",
  editPolicy: "editable",
  source: curveSource(points, "polyline", closed),
  width: { leftMeters: half, rightMeters: half, stations: [] }
});
const anchor = (pathId: string, t: number, segmentId = "segment:0") => ({ pathId, segmentId, t });
function riverCity(): VectorCityDocument {
  const doc = createVectorDocument();
  doc.paths.river = path(
    "river",
    "river",
    [
      [-100, 0],
      [100, 0]
    ],
    false,
    10
  );
  return doc;
}
function doubleWall(index = 0): VectorCityDocument {
  const input = fixtures.cases.find(c => c.id === "double-wall-gap")!.input as unknown as {
    outerWall: Point[];
    innerWalls: Point[][];
  };
  let doc = createVectorDocument();
  doc.paths.outer = path("outer", "wall", input.outerWall, true);
  doc.paths.inner = path("inner", "wall", input.innerWalls[index], true);
  doc = setWallCircuit(doc, "outer");
  return setWallCircuit(doc, "inner", "circuit:1");
}

describe("M3 explicit graph and gate openings", () => {
  it("connects a T junction by one shared anchor and builds curve ranges without splitting geometry", () => {
    let doc = createVectorDocument();
    doc.paths.main = path("main", "road", [
      [-20, 0],
      [20, 0]
    ]);
    doc.paths.branch = path("branch", "road", [
      [0, -20],
      [2, -2]
    ]);
    const before = structuredClone(doc);
    doc = connectVectorAnchors(doc, anchor("main", 0.5), anchor("branch", 1));
    expect(doc.paths.main).toEqual(before.paths.main);
    expect(Object.values(doc.connections.edges)).toHaveLength(3);
    const node = Object.values(doc.connections.nodes).find(n => n.anchors.length === 2)!;
    expect(node.position).toEqual([0, 0]);
    expect(evaluateAnchor(doc.paths.branch, anchor("branch", 1))).toEqual([0, 0]);
    expect(renderVectorDocument(doc).querySelector("[data-vector-junction]")).not.toBeNull();
    const history = new VectorDocumentHistory(before);
    history.commit(doc);
    expect(history.undo()).toEqual(before);
    expect(history.redo()).toEqual(doc);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
    const disconnected = disconnectVectorNode(doc, node.id);
    expect(Object.values(disconnected.connections.nodes).some(n => n.anchors.length === 2)).toBe(false);
  });
  it("does not infer a connection at other crossings and protects fixed source endpoints", () => {
    let doc = createVectorDocument();
    doc.paths.a = path("a", "road", [
      [-20, 0],
      [20, 0]
    ]);
    doc.paths.b = path("b", "road", [
      [0, -20],
      [0, 20]
    ]);
    doc.paths.c = path("c", "road", [
      [20, -20],
      [21, 0]
    ]);
    doc.paths.a.editPolicy = "fixed";
    doc = connectVectorAnchors(doc, anchor("a", 1), anchor("c", 1));
    expect(Object.values(doc.connections.nodes).filter(n => n.anchors.length > 1)).toHaveLength(1);
    doc.paths.b.editPolicy = "fixed";
    const before = structuredClone(doc);
    expect(() => connectVectorAnchors(doc, anchor("a", 0.5), anchor("b", 1))).toThrow("fixed-connection");
    expect(doc).toEqual(before);
    expect(() => connectVectorAnchors(doc, anchor("a", 0.5), anchor("b", 0.6))).toThrow();
  });
  it("opens a gate and moves its road endpoint with the exact wall anchor; rejects inadequate width", () => {
    let doc = createVectorDocument();
    doc.paths.wall = path(
      "wall",
      "wall",
      [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20]
      ],
      true
    );
    doc.paths.access = path(
      "access",
      "road",
      [
        [0, 0],
        [19, 0]
      ],
      false,
      2
    );
    doc = createVectorGate(doc, anchor("wall", 0.5, "segment:1"), anchor("access", 1), 4, "passage");
    const gate = Object.values(doc.connections.gates)[0];
    expect(gate.circuitId).toBe("circuit:1");
    expect(doc.connections.nodes[gate.nodeId].position).toEqual([20, 0]);
    const svg = renderVectorDocument(doc);
    expect(svg.querySelector("mask [data-vector-gate]")).not.toBeNull();
    expect(svg.querySelector('[data-vector-path="wall"]')!.parentElement!.hasAttribute("mask")).toBe(true);
    const moved = createVectorGate(doc, anchor("wall", 0.6, "segment:1"), anchor("access", 1), 6, "passage", gate.id);
    expect(moved.connections.nodes[moved.connections.gates[gate.id].nodeId].position[1]).toBeCloseTo(4);
    expect(() =>
      createVectorGate(doc, anchor("wall", 0.5, "segment:1"), anchor("access", 1), 3, "passage", gate.id)
    ).toThrow("gate-access");
    expect(() => disconnectVectorNode(doc, gate.nodeId)).toThrow("gate-connection");
    const fixed = structuredClone(doc);
    fixed.paths.wall.editPolicy = "fixed";
    fixed.paths.other = path(
      "other",
      "wall",
      [
        [-40, -40],
        [40, -40],
        [40, 40],
        [-40, 40]
      ],
      true
    );
    expect(() =>
      createVectorGate(fixed, anchor("other", 0.5, "segment:1"), anchor("access", 1), 6, "passage", gate.id)
    ).toThrow("fixed-path");
    expect(renderVectorDocument(removeVectorGate(doc, gate.id)).querySelector("[data-vector-gate]")).toBeNull();
  });
  it("keeps water gates separate from road nodes", () => {
    let doc = createVectorDocument();
    doc.paths.wall = path(
      "wall",
      "wall",
      [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20]
      ],
      true
    );
    doc.paths.water = path(
      "water",
      "river",
      [
        [0, 0],
        [20, 0]
      ],
      false,
      2
    );
    doc = createVectorGate(doc, anchor("wall", 0.5, "segment:1"), anchor("water", 1), 4, "water");
    expect(Object.values(doc.connections.gates)[0].kind).toBe("water");
    doc.paths.road = path("road", "road", [
      [0, -10],
      [20, 0]
    ]);
    expect(() => connectVectorAnchors(doc, anchor("water", 1), anchor("road", 1))).toThrow("bridge-required");
    expect(() => createVectorGate(doc, anchor("wall", 0.5, "segment:1"), anchor("road", 1), 10, "passage")).toThrow();
  });
});

describe("M3 graph range stability", () => {
  it("registers bridge landings as nodes and preserves unrelated edge ids when a branch splits an approach", () => {
    let doc = riverCity();
    doc.paths.road = path(
      "road",
      "road",
      [
        [0, -30],
        [0, 30]
      ],
      false,
      2
    );
    doc = adoptVectorBridge(doc, {
      id: "bridge",
      roadPathId: "road",
      riverAnchor: anchor("river", 0.5),
      from: anchor("road", 0.25),
      to: anchor("road", 0.75),
      structure: "stone",
      dryLandingMeters: 2,
      editPolicy: "editable"
    });
    expect(Object.values(doc.connections.edges)).toHaveLength(3);
    const span = Object.values(doc.connections.edges).find(e => e.from.t === 0.25 && e.to.t === 0.75)!;
    doc.paths.branch = path("branch", "road", [
      [10, -24],
      [1, -24]
    ]);
    doc = connectVectorAnchors(doc, anchor("road", 0.1), anchor("branch", 1));
    expect(doc.connections.edges[span.id]).toEqual(span);
    expect(Object.values(doc.connections.edges)).toHaveLength(5);
    expect(validateVectorDocument(doc)).toEqual([]);
  });
  it("uses one shared node for both references to an existing segment joint", () => {
    let doc = createVectorDocument();
    doc.paths.main = path("main", "road", [
      [-10, 0],
      [0, 0],
      [10, 0]
    ]);
    doc.paths.a = path("a", "road", [
      [0, -10],
      [0, 0]
    ]);
    doc.paths.b = path("b", "road", [
      [0, 10],
      [0, 0]
    ]);
    doc = connectVectorAnchors(doc, anchor("main", 1), anchor("a", 1));
    doc = connectVectorAnchors(doc, anchor("main", 0, "segment:1"), anchor("b", 1));
    expect(
      Object.values(doc.connections.nodes).filter(
        n =>
          n.anchors.some(a => a.pathId === "main") &&
          n.anchors.some(a => a.pathId === "a") &&
          n.anchors.some(a => a.pathId === "b")
      )
    ).toHaveLength(1);
    expect(Object.values(doc.connections.edges).filter(e => e.pathId === "main")).toHaveLength(2);
  });
});

describe("M3 crossing ambiguity", () => {
  it("refuses openings that would also cut a distant part of the same wall", () => {
    const doc = createVectorDocument();
    doc.paths.wall = path(
      "wall",
      "wall",
      [
        [-5, -2],
        [5, -2],
        [5, 2],
        [-5, 2]
      ],
      true,
      0.4
    );
    doc.paths.road = path(
      "road",
      "road",
      [
        [0, 0],
        [0, 2]
      ],
      false,
      0.5
    );
    expect(() => createVectorGate(doc, anchor("wall", 0.5, "segment:2"), anchor("road", 1), 4, "passage")).toThrow(
      "gate-access"
    );
  });
  it("rejects one span across both arms of a closed channel", () => {
    const doc = createVectorDocument();
    doc.paths.river = {
      ...path(
        "river",
        "river",
        [
          [-1, 0],
          [1, 0]
        ],
        false,
        3
      ),
      source: {
        kind: "preset",
        preset: "ellipse",
        center: [0, 0],
        widthMeters: 60,
        heightMeters: 60,
        bearingDegrees: 90
      }
    };
    doc.paths.road = path(
      "road",
      "road",
      [
        [-40, 0],
        [40, 0]
      ],
      false,
      1
    );
    expect(() =>
      adoptVectorBridge(doc, {
        id: "bridge",
        roadPathId: "road",
        riverAnchor: anchor("river", 0, "arc:0"),
        from: anchor("road", 0),
        to: anchor("road", 1),
        structure: "stone",
        dryLandingMeters: 2,
        editPolicy: "editable"
      })
    ).toThrow("bridge-multiple-channels");
  });
  it("does not put bridge decks on unadopted crossings and protects reserved landing sites", () => {
    const doc = riverCity();
    doc.paths.road = path(
      "road",
      "road",
      [
        [0, -20],
        [0, 20]
      ],
      false,
      2
    );
    expect(renderVectorDocument(doc).querySelector("[data-vector-bridge]")).toBeNull();
    doc.regions.site = {
      id: "site",
      kind: "reservation",
      outer: [
        [-1, 10],
        [1, 10],
        [1, 13],
        [-1, 13]
      ],
      holes: []
    };
    expect(() => proposeSquareBridge(doc, anchor("river", 0.5), 4, 2, "stone")).toThrow("protected-land");
  });
});

describe("M3 walls and full-width free space", () => {
  it("uses the M0 eight-meter gap and rejects the six-meter gap without cell subdivision", () => {
    const doc = doubleWall(),
      next = createWallGapRoad(doc, "circuit:1", "circuit:2", [-40, 26], [40, 26], 4, 0.5);
    expect(next).not.toHaveProperty("mesh");
    expect(Object.values(next.connections.wallRoads)).toHaveLength(1);
    expect(Object.values(next.connections.edges)).toHaveLength(1);
    expect(() => createWallGapRoad(doubleWall(1), "circuit:1", "circuit:2", [-40, 27], [40, 27], 4, 0.5)).toThrow(
      "road-clearance"
    );
    const route = Object.values(next.connections.wallRoads)[0],
      candidate = structuredClone(next.paths[route.pathId]);
    candidate.width.leftMeters = 4;
    expect(() => replaceVectorPath(next, candidate)).toThrow("road-clearance");
    expect(parseVectorDocument(serializeVectorDocument(next))).toEqual(next);
  });
  it("turns around inner wall corners using a visibility graph and rejects obstruction by a reserved site", () => {
    const doc = doubleWall(),
      next = createWallGapRoad(doc, "circuit:1", "circuit:2", [-56, 0], [56, 0], 3, 0.4),
      route = Object.values(next.connections.wallRoads)[0];
    expect(next.paths[route.pathId].source).toMatchObject({ kind: "curve" });
    if (next.paths[route.pathId].source.kind !== "curve") throw new Error();
    expect(next.paths[route.pathId].source.segments.length).toBeGreaterThan(1);
    doc.regions.blocked = {
      id: "blocked",
      kind: "reservation",
      outer: [
        [-59, 23],
        [59, 23],
        [59, 29],
        [-59, 29]
      ],
      holes: []
    };
    expect(() => createWallGapRoad(doc, "circuit:1", "circuit:2", [-40, 26], [40, 26], 4, 0.5)).toThrow(
      "road-clearance"
    );
  });
  it("creates a physical offset rather than scaled inner wall and rejects crossing or cyclic parents", () => {
    const doc = doubleWall();
    delete doc.paths.inner;
    delete doc.connections.circuits["circuit:2"];
    const next = createInnerWall(doc, "circuit:1", 8),
      inner = Object.values(next.connections.circuits).find(c => c.parentCircuitId)!;
    expect(next.paths[inner.pathId].source).toMatchObject({
      segments: [
        { from: [-52, -22], to: [52, -22] },
        { from: [52, -22], to: [52, 22] },
        { from: [52, 22], to: [-52, 22] },
        { from: [-52, 22], to: [-52, -22] }
      ]
    });
    expect(() => setWallCircuit(next, "outer", inner.id)).toThrow();
    expect(() => createInnerWall(doc, "circuit:1", 40)).toThrow("offset-split");
    const bad = doubleWall();
    if (bad.paths.inner.source.kind !== "curve") throw new Error();
    bad.paths.inner.source.segments[0].from[0] = -62;
    bad.paths.inner.source.segments.at(-1)!.to[0] = -62;
    expect(validateVectorDocument(bad).length).toBeGreaterThan(0);
  });
  it("connects a gate approach to a gap road without moving any wall vertices", () => {
    let doc = doubleWall();
    const wall = structuredClone(doc.paths.outer);
    doc.paths.approach = path(
      "approach",
      "road",
      [
        [0, 30],
        [0, 26]
      ],
      false,
      1
    );
    doc = createVectorGate(doc, anchor("outer", 0.5, "segment:2"), anchor("approach", 0), 3, "passage");
    doc = createWallGapRoad(doc, "circuit:1", "circuit:2", [0, 26], [40, 26], 2, 0.5);
    const route = Object.values(doc.connections.wallRoads)[0];
    doc = connectVectorAnchors(doc, anchor("approach", 1), anchor(route.pathId, 0));
    expect(doc.paths.outer).toEqual(wall);
    const gate = Object.values(doc.connections.gates)[0];
    expect(doc.connections.nodes[gate.nodeId].position).toEqual([0, 30]);
    expect(
      Object.values(doc.connections.nodes).some(
        n => n.anchors.some(a => a.pathId === route.pathId) && n.anchors.some(a => a.pathId === "approach")
      )
    ).toBe(true);
  });
});

describe("M3 legal bridge spans", () => {
  it("proposes the shortest square dry span and round-trips its graph, split references and undo", () => {
    const doc = riverCity(),
      next = proposeSquareBridge(doc, anchor("river", 0.5), 4, 2, "stone"),
      bridge = Object.values(next.connections.bridges)[0],
      geometry = bridgeGeometry(next, bridge, new Map([["river", pathSurface(next.paths.river)]]));
    expect(distance(geometry.from, geometry.to)).toBeCloseTo(24, 3);
    expect(bridgeSkewDegrees([0, 1], [1, 0])).toBe(0);
    expect(renderVectorDocument(next).querySelectorAll("[data-vector-bridge]")).toHaveLength(1);
    const split = splitVectorPath(next, {
      pathId: bridge.roadPathId,
      segmentId: "segment:0",
      t: 0.5,
      leftId: "left",
      rightId: "right"
    });
    expect(Object.values(split.connections.bridges)[0].to.segmentId).toBe("right");
    expect(validateVectorDocument(split)).toEqual([]);
    expect(validateVectorDocument(reverseVectorPath(split, bridge.roadPathId))).toEqual([]);
    expect(parseVectorDocument(serializeVectorDocument(split))).toEqual(split);
    const history = new VectorDocumentHistory(doc);
    history.commit(next);
    expect(history.undo()).toEqual(doc);
    expect(history.redo()).toEqual(next);
  });
  it.each([
    ["highMedieval", "stone", 15, true],
    ["highMedieval", "stone", 15.001, false],
    ["highMedieval", "timber", 20, true],
    ["highMedieval", "timber", 20.001, false],
    ["ageOfExploration", "stone", 25, true],
    ["preIndustrialEra", "stone", 30, true],
    ["preIndustrialEra", "stone", 45, false],
    ["preIndustrialEra", "stone", 89, false]
  ] as const)("enforces %s %s at %s degrees", (period, structure, angle, legal) => {
    const doc = riverCity();
    doc.context.historicalPeriod = period;
    const radians = (angle * Math.PI) / 180,
      from: Point = [-40 * Math.sin(radians), -40 * Math.cos(radians)],
      to: Point = [40 * Math.sin(radians), 40 * Math.cos(radians)];
    doc.paths.road = path("road", "road", [from, to], false, 2);
    const bridge: VectorBridge = {
      id: "bridge",
      roadPathId: "road",
      riverAnchor: anchor("river", 0.5),
      from: anchor("road", 0),
      to: anchor("road", 1),
      structure,
      dryLandingMeters: 2,
      editPolicy: "editable"
    };
    if (legal) expect(() => adoptVectorBridge(doc, bridge)).not.toThrow();
    else expect(() => adoptVectorBridge(doc, bridge)).toThrow();
  });
  it("honors acquired technology without lowering the historical baseline, and rejects bent spans or short landings", () => {
    let doc = riverCity();
    doc.context.bridgeSkewTier = 2;
    doc.paths.road = path(
      "road",
      "road",
      [
        [-15, -30],
        [15, 30]
      ],
      false,
      2
    );
    const bridge: VectorBridge = {
      id: "bridge",
      roadPathId: "road",
      riverAnchor: anchor("river", 0.5),
      from: anchor("road", 0),
      to: anchor("road", 1),
      structure: "stone",
      dryLandingMeters: 2,
      editPolicy: "editable"
    };
    expect(() => adoptVectorBridge(doc, bridge)).not.toThrow();
    doc = riverCity();
    doc.paths.road = path(
      "road",
      "road",
      [
        [0, -20],
        [0, 0],
        [5, 20]
      ],
      false,
      2
    );
    expect(() => adoptVectorBridge(doc, { ...bridge, to: anchor("road", 1, "segment:1") })).toThrow("bridge-bent");
    doc.paths.road = path(
      "road",
      "road",
      [
        [0, -10],
        [0, 10]
      ],
      false,
      2
    );
    expect(() => adoptVectorBridge(doc, bridge)).toThrow("bridge-landing");
  });
  it("rejects imported illegal geometry and fixed-span edits without drawing or mutating accepted state", () => {
    const doc = proposeSquareBridge(riverCity(), anchor("river", 0.5), 4, 2, "stone"),
      bridge = Object.values(doc.connections.bridges)[0];
    bridge.editPolicy = "fixed";
    const before = structuredClone(doc),
      river = structuredClone(doc.paths.river);
    river.width.leftMeters = 11;
    expect(() => replaceVectorPath(doc, river)).toThrow("fixed-bridge");
    expect(() => removeVectorBridge(doc, bridge.id)).toThrow("fixed-bridge");
    expect(doc).toEqual(before);
    const invalid = structuredClone(doc);
    invalid.paths[bridge.roadPathId].source = curveSource(
      [
        [-40, -10],
        [40, 10]
      ],
      "polyline",
      false
    );
    invalid.connections.nodes = {};
    invalid.connections.edges = {};
    expect(parseVectorDocument(JSON.stringify(invalid))).toBeNull();
    expect(() => renderVectorDocument(invalid)).toThrow();
  });
  it("rejects insufficient landing caused by river widening and preserves the accepted document", () => {
    const doc = proposeSquareBridge(riverCity(), anchor("river", 0.5), 4, 2, "stone"),
      before = structuredClone(doc),
      river = structuredClone(doc.paths.river);
    river.width.leftMeters = 15;
    expect(() => replaceVectorPath(doc, river)).toThrow("bridge-landing");
    expect(doc).toEqual(before);
  });
  it("migrates v1 and v2 ledgers while rejecting unsupported v4 and malformed bridge fields", () => {
    const doc = createVectorExample(),
      legacy = JSON.parse(JSON.stringify(doc));
    legacy.version = 2;
    delete legacy.connections.bridges;
    delete legacy.connections.wallRoads;
    for (const gate of Object.values(legacy.connections.gates) as Record<string, unknown>[]) {
      delete gate.kind;
      delete gate.circuitId;
    }
    expect(parseVectorDocument(JSON.stringify(legacy))).toEqual(doc);
    const withoutCircuit = structuredClone(legacy);
    withoutCircuit.connections.circuits = {};
    const migrated = parseVectorDocument(JSON.stringify(withoutCircuit))!;
    expect(migrated.connections.gates.east.circuitId).toBeTruthy();
    expect(validateVectorDocument(migrated)).toEqual([]);
    const current = structuredClone(doc);
    delete current.connections.gates.east.circuitId;
    expect(parseVectorDocument(JSON.stringify(current))).toBeNull();
    legacy.version = 4;
    expect(parseVectorDocument(JSON.stringify(legacy))).toBeNull();
    const invalid = proposeSquareBridge(riverCity(), anchor("river", 0.5), 4, 2, "stone");
    Object.values(invalid.connections.bridges)[0].dryLandingMeters = -1;
    expect(parseVectorDocument(JSON.stringify(invalid))).toBeNull();
  });
});
