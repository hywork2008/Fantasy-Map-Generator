/**
 * Feudal holding ledger. Celtic (name base 22) is the first regime that fills it.
 * See docs/plan/medieval-european-nobility-holdings.md.
 */

export const FEUDAL_REGIMES = [
  "germanImmediate",
  "englishHonour",
  "frenchTerritorial",
  "italianCommunal",
  "italianFeudal",
  "urbanCommunal",
  "iberianConcejo",
  "nordicOfficer",
  "hungarianCounty",
  "gaelicProvincial",
  "episcopal"
] as const;

export type FeudalRegime = (typeof FEUDAL_REGIMES)[number];

export const HOLDING_DIGNITIES = [
  "duke",
  "landgrave",
  "count",
  "earl",
  "viscount",
  "baron",
  "banneret",
  "knight",
  "jarl",
  "magnate"
] as const;

export type HoldingDignity = (typeof HOLDING_DIGNITIES)[number];

export const HOLDING_OFFICES = [
  "none",
  "borderCommand",
  "ban",
  "sheriff",
  "bailli",
  "seneschal",
  "castellan",
  "burgrave",
  "bishopTemporal",
  "abbotTemporal",
  "mayor",
  "consuls",
  "podesta",
  "capitanoPopolo",
  "adelantado",
  "ispan",
  "sysselman",
  "orderMaster",
  "mormaer",
  "thane"
] as const;

export type HoldingOffice = (typeof HOLDING_OFFICES)[number];

export const HOLDING_TENURES = [
  "demesne",
  "fief",
  "allod",
  "appanage",
  "ecclesiastical",
  "urbanJurisdiction",
  "militaryOrder",
  "ministerialis",
  "odal",
  "feeQuotaOnly",
  "thanage",
  "kinLand"
] as const;

export type HoldingTenure = (typeof HOLDING_TENURES)[number];

export const HOLDER_KINDS = ["character", "crown", "commune", "abbey", "order", "odal", "kindred"] as const;

export type HolderKind = (typeof HOLDER_KINDS)[number];

export interface NobleHolding {
  id: number;
  stateId: number;
  dignity: HoldingDignity | null;
  office: HoldingOffice;
  tenure: HoldingTenure;
  /** Contiguous block. Empty for an office that holds no land (a sheriff). */
  cellIds: number[];
  /** Fractional secular right. 10_000 basis points = 100% of that cell. */
  shares?: { cellId: number; basisPoints: number }[];
  provinceIds: number[];
  burgIds: number[];
  knightFees: number;
  holderKind: HolderKind;
  holderCharacterId?: number;
  holderSlotId?: string;
  retiredYear?: number;
  officeTitle?: string;
  hereditary: boolean;
  frontier: boolean;
  /** Place name for "Earl of X". */
  seatName?: string;
  /** Caput burg, or 0 when the holding has no town. */
  seatBurgId?: number;
}

export type GaelicPeriod = "earlyMedieval" | "highMedieval" | "lateMedieval";

export interface GaelicCellInput {
  id: number;
  provinceId: number;
  areaKm2: number;
  ruralPeople: number;
  burgId: number;
  burgName: string;
  urbanPeople: number;
  height: number;
  neighborIds: number[];
}

export interface GaelicProvinceInput {
  id: number;
  name: string;
  seatBurgId: number;
  seatCellId: number;
}

export interface AllocateGaelicInput {
  stateId: number;
  period: GaelicPeriod;
  cells: GaelicCellInput[];
  provinces: GaelicProvinceInput[];
  /** Burg id of the state capital. 0 when the state has no capital town. */
  capitalBurgId: number;
  /** Cell of that capital, when it lies in the state. */
  capitalCellId?: number;
  threatenedProvinceIds?: readonly number[];
}
