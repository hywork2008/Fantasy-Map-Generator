import { MAX_FILE_BYTES, parseDocument } from "../core/document";
import type { DungeonDocument } from "../core/types";
import { type RenderOptions, renderDungeonSvg } from "../render/svg";

export const DUNGEON_FILE_EXTENSION = ".fmg-dungeon-editor.json";
export function serializeDocument(document: DungeonDocument): string {
  return JSON.stringify(document, null, 2);
}
export async function readDungeonFile(file: File): Promise<ReturnType<typeof parseDocument>> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "ファイルは 2 MB 以下にしてください。" };
  try {
    return parseDocument(await file.text());
  } catch {
    return { ok: false, message: "ファイルを読み込めませんでした。" };
  }
}
function download(content: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportDungeonJson(document: DungeonDocument): void {
  download(serializeDocument(document), "application/json", `dungeon${DUNGEON_FILE_EXTENSION}`);
}
export function exportDungeonSvg(document: DungeonDocument, options: RenderOptions): void {
  download(
    renderDungeonSvg(document, { ...options, interactive: false, selectedId: undefined }),
    "image/svg+xml;charset=utf-8",
    "dungeon.svg"
  );
}
