#!/usr/bin/env node
/** M0 lab only: fixed geometry oracles, current kernel measurements and policy audit.
 * node --import tsx scripts/city-editor/meshless/m0Baseline.ts --out <new-file.json>
 * This is not the vector-city generator, codec or a production curve evaluator.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import RBush from "rbush";
import { ShapeUtils, Vector2 } from "three";
import {
  isSimplePolygon,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  segmentSegmentHit,
  simplifyPolyline
} from "../../../src/city-editor/generators/geom";
import { convexInfillParts } from "../../../src/city-editor/generators/lotGeometry";
import { intersectConvex, PlotIndex, subtractConvex } from "../../../src/city-editor/generators/parcelGeometry";
import { clipStreetBlocks } from "../../../src/city-editor/generators/streetBlockGeometry";
import type { Point } from "../../../src/city-editor/types/primitives";
import {
  BRIDGE_SKEW_MAX_DEGREES,
  bridgeSkewDegrees,
  bridgeSkewLimitForPeriod,
  resolveBridgeSkewLimit,
  withinBridgeSkewLimit
} from "../../../src/utils/bridgeSkewPolicy";

const fixturePath = "docs/plan/data/ce-meshless-m0-cases.json";
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
const inventoryPath = "docs/plan/data/ce-meshless-m0-inventory.json";
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
assert.equal(fixtures.format, "ce-meshless-m0-fixtures");
assert.equal(fixtures.version, 1);
assert.equal(inventory.format, "ce-meshless-m0-inventory");
assert.equal(inventory.version, 1);
assert.equal(new Set(fixtures.cases.map((c: { id: string }) => c.id)).size, 11);
const args = process.argv.slice(2);
assert.equal(args.length, 2, "Use --out <new-file.json>");
assert.equal(args[0], "--out");
const out = resolve(args[1]);
assert(!existsSync(out), "Refusing to overwrite an existing observation");
const get = (id: string) => {
  const c = fixtures.cases.find((c: { id: string }) => c.id === id);
  assert(c, `Missing case ${id}`);
  return c;
};
const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const fileHash = (path: string) => ({ path, bytes: readFileSync(path).length, sha256: sha256(readFileSync(path)) });
const area = (polygon: Point[]) => Math.abs(polygonArea(polygon));
const sumArea = (parts: Point[][]) => parts.reduce((n, p) => n + area(p), 0);
const close = (actual: number, expected: number, tolerance = 1e-8) =>
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tolerance ${tolerance})`);
const checks: { id: string; status: string; measured?: unknown; requiredPhase?: string }[] = [];
const measured = (id: string, value: unknown) => checks.push({ id, status: "measured", measured: value });
const pending = (id: string, phase: string) =>
  checks.push({ id, status: "prepared-not-implemented", requiredPhase: phase });

const auditedSources = new Set<string>();
for (const feature of inventory.features) {
  assert(feature.acceptance && feature.decision && feature.implementationPhase);
  assert(feature.calls.length > 0 && feature.fixtureIds.length > 0);
  for (const id of feature.fixtureIds) get(id);
  for (const call of feature.calls) {
    assert(!call.path.startsWith("src/city-generator/"));
    assert(readFileSync(call.path, "utf8").includes(call.symbol), `${call.path}: missing ${call.symbol}`);
    auditedSources.add(call.path);
  }
}
assert.equal(new Set(inventory.features.map((f: { id: string }) => f.id)).size, inventory.features.length);
measured("feature-inventory-source-references", {
  features: inventory.features.length,
  sourceFiles: auditedSources.size
});

function timing(name: string, operation: () => unknown) {
  const { warmup, samples, iterations } = fixtures.benchmark;
  for (let i = 0; i < warmup; i++) operation();
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    for (let j = 0; j < iterations; j++) operation();
    times.push((performance.now() - start) / iterations);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    medianMs: times[Math.floor(samples / 2)],
    p95Ms: times[Math.ceil(samples * 0.95) - 1],
    samples,
    iterations
  };
}

function cubic(controls: Point[], t: number): Point {
  const u = 1 - t;
  const weights = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
  return [0, 1].map(axis => controls.reduce((n, p, i) => n + weights[i] * p[axis], 0)) as Point;
}
function tangent(controls: Point[], t: number): Point {
  const u = 1 - t;
  return [0, 1].map(
    axis =>
      3 * u * u * (controls[1][axis] - controls[0][axis]) +
      6 * u * t * (controls[2][axis] - controls[1][axis]) +
      3 * t * t * (controls[3][axis] - controls[2][axis])
  ) as Point;
}
function sampleCubic(controls: Point[], count: number): Point[] {
  return Array.from({ length: count + 1 }, (_, i) => cubic(controls, i / count));
}
function curveErrors(controls: Point[], count: number) {
  const line = sampleCubic(controls, count);
  let maxPositionMeters = 0;
  let maxTangentDegrees = 0;
  for (let i = 0; i <= fixtures.precision.referenceSamples; i++) {
    const t = i / fixtures.precision.referenceSamples;
    const k = Math.min(count - 1, Math.floor(t * count));
    const a = line[k],
      b = line[k + 1];
    maxPositionMeters = Math.max(maxPositionMeters, nearestOnPolyline(cubic(controls, t), [a, b]).dist);
    const d = tangent(controls, t);
    const cos = Math.abs(
      ((b[0] - a[0]) * d[0] + (b[1] - a[1]) * d[1]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(...d))
    );
    maxTangentDegrees = Math.max(maxTangentDegrees, (Math.acos(Math.min(1, cos)) * 180) / Math.PI);
  }
  return { segments: count, maxPositionMeters, maxTangentDegrees };
}

// Independent area and gap oracles are fixtures, not outputs of a new generator.
const wall = get("wall-presets").input;
const ellipseRows = wall.ellipse.ratios.map((ratio: number) => {
  const a = Math.sqrt((wall.ellipse.area * ratio) / Math.PI);
  const b = Math.sqrt(wall.ellipse.area / ratio / Math.PI);
  const radians = (wall.ellipse.rotationDegrees * Math.PI) / 180;
  const points: Point[] = Array.from({ length: 1024 }, (_, i) => {
    const t = (i * 2 * Math.PI) / 1024;
    const x = a * Math.cos(t),
      y = b * Math.sin(t);
    return [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)];
  });
  const relativeAreaError = Math.abs(area(points) / wall.ellipse.area - 1);
  assert(relativeAreaError <= fixtures.precision.areaRelative);
  return { ratio, semiAxesMeters: [a, b], relativeAreaError };
});
measured("wall-preset-area-reference", ellipseRows);
pending("wall-preset-editing-widths-and-undo", "M2");

const curve = get("curves-and-freehand").input;
const curveRows = fixtures.precision.curveSamples.map((n: number) => curveErrors(curve.cubic, n));
assert(curveRows.at(-1).maxPositionMeters <= fixtures.precision.positionMeters);
assert(curveRows.at(-1).maxTangentDegrees <= fixtures.precision.tangentDegrees);
close(nearestOnPolyline(curve.junction, sampleCubic(curve.cubic, 64)).dist, 0);
const simplified = simplifyPolyline(curve.freehand, fixtures.precision.positionMeters);
assert.deepEqual(simplified[0], curve.freehand[0]);
assert.deepEqual(simplified.at(-1), curve.freehand.at(-1));
const simplifyError = Math.max(...curve.freehand.map((p: Point) => nearestOnPolyline(p, simplified).dist));
assert(simplifyError <= fixtures.precision.positionMeters);
assert.equal(isSimplePolygon(curve.bowTie, 0), false);
measured("curve-sampling-and-simplification", { curveRows, simplifiedPoints: simplified.length, simplifyError });
pending("curve-anchors-and-certified-adaptive-error-bound", "M1-M2");

const gap = get("double-wall-gap");
const usableGaps = gap.input.innerWalls.map(
  (ring: Point[]) => gap.input.outerWall[2][1] - ring[2][1] - gap.input.wallThickness - 2 * gap.input.clearancePerSide
);
assert.deepEqual(usableGaps, gap.oracle.usableTopGapMeters);
assert.deepEqual(
  usableGaps.map((n: number) => n >= gap.input.roadWidth),
  gap.oracle.roadFits
);
measured("double-wall-gap-width-reference", usableGaps);
pending("double-wall-routing-and-shared-gate-nodes", "M3");

const river = get("variable-river-width");
assert.deepEqual(
  [river.input.widthBefore, river.input.widthAfter].map(w => w + 2 * river.input.dryLandingMeters),
  river.oracle.bridgeLengthsMeters
);
const buildingMinY = Math.min(...river.input.lockedBuilding.map((p: Point) => p[1]));
assert(buildingMinY > river.input.widthBefore / 2 && buildingMinY < river.input.widthAfter / 2);
measured("variable-width-reference", river.oracle);
pending("river-width-transaction-and-preserved-locked-building", "M6");

const bridge = get("bridge-policy").input;
const policyRows = bridge.limits.map((row: { period: string; structure: "stone" | "timber"; expected: number }) => {
  const actual = bridgeSkewLimitForPeriod(row.period, row.structure);
  assert.equal(actual, row.expected);
  return { ...row, actual };
});
const angleRows = bridge.skewDegrees.map((angle: number) => {
  const rad = (angle * Math.PI) / 180;
  const actual = bridgeSkewDegrees([Math.sin(rad), Math.cos(rad)], bridge.riverTangent);
  close(actual, angle, 1e-6);
  return { requested: angle, measured: actual, permittedMedievalStone: withinBridgeSkewLimit(actual, 15) };
});
const overrides = bridge.explicitAllowances.map((value: number) => {
  const actual = resolveBridgeSkewLimit("highMedieval", { maxBridgeSkewDegrees: value });
  return { inputDegrees: value, actualDegrees: actual, exceedsAbsoluteMaximum: actual > BRIDGE_SKEW_MAX_DEGREES };
});
checks.push({
  id: "bridge-policy-absolute-override",
  status: overrides.some((r: { exceedsAbsoluteMaximum: boolean }) => r.exceedsAbsoluteMaximum)
    ? "known-gap"
    : "measured",
  measured: { policyRows, angleRows, overrides }
});
const degeneracy = bridgeSkewDegrees([0, 0], [1, 0]);
assert.equal(degeneracy, 90);
measured("bridge-zero-axis-rejection", { skewDegrees: degeneracy, permitted: withinBridgeSkewLimit(degeneracy, 30) });

const tannery = get("riverside-tannery");
close(
  tannery.input.road[0][1] - tannery.input.roadWidth / 2 - tannery.input.riverWidth / 2,
  tannery.oracle.bankToRoadEdgeMeters
);
close(
  Math.hypot(
    tannery.input.streetTarget[0] - tannery.input.entrance[0],
    tannery.input.streetTarget[1] - tannery.input.entrance[1]
  ),
  tannery.oracle.entranceAccessMeters
);
close(area(tannery.input.facilitySite), tannery.oracle.siteArea);
close(tannery.input.facilitySite[0][1] - tannery.input.riverWidth / 2, tannery.oracle.siteToBankMeters);
measured("riverside-tannery-distance-reference", tannery.oracle);
pending("riverside-tannery-placement-and-access", "M5");

const fmg = get("fmg-fixed-crossing").input;
const imported = JSON.parse(readFileSync(fmg.sourceFile, "utf8"));
assert.equal(imported.kind, "fmg-city-editor-share");
assert.equal(imported.descriptor.fixedCrossings.crossings.length, fmg.expectedCrossings);
measured("fmg-fixed-input", {
  ...fileHash(fmg.sourceFile),
  crossings: fmg.expectedCrossings,
  fixedPayloadSha256: sha256(JSON.stringify(imported.descriptor.fixedCrossings))
});
pending("fmg-fixed-crossing-vector-import", "M4");

const domain = get("holes-and-open-roads");
const parts = subtractConvex(domain.input.outer, domain.input.hole, 0);
close(sumArea(parts), domain.oracle.remainingArea);
assert(!parts.some(p => pointInPolygon([0, 0], p)));
for (let i = 0; i < parts.length; i++)
  for (let j = i + 1; j < parts.length; j++) close(area(intersectConvex(parts[i], parts[j])), 0);
const vector2 = (ring: Point[]) => ring.map(p => new Vector2(...p));
const triangles = ShapeUtils.triangulateShape(vector2(domain.input.outer), [vector2(domain.input.hole)]);
const allVertices = [...domain.input.outer, ...domain.input.hole];
close(
  triangles.reduce((n, ids) => n + area(ids.map(i => allVertices[i])), 0),
  domain.oracle.remainingArea
);
const clipped = clipStreetBlocks(domain.input.uShape, domain.input.splitNormal, domain.input.splitOffset);
assert.equal(clipped.length, domain.oracle.uShapeUpperComponents);
close(sumArea(clipped), domain.oracle.uShapeUpperArea);
close(sumArea(convexInfillParts(domain.input.uShape)), area(domain.input.uShape));
const defaultThinArea = sumArea(subtractConvex(domain.input.thinSubject, domain.input.thinReservation));
const explicitThinArea = sumArea(subtractConvex(domain.input.thinSubject, domain.input.thinReservation, 0));
close(explicitThinArea, domain.oracle.thinRemainingArea);
checks.push({
  id: "small-residual-default-area",
  status: Math.abs(defaultThinArea - explicitThinArea) > 1e-8 ? "known-gap" : "measured",
  measured: { defaultThinArea, explicitThinArea }
});
measured("hole-and-disconnected-components", {
  convexPieces: parts.length,
  triangles: triangles.length,
  remainingArea: sumArea(parts),
  splitComponents: clipped.length,
  upperArea: sumArea(clipped)
});
pending("general-multipolygon-boolean-and-open-road-domain", "M4");

// Current intersection helper deliberately does not enumerate overlapping spans.
close(segmentSegmentHit([0, 0], [10, 0], [5, -2], [5, 2])!.point[0], 5);
const overlap = segmentSegmentHit([0, 0], [10, 0], [5, 0], [15, 0]);
checks.push({
  id: "collinear-overlap-classification",
  status: overlap === null ? "known-gap" : "measured",
  measured: overlap
});
pending("facility-stage-playback", "M5");
pending("edit-undo-stale-job", "M6");
assert.equal(get("document-formats").input.proposedFormat, "fmg-vector-city");
pending("document-formats", "M1");

const boxes = Array.from({ length: 400 }, (_, id) => ({
  id,
  minX: (id % 20) * 10,
  minY: Math.floor(id / 20) * 10,
  maxX: (id % 20) * 10 + 4,
  maxY: Math.floor(id / 20) * 10 + 4
}));
const query = { minX: 48, minY: 48, maxX: 72, maxY: 72 };
const exactHits = boxes
  .filter(b => b.minX <= query.maxX && b.maxX >= query.minX && b.minY <= query.maxY && b.maxY >= query.minY)
  .map(b => b.id)
  .sort((a, b) => a - b);
const tree = new RBush<(typeof boxes)[number]>();
tree.load(boxes);
const buckets = new PlotIndex<(typeof boxes)[number]>(20);
for (const box of boxes) buckets.add(box, [box.minX, box.minY, box.maxX, box.maxY]);
assert.deepEqual(
  tree
    .search(query)
    .map(b => b.id)
    .sort((a, b) => a - b),
  exactHits
);
const bucketCandidates = buckets.query([query.minX, query.minY, query.maxX, query.maxY]);
assert(exactHits.every(id => bucketCandidates.some(b => b.id === id)));
measured("spatial-index-candidates", {
  records: boxes.length,
  exactHits: exactHits.length,
  rbushCandidates: tree.search(query).length,
  bucketCandidates: bucketCandidates.length
});

const timings = [
  timing("cubic-uniform-1024-lab", () => sampleCubic(curve.cubic, 1024)),
  timing("current-freehand-simplification", () => simplifyPolyline(curve.freehand, fixtures.precision.positionMeters)),
  timing("current-convex-hole-difference", () => subtractConvex(domain.input.outer, domain.input.hole, 0)),
  timing("three-hole-triangulation", () =>
    ShapeUtils.triangulateShape(vector2(domain.input.outer), [vector2(domain.input.hole)])
  ),
  timing("current-disconnected-half-plane", () =>
    clipStreetBlocks(domain.input.uShape, domain.input.splitNormal, domain.input.splitOffset)
  ),
  timing("rbush-load-query-400", () => new RBush<(typeof boxes)[number]>().load(boxes).search(query)),
  timing("buckets-build-query-400", () => {
    const index = new PlotIndex<(typeof boxes)[number]>(20);
    for (const box of boxes) index.add(box, [box.minX, box.minY, box.maxX, box.maxY]);
    return index.query([query.minX, query.minY, query.maxX, query.maxY]);
  })
];

async function saveObservation() {
  const candidates = {
    existingConvex: 'export { intersectConvex, subtractConvex } from "./src/city-editor/generators/parcelGeometry.ts";',
    existingBuckets: 'export { PlotIndex } from "./src/city-editor/generators/parcelGeometry.ts";',
    rbush: 'export { default } from "rbush";',
    threeTriangulation: 'export { ShapeUtils, Vector2 } from "three";'
  };
  const bundles = [];
  for (const [name, contents] of Object.entries(candidates)) {
    const result = await build({
      stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
      bundle: true,
      write: false,
      minify: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      logLevel: "silent"
    });
    const bytes = result.outputFiles[0].contents;
    bundles.push({ name, minifiedBytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }

  const inputs = [
    fixturePath,
    inventoryPath,
    fmg.sourceFile,
    "scripts/city-editor/meshless/m0Baseline.ts",
    "src/utils/bridgeSkewPolicy.ts",
    "src/city-editor/generators/geom.ts",
    "src/city-editor/generators/lotGeometry.ts",
    "src/city-editor/generators/parcelGeometry.ts",
    "src/city-editor/generators/streetBlockGeometry.ts",
    "package-lock.json",
    ...auditedSources
  ]
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .map(fileHash);
  const report = {
    format: "ce-meshless-m0-observation",
    version: 1,
    measuredAtUtc: new Date().toISOString(),
    environment: { node: process.version, platform: platform(), architecture: arch(), cpu: cpus()[0]?.model },
    scope:
      "Bounded existing-kernel and analytic-reference lab; no meshless generator, browser frame or full-city performance claim",
    precision: fixtures.precision,
    checks,
    timings,
    bundles,
    inputs,
    preparedCases: fixtures.cases.map((c: { id: string; phase: string; acceptance: string[] }) => ({
      id: c.id,
      implementationPhase: c.phase,
      acceptance: c.acceptance
    }))
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(
    JSON.stringify(
      {
        output: out,
        sha256: fileHash(out).sha256,
        preparedCases: report.preparedCases.length,
        knownGaps: checks.filter(c => c.status === "known-gap").map(c => c.id),
        timings,
        bundles
      },
      null,
      2
    )
  );
}

saveObservation().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
