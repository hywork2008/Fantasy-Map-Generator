import type { CityDocument } from "../types/document";
import type { DistrictFabric } from "./blockInfill.types";

export type RuralFieldOverlay = Pick<DistrictFabric, "farms" | "lanes" | "ruralFields">;
const overlays = new WeakMap<CityDocument, { fingerprint: string; overlay: RuralFieldOverlay }>();
/** Session-only derived geometry. Generation and initial rendering never compute it. */
export function storeRuralFieldOverlay(document: CityDocument, fingerprint: string, overlay: RuralFieldOverlay): void {
  overlays.set(document, { fingerprint, overlay });
}
export function ruralFieldOverlay(document: CityDocument, fingerprint: string): RuralFieldOverlay | undefined {
  const entry = overlays.get(document);
  return document.ruralFieldSettings?.mode !== "off" && entry?.fingerprint === fingerprint ? entry.overlay : undefined;
}
