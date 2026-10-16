import type { CityDocument } from "../document";
import type { FixedApproachInput } from "../fixedApproachInput";
import type { FixedApproachRequest } from "./savedFixedApproach";

export type FixedApproachProvider = (
  /** Resolve against this immutable current-document snapshot, never a captured previous state. */
  request: Readonly<FixedApproachRequest>,
  document: Readonly<CityDocument>
) => Pick<FixedApproachInput, "otherWater" | "supportsDryFootprint" | "allowsMeshEdge"> | null;

export type { FixedApproachRequest, SavedFixedApproach } from "./savedFixedApproach";
