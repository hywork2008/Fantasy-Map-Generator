import type { CurveAnchor, VectorCityDocument } from "../../../types/vector/document";

export function mapDocumentAnchors(document: VectorCityDocument, map: (anchor: CurveAnchor) => CurveAnchor): void {
  for (const path of Object.values(document.paths))
    for (const station of path.width.stations) station.anchor = map(station.anchor);
  for (const node of Object.values(document.connections.nodes)) node.anchors = node.anchors.map(map);
  for (const edge of Object.values(document.connections.edges)) {
    edge.from = map(edge.from);
    edge.to = map(edge.to);
  }
  for (const gate of Object.values(document.connections.gates)) gate.anchor = map(gate.anchor);
  for (const bridge of Object.values(document.connections.bridges)) {
    bridge.from = map(bridge.from);
    bridge.to = map(bridge.to);
    bridge.riverAnchor = map(bridge.riverAnchor);
  }
  for (const placement of Object.values(document.placements)) placement.accesses = placement.accesses.map(map);
}

export function pathAnchors(document: VectorCityDocument, pathId: string): CurveAnchor[] {
  const anchors: CurveAnchor[] = [];
  mapDocumentAnchors(structuredClone(document), anchor => {
    if (anchor.pathId === pathId) anchors.push(anchor);
    return anchor;
  });
  return anchors;
}
