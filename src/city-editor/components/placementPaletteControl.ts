import { MARKET_PALETTES, type MarketPalette } from "../../buildings/medieval/marketAppearance";
import { placementPalette } from "../../buildings/placementModels";
import { editorText } from "../../i18n/editorMessages";

export function syncPlacementPaletteControl(
  select: HTMLSelectElement,
  modelId: string,
  requested?: MarketPalette
): void {
  const value = placementPalette(modelId, requested);
  select.disabled = !value;
  if (!value) return;
  if (!select.options.length)
    for (const id of MARKET_PALETTES) select.add(new Option(editorText(`cityEditor.messages.marketPalette_${id}`), id));
  select.value = value;
}
