import { parseDocument } from "../core/document";
import type { CityDocument } from "../core/types";

export const CITY_EDITOR_FILE_EXTENSION = ".fmg-city-editor.json";

/** Download the complete editable map, not a rendered SVG snapshot. */
export function exportCityMap(cityDocument: CityDocument): void {
  const blob = new Blob([JSON.stringify(cityDocument, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `city-map${CITY_EDITOR_FILE_EXTENSION}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Open a file picker and validate that the selected JSON is an editor map. */
export function pickCityMap(): Promise<CityDocument | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${CITY_EDITOR_FILE_EXTENSION},application/json`;
    input.addEventListener("change", () => void readCityMap(input.files?.[0]).then(resolve), { once: true });
    input.click();
  });
}

export async function readCityMap(file: File | undefined): Promise<CityDocument | null> {
  if (!file) return null;
  try {
    return parseDocument(await file.text());
  } catch {
    return null;
  }
}
