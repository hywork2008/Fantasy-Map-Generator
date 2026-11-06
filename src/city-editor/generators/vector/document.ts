import type { VectorCityDocument, VectorPath } from "../../types/vector/document";
import { assertVectorDocument } from "./validation/document";

export function createVectorDocument(seed = "vector-manual", extentMeters = 400): VectorCityDocument {
  const document: VectorCityDocument = {
    format: "fmg-vector-city",
    version: 5,
    revision: 0,
    frame: { extentMeters },
    context: { historicalPeriod: "highMedieval", targetPopulation: 0 },
    paths: {},
    connections: { nodes: {}, edges: {}, gates: {}, circuits: {}, bridges: {}, wallRoads: {} },
    regions: {},
    placements: {},
    recipe: { algorithm: "vector-city-v1", seed }
  };
  assertVectorDocument(document);
  return document;
}

/** Small authored ledger for codec/history preview, not a generated city. */
export function createVectorExample(): VectorCityDocument {
  const document = createVectorDocument("vector-example-v1");
  const path = (id: string, role: VectorPath["role"], source: VectorPath["source"], halfWidth: number): VectorPath => ({
    id,
    revision: 0,
    role,
    source,
    origin: "manual",
    editPolicy: "editable",
    width: { leftMeters: halfWidth, rightMeters: halfWidth, stations: [] }
  });
  document.paths = {
    outer: path(
      "outer",
      "wall",
      { kind: "preset", preset: "ellipse", center: [10, 0], widthMeters: 200, heightMeters: 160, bearingDegrees: 90 },
      1
    ),
    circle: path(
      "circle",
      "wall",
      { kind: "preset", preset: "ellipse", center: [-120, -90], widthMeters: 60, heightMeters: 60, bearingDegrees: 0 },
      1
    ),
    rectangle: path(
      "rectangle",
      "wall",
      {
        kind: "preset",
        preset: "rectangle",
        center: [120, -100],
        widthMeters: 50,
        heightMeters: 60,
        bearingDegrees: 90
      },
      1
    ),
    main: path(
      "main",
      "road",
      { kind: "curve", closed: false, segments: [{ id: "main-line", kind: "line", from: [0, 0], to: [110, 0] }] },
      2
    ),
    water: path(
      "water",
      "river",
      {
        kind: "curve",
        closed: false,
        segments: [
          {
            id: "water-bend",
            kind: "cubic",
            from: [-150, 110],
            control1: [-50, 150],
            control2: [50, 30],
            to: [150, 110]
          }
        ]
      },
      5
    )
  };
  const start = { pathId: "main", segmentId: "main-line", t: 0 };
  const end = { pathId: "main", segmentId: "main-line", t: 1 };
  const gate = { pathId: "outer", segmentId: "arc:0", t: 0 };
  document.connections.nodes = {
    center: { id: "center", position: [0, 0], anchors: [start] },
    eastGate: { id: "eastGate", position: [110, 0], anchors: [end, gate] }
  };
  document.connections.edges.main = {
    id: "main",
    pathId: "main",
    fromNodeId: "center",
    toNodeId: "eastGate",
    from: start,
    to: end
  };
  document.connections.gates.east = {
    id: "east",
    kind: "passage",
    circuitId: "outer",
    wallPathId: "outer",
    nodeId: "eastGate",
    anchor: gate,
    widthMeters: 4
  };
  document.connections.circuits.outer = { id: "outer", pathId: "outer" };
  document.paths.water.width.stations.push({
    anchor: { pathId: "water", segmentId: "water-bend", t: 0.5 },
    leftMeters: 8,
    rightMeters: 6
  });
  assertVectorDocument(document);
  return document;
}
