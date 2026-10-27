import type { CityDocument, Id } from "../types/document";
import { createCastleOnFace, finalizeCastles, registerTownCircuit } from "./castles";
import { refreshCemeteryLayouts, relocateUndersizedCemeteries, syncDocumentCemeteries } from "./cemeteryLayout";
import { orientTempleHybrid } from "./civicPlacement";
import { finishCityGeometry } from "./finishCityGeometry";
import { reservedCastleFaces } from "./fortifications";
import { settleTempleOnDocument } from "./generation/assembly/temple";
import { polygonCentroid } from "./geom";
import { spawnHarborShips } from "./harborShips";
import { plazaFootprintMeters, templeFootprintMeters } from "./housing";
import { clone, faceNeighbors, facePoints, validate } from "./mesh";
import { retractProtrudingGates, straightenBridges, straightenGateCrossings } from "./passages";
import { isHexagonalDocument, rectifyHexBlocks } from "./rectifyHexBlocks";
import { rectifyVoronoiBlocks } from "./rectifyVoronoiBlocks";
import { enclosedTownFaces } from "./riverWallRouting";
import { townExtentMeters } from "./settlementExtent";

/**
 * Manual counterparts of the complete-city stages that have no drawing tool:
 * each applies one generator step to the edited document so that a hand-built
 * town reaches the same document contract as "New city" before
 * "Generate from current edits" builds its fabric.
 */

export type CivicElementKind = "plaza" | "temple" | "harbor";

const MANUAL_PREFIX = "manual:";

/** Turn the drawn town wall rings into the town defence circuit and the urban core. */
export function registerTownFromWalls(document: CityDocument): CityDocument | null {
  const inside = enclosedTownFaces(document);
  if (!inside?.size) return null;
  const next = clone(document);
  next.defenseCircuits = (next.defenseCircuits ?? []).filter(c => c.scope !== "town" || c.locked);
  registerTownCircuit(next, [], true, [...inside]);
  const castleFaces = reservedCastleFaces(next);
  for (const face of Object.values(next.mesh.faces)) {
    if (face.properties.locked || face.properties.water !== "land" || castleFaces.has(face.id)) continue;
    face.properties.settlement = inside.has(face.id) ? "core" : "outskirts";
    delete face.properties.wallRing;
  }
  return next;
}

/** Build a full castle plan (curtain, parts, accesses) on the painted castle cells. */
export function createCastlePlanFromCells(document: CityDocument, preferredFaceId?: Id | null): CityDocument | null {
  const faces = Object.values(document.mesh.faces).filter(
    face => face.properties.ward === "castle" && face.properties.water === "land"
  );
  const site = faces.find(face => face.id === preferredFaceId) ?? faces[0];
  return site ? createCastleOnFace(document, site.id) : null;
}

/** Place the market square, cathedral or harbour landmark on one cell, replacing a previous one. */
export function placeCivicElement(document: CityDocument, faceId: Id, kind: CivicElementKind): CityDocument | null {
  const face = document.mesh.faces[faceId];
  if (!face || face.properties.water !== "land") return null;
  if (
    kind === "harbor" &&
    (face.properties.ward !== "harbor" ||
      !faceNeighbors(document.mesh, faceId).some(id => document.mesh.faces[id]?.properties.water !== "land"))
  )
    return null;
  const next = clone(document);
  next.elements = next.elements.filter(element => element.locked || element.kind !== kind);
  const point = polygonCentroid(facePoints(next.mesh, face));
  const extent = townExtentMeters(next.frame);
  const plaza = next.elements.find(element => element.kind === "plaza")?.point;
  const waterNeighbor = faceNeighbors(next.mesh, faceId)
    .map(id => next.mesh.faces[id])
    .find(neighbor => neighbor && neighbor.properties.water !== "land");
  next.elements.push({
    id: `${MANUAL_PREFIX}${kind}`,
    kind,
    faceIds: [faceId],
    point,
    ...(kind === "temple"
      ? {
          sizeMeters: templeFootprintMeters(extent).length,
          rotation: orientTempleHybrid(point, 0, plaza, next.historicalPeriod)
        }
      : kind === "plaza"
        ? { sizeMeters: plazaFootprintMeters(extent) }
        : { harborKind: waterNeighbor?.properties.water === "sea" ? ("sea" as const) : ("river" as const) }),
    locked: false
  });
  if (kind === "temple") settleTempleOnDocument(next);
  return next;
}

/** The complete-city finishing chain: smoothing, square bridges, block rectification, gate crossings. */
export function finishManualGeometry(document: CityDocument, seed: string): CityDocument | null {
  const coarse = document.gridKind === "evolution";
  const hexagonal = !coarse && isHexagonalDocument(document);
  const rectified = hexagonal ? rectifyHexBlocks(document, seed) : document;
  const squared = straightenBridges(finishCityGeometry(rectified));
  const shaped = hexagonal || coarse ? squared : rectifyVoronoiBlocks(squared, seed, rectified);
  const next = straightenGateCrossings(retractProtrudingGates(straightenBridges(shaped)));
  if (next.castles?.length && !finalizeCastles(next, false)) return null;
  delete next.fabric;
  return validate(next).length ? null : next;
}

/** Settle civic buildings, cemeteries and harbour ships against the finished streets. */
export function settleManualCity(
  document: CityDocument,
  seed: string,
  defaults: Pick<CityDocument, "historicalPeriod">
): CityDocument {
  const next = clone(document);
  // Same precedence as New city: the chosen setting wins over the grid's period.
  if (defaults.historicalPeriod) next.historicalPeriod = defaults.historicalPeriod;
  settleTempleOnDocument(next);
  syncDocumentCemeteries(next);
  refreshCemeteryLayouts(next);
  relocateUndersizedCemeteries(next);
  if (next.elements.some(element => element.kind === "harbor")) spawnHarborShips(next, seed);
  return next;
}
