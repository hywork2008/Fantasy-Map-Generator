import { parseDocument } from "../core/document";
import type { CityDocument } from "../core/types";
import { importMfcgJson, importMfcgSvg } from "./mfcgImport";

export const CITY_EDITOR_FILE_EXTENSION = ".fmg-city-editor.json";

export interface ImportedCityMap {
  document: CityDocument;
  source: "city-editor" | "mfcg-json" | "mfcg-svg";
}

/** Download the complete editable map, not a rendered SVG snapshot. */
export function exportCityMap(cityDocument: CityDocument): void {
  const blob = new Blob([JSON.stringify(cityDocument, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ce-${formatExportTimestamp(new Date())}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatExportTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Open a file picker for native City Editor maps and MFCG exports. */
export function pickCityMap(): Promise<ImportedCityMap | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${CITY_EDITOR_FILE_EXTENSION},application/json,image/svg+xml,.svg`;
    input.addEventListener("change", () => void readCityMap(input.files?.[0]).then(resolve), { once: true });
    input.click();
  });
}

export async function readCityMap(file: File | undefined): Promise<ImportedCityMap | null> {
  if (!file) return null;
  try {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml") {
      const document = importMfcgSvg(text);
      return document ? { document, source: "mfcg-svg" } : null;
    }
    const cityEditor = parseDocument(text);
    if (cityEditor) return { document: cityEditor, source: "city-editor" };
    const document = importMfcgJson(JSON.parse(text));
    return document ? { document, source: "mfcg-json" } : null;
  } catch {
    return null;
  }
}
