export const PRESET_IDS = [
  "master-all",
  "master-markets",
  "master-guilds",
  "master-nobility",
  "master-covert",
  "state-heads",
  "national-leadership",
  "field-commanders",
  "major-feudal-lords",
  "all-feudal-lords",
  "regional-administrators",
  "urban-leadership",
  "religious-leaders",
  "urban-clergy",
  "court-suppliers",
  "merchant-leaders",
  "guild-leaders",
  "institution-heads",
  "organization"
] as const;
export type PresetId = (typeof PRESET_IDS)[number];
export const ROLE_PURPOSES = [
  "headOfState",
  "headOfGovernment",
  "centralExecutive",
  "unitCommander",
  "militaryStaff",
  "militaryMember",
  "secularLord",
  "territorialAdministrator",
  "urbanExecutive",
  "urbanCouncil",
  "castellan",
  "religiousHead",
  "bishop",
  "abbot",
  "orderMaster",
  "urbanClergyLead",
  "parishClergy",
  "companyHead",
  "companyOfficer",
  "marketHead",
  "marketMerchant",
  "guildHead",
  "guildOfficer",
  "institutionHead",
  "householdOfficer",
  "member"
] as const;
export type RolePurpose = (typeof ROLE_PURPOSES)[number];
export interface PresetQuery {
  profile?: "master-20261022-v1" | "household-funded-v1";
  version: 1;
  presets: PresetId[];
  stateIds?: number[];
  organizationId?: string;
  descendants: boolean;
  geography: "affiliation" | "activity";
  depth: "heads" | "leaders" | "all";
  clergy: "urban" | "parishes";
  military: "all" | "land" | "sea" | "corps";
  includeReligiousLords: boolean;
}
export const defaultPresetQuery = (): PresetQuery => ({
  version: 1,
  presets: ["state-heads"],
  descendants: true,
  geography: "affiliation",
  depth: "heads",
  clergy: "urban",
  military: "all",
  includeReligiousLords: false
});
export interface PresetSeat {
  roleId: string;
  ordinal: number;
  slotId?: string;
  /** Appointment history distinguishes initial abstract occupants from genuine vacancies. */
  status: "new" | "existing" | "vacant" | "unresolved";
  signature: string;
}
export interface PresetPreview {
  seats: PresetSeat[];
  required: number;
  people: number;
  existing: number;
  generate: number;
  vacant: number;
  unresolved: number;
  warnings: string[];
}
export interface PresetPlan {
  referenceHash?: string;
  id: string;
  query: PresetQuery;
  year: number;
  seats: PresetSeat[];
  cursor: number;
  discarded?: boolean;
  mode: "memo" | "simulation";
}
export interface SavedRosterPreset {
  id: string;
  name: string;
  query: PresetQuery;
}
export interface PatronageContract {
  id: string;
  patronId: string;
  supplierId: string;
  roleId: string;
  ordinal: number;
  domain: string;
  startYear: number;
  endYear?: number;
}

export function validatePresetQuery(value: unknown): asserts value is PresetQuery {
  if (!value || typeof value !== "object") throw Error("Invalid preset query");
  const q = value as PresetQuery;
  if (
    q.version !== 1 ||
    (q.profile !== undefined && !["master-20261022-v1", "household-funded-v1"].includes(q.profile)) ||
    !Array.isArray(q.presets) ||
    !q.presets.length ||
    !q.presets.every(id => PRESET_IDS.includes(id)) ||
    (q.stateIds !== undefined &&
      (!Array.isArray(q.stateIds) || !q.stateIds.every(id => Number.isInteger(id) && id >= 0))) ||
    (q.organizationId !== undefined && typeof q.organizationId !== "string") ||
    typeof q.descendants !== "boolean" ||
    typeof q.includeReligiousLords !== "boolean" ||
    !["affiliation", "activity"].includes(q.geography) ||
    !["heads", "leaders", "all"].includes(q.depth) ||
    !["urban", "parishes"].includes(q.clergy) ||
    !["all", "land", "sea", "corps"].includes(q.military)
  )
    throw Error("Invalid preset query");
}
