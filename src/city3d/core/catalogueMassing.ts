import { coarseSolids } from "../../buildings/coarseSolids";
import type { BuildingRecord, CoarseSolid } from "../../buildings/record";
import type { StructureMassing, StructureRoof } from "../../city-editor/types/contracts/structureMassing";

const KIND = {
  wall: "wall",
  tower: "tower",
  gate: "gate",
  range: "landmark"
} as const satisfies Record<CoarseSolid["kind"], StructureMassing["kind"]>;

const ROOF = {
  flat: "flat",
  gable: "gable",
  hip: "hip",
  pyramid: "pyramid",
  cone: "pyramid"
} as const satisfies Record<CoarseSolid["roof"], StructureRoof>;

/** Coarse solids projected into the massing the existing extruder already draws. */
export function catalogueMassing(record: BuildingRecord): StructureMassing[] {
  const material = record.materials.wall === "timber" ? "wood" : "stone";
  return coarseSolids(record).map(solid => ({
    id: solid.id,
    kind: KIND[solid.kind],
    name: record.name,
    material,
    footprint: solid.outer,
    holes: solid.holes.length ? solid.holes : undefined,
    heightMeters: solid.heightMeters,
    baseElevationMeters: solid.baseElevationMeters,
    roof: ROOF[solid.roof],
    ridgeAzimuth: solid.ridgeAzimuth ?? 0,
    parapet: "none",
    parapetMeters: 0,
    parapetWidthMeters: 0,
    spire: false
  }));
}
