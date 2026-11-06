import {
  assertVectorDocument,
  VECTOR_DOCUMENT_LIMITS,
  validateVectorDocument
} from "../../../generators/vector/validation/document";
import type { VectorCityDocument } from "../../../types/vector/document";

export function parseVectorDocument(text: string): VectorCityDocument | null {
  if (text.length > VECTOR_DOCUMENT_LIMITS.textLength) return null;
  try {
    const value: unknown = JSON.parse(text);
    return validateVectorDocument(value).length ? null : (value as VectorCityDocument);
  } catch {
    return null;
  }
}

export function serializeVectorDocument(document: VectorCityDocument): string {
  assertVectorDocument(document);
  const text = JSON.stringify(document, null, 2);
  if (text.length > VECTOR_DOCUMENT_LIMITS.textLength) throw new Error("Vector document exceeds the v1 file budget");
  return text;
}
