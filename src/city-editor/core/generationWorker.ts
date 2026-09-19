import { generateCityOnDocument } from "./generate";
import type { GenerationReply, GenerationRequest } from "./generationWorkerClient";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<GenerationRequest>) => void;
  postMessage: (reply: GenerationReply) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const document = generateCityOnDocument(data.document, data.settings, data.seed, sample =>
      scope.postMessage({ type: "progress", sample })
    );
    scope.postMessage({ type: "complete", document });
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
