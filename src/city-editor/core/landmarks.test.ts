import { describe, expect, it } from "vitest";
import { createDocument, parseDocument } from "./document";
import { DocumentHistory } from "./history";
import {
  connectedRoadEdgeIds,
  landmarkReservationHits,
  placeLandmark,
  polygonIntersectsLandmark,
  transformLandmarkPolygons
} from "./landmarks";
import type { LandmarkAsset, Point } from "./types";

const square = (half: number): Point[] => [
  [-half, -half],
  [half, -half],
  [half, half],
  [-half, half]
];
const asset: LandmarkAsset = {
  id: "test-plan",
  revision: "1",
  name: "Test plan",
  historicalPhase: "test",
  referenceSizeMeters: [20, 20],
  dimensionSource: "test",
  provenanceId: "test",
  footprint: [{ outer: square(8), holes: [] }],
  minimumSite: [{ outer: square(10), holes: [] }],
  entrances: [],
  renderSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 0L1 1Z"/></svg>'
};

describe("historic landmark foundation", () => {
  it("does not connect an isolated road to a boundary road", () => {
    const doc = createDocument("road-connectivity", 300);
    const edges = Object.values(doc.mesh.edges);
    const onBoundary = (id: string) => Math.max(...doc.mesh.vertices[id].point.map(Math.abs)) >= 149.999;
    const boundary = edges.find(edge => onBoundary(edge.a) || onBoundary(edge.b))!;
    const isolated = edges.find(
      edge =>
        ![edge.a, edge.b].some(id => [boundary.a, boundary.b].includes(id)) &&
        !onBoundary(edge.a) &&
        !onBoundary(edge.b)
    )!;
    expect(boundary).toBeDefined();
    expect(isolated).toBeDefined();
    doc.featureGroups = [boundary, isolated].map((edge, index) => ({
      id: `road-${index}`,
      kind: "road",
      name: "Road",
      segments: [{ edgeId: edge.id, forward: true }],
      style: { widthMeters: 4, color: "#555" },
      locked: false
    }));
    const connected = connectedRoadEdgeIds(doc);
    expect(connected.has(boundary.id)).toBe(true);
    expect(connected.has(isolated.id)).toBe(false);
  });
  it("transforms site geometry without changing the source", () => {
    const transformed = transformLandmarkPolygons(asset.minimumSite, {
      position: [20, 30],
      rotation: Math.PI / 2,
      scale: 2
    });
    expect(transformed[0].outer[0][0]).toBeCloseTo(40);
    expect(transformed[0].outer[0][1]).toBeCloseTo(10);
    expect(asset.minimumSite[0].outer[0]).toEqual([-10, -10]);
  });

  it("respects courtyard holes when reserving housing", () => {
    const site = [{ outer: square(10), holes: [square(4)] }];
    expect(polygonIntersectsLandmark(square(2), site)).toBe(false);
    expect(
      polygonIntersectsLandmark(
        [
          [6, 0],
          [8, 0],
          [8, 2],
          [6, 2]
        ],
        site
      )
    ).toBe(true);
  });

  it("saves and replays a placement as one history edit", () => {
    const doc = createDocument("landmark-test", 300);
    const edge = Object.values(doc.mesh.edges)[0];
    const target = doc.mesh.vertices[edge.a].point;
    const connectedAsset = {
      ...asset,
      entrances: [{ id: "front", point: [10, 0] as Point, outward: [1, 0] as Point, widthMeters: 2, required: true }]
    };
    const next = {
      ...doc,
      version: 3 as const,
      featureGroups: [
        {
          id: "road-1",
          kind: "road" as const,
          name: "Road",
          segments: [{ edgeId: edge.id, forward: true }],
          style: { widthMeters: 4, color: "#555" },
          locked: false
        }
      ],
      landmarkAssets: [connectedAsset],
      landmarks: [
        {
          id: "landmark-1",
          assetId: asset.id,
          assetRevision: asset.revision,
          position: [0, 0] as Point,
          rotation: 0,
          scale: 1,
          site: asset.minimumSite,
          accesses: [
            {
              entranceId: "front",
              points: [[10, 0] as Point, target],
              widthMeters: 2,
              target: { kind: "road" as const, id: "road-1", point: target }
            }
          ],
          locked: false
        }
      ]
    };
    expect(landmarkReservationHits(next, square(2))).toBe(true);
    expect(parseDocument(JSON.stringify(next))?.landmarks?.[0].id).toBe("landmark-1");
    const history = new DocumentHistory(doc);
    history.commit(next, "Place landmark");
    expect(history.undo()?.landmarks).toBeUndefined();
    expect(history.redo()?.landmarks?.[0].id).toBe("landmark-1");
  });

  it("rejects unsafe SVG and an out-of-frame site", () => {
    const doc = createDocument("landmark-test", 300);
    const unsafe = { ...asset, renderSvg: "<svg><script>alert(1)</script></svg>" };
    expect(placeLandmark(doc, unsafe, { id: "unsafe", position: [0, 0], rotation: 0, scale: 1 }).document).toBeNull();
    const outside = placeLandmark(doc, asset, { id: "outside", position: [149, 0], rotation: 0, scale: 1 });
    expect(outside.document).toBeNull();
    expect(outside.reasons).toContain("Outside map frame");
  });

  it("connects a required entrance to a road and reserves the passage", () => {
    const doc = createDocument("access-test", 300);
    const edge = Object.values(doc.mesh.edges).find(candidate => {
      const a = doc.mesh.vertices[candidate.a].point;
      const b = doc.mesh.vertices[candidate.b].point;
      return Math.hypot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) < 50;
    })!;
    const a = doc.mesh.vertices[edge.a].point;
    const b = doc.mesh.vertices[edge.b].point;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const position: Point = [middle[0] - normal[0] * 12, middle[1] - normal[1] * 12];
    doc.featureGroups.push({
      id: "road-1",
      kind: "road",
      name: "Road",
      segments: [{ edgeId: edge.id, forward: true }],
      style: { widthMeters: 4, color: "#555" },
      locked: false
    });
    const accessAsset = {
      ...asset,
      footprint: [{ outer: square(2), holes: [] }],
      minimumSite: [{ outer: square(3), holes: [] }],
      entrances: [{ id: "front", point: [3, 0] as Point, outward: [1, 0] as Point, widthMeters: 2, required: true }]
    };
    const result = placeLandmark(doc, accessAsset, {
      id: "access",
      position,
      rotation: Math.atan2(normal[1], normal[0]),
      scale: 1
    });
    expect(result.reasons).toEqual([]);
    const blocked = placeLandmark(
      doc,
      accessAsset,
      {
        id: "blocked",
        position,
        rotation: Math.atan2(normal[1], normal[0]),
        scale: 1
      },
      [
        {
          points: [
            [position[0] - 10, position[1]],
            [position[0] + 10, position[1]]
          ],
          widthMeters: 2
        }
      ]
    );
    expect(blocked.document).toBeNull();
    expect(blocked.reasons).toContain("Blocks existing lane 1");
    expect(result.document?.landmarks?.[0].accesses[0].target.id).toBe("road-1");
    const passage = result.document!.landmarks![0].accesses[0].points;
    const midway: Point = [(passage[0][0] + passage[1][0]) / 2, (passage[0][1] + passage[1][1]) / 2];
    expect(
      landmarkReservationHits(result.document!, [
        [midway[0] - 0.5, midway[1] - 0.5],
        [midway[0] + 0.5, midway[1] - 0.5],
        [midway[0] + 0.5, midway[1] + 0.5],
        [midway[0] - 0.5, midway[1] + 0.5]
      ])
    ).toBe(true);
    expect(parseDocument(JSON.stringify({ ...result.document!, featureGroups: [] }))).toBeNull();
  });
});
