import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { syntheticVectorInput } from "../generators/vector/generation/input";
import { planPerimeterDistrict } from "../generators/vector/generation/perimeter";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../generators/vector/generation/pipeline";
import {
  DEFAULT_VECTOR_URBAN,
  generateVectorUrban,
  generateVectorUrbanAsync
} from "../generators/vector/generation/urban";
import { serializeVectorDocument } from "./io/vector/documentCodec";
import {
  createVectorDistrictPool,
  type VectorDistrictReply,
  type VectorDistrictWorker,
  vectorDistrictWorkerCount
} from "./vectorDistrictPool";

/** A stand-in worker: messages are structured-cloned both ways and answered asynchronously. */
function fakeWorker(log: number[]): VectorDistrictWorker {
  const worker: VectorDistrictWorker = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      const request = structuredClone(message);
      log.push(request.jobs.length);
      setTimeout(() => {
        const reply: VectorDistrictReply = {
          id: request.id,
          results: request.jobs.map(job => planPerimeterDistrict(request.context, job))
        };
        worker.onmessage?.({ data: structuredClone(reply) });
      }, Math.random() * 5);
    },
    terminate() {}
  };
  return worker;
}
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("district planning in a worker pool (S3)", () => {
  it("serialises the same document with 1, 2 and 4 workers as the direct run", async () => {
    const skeleton = generateVectorSkeleton(syntheticVectorInput("m6", 100, false), {
        ...DEFAULT_VECTOR_GENERATION,
        branches: 4
      }).document,
      settings = { ...DEFAULT_VECTOR_URBAN, mode: "medieval" as const, population: 600, maxLanes: 4 },
      direct = sha(serializeVectorDocument(generateVectorUrban(skeleton, settings)));
    for (const count of [1, 2, 4]) {
      const log: number[] = [],
        pool = createVectorDistrictPool(count, () => fakeWorker(log)),
        doc = await generateVectorUrbanAsync(skeleton, settings, request => pool.plan(request));
      pool.dispose();
      expect(sha(serializeVectorDocument(doc))).toBe(direct);
      // One worker plans here; more split the districts into one contiguous run per worker.
      expect(log.length).toBe(count === 1 ? 0 : Math.min(count, log.length));
      if (count > 1) expect(log.length).toBeGreaterThan(1);
    }
  });
  it("uses one fewer worker than the cores, from one to four", () => {
    expect([1, 2, 3, 4, 8, 16].map(vectorDistrictWorkerCount)).toEqual([1, 1, 2, 3, 4, 4]);
  });
});
