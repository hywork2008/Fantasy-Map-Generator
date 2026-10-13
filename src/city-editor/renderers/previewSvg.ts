import type { GenerationObserver } from "../generators/generationDiagnostics";
import type { CityDocument } from "../types/document";
import { serializeSvgFile } from "./serializeSvg";
import { renderStandaloneCitySvg } from "./standaloneSvg";

export const CITY_PREVIEW_VERSION = 1;

/** Structure-only rendering: no residential lots or detailed facility fabric.
 * Complex blocks use their existing land-use fill; no symbol search is needed.
 * The shared renderer keeps water, validated crossings and defenses identical.
 */
export function renderCityPreviewSvg(document: CityDocument, observer?: GenerationObserver): SVGSVGElement {
  return renderStandaloneCitySvg(document, true, observer);
}

export function serializeCityPreviewSvg(document: CityDocument, observer?: GenerationObserver): string {
  return serializeSvgFile(renderCityPreviewSvg(document, observer));
}
