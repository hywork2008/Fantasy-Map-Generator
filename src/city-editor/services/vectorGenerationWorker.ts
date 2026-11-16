import { generateVectorSkeleton } from "../generators/vector/generation/pipeline";
import { generateVectorUrbanAsync } from "../generators/vector/generation/urban";
import { createVectorDistrictPool, vectorDistrictWorkerCount } from "./vectorDistrictPool";
import type { VectorGenerationReply, VectorGenerationRequest } from "./vectorGenerationWorkerClient";

self.onmessage = async ({ data }: MessageEvent<VectorGenerationRequest>) => {
  const { id, inputRevision, source, task } = data;
  // Districts are planned in nested workers where the browser allows them; the result does not depend on it.
  const pool = createVectorDistrictPool(
    typeof Worker === "undefined" ? 1 : (data.districtWorkers ?? vectorDistrictWorkerCount())
  );
  try {
    if (source.revision !== inputRevision) throw new Error("generation-revision");
    const progress = (
      phase: "skeleton" | "lanes" | "facilities" | "housing" | "validation",
      completed?: number,
      total?: number
    ) => self.postMessage({ id, inputRevision, progress: { phase, completed, total } } satisfies VectorGenerationReply);
    const plan = pool.plan.bind(pool);
    progress("skeleton");
    const result =
      task.kind === "city"
        ? {
            document: await generateVectorUrbanAsync(
              generateVectorSkeleton(source, task.settings).document,
              task.urban,
              plan,
              undefined,
              { progress }
            ),
            stages: []
          }
        : task.kind === "skeleton"
          ? generateVectorSkeleton(source, task.settings)
          : {
              document: await generateVectorUrbanAsync(source, task.settings, plan, undefined, { progress }),
              stages: []
            };
    self.postMessage({ id, inputRevision, result } satisfies VectorGenerationReply);
  } catch (error) {
    self.postMessage({
      id,
      inputRevision,
      error: error instanceof Error ? error.message : String(error)
    } satisfies VectorGenerationReply);
  } finally {
    pool.dispose();
  }
};
