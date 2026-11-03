import type { PlacementQuality } from "../../buildings/placementContract";
import { placementQualities, placementQuality } from "../../buildings/placementModels";
import { editorText } from "../../i18n/editorMessages";

/** Hide quality choices for models that still use their compatibility factory. */
export function syncPlacementQualityControl(
  select: HTMLSelectElement,
  modelId: string,
  requested?: PlacementQuality
): void {
  const levels = placementQualities(modelId);
  const titles = levels.map(level =>
    editorText(level === "low" ? "cityEditor.messages.modelQualityLow" : "cityEditor.messages.modelQualityHigh")
  );
  if (
    select.options.length !== levels.length ||
    levels.some((level, index) => select.options[index].value !== level || select.options[index].text !== titles[index])
  ) {
    select.replaceChildren(...levels.map((level, index) => new Option(titles[index], level)));
  }
  const value = placementQuality(modelId, requested) ?? "";
  if (select.value !== value) select.value = value;
  select.disabled = !levels.length;
}
