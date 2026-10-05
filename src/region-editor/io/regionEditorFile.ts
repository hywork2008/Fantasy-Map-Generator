import { validateRegionDocument } from "../core/document";
import type { RegionDocument } from "../core/types";
import { renderRegionSvg } from "../render/svg";

export function exportRegionJson(doc: RegionDocument): void {
  const jsonStr = JSON.stringify(doc, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  downloadBlob(blob, `${slugify(doc.title)}.region.json`);
}

export function exportRegionSvg(doc: RegionDocument): void {
  const svgStr = renderRegionSvg(doc, null, { quality: "high" });
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, `${slugify(doc.title)}.svg`);
}

export function readRegionFile(
  file: File
): Promise<{ ok: true; document: RegionDocument } | { ok: false; error: string }> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        resolve(validateRegionDocument(parsed));
      } catch (err) {
        resolve({ ok: false, error: `JSON Parse error: ${String(err)}` });
      }
    };
    reader.onerror = () => resolve({ ok: false, error: "Failed to read file" });
    reader.readAsText(file);
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "region-map"
  );
}
