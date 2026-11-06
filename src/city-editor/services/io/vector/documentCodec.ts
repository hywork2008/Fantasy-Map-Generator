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
    const legacy = !!value && typeof value === "object" && "version" in value && value.version === 1;
    if (validateVectorDocument(value, legacy).length) return null;
    if (legacy) (value as { version: number }).version = 2;
    if (legacy && validateVectorDocument(value).length) return null;
    return value as VectorCityDocument;
  } catch {
    return null;
  }
}

export function serializeVectorDocument(document: VectorCityDocument): string {
  assertVectorDocument(document);
  const text = JSON.stringify(document, null, 2);
  if (text.length > VECTOR_DOCUMENT_LIMITS.textLength) throw new Error("Vector document exceeds the file budget");
  return text;
}
