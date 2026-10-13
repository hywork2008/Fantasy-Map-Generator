import type { ApproachCorridor } from "../../../generators/approachCorridorSearch";
import type { CityDocument } from "../document";
import type { FixedApproachInput } from "../fixedApproachInput";

export type FixedApproachProvider = (
  /** Resolve against this immutable current-document snapshot, never a captured previous state. */
  request: Readonly<FixedApproachRequest>,
  document: Readonly<CityDocument>
) => Pick<FixedApproachInput, "otherWater" | "supportsDryFootprint" | "allowsMeshEdge"> | null;

export type FixedApproachRequest = Omit<FixedApproachInput, "otherWater" | "supportsDryFootprint" | "allowsMeshEdge">;

export interface SavedFixedApproach {
  id: string;
  request: FixedApproachRequest;
  corridor: ApproachCorridor;
  geometryVersion: number;
}
