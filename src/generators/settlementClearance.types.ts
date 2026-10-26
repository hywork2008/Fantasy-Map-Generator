import type { LandUseProfile } from "../types/landUse";

export interface ClearanceCellInput {
  polygon?: [number, number][];
  temperature?: number;
  precipitation?: number;
  tenure?: "common" | "private" | "protected";
  ownerId?: number;
  access?: { cellId: number; cost: number; allowed?: boolean }[];
  maxTransportCost?: number;
  /**
   * Staple eaters of other cells who buy through this market town because no field within their
   * own reach can feed them. They are counted here once and removed from their home request.
   */
  marketStaplePeople?: number;
  workforce?: {
    adultPeople: number;
    workableDays: number;
    maintenanceDaysPerHa: number;
    otherOccupationDays: number;
    clearanceShare: number;
    clearanceDaysPerHa: number;
  };
  livestock?: {
    grazingAreaHa: number;
    hayAreaHa?: number;
    woodPastureHa?: number;
    grazedFallowHa?: number;
    fodderWithinFieldsHa?: number;
  };
  managedForestAreaHa?: number;
  forestRotationYears?: number;
  agroforestryAreaHa?: number;
  agroforestryRotationYears?: number;
  shiftingCycleYears?: number;
  shiftingActiveYears?: number;
  id: number;
  anchor: [number, number];
  physicalLandAreaHa: number;
  forestCover: number;
  ruralPeople: number;
  urbanPeople: number;
  profile?: LandUseProfile;
  cultivableAreaHa: number;
  yieldKgPerSownHa: number;
  annualSownShare?: number;
  laborAffordableAreaHa?: number;
  /** Preserve the existing max(subsistence reserve, labour development) policy. */
  subsistenceReserve?: number;
  importedStaplePeople?: number;
  includeUrbanFoodDemand?: boolean;
  /** Resolved food composition; omitted embedded supply remains unknown. */
  localStapleShare?: number;
  neighbors?: number[];
  diagnostics?: string[];
  /** Annual new clearance capacity, distinct from field maintenance labour. */
  newClearanceAreaHa?: number;
}
