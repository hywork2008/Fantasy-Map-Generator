import type { VectorCityDocument } from "../../types/vector/document";
export const featureReservations = (doc: VectorCityDocument) =>
  Object.values(doc.environment?.features ?? {}).map(f => f.boundary);
