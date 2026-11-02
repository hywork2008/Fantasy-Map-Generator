import type { CityDocument } from "../../types/document";
import type { FreeformWay } from "../../types/terrain";
import { previewWay, type WayDraft, type WayPreview } from "./validateWay";

export function commitWay(document: CityDocument, draft: WayDraft): { document: CityDocument; preview: WayPreview } {
  const preview = previewWay(document, draft);
  if (!preview.ok || !document.terrain) return { document, preview };
  const way: FreeformWay = {
    id: draft.id,
    centerline: draft.centerline.map(point => [point[0], point[1]]),
    widthMeters: draft.widthMeters,
    profile: draft.profile,
    surface: draft.surface,
    ...(draft.grade ? { grade: draft.grade } : {}),
    ...(preview.stepped ? { landings: preview.stepped.landings, flights: preview.stepped.flights } : {})
  };
  return {
    document: {
      ...document,
      terrain: {
        ...document.terrain,
        ways: [...(document.terrain.ways ?? []).filter(item => item.id !== draft.id), way]
      }
    },
    preview
  };
}

export function removeWay(document: CityDocument, id: string): CityDocument {
  if (!document.terrain?.ways?.some(way => way.id === id)) return document;
  return {
    ...document,
    terrain: { ...document.terrain, ways: document.terrain.ways.filter(way => way.id !== id) }
  };
}
