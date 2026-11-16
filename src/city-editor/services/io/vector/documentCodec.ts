import { pathIsClosed } from "../../../generators/vector/geometry/curves";
import {
  assertVectorDocument,
  VECTOR_DOCUMENT_LIMITS,
  validateVectorDocument
} from "../../../generators/vector/validation/document";
import type { VectorCityDocument } from "../../../types/vector/document";
import { parseDocument } from "../documentCodec";

export function parseVectorDocument(text: string): VectorCityDocument | null {
  if (text.length > VECTOR_DOCUMENT_LIMITS.textLength) return null;
  try {
    const value: unknown = JSON.parse(text);
    const version = value && typeof value === "object" && "version" in value ? value.version : undefined;
    const legacy =
      version === 1
        ? true
        : version === 2
          ? 2
          : version === 3
            ? 3
            : version === 4
              ? 4
              : version === 5
                ? 5
                : version === 6
                  ? 6
                  : false;
    if (validateVectorDocument(value, legacy).length) return null;
    if (legacy) {
      const migrated = value as VectorCityDocument;
      migrated.version = 8;
      if (legacy === true || legacy === 2) {
        migrated.connections.bridges = {};
        migrated.connections.wallRoads = {};
        for (const gate of Object.values(migrated.connections.gates)) {
          const node = migrated.connections.nodes[gate.nodeId];
          gate.kind =
            node.anchors.some(a => migrated.paths[a.pathId].role === "river") &&
            !node.anchors.some(a => migrated.paths[a.pathId].role === "road")
              ? "water"
              : "passage";
          let circuit = Object.values(migrated.connections.circuits).find(c => c.pathId === gate.wallPathId);
          if (!circuit && pathIsClosed(migrated.paths[gate.wallPathId])) {
            let n = 1;
            while (Object.hasOwn(migrated.connections.circuits, `circuit:legacy:${n}`)) n++;
            const id = `circuit:legacy:${n}`;
            circuit = { id, pathId: gate.wallPathId };
            migrated.connections.circuits[id] = circuit;
          }
          if (circuit) gate.circuitId = circuit.id;
        }
      }
      if (validateVectorDocument(migrated).length) return null;
    }
    const document = value as VectorCityDocument;
    // A v7 ledger is a v8 ledger without fabric.
    if (document.version === (7 as number)) document.version = 8;
    if (document.legacyCopy && !parseDocument(document.legacyCopy.sourceJson)) return null;
    return document;
  } catch {
    return null;
  }
}

export function serializeVectorDocument(document: VectorCityDocument): string {
  assertVectorDocument(document);
  if (document.legacyCopy && !parseDocument(document.legacyCopy.sourceJson)) throw new Error("legacy-source");
  const pretty = JSON.stringify(document, null, 2);
  const text = pretty.length <= VECTOR_DOCUMENT_LIMITS.textLength ? pretty : JSON.stringify(document);
  if (text.length > VECTOR_DOCUMENT_LIMITS.textLength) throw new Error("Vector document exceeds the file budget");
  return text;
}
