import type { VectorCityDocument } from "../../../types/vector/document";
import { ringInside } from "../geometry/routing";
import { simpleContour } from "../geometry/surfaces";
export function validateVectorPresentation(doc: VectorCityDocument): string[] {
  const errors: string[] = [];
  const point = (p: unknown) =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e8);
  for (const p of Object.values(doc.placements)) {
    const d = p.display;
    if (!d) continue;
    if (
      !["housing", "facility", "landmark", "object"].includes(d.kind) ||
      !["copied", "massing"].includes(d.provenance) ||
      !Number.isFinite(d.heightMeters) ||
      d.heightMeters <= 0 ||
      d.heightMeters > 500 ||
      typeof d.note !== "string" ||
      d.note.length > 500 ||
      !Array.isArray(d.footprint) ||
      !d.footprint.length ||
      d.footprint.length > 128 ||
      !d.footprint.every(
        r =>
          r &&
          Object.keys(r).every(k => ["outer", "holes"].includes(k)) &&
          Array.isArray(r.outer) &&
          r.outer.length >= 3 &&
          r.outer.length <= 16000 &&
          r.outer.every(point) &&
          simpleContour(r.outer, true) &&
          Array.isArray(r.holes) &&
          r.holes.every(h => Array.isArray(h) && h.every(point) && simpleContour(h, true) && ringInside(h, r.outer))
      ) ||
      (d.dwellings !== undefined && (!Number.isSafeInteger(d.dwellings) || d.dwellings < 0)) ||
      Object.keys(d).some(k => !["kind", "heightMeters", "footprint", "provenance", "note", "dwellings"].includes(k))
    )
      errors.push(`display:${p.id}`);
  }
  const copy = doc.legacyCopy;
  if (copy) {
    if (
      typeof copy.sourceJson !== "string" ||
      copy.sourceJson.length > 6 * 1024 * 1024 ||
      !Array.isArray(copy.report) ||
      copy.report.length > 20000 ||
      Object.keys(copy).some(k => !["sourceJson", "report"].includes(k)) ||
      !copy.report.every(
        r =>
          r &&
          typeof r.id === "string" &&
          r.id.length <= 256 &&
          ["converted", "snapshot", "unsupported"].includes(r.status) &&
          typeof r.category === "string" &&
          r.category.length <= 100 &&
          typeof r.reason === "string" &&
          r.reason.length <= 500 &&
          Object.keys(r).every(k => ["id", "status", "category", "reason"].includes(k))
      )
    )
      errors.push("legacy-copy");
    else
      try {
        const source = JSON.parse(copy.sourceJson);
        if (source?.format !== "fmg-city-editor" || ![1, 2, 3, 4, 5, 6].includes(source.version))
          errors.push("legacy-source");
      } catch {
        errors.push("legacy-source");
      }
  }
  return errors;
}
