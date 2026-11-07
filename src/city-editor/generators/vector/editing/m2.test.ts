import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { Point } from "../../../types/primitives";
import type { VectorPath, VectorPreset } from "../../../types/vector/document";
import { createVectorDocument, createVectorExample } from "../document";
import { evaluateAnchor, evaluateSegment, segmentTangent } from "../geometry/curves";
import { evaluatePresetPiece, presetArea, presetDimensionsForArea, presetPieces } from "../geometry/presets";
import { pointSegmentDistance, sampledWidth, samplePath, simplifyFreehand } from "../geometry/sampling";
import { pathSurface, surfacesOverlap } from "../geometry/surfaces";
import { VectorDocumentHistory } from "../history";
import { validateVectorDocument, validateVectorPath } from "../validation/document";
import { convertVectorPreset } from "./convertPreset";
import {
  curveSource,
  moveCurveHandle,
  moveCurveVertex,
  removeCurveVertex,
  removeVectorPath,
  replaceVectorPath,
  reverseVectorPath,
  setCurveClosed,
  setVectorPathPolicy
} from "./paths";

const makePath = (points: Point[], closed = false): VectorPath => ({
  id: "drawn",
  revision: 0,
  role: "river",
  origin: "manual",
  editPolicy: "editable",
  source: curveSource(points, "polyline", closed),
  width: { leftMeters: 2, rightMeters: 3, stations: [], interpolation: "linear" }
});
const rounded: VectorPreset = {
  kind: "preset",
  preset: "rectangle",
  center: [15, 20],
  widthMeters: 100,
  heightMeters: 60,
  bearingDegrees: 32,
  cornerRadiusMeters: 8
};
const error = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("M2 physical presets and conversion", () => {
  it("retains area at a new aspect ratio with a physical corner radius", () => {
    expect(presetArea(rounded)).toBeCloseTo(6000 - (4 - Math.PI) * 64, 8);
    const changed = presetDimensionsForArea(rounded, presetArea(rounded), 2.5);
    expect(changed.widthMeters / changed.heightMeters).toBeCloseTo(2.5, 10);
    expect(changed.cornerRadiusMeters).toBe(8);
    expect(presetArea(changed)).toBeCloseTo(presetArea(rounded), 8);
    const corner = presetPieces(changed)[0];
    expect(corner.axes).toEqual([8, 8]);
    expect(() => presetDimensionsForArea(rounded, 1, 1)).toThrow("invalid-dimensions");
  });
  it.each(["ellipse", "rounded rectangle", "polygon"])(
    "converts %s within position and tangent budgets and retains the original for Undo",
    shape => {
      const doc = createVectorDocument();
      const path = makePath([
        [0, 0],
        [10, 0]
      ]);
      path.source =
        shape === "ellipse"
          ? { ...rounded, preset: "ellipse", cornerRadiusMeters: 0 }
          : shape === "polygon"
            ? { ...rounded, preset: "polygon", sides: 6 }
            : rounded;
      doc.paths[path.id] = path;
      const next = convertVectorPreset(doc, path.id),
        source = next.paths[path.id].source;
      if (source.kind !== "curve" || path.source.kind !== "preset") throw new Error("Expected curves");
      for (const piece of presetPieces(path.source)) {
        const converted = source.segments.filter(s => s.id === piece.id || s.id.startsWith(`${piece.id}.`));
        expect(converted.length).toBeGreaterThan(0);
        for (let i = 0; i < converted.length; i++)
          for (let j = 0; j <= 10; j++) {
            const t = j / 10,
              oldT = (i + t) / converted.length;
            expect(error(evaluateSegment(converted[i], t), evaluatePresetPiece(path.source, piece, oldT))).toBeLessThan(
              0.005
            );
            const a = segmentTangent(converted[i], t),
              b = evaluatePresetPiece(path.source, piece, oldT, true);
            expect(
              (Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1]) * 180) / Math.PI
            ).toBeLessThan(0.1);
          }
      }
      expect(parseVectorDocument(serializeVectorDocument(next))).toEqual(next);
      const history = new VectorDocumentHistory(doc);
      history.commit(next);
      expect(history.undo()).toEqual(doc);
      expect(history.redo()).toEqual(next);
    }
  );
  it("keeps a fixed gate road and arbitrary persisted anchors exactly in place during conversion", () => {
    const doc = createVectorExample();
    doc.paths.main.editPolicy = "fixed";
    const anchor = { pathId: "outer", segmentId: "arc:0", t: 0.371 };
    const position = evaluateAnchor(doc.paths.outer, anchor);
    doc.connections.nodes.custom = { id: "custom", position, anchors: [anchor] };
    doc.paths.outer.width.stations.push({ anchor, leftMeters: 1.5, rightMeters: 1 });
    const next = convertVectorPreset(doc, "outer");
    expect(next.paths.main).toEqual(doc.paths.main);
    expect(error(evaluateAnchor(next.paths.outer, next.connections.nodes.custom.anchors[0]), position)).toBeLessThan(
      1e-10
    );
    expect(next.connections.nodes.eastGate.position).toEqual([110, 0]);
    expect(validateVectorDocument(next)).toEqual([]);
  });
});

describe("M2 adaptive geometry and real width surfaces", () => {
  it("bounds every sampled cubic chord and tangent on a curved river", () => {
    const path = createVectorExample().paths.water,
      samples = samplePath(path);
    if (path.source.kind !== "curve") throw new Error("Expected curve");
    const segment = path.source.segments[0];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i];
      if (a.anchor.t === b.anchor.t) continue;
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const t = a.anchor.t + (b.anchor.t - a.anchor.t) * fraction,
          p = evaluateSegment(segment, t);
        expect(pointSegmentDistance(p, a.point, b.point)).toBeLessThanOrEqual(0.0050001);
        const d = segmentTangent(segment, t),
          c: Point = [b.point[0] - a.point[0], b.point[1] - a.point[1]];
        expect(
          (Math.atan2(Math.abs(d[0] * c[1] - d[1] * c[0]), d[0] * c[0] + d[1] * c[1]) * 180) / Math.PI
        ).toBeLessThanOrEqual(0.100001);
      }
    }
  });
  it("makes independently variable banks and leaves the center of a wall circuit empty", () => {
    const path = makePath([
      [0, 0],
      [100, 0]
    ]);
    path.width.stations = [
      { anchor: { pathId: path.id, segmentId: "segment:0", t: 0.5 }, leftMeters: 10, rightMeters: 6 }
    ];
    const samples = samplePath(path),
      widths = sampledWidth(path, samples);
    expect(widths[1]).toEqual({ left: 10, right: 6 });
    const surface = pathSurface(path);
    expect(surface.outer).toContainEqual([50, 10]);
    expect(surface.outer).toContainEqual([50, -6]);
    const wall = createVectorExample().paths.circle,
      ring = pathSurface(wall);
    expect(ring.holes).toHaveLength(1);
    expect(
      surfacesOverlap(ring, {
        outer: [
          [-121, -91],
          [-119, -91],
          [-119, -89],
          [-121, -89]
        ],
        holes: []
      })
    ).toBe(false);
    wall.width.leftMeters = 100;
    expect(() => pathSurface(wall)).toThrow("width-fold");
  });
  it("rejects crossing centerlines, degenerate tangents and excessive bend widths", () => {
    expect(
      validateVectorPath(
        makePath([
          [0, 0],
          [100, 100],
          [0, 100],
          [100, 0]
        ])
      )
    ).toContain("self-intersection");
    const path = makePath([
      [0, 0],
      [10, 0],
      [10, 10]
    ]);
    path.width.leftMeters = 20;
    expect(() => pathSurface(path)).toThrow("width-fold");
    path.source = {
      kind: "curve",
      closed: false,
      segments: [{ id: "cusp", kind: "cubic", from: [0, 0], control1: [10, 0], control2: [-10, 0], to: [0, 0] }]
    };
    expect(() => samplePath(path)).toThrow();
  });
  it("simplifies in meters without erasing collinear overshoots", () => {
    expect(
      simplifyFreehand(
        [
          [0, 0],
          [100, 0],
          [10, 0]
        ],
        0.5
      )
    ).toEqual([
      [0, 0],
      [100, 0],
      [10, 0]
    ]);
    const source = curveSource(
      [
        [0, 0],
        [10, 0.01],
        [20, 0],
        [30, 0]
      ],
      "freehand",
      false,
      0.1
    );
    expect(source).toMatchObject({ freehandToleranceMeters: 0.1, segments: [{ from: [0, 0], to: [30, 0] }] });
  });
});

describe("M2 atomic editing and protected connections", () => {
  it("moves a shared gate and road endpoint together but refuses fixed connections without mutation", () => {
    const doc = createVectorExample(),
      candidate = structuredClone(doc.paths.outer);
    if (candidate.source.kind !== "preset") throw new Error();
    candidate.source.widthMeters = 240;
    const next = replaceVectorPath(doc, candidate);
    expect(next.connections.nodes.eastGate.position[0]).toBe(130);
    expect(evaluateAnchor(next.paths.main, next.connections.edges.main.to)).toEqual([130, 0]);
    doc.paths.main.editPolicy = "fixed";
    const before = structuredClone(doc);
    expect(() => replaceVectorPath(doc, candidate)).toThrow("fixed-connection");
    expect(doc).toEqual(before);
  });
  it("rejects reservations and fixed paths and keeps the accepted history on failure", () => {
    const doc = createVectorDocument();
    doc.regions.site = {
      id: "site",
      kind: "reservation",
      outer: [
        [10, -10],
        [20, -10],
        [20, 10],
        [10, 10]
      ],
      holes: []
    };
    const history = new VectorDocumentHistory(doc);
    expect(() =>
      replaceVectorPath(
        doc,
        makePath([
          [0, 0],
          [30, 0]
        ])
      )
    ).toThrow("protected-land");
    expect(history.canUndo).toBe(false);
    const accepted = replaceVectorPath(
      doc,
      makePath([
        [0, 30],
        [30, 30]
      ])
    );
    const locked = setVectorPathPolicy(accepted, "drawn", "fixed");
    expect(() => replaceVectorPath(locked, accepted.paths.drawn)).toThrow("fixed-path");
    expect(() => removeVectorPath(locked, "drawn")).toThrow("fixed-path");
  });
  it("links symmetric and aligned handles, moves vertices and stores a whole edit in one history step", () => {
    const doc = createVectorDocument(),
      path = makePath([
        [0, 0],
        [30, 0],
        [60, 0]
      ]);
    path.source = curveSource(
      [
        [0, 0],
        [30, 0],
        [60, 0]
      ],
      "bezier",
      false
    );
    doc.paths.drawn = path;
    if (path.source.kind !== "curve") throw new Error();
    moveCurveHandle(path, 1, "control1", [40, 5], "symmetric");
    expect(path.source.segments[0]).toMatchObject({ control2: [20, -5] });
    moveCurveHandle(path, 1, "control1", [50, 0], "aligned");
    const first = path.source.segments[0];
    if (first.kind !== "cubic") throw new Error();
    expect(error(first.control2, [30, 0])).toBeCloseTo(Math.hypot(10, 5));
    moveCurveVertex(path, 1, "from", [30, 10]);
    expect(first.to).toEqual([30, 10]);
    const initial = createVectorDocument(),
      history = new VectorDocumentHistory(initial);
    history.commit(replaceVectorPath(initial, path));
    expect(history.entries).toHaveLength(2);
    expect(history.undo()).toEqual(initial);
  });
  it("reverses references and asymmetric widths; closes, opens, joins and deletes paths", () => {
    const doc = createVectorExample();
    const reverse = reverseVectorPath(doc, "main");
    expect(reverse.connections.edges.main.to.t).toBe(0);
    expect(validateVectorDocument(reverse)).toEqual([]);
    const initial = createVectorDocument();
    const next = replaceVectorPath(
      initial,
      makePath([
        [0, 0],
        [50, 0],
        [50, 50]
      ])
    );
    next.paths.drawn.width.leftMeters = 1;
    const reversed = reverseVectorPath(next, "drawn");
    expect(reversed.paths.drawn.width.rightMeters).toBe(1);
    const closed = setCurveClosed(next, "drawn", true);
    expect(closed.paths.drawn.source).toMatchObject({ closed: true });
    expect(setCurveClosed(closed, "drawn", false).paths.drawn.source).toMatchObject({ closed: false });
    const joined = removeCurveVertex(next, "drawn", 1);
    expect(joined.paths.drawn.source).toMatchObject({ segments: [{ from: [0, 0], to: [50, 50] }] });
    expect(Object.keys(removeVectorPath(joined, "drawn").paths)).toHaveLength(0);
  });
});
