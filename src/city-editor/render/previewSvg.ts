import type { GenerationObserver } from "../core/generationDiagnostics";
import type { CityDocument } from "../core/types";
import { renderStandaloneCitySvg } from "./svg";

export const CITY_PREVIEW_VERSION = 1;

/** Structure-only rendering: no residential lots or detailed facility fabric.
 * Complex blocks use their existing land-use fill; no symbol search is needed.
 * The shared renderer keeps water, validated crossings and defenses identical.
 */
export function renderCityPreviewSvg(document: CityDocument, observer?: GenerationObserver): SVGSVGElement {
  return renderStandaloneCitySvg(document, true, observer);
}

export function serializeCityPreviewSvg(document: CityDocument, observer?: GenerationObserver): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${new XMLSerializer().serializeToString(renderCityPreviewSvg(document, observer))}`;
}
