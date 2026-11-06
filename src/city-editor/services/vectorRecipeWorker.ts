import { generateVectorSkeleton } from "../generators/vector/generation/pipeline";
import { generateVectorUrban } from "../generators/vector/generation/urban";
import type { VectorRecipe } from "./io/vector/share";

self.onmessage = ({ data }: MessageEvent<VectorRecipe>) => {
  try {
    const skeleton = generateVectorSkeleton(data.input, data.skeleton).document;
    self.postMessage({ document: data.urban ? generateVectorUrban(skeleton, data.urban) : skeleton });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
