import type { ApproachCorridor } from "../../../generators/approachCorridorSearch";
import type { FixedApproachInput } from "../fixedApproachInput";

export type FixedApproachRequest = Omit<FixedApproachInput, "otherWater" | "supportsDryFootprint" | "allowsMeshEdge">;

export interface SavedFixedApproach {
  id: string;
  request: FixedApproachRequest;
  corridor: ApproachCorridor;
  geometryVersion: number;
}
