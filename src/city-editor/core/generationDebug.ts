import type { GenerationSample } from "./generationDiagnostics";
import type { CityDocument, Id } from "./types";

export interface GenerationDebugPreview {
  document: CityDocument;
  sample: GenerationSample;
  seed: string;
  /** IDs named by the validator, or contextual areas when no location is known. */
  highlights: { vertices: Id[]; edges: Id[]; faces: Id[]; contextual: boolean };
}
export type GenerationDebugObserver = (preview: GenerationDebugPreview) => void;

/** Called only for opted-in rejected attempts; snapshots never become editable documents. */
export function captureGenerationDebugPreview(
  document: CityDocument,
  sample: GenerationSample,
  seed: string
): GenerationDebugPreview {
  const vertices = new Set<Id>();
  const edges = new Set<Id>();
  const faces = new Set<Id>();
  const details = sample.failure?.details ?? [];
  const tokens = new Set(details.flatMap(line => (line.match(/[\w:-]+/g) ?? []).map(id => id.replace(/:+$/, ""))));
  for (const id of tokens) {
    if (document.mesh.vertices[id]) vertices.add(id);
    if (document.mesh.edges[id]) edges.add(id);
    if (document.mesh.faces[id]) faces.add(id);
    const gate = document.gates.find(g => g.id === id);
    if (gate) vertices.add(gate.vertexId);
  }
  for (const group of document.featureGroups) {
    if (!tokens.has(group.id) && !details.some(line => line.includes(group.name))) continue;
    if (group.kind === "river") for (const id of group.vertices) vertices.add(id);
    else for (const ref of group.segments) edges.add(ref.edgeId);
  }
  const contextual = !vertices.size && !edges.size && !faces.size;
  if (contextual) {
    const reason = sample.failure?.reason;
    if (reason?.startsWith("castle-")) {
      for (const circuit of document.defenseCircuits ?? [])
        if (circuit.scope === "castle") for (const id of circuit.areaFaceIds) faces.add(id);
      for (const gate of document.gates) if (gate.ownerCastleId) vertices.add(gate.vertexId);
      for (const face of Object.values(document.mesh.faces)) if (face.properties.ward === "castle") faces.add(face.id);
    }
    if (reason === "too-few-external-roads") {
      for (const gate of document.gates) if (!gate.ownerCastleId) vertices.add(gate.vertexId);
      for (const group of document.featureGroups)
        if (group.kind === "road" && group.id.startsWith("gc:road-"))
          for (const ref of group.segments) edges.add(ref.edgeId);
    }
    if (!faces.size && !edges.size && !vertices.size)
      for (const face of Object.values(document.mesh.faces))
        if (face.properties.buildable && face.properties.water === "land") faces.add(face.id);
  }
  return {
    document: structuredClone(document),
    sample: structuredClone(sample),
    seed,
    highlights: { vertices: [...vertices], edges: [...edges], faces: [...faces], contextual }
  };
}
