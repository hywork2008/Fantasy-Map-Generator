import { describe, expect, it } from "vitest";
import { syntheticVectorInput } from "../generators/vector/generation/input";
import { perimeterPlansKept, planPerimeterRequest } from "../generators/vector/generation/perimeter";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../generators/vector/generation/urban";
import type { VectorDistrictReply, VectorDistrictRequest, VectorDistrictWorker } from "./vectorDistrictPool";
import { createVectorPlanPreparation } from "./vectorPlanPreparation";

const city = (seed: string) =>
  generateVectorUrban(
    generateVectorSkeleton(syntheticVectorInput(seed, 100, false), { ...DEFAULT_VECTOR_GENERATION, branches: 4 })
      .document,
    { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 200, maxLanes: 4 }
  );
/** Workers answering from replies planned beforehand, so only the preparation can keep plans on this thread. */
function replayWorker(replies: Map<string, unknown>): VectorDistrictWorker {
  const worker: VectorDistrictWorker = {
    onmessage: null,
    onerror: null,
    postMessage(message: VectorDistrictRequest) {
      const results = replies.get(JSON.stringify({ ...message, id: 0 }));
      setTimeout(() =>
        worker.onmessage?.({ data: structuredClone({ id: message.id, results }) as VectorDistrictReply })
      );
    },
    terminate() {}
  };
  return worker;
}

describe("preparing district plans for dependency updates (S4g)", () => {
  it("keeps the plans of an opened city from district workers, and skips cities already kept", async () => {
    const doc = city("m6");
    // Record what workers would answer, then push the plans out of the cache with two other cities.
    const replies = new Map<string, unknown>();
    const recorder = (): VectorDistrictWorker => {
      const worker: VectorDistrictWorker = {
        onmessage: null,
        onerror: null,
        postMessage(message: VectorDistrictRequest) {
          const results = structuredClone(planPerimeterRequest(structuredClone(message)));
          replies.set(JSON.stringify({ ...message, id: 0 }), results);
          setTimeout(() => worker.onmessage?.({ data: { id: message.id, results } }));
        },
        terminate() {}
      };
      return worker;
    };
    const outcomes: string[] = [];
    let settled: () => void = () => {};
    const record = createVectorPlanPreparation({
      workers: 2,
      createWorker: recorder,
      onSettled: o => {
        outcomes.push(o);
        settled();
      }
    });
    city("m7");
    city("m8");
    expect(perimeterPlansKept(doc.fabric)).toBe(false);
    await new Promise<void>(resolve => {
      settled = resolve;
      record.request(doc);
    });
    // Streets and street blocks, each split between the two workers; the replay below answers them.
    expect(replies.size).toBe(4);
    city("m7");
    city("m8");
    expect(perimeterPlansKept(doc.fabric)).toBe(false);

    const prepare = createVectorPlanPreparation({
      workers: 2,
      createWorker: () => replayWorker(replies),
      onSettled: o => {
        outcomes.push(o);
        settled();
      }
    });
    await new Promise<void>(resolve => {
      settled = resolve;
      prepare.request(doc);
    });
    expect(outcomes).toEqual(["prepared", "prepared"]);
    expect(perimeterPlansKept(doc.fabric)).toBe(true);
    // Kept plans start nothing.
    prepare.request(structuredClone(doc));
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(outcomes).toHaveLength(2);
    prepare.dispose();
  });
});
