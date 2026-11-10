import type { VectorCityDocument, VectorRegion } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { regionBoolean } from "../geometry/regions";
import { assertVectorDocument } from "../validation/document";
import { prepareVectorEdit } from "./dependencies";
import { networkId } from "./network";
export function setVectorRegion(
  input: VectorCityDocument,
  polygon: VectorPolygon,
  settings: Pick<VectorRegion, "kind" | "use" | "density" | "maxHeightMeters">,
  id?: string
): VectorCityDocument {
  const doc = prepareVectorEdit(input),
    key = id ?? networkId(doc.regions, "region");
  doc.regions[key] = { id: key, ...structuredClone(polygon), ...settings };
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
/** Boolean operations keep every component and hole rather than taking only the largest island. */
export function combineVectorRegions(
  input: VectorCityDocument,
  ids: string[],
  operation: "union" | "difference" | "intersection"
): VectorCityDocument {
  if (ids.length < 2 || ids.some(id => !input.regions[id])) throw Error("region-selection");
  const first = input.regions[ids[0]],
    others = ids.slice(1).map(id => input.regions[id]);
  const result = regionBoolean([first], others, operation),
    doc = prepareVectorEdit(input);
  for (const id of ids) delete doc.regions[id];
  for (const polygon of result) {
    const id = networkId(doc.regions, "region");
    doc.regions[id] = { ...structuredClone(first), ...polygon, id };
  }
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
