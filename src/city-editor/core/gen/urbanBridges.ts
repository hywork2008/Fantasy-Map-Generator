import { reservedCastleFaces } from "../fortifications";
import { incidentFaces, insertEdgeVertex } from "../mesh";
import { addBridge, addWideRiverBridge, kindEdgeIds, openBarrierPassage } from "../passages";
import type { CityDocument, Id } from "../types";

/** Land districts separated by rivers need access even when no gate route crosses them. */
export function connectUrbanRiverDistricts(document: CityDocument, allowedRiverIds: Set<Id>): CityDocument {
  const access = (city: CityDocument) => {
    const reserved = reservedCastleFaces(city);
    const land = new Set(
      Object.values(city.mesh.faces)
        .filter(
          face =>
            face.properties.water === "land" &&
            face.properties.buildable &&
            !face.properties.locked &&
            face.properties.settlement === "core" &&
            !reserved.has(face.id)
        )
        .map(face => face.id)
    );
    const barriers = new Set([...kindEdgeIds(city, "river"), ...kindEdgeIds(city, "wall")]);
    const roads = kindEdgeIds(city, "road");
    const reached = new Set<Id>();
    const queue = [...land].filter(id =>
      city.mesh.faces[id].boundary.some(ref => roads.has(ref.edgeId) && !barriers.has(ref.edgeId))
    );
    for (const id of queue) reached.add(id);
    for (let i = 0; i < queue.length; i++) {
      const face = city.mesh.faces[queue[i]];
      for (const ref of face.boundary) {
        const edge = city.mesh.edges[ref.edgeId];
        const other = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
        if (!other || !land.has(other) || reached.has(other) || barriers.has(edge.id) || edge.locked) continue;
        reached.add(other);
        queue.push(other);
      }
    }
    return { land, reached };
  };
  let next = document;
  // Every accepted bridge must give access to previously isolated core land.
  const limit = Object.keys(document.mesh.faces).length;
  for (let pass = 0; pass < limit; pass++) {
    const { land, reached } = access(next);
    const missing = [...land].filter(id => !reached.has(id));
    if (!missing.length || !reached.size) break;
    let bridgeIndex = pass;
    while (next.featureGroups.some(group => group.id === `gc:bridge-district-${bridgeIndex}`)) bridgeIndex++;
    const bridgeId = `gc:bridge-district-${bridgeIndex}`;
    let connected: CityDocument | null = null;
    for (const river of next.featureGroups) {
      if (river.kind !== "river" || river.locked || !allowedRiverIds.has(river.id)) continue;
      for (const vertexId of river.vertices.slice(1, -1)) {
        const faces = incidentFaces(next.mesh, vertexId);
        if (
          !faces.some(face => reached.has(face.id)) ||
          !faces.some(face => land.has(face.id) && !reached.has(face.id))
        )
          continue;
        const opened =
          river.style.widthMeters > next.frame.blockSizeMeters
            ? addWideRiverBridge(next, vertexId, bridgeId)
            : (() => {
                const passage = openBarrierPassage(next, vertexId, "river");
                return passage ? addBridge(passage, vertexId, bridgeId) : null;
              })();
        if (!opened) continue;
        const after = access(opened);
        // Face splits keep the original id: measure access to the original missing land.
        if (!missing.some(id => after.reached.has(id))) continue;
        connected = opened;
        break;
      }
      if (connected) break;
    }
    if (!connected) {
      const riverEdges = kindEdgeIds(next, "river");
      for (const edge of Object.values(next.mesh.edges)) {
        if (!riverEdges.has(edge.id) || edge.locked || !edge.leftFace || !edge.rightFace) continue;
        const banks = [edge.leftFace, edge.rightFace];
        if (!banks.some(id => reached.has(id)) || !banks.some(id => land.has(id) && !reached.has(id))) continue;
        const rivers = next.featureGroups.filter(
          group => group.kind === "river" && group.vertices.includes(edge.a) && group.vertices.includes(edge.b)
        );
        if (!rivers.length || rivers.some(river => river.locked || !allowedRiverIds.has(river.id))) continue;
        const inserted = insertEdgeVertex(next, edge.id, 0.5);
        if (!inserted) continue;
        // A straight reach avoids confluence corners. Bank approaches can span a
        // local block even when the drawn river itself is much narrower.
        const bridged = addWideRiverBridge(
          inserted.document,
          inserted.vertexId,
          bridgeId,
          Math.max(next.frame.blockSizeMeters * 2, ...rivers.map(river => river.style.widthMeters * 1.2))
        );
        if (!bridged) continue;
        const after = access(bridged);
        if (!missing.some(id => after.reached.has(id))) continue;
        connected = bridged;
        break;
      }
    }
    if (!connected) break;
    next = connected;
  }
  return next;
}
