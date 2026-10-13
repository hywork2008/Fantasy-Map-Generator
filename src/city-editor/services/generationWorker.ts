import i18n, { isSupportedLanguage } from "../../i18n/index";
import { generateCityOnDocument } from "../generators/generation/generateCity";
import type { GenerationDebugPreview } from "../types/contracts/generationDebug";
import type { GenerationReply, GenerationRequest } from "../types/worker";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<GenerationRequest>) => void;
  postMessage: (reply: GenerationReply) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    await i18n.changeLanguage(isSupportedLanguage(data.language ?? null) ? data.language : "en");
    const started = performance.now();
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
    scope.postMessage({
      type: "complete",
      document,
      timing: { structureMs: performance.now() - started, postedAt: performance.timeOrigin + performance.now() },
      ...(!document && failurePreview ? { failurePreview } : {})
    });
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
