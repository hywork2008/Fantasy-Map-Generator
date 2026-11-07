import { generateVectorSkeleton } from "../generators/vector/generation/pipeline";
import { generateVectorUrban } from "../generators/vector/generation/urban";
import type { VectorGenerationReply, VectorGenerationRequest } from "./vectorGenerationWorkerClient";

self.onmessage = ({ data }: MessageEvent<VectorGenerationRequest>) => {
  const { id, inputRevision, source, task } = data;
  try {
    if (source.revision !== inputRevision) throw new Error("generation-revision");
    const progress = (
      phase: "skeleton" | "lanes" | "facilities" | "housing" | "validation",
      completed?: number,
      total?: number
    ) => self.postMessage({ id, inputRevision, progress: { phase, completed, total } } satisfies VectorGenerationReply);
    progress("skeleton");
    const result =
      task.kind === "city"
        ? {
            document: generateVectorUrban(
              generateVectorSkeleton(source, task.settings).document,
              task.urban,
              undefined,
              { progress }
            ),
            stages: []
          }
        : task.kind === "skeleton"
          ? generateVectorSkeleton(source, task.settings)
          : { document: generateVectorUrban(source, task.settings, undefined, { progress }), stages: [] };
    self.postMessage({ id, inputRevision, result } satisfies VectorGenerationReply);
  } catch (error) {
    self.postMessage({
      id,
      inputRevision,
      error: error instanceof Error ? error.message : String(error)
    } satisfies VectorGenerationReply);
  }
};
