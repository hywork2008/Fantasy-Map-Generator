import { resolvePortFrontages } from "../../core/gen/site/portFrontages";
import { applyImportedFixedCrossings } from "../../core/importedFixedCrossings";
import type { CityDocument } from "../../core/types";
import type { GenerationSettings } from "../../types/generation";

/** Preserve the source port frontages for berth-specific vessel selection. */
export function applyImportedWaterAccess(document: CityDocument, settings: GenerationSettings): void {
  applyImportedFixedCrossings(document, settings.descriptor);
  const access = settings.descriptor ? resolvePortFrontages(settings.descriptor).burg.waterAccess : undefined;
  if (access) document.waterAccess = structuredClone(access);
  else delete document.waterAccess;
}
