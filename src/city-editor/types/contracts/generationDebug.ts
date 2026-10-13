import type { CityDocument, Id } from "../document";
import type { GenerationSample } from "./generationDiagnostics";

export interface GenerationDebugPreview {
  document: CityDocument;
  sample: GenerationSample;
  seed: string;
  /** IDs named by the validator, or contextual areas when no location is known. */
  highlights: { vertices: Id[]; edges: Id[]; faces: Id[]; contextual: boolean };
}
