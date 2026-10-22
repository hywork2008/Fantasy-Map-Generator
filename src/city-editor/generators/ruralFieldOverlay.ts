import type { CityDocument } from "../types/document";
import type { DistrictFabric } from "./blockInfill.types";

export type RuralFieldOverlay = Pick<DistrictFabric, "farms" | "lanes" | "ruralFields">;
const overlays = new WeakMap<CityDocument, { fingerprint: string; overlay: RuralFieldOverlay }>();
/** Session-only results from the regeneration button override saved stage snapshots. */
export function storeRuralFieldOverlay(document: CityDocument, fingerprint: string, overlay: RuralFieldOverlay): void {
  overlays.set(document, { fingerprint, overlay });
}
export function ruralFieldOverlay(document: CityDocument, fingerprint: string): RuralFieldOverlay | undefined {
  const entry = overlays.get(document);
  if (document.ruralFieldSettings?.mode === "off") return undefined;
  if (entry?.fingerprint === fingerprint) return entry.overlay;
  const snapshot = document.ruralFieldSnapshot;
  return snapshot?.fingerprint === fingerprint ? snapshot : undefined;
}
