import { materializeFreeform, parseFreeformCity, serializeFreeform } from "../../generators/freeform/freeformCity";
import { serializeGenerationDebugSvg } from "../../renderers/generationDebugSvg";
import { serializeCitySvg } from "../../renderers/standaloneSvg";
import type { FixedApproachProvider } from "../../types/contracts/fixedApproachAdoption";
import type { GenerationDebugPreview } from "../../types/contracts/generationDebug";
import type { CityDocument } from "../../types/document";
import { type EditorDocument, isVectorDocument } from "../../types/editorDocument";
import type { VectorCityDocument } from "../../types/vector/document";
import { buildingInventoryCsv } from "../analysis/buildingInventoryCsv";
import { readForestViewPreferences } from "../forestViewPreferences";
import { parseDocument, serializeDocument } from "./documentCodec";
import { importMfcgJson, importMfcgSvg } from "./mfcgImport";
import { parseVectorDocument, serializeVectorDocument } from "./vector/documentCodec";

export const CITY_EDITOR_FILE_EXTENSION = ".fmg-city-editor.json";

export type ImportedCityMap =
  | { document: CityDocument; source: "city-editor" | "mfcg-json" | "mfcg-svg" }
  | { document: VectorCityDocument; source: "vector-city" };

/** Download the complete editable map, not a rendered SVG snapshot. */
export function exportCityMap(cityDocument: EditorDocument): void {
  const vector = isVectorDocument(cityDocument);
  const ledger = !vector && Boolean(cityDocument.freeform);
  const content = vector
    ? serializeVectorDocument(cityDocument)
    : ledger
      ? serializeFreeform(cityDocument)
      : serializeDocument(cityDocument);
  const blob = new Blob([content], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${vector ? "ce-vector-" : ledger ? "ce-freeform-" : "ce-"}${formatExportTimestamp(new Date())}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download a rendered standalone SVG map snapshot. */
export function exportCitySvg(cityDocument: CityDocument): void {
  downloadSvg(
    serializeCitySvg(cityDocument, undefined, { representation: readForestViewPreferences().representation }),
    "ce"
  );
}

/** Download one row per generated building with dimensions and floor area. */
export function exportBuildingInventoryCsv(cityDocument: CityDocument): void {
  const blob = new Blob([buildingInventoryCsv(cityDocument)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ce-building-inventory-${formatExportTimestamp(new Date())}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download the rejected checkpoint with failure highlights and diagnostics. */
export function exportGenerationDebugSvg(preview: GenerationDebugPreview): void {
  downloadSvg(serializeGenerationDebugSvg(preview), "ce-generation-failure");
}

function downloadSvg(svg: string, prefix: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}-${formatExportTimestamp(new Date())}.svg`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatExportTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Open a file picker for native City Editor maps and MFCG exports. */
export function pickCityMap(fixedApproachProvider?: FixedApproachProvider): Promise<ImportedCityMap | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${CITY_EDITOR_FILE_EXTENSION},application/json,image/svg+xml,.svg`;
    input.addEventListener("change", () => void readCityMap(input.files?.[0], fixedApproachProvider).then(resolve), {
      once: true
    });
    input.click();
  });
}

export async function readCityMap(
  file: File | undefined,
  fixedApproachProvider?: FixedApproachProvider
): Promise<ImportedCityMap | null> {
  if (!file) return null;
  try {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml") {
      const document = importMfcgSvg(text);
      return document ? { document, source: "mfcg-svg" } : null;
    }
    const payload = JSON.parse(text) as { format?: unknown };
    if (payload && typeof payload === "object" && payload.format === "fmg-vector-city") {
      const document = parseVectorDocument(text);
      return document ? { document, source: "vector-city" } : null;
    }
    if (payload && typeof payload === "object" && payload.format === "fmg-freeform-city") {
      const city = parseFreeformCity(text);
      return city ? { document: materializeFreeform(city), source: "city-editor" } : null;
    }
    const cityEditor = parseDocument(text, fixedApproachProvider);
    if (cityEditor) return { document: cityEditor, source: "city-editor" };
    const document = importMfcgJson(payload);
    return document ? { document, source: "mfcg-json" } : null;
  } catch {
    return null;
  }
}
