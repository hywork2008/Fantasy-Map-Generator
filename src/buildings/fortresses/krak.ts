import inner from "../catalogue/krak-inner-ward.json";
import type { BuildingRecord, Point } from "../record";
import { validateBuildingRecord } from "../validate";

const checked = validateBuildingRecord(inner);
if (!checked.ok) throw new Error(`Invalid Krak inner ward: ${checked.errors.join("; ")}`);

export type KrakPhase = "hospitalier-1270" | "mamluk-1302";

/** Original schematic parts and their fixed relative positions, in metres. */
export const KRAK = {
  id: "krak-des-chevaliers",
  name: "Krak des Chevaliers",
  inner: checked.record as BuildingRecord,
  talusBottom: [
    [-35, -45],
    [35, -45],
    [35, 43],
    [-35, 43]
  ] as Point[],
  talusTop: [
    [-27, -37],
    [27, -37],
    [27, 37],
    [-27, 37]
  ] as Point[],
  innerEntrance: [27, 5.5] as Point,
  wallWidth: 3.2,
  wallHeight: 9,
  towerRadius: 6,
  towerHeight: 14,
  towerSpacing: 32,
  terraceHeight: 7,
  source: "https://archeologie.culture.gouv.fr/crac-chevaliers/en/final-construction-phase",
  laterSource: "https://archeologie.culture.gouv.fr/crac-chevaliers/en/sultan-qalawuns-tower",
  note: "Original schematic assembly inspired by Krak des Chevaliers, not a surveyed reconstruction. Outer walls follow the chosen site. Tower spacing, wall heights, talus and access geometry are approximate. The Mamluk phase adds the southern rectangular tower and a covered access ramp."
} as const;
