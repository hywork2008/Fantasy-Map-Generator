import * as THREE from "three";
import { placeableObject } from "../../../../buildings/placeableObjects";
import { placementFootprint } from "../../../../buildings/placementModels";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { matchesVectorUrbanFingerprint } from "../generation/urbanState";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { vectorOccupiedSites } from "../occupancy";
import { assertVectorDocument } from "../validation/document";
import { refreshUrbanLedger } from "./fabricHouses";

/** Ids of objects placed by hand with the object tool. */
export const VECTOR_OBJECT_PREFIX = "manual:object:";

export const isVectorObject = (id: string) => id.startsWith(VECTOR_OBJECT_PREFIX);

/** Generated houses and lanes stay as they are; the urban ledger only records the new revision. */
function commitBeside(source: VectorCityDocument, edit: (doc: VectorCityDocument) => void): VectorCityDocument {
  assertVectorDocument(source);
  const u = source.urban,
    fresh = !!u && u.inputRevision === source.revision && matchesVectorUrbanFingerprint(source, u.adoptedFingerprint);
  const doc = structuredClone(source);
  edit(doc);
  doc.revision++;
  if (fresh) refreshUrbanLedger(doc, []);
  assertVectorDocument(doc);
  return doc;
}

/**
 * Places a catalogue object (vehicle, siege engine, mill, well…) at metre scale with its centre at `position`.
 * It takes free ground only: no road, river or wall, no building site and no generated house may lie under it.
 * The historical period is not checked here; offering period-appropriate models is the editor's choice.
 */
export function addVectorObject(
  source: VectorCityDocument,
  modelId: string,
  position: Point,
  facingDegrees: number
): { document: VectorCityDocument; placementId: string } {
  const definition = placeableObject(modelId),
    footprint = placementFootprint(modelId);
  if (!definition || !footprint) throw new Error("object-model");
  if (!position.every(Number.isFinite) || !Number.isFinite(facingDegrees)) throw new Error("object-transform");
  const facing = ((facingDegrees % 360) + 360) % 360,
    angle = (facing * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const outer: Point[] = [
    [-footprint.halfX, -footprint.halfZ],
    [footprint.halfX, -footprint.halfZ],
    [footprint.halfX, footprint.halfZ],
    [-footprint.halfX, footprint.halfZ]
  ].map(([x, z]) => [position[0] + x * c + z * s, position[1] + x * s - z * c]);
  const half = source.frame.extentMeters / 2;
  if (outer.some(p => Math.abs(p[0]) > half || Math.abs(p[1]) > half)) throw new Error("object-outside-frame");
  const site = { outer, holes: [] as Point[][] };
  const obstacles = [...Object.values(source.paths).map(pathSurface), ...vectorOccupiedSites(source, "site")];
  if (regionBoolean([site], obstacles, "intersection").some(r => regionArea(r) > 1e-5))
    throw new Error("object-obstacle");
  const model = definition.create();
  let height: number;
  try {
    const bounds = new THREE.Box3().setFromObject(model.group, true);
    height = bounds.max.y - bounds.min.y;
  } finally {
    model.dispose();
  }
  let placementId = "";
  const document = commitBeside(source, doc => {
    let n = 1;
    while (Object.hasOwn(doc.placements, `${VECTOR_OBJECT_PREFIX}${modelId}:${n}`)) n++;
    placementId = `${VECTOR_OBJECT_PREFIX}${modelId}:${n}`;
    doc.placements[placementId] = {
      id: placementId,
      modelId,
      position: [...position],
      facingDegrees: facing,
      origin: "manual",
      editPolicy: "editable",
      site: structuredClone(site),
      accesses: [],
      display: {
        kind: "object",
        heightMeters: height,
        footprint: [structuredClone(site)],
        provenance: "copied",
        note: "Catalogue object placed by hand at metre scale."
      },
      appearance: { quality: "low" }
    };
  });
  return { document, placementId };
}

/** Removes an object placed with the object tool; generated and imported placements are not touched. */
export function removeVectorObject(source: VectorCityDocument, id: string): VectorCityDocument {
  const p = source.placements[id];
  if (!p || !isVectorObject(id)) throw new Error("object-required");
  if (p.editPolicy === "fixed") throw new Error("dependency-protected-placement");
  return commitBeside(source, doc => {
    delete doc.placements[id];
  });
}
