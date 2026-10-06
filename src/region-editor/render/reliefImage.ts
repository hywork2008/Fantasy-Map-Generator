import type { RegionDocument } from "../core/types";
import { computeReliefRaster } from "./relief";

/**
 * Relief ラスタを data URI に変換してキャッシュする。
 * 再描画（選択・ズーム・ブラシ）のたびに再計算しないよう、入力のハッシュで1件だけ保持する。
 * Canvas の無い環境（テスト）では null。
 */
let cache: { key: string; uri: string | null } | null = null;

function reliefKey(doc: RegionDocument): string {
  const hf = doc.terrain.heightfield!;
  let h = 2166136261;
  for (const v of hf.elevationsMeters) h = Math.imul(h ^ Math.round(v), 16777619);
  for (const s of doc.terrain.climateSamples ?? []) h = Math.imul(h ^ Math.round(s[3] * 10), 16777619);
  return [
    hf.cols,
    hf.rows,
    h >>> 0,
    doc.bounds.widthMeters,
    doc.bounds.heightMeters,
    doc.bounds.metersPerUnit,
    doc.seed,
    doc.decoration.theme === "monochrome",
    JSON.stringify(doc.terrain.relief ?? {})
  ].join("|");
}

export function reliefImageUri(doc: RegionDocument): string | null {
  if (!doc.terrain.heightfield || typeof document === "undefined") return null;
  const key = reliefKey(doc);
  if (cache?.key === key) return cache.uri;
  const raster = computeReliefRaster({
    heightfield: doc.terrain.heightfield,
    widthUnits: doc.bounds.widthMeters / doc.bounds.metersPerUnit,
    heightUnits: doc.bounds.heightMeters / doc.bounds.metersPerUnit,
    metersPerUnit: doc.bounds.metersPerUnit,
    seed: doc.seed,
    climateSamples: doc.terrain.climateSamples,
    settings: doc.terrain.relief,
    monochrome: doc.decoration.theme === "monochrome"
  });
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  let uri: string | null = null;
  if (ctx) {
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(raster.rgba.buffer as ArrayBuffer), raster.width, raster.height),
      0,
      0
    );
    uri = canvas.toDataURL("image/png");
  }
  cache = { key, uri };
  return uri;
}
