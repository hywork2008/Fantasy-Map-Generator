import { generateCityOnDocument } from "./generate";
import type { GenerationDebugPreview } from "./generationDebug";
import type { GenerationReply, GenerationRequest } from "./generationWorkerClient";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<GenerationRequest>) => void;
  postMessage: (reply: GenerationReply) => void;
};
scope.onmessage = ({ data }) => {
  try {
    let failurePreview: GenerationDebugPreview | undefined;
    const document = generateCityOnDocument(
      data.document,
      data.settings,
      data.seed,
      sample => scope.postMessage({ type: "progress", sample }),
      data.debugFailure
        ? preview => {
            failurePreview = preview;
          }
        : undefined
    );
    scope.postMessage({ type: "complete", document, ...(!document && failurePreview ? { failurePreview } : {}) });
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
