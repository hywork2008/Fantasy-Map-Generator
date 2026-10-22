import type { BuildingMassing } from "../types/contracts/buildingMassing";
import type { Id, Point } from "../types/primitives";

export interface BuildingLot {
  residentialCluster?: import("../types/contracts/population").ResidentialCluster;
  faceId: Id;
  polygon: Point[];
  landmark: boolean;
  id?: Id;
  parcelId?: Id;
  archetype?: import("./parcelArchetypes").ParcelArchetype;
  role?: "main" | "wing" | "store" | "workshop" | "stable" | "shed";
  uses?: Array<"residential" | "retail" | "storage" | "craft">;
  storeys?: number;
  growthRegionId?: string;
  residentialFloorShare?: number;
  /** The random draw its occupancy test used: the lot is built while its district's occupancy exceeds it.
   * Lets the housing fit count a lower occupancy without rebuilding (absent: always built). */
  occupancyDraw?: number;
  /** Present on derived lots after `assignBuildingMassing`. Not saved on the document. */
  massing?: BuildingMassing;
  /** Derived surface colors; never serialized with the document. */
  appearance?: import("../../buildings/appearance/types").BuildingAppearance;
}
