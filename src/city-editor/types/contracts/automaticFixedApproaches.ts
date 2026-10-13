import type { CityDocument } from "../document";

export interface AutomaticFixedApproachResult {
  document: CityDocument;
  diagnostics: readonly { facilityId: number; side: "A" | "B"; status: "adopted" | "unresolved"; reason?: string }[];
}
