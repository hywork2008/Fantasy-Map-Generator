import type { ForestSettings, LandCoverOverride } from "../types/contracts/forest";
import type { CityDocument, Id, Point } from "../types/document";
import type { DistrictFabric } from "./blockInfill.types";
import { hasForestState, validForestSettings, validLandCoverOverride } from "./forestSettings";
import { convexInfillParts } from "./lotGeometry";
import { clone, facePoints } from "./mesh";
import { bounds, corridor, intersectConvex, PlotIndex, plotArea } from "./parcelGeometry";

/** Resolves ownership only. No fabric lookup, clipping, renderer or cache dependency. */
export function forestLandCover(document: CityDocument): Set<Id> {
  const selected = new Set<Id>();
  const protectedFaces = new Set(document.elements.flatMap(element => element.faceIds));
  for (const face of Object.values(document.mesh.faces).sort((a, b) => a.id.localeCompare(b.id))) {
    const p = face.properties;
    if (p.water !== "land" || p.locked || protectedFaces.has(face.id) || p.landCoverOverride === "open") continue;
    const farm = p.ward === "farm";
    const countryside = p.settlement === "outskirts" && (p.ward === null || p.ward === "empty" || farm);
    if (!farm && !countryside) continue;
    if (
      p.landCoverOverride === "forest" ||
      (document.forestSettings?.mode === "farmland" && farm) ||
      (document.forestSettings?.mode === "surroundings" && (farm || countryside))
    )
      selected.add(face.id);
  }
  return selected;
}

/** Also protects legacy generators and cached overlays, including plots spanning several faces. */
export function enforceForestLandCover(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  if (!hasForestState(document)) return fabric;
  const faces = forestLandCover(document);
  if (!faces.size) return fabric;
  const index = new PlotIndex<Point[]>();
  for (const id of faces)
    for (const part of convexInfillParts(facePoints(document.mesh, document.mesh.faces[id])))
      index.add(part, bounds(part));
  const overlaps = (polygon: Point[]) =>
    polygon.length >= 3 &&
    convexInfillParts(polygon).some(part =>
      index.query(bounds(part)).some(cut => plotArea(intersectConvex(part, cut)) > 0.001)
    );
  const farms = fabric.farms.filter(
    farm =>
      (farm.sourceFaceIds ?? [farm.faceId]).some(id => document.mesh.faces[id]?.properties.locked) ||
      !overlaps(farm.polygon)
  );
  const lanes = fabric.lanes.filter(
    lane =>
      !lane.kind ||
      document.mesh.faces[lane.faceId]?.properties.locked ||
      !lane.points.slice(1).some((b, i) => overlaps(corridor(lane.points[i], b, lane.widthMeters)))
  );
  if (farms.length === fabric.farms.length && lanes.length === fabric.lanes.length) return fabric;
  return { ...fabric, farms, lanes, ruralFields: undefined };
}

/** One immutable edit for the history caller; city layout and fixed content are retained. */
export function withForestSettings(
  document: CityDocument,
  settings: ForestSettings | undefined,
  overrides: Record<Id, LandCoverOverride | undefined> = {}
): CityDocument {
  if (!validForestSettings(settings) || Object.values(overrides).some(value => !validLandCoverOverride(value)))
    throw new RangeError("Unsupported forest settings");
  const next = clone(document);
  if (settings) next.forestSettings = { ...settings };
  else delete next.forestSettings;
  for (const [id, override] of Object.entries(overrides)) {
    const face = next.mesh.faces[id];
    if (!face || face.properties.locked) continue;
    if (override === undefined) delete face.properties.landCoverOverride;
    else face.properties.landCoverOverride = override;
  }
  delete next.ruralFieldSnapshot;
  if (hasForestState(next)) next.version = 6;
  if (next.fabric?.generation) {
    // Keep the replay input and settings consistent with the edited document.
    const generation = next.fabric.generation;
    const input = withForestSettings(generation.input, settings, overrides);
    next.fabric = {
      ...next.fabric,
      generation: {
        ...generation,
        input,
        settings: { ...generation.settings, forestSettings: settings ? { ...settings } : undefined }
      }
    };
  }
  return next;
}
