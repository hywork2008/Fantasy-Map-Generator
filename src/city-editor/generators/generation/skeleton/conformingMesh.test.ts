import { describe, expect, it } from "vitest";
import { polygonArea, segmentsIntersect } from "../../geom";
import { facePoints } from "../../mesh";
import { buildConformingMesh } from "./conformingMesh";
import type { SkeletonInputs } from "./contracts";
import { clipMeshSegment, meshSegments, segmentDistance } from "./meshSegments";
import { planSkeleton } from "./pipeline";

const inputs = (wet: number): SkeletonInputs => ({
  half: 300,
  cellSize: 50,
  core: [0, 0],
  cityRadius: 180,
  walls: true,
  walledAreaShare: 1,
  water:
    wet === 2
      ? [
          {
            kind: "sea",
            polygon: [
              [-300, 180],
              [300, 180],
              [300, 300],
              [-300, 300]
            ]
          }
        ]
      : [],
  rivers:
    wet === 1
      ? [
          {
            index: 0,
            centerline: [
              [30, -300],
              [30, 300]
            ],
            halfWidth: 8
          }
        ]
      : [],
  roads: [
    [300, 0],
    [-300, 0],
    [0, -300]
  ].map((p, id) => ({
    id,
    path: [
      [0, 0],
      [p[0], p[1]]
    ],
    fixed: false,
    reachesFrame: true
  })),
  fixedBridges: [],
  bridgeSkewLimit: 15,
  bastionEra: false,
  requiredExternalRoads: 2,
  wallWidth: 7,
  minGateSpacing: 40
});

describe("skeleton K6", () => {
  it("tiles the frame with simple faces and continuous skeleton chains across 100 seeds", () => {
    let count = 0;
    for (let i = 0; i < 100; i++) {
      const base = inputs(i % 3),
        seed = `k6:${i}`;
      const skeleton = planSkeleton(
        base,
        { wallShape: ["organic", "round", "oval", "square", "polygon"][i % 5] as "organic" },
        seed
      ).skeleton;
      if (!skeleton) throw new Error(`K5 rejected fixture ${seed}`);
      const { mesh, lines, diagnostics } = buildConformingMesh(base, skeleton, seed);
      expect(diagnostics.mirrorPairs).toBeGreaterThan(0);
      let area = 0;
      for (const f of Object.values(mesh.faces)) {
        const p = facePoints(mesh, f);
        // The editor helper also rejects area < 1 m²; that is a buildability
        // rule, separate from simplicity at constrained junctions.
        expect(Math.abs(polygonArea(p))).toBeGreaterThan(1e-8);
        for (let a = 0; a < p.length; a++)
          for (let b = a + 2; b < p.length; b++) {
            if (a === 0 && b === p.length - 1) continue;
            expect(segmentsIntersect(p[a], p[(a + 1) % p.length], p[b], p[(b + 1) % p.length])).toBe(false);
          }
        area += Math.abs(polygonArea(p));
      }
      expect(area).toBeCloseTo(360000, 3);
      for (const line of lines) {
        expect(line.edges.length).toBeGreaterThan(0);
        const segments = meshSegments(line)
          .map(s => clipMeshSegment(s, base.half))
          .filter(s => s !== null);
        let actualLength = 0;
        for (const ref of line.edges) {
          const edge = mesh.edges[ref.edgeId],
            a = mesh.vertices[edge.a].point,
            b = mesh.vertices[edge.b].point;
          expect(segments.some(s => segmentDistance(a, s) < 0.0003 && segmentDistance(b, s) < 0.0003)).toBe(true);
          actualLength += Math.hypot(a[0] - b[0], a[1] - b[1]);
        }
        const expectedLength = segments.reduce((sum, s) => sum + Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]), 0);
        expect(Math.abs(actualLength - expectedLength)).toBeLessThan(0.001 * segments.length);
        const ends = line.edges.map(r => {
          const e = mesh.edges[r.edgeId];
          return r.forward ? [e.a, e.b] : [e.b, e.a];
        });
        for (let j = 1; j < ends.length; j++) expect(ends[j - 1][1]).toBe(ends[j][0]);
        if (line.closed) expect(ends.at(-1)![1]).toBe(ends[0][0]);
      }
      count++;
    }
    expect(count).toBe(100);
  }, 120000);

  it("is deterministic and leaves vectors unchanged", () => {
    const base = inputs(1),
      skeleton = planSkeleton(base, {}, "same").skeleton!;
    const before = JSON.stringify({ base, skeleton });
    expect(buildConformingMesh(base, skeleton, "same")).toEqual(buildConformingMesh(base, skeleton, "same"));
    expect(JSON.stringify({ base, skeleton })).toBe(before);
  });
});

it("supports an unwalled skeleton with no constraints at the evolution block scale", () => {
  const base = inputs(0);
  base.walls = false;
  base.roads = [];
  base.requiredExternalRoads = 0;
  const skeleton = planSkeleton(base, {}, "empty").skeleton!;
  const { mesh, lines, diagnostics } = buildConformingMesh(base, skeleton, "empty");
  expect(lines).toEqual([]);
  expect(diagnostics.mirrorPairs).toBe(0);
  const areas = Object.values(mesh.faces)
    .map(f => Math.abs(polygonArea(facePoints(mesh, f))))
    .sort((a, b) => a - b);
  expect(areas.length).toBeGreaterThan(120);
  expect(areas.length).toBeLessThan(300);
  expect(areas[Math.floor(areas.length / 2)]).toBeGreaterThan(1000);
  expect(areas[Math.floor(areas.length / 2)]).toBeLessThan(3000);
});

it("keeps coincident fixed routes and records separate runs on leaving the frame", () => {
  const base = inputs(0);
  const skeleton = planSkeleton(base, {}, "overlap").skeleton!;
  skeleton.wall = null;
  skeleton.routes = [0, 1].map(id => ({
    id,
    dropped: false,
    gateIndex: null,
    reachesFrame: true,
    path: [
      [-300, 0],
      [0, 0],
      [300, 0]
    ]
  }));
  const { mesh, lines } = buildConformingMesh(base, skeleton, "overlap");
  expect(lines[0].edges).toEqual(lines[1].edges);
  expect(lines[0].runs).toHaveLength(1);
  for (const ref of lines[0].edges) {
    const edge = mesh.edges[ref.edgeId];
    expect(mesh.vertices[edge.a].point[1]).toBeCloseTo(0, 6);
    expect(mesh.vertices[edge.b].point[1]).toBeCloseTo(0, 6);
  }
  skeleton.routes = [
    {
      id: 2,
      dropped: false,
      gateIndex: null,
      reachesFrame: true,
      path: [
        [-100, 0],
        [500, 0],
        [500, 200],
        [-100, 200]
      ]
    }
  ];
  const clipped = buildConformingMesh(base, skeleton, "clip");
  expect(clipped.lines[0].runs).toHaveLength(2);
});
