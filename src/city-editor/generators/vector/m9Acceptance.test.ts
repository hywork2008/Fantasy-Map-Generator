import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { createVectorScene } from "../../renderers/vector/scene3d";
import { parseVectorDocument, serializeVectorDocument } from "../../services/io/vector/documentCodec";
import { decodeVectorShare, encodeVectorShare } from "../../services/io/vector/share";
import type { Point } from "../../types/primitives";
import { createVectorExample } from "./document";
import { curveSource } from "./editing/paths";
import { syntheticVectorInput } from "./generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban, type VectorUrbanProfile } from "./generation/urban";
import { pointSegmentDistance, samplePath } from "./geometry/sampling";

const output = process.env.CE_MESHLESS_ACCEPTANCE_OUT;
/** Deliberately opt-in: three fixed scales, one seed, no full geometry output. */
describe.runIf(!!output)("M9 bounded acceptance observation", () => {
  it("records compatibility, independent curve accuracy and fixed-scale cost without changing source geometry", () => {
    const root = resolve(import.meta.dirname, "../../../.."),
      hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex"),
      checks: unknown[] = [],
      inputs: { path: string; sha256: string; bytes: number }[] = [];
    const fixtures = [
      "docs/analytics/ce-meshless-m3-input-20261107.json",
      "docs/analytics/ce-meshless-m4-fmg-20261107.json",
      "docs/analytics/ce-meshless-m5-synthetic-20261107.json",
      "docs/analytics/ce-meshless-m6-edit-20261107.json",
      "docs/analytics/ce-meshless-m8-sites-20261107.json",
      "docs/analytics/ce-meshless-m8-freeform-edit-20261107.json"
    ];
    const time = <T>(fn: () => T) => {
      const start = performance.now(),
        value = fn();
      return { value, ms: performance.now() - start };
    };
    for (const path of fixtures) {
      const bytes = readFileSync(resolve(root, path)),
        parsed = time(() => parseVectorDocument(bytes.toString()));
      expect(parsed.value, path).not.toBeNull();
      const doc = parsed.value!,
        before = serializeVectorDocument(doc),
        render = time(() => vectorRenderData(doc)),
        scene = time(() => createVectorScene(render.value));
      scene.value.dispose();
      expect(serializeVectorDocument(doc)).toBe(before);
      expect(parseVectorDocument(before)).toEqual(doc);
      const shared = decodeVectorShare(
        encodeVectorShare({
          kind: "fmg-vector-city-share",
          version: 1,
          mode: "document",
          document: doc,
          stage: doc.urban ? "housing" : "regions"
        })
      );
      expect(shared?.mode).toBe("document");
      inputs.push({ path, sha256: hash(bytes), bytes: bytes.length });
      checks.push({
        id: path,
        fromVersion: JSON.parse(bytes.toString()).version,
        toVersion: doc.version,
        parseMs: parsed.ms,
        renderMs: render.ms,
        sceneMs: scene.ms,
        surfaces: render.value.surfaces.length,
        paths: Object.keys(doc.paths).length,
        placements: Object.keys(doc.placements).length
      });
    }
    const example = createVectorExample();
    example.version = 6 as typeof example.version;
    expect(parseVectorDocument(JSON.stringify(example))?.version).toBe(7);
    const points: Point[] = [
        [0, 0],
        [50, 140],
        [-60, -100],
        [120, 20]
      ],
      path = {
        ...createVectorExample().paths.outer,
        id: "accuracy",
        role: "road" as const,
        source: curveSource([points[0], points[3]], "polyline", false)
      };
    path.source = {
      kind: "curve",
      closed: false,
      segments: [
        { id: "segment:0", kind: "cubic", from: points[0], control1: points[1], control2: points[2], to: points[3] }
      ]
    };
    const samples = samplePath(path);
    let maxError = 0;
    for (let i = 0; i <= 4096; i++) {
      const t = i / 4096,
        u = 1 - t,
        p: Point = [0, 0];
      for (let axis = 0; axis < 2; axis++)
        p[axis] =
          u * u * u * points[0][axis] +
          3 * u * u * t * points[1][axis] +
          3 * u * t * t * points[2][axis] +
          t * t * t * points[3][axis];
      let error = Infinity;
      for (let j = 1; j < samples.length; j++)
        error = Math.min(error, pointSegmentDistance(p, samples[j - 1].point, samples[j].point));
      maxError = Math.max(maxError, error);
    }
    expect(maxError).toBeLessThanOrEqual(0.005);
    checks.push({
      id: "independent-cubic-distance",
      referencePoints: 4097,
      samples: samples.length,
      maxErrorMeters: maxError,
      limitMeters: 0.005
    });
    const coveragePath = "docs/plan/data/ce-meshless-m9-coverage.json",
      coverageBytes = readFileSync(resolve(root, coveragePath)),
      coverageFile = JSON.parse(coverageBytes.toString());
    const coverage = {
      path: coveragePath,
      sha256: hash(coverageBytes),
      verified: coverageFile.features.filter((f: { status: string }) => f.status === "verified").length,
      limited: coverageFile.features.filter((f: { status: string }) => f.status === "limited").length,
      releaseChannel: coverageFile.releaseChannel
    };
    const scales = [];
    for (const population of [500, 1000, 5000]) {
      const source = syntheticVectorInput("m9-fixed", population === 5000 ? 240 : 150, true),
        before = serializeVectorDocument(source),
        skeleton = time(
          () => generateVectorSkeleton(source, { ...DEFAULT_VECTOR_GENERATION, branches: 4, wall: "ellipse" }).document
        ),
        profile: VectorUrbanProfile = {
          lanesMs: 0,
          facilityMs: 0,
          housingMs: 0,
          facilityAttempts: 0,
          housingAttempts: 0,
          regionMs: 0,
          curveMs: 0,
          starvedFacilities: 0,
          cappedFacilities: 0,
          housingStop: "demand-met"
        },
        urban = time(() =>
          generateVectorUrban(skeleton.value, { ...DEFAULT_VECTOR_URBAN, population, maxLanes: 8 }, undefined, {
            profile
          })
        );
      expect(serializeVectorDocument(source)).toBe(before);
      const data = time(() => vectorRenderData(urban.value)),
        scene = time(() => createVectorScene(data.value)),
        native = time(() => serializeVectorDocument(urban.value));
      scene.value.dispose();
      expect(Buffer.byteLength(native.value)).toBeLessThanOrEqual(8 * 1024 * 1024);
      expect(urban.ms + skeleton.ms).toBeLessThan(60000);
      expect(data.ms + scene.ms).toBeLessThan(10000);
      const facilities = vectorRenderData(urban.value, "facilities").surfaces.filter(s => s.kind === "building");
      expect(facilities.every(s => s.buildingKind !== "housing")).toBe(true);
      scales.push({
        population,
        radiusMeters: population === 5000 ? 240 : 150,
        skeletonSettings: { ...DEFAULT_VECTOR_GENERATION, branches: 4, wall: "ellipse" },
        urbanSettings: { ...DEFAULT_VECTOR_URBAN, population, maxLanes: 8 },
        seed: "m9-fixed",
        inputSha256: hash(before),
        skeletonMs: skeleton.ms,
        urbanMs: urban.ms,
        renderMs: data.ms,
        sceneMs: scene.ms,
        serializeMs: native.ms,
        bytes: Buffer.byteLength(native.value),
        paths: Object.keys(urban.value.paths).length,
        placements: Object.keys(urban.value.placements).length,
        report: urban.value.urban!.report,
        profile
      });
    }
    writeFileSync(
      output!,
      `${JSON.stringify({ format: "ce-meshless-m9-acceptance", version: 1, measuredAtUtc: new Date().toISOString(), environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model }, scope: "Six saved inputs and three fixed population scales; one seed; one ordered run after compatibility fixtures, shared caches may be warm; not a statistical benchmark", thresholds: { curveMeters: 0.005, workerMs: 60000, renderAndSceneMs: 10000, nativeBytes: 8 * 1024 * 1024 }, inputs, coverage, checks, scales }, null, 2)}\n`
    );
  }, 240000);
});
