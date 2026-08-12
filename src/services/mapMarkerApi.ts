/**
 * Pure helpers backing `ExtensionAPI.createMapMarker` / `updateMapMarker`
 * (docs/plan/great-library.md §Marker作成経路). Kept separate from app.ts's `buildExtensionAPI()`
 * closure so the id-allocation and patch-application logic can be unit tested without importing
 * the full app bootstrap module graph.
 */

import type { Marker } from "../types/models";
import type { WorldNote } from "../types/WorldState";
import { last } from "../utils/arrayUtils";

/** Same allocation pattern as the host's own marker-creating callers (e.g. controllers/battle-screen.ts). */
export function nextMarkerId(markers: readonly Marker[]): number {
  return (last(markers as Marker[])?.i ?? -1) + 1;
}

/** Canonical note id for a marker — every marker-creating call site in the host uses this convention. */
export function markerNoteId(markerId: number): string {
  return `marker${markerId}`;
}

export type MapMarkerPatch = Partial<Omit<Marker, "i">> & { noteName?: string; noteLegend?: string };

/** Applies a patch to an existing marker (and its paired note's name/legend, if provided) in place. */
export function applyMapMarkerPatch(marker: Marker, note: WorldNote | undefined, patch: MapMarkerPatch): void {
  const { noteName, noteLegend, ...markerPatch } = patch;
  Object.assign(marker, markerPatch);

  if (!note) return;
  if (noteName !== undefined) note.name = noteName;
  if (noteLegend !== undefined) note.legend = noteLegend;
}
