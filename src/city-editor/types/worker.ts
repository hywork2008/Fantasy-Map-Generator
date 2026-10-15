import type { SupportedLanguage } from "../../i18n";
import type { GenerationDebugPreview } from "./contracts/generationDebug";
import type { GenerationSample } from "./contracts/generationDiagnostics";
import type { CityDocument } from "./document";
import type { GenerationSettings } from "./generation";
export interface GenerationRequest {
  document: CityDocument;
  settings: GenerationSettings;
  seed: string;
  /** Capture the UI locale because workers do not share localStorage. */
  language?: SupportedLanguage;
  debugFailure?: boolean;
  /** Opt-in diagnostics for benchmarks; never persisted in city documents. */
  profile?: boolean;
}
export interface GenerationTimings {
  structureMs: number;
  resultTransferMs: number;
  breakdown?: import("../../utils/processingProfiler").ProcessingTiming[];
}
export type GenerationReply =
  | { type: "progress"; sample: GenerationSample }
  | {
      type: "complete";
      document: CityDocument | null;
      failurePreview?: GenerationDebugPreview;
      timing?: {
        structureMs: number;
        postedAt: number;
        breakdown?: import("../../utils/processingProfiler").ProcessingTiming[];
      };
    }
  | { type: "error"; message: string };
