import type { VectorCityDocument } from "../../types/vector/document";
import { defenseReservations } from "./defense";
export const featureReservations = (doc: VectorCityDocument) => [
  ...Object.values(doc.environment?.features ?? {}).map(f => f.boundary),
  ...Object.values(doc.environment?.defenses ?? {}).flatMap(defenseReservations)
];
