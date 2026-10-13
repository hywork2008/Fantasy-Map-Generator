import type { CityDocument } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { applyImportedFixedCrossings } from "../importedFixedCrossings";
import { resolvePortFrontages } from "../site/portFrontages";

/** Preserve the source port frontages for berth-specific vessel selection. */
export function applyImportedWaterAccess(document: CityDocument, settings: GenerationSettings): void {
  applyImportedFixedCrossings(document, settings.descriptor);
  const access = settings.descriptor ? resolvePortFrontages(settings.descriptor).burg.waterAccess : undefined;
  if (access) document.waterAccess = structuredClone(access);
  else delete document.waterAccess;
}
