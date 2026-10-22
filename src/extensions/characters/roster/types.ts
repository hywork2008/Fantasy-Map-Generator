import type { CharacterRole, CharacterRoleClass, CharacterSkills, Gender, TitleHolding } from "../characterTypes";
import type { PatronageContract, PresetPlan, RolePurpose, SavedRosterPreset } from "./presetTypes";

export type RosterMode = "memo" | "simulation";
export interface RosterOrganization {
  id: string;
  name: string;
  stateId: number;
  kind?:
    | "government"
    | "household"
    | "military"
    | "religious"
    | "company"
    | "guild"
    | "market"
    | "settlement"
    | "territory"
    | "institution";
  activityStateIds?: number[];
  religionId?: number;
  adherentShare?: number;
  religiousKind?: "church" | "diocese" | "urban" | "monastery" | "order";
  formation?: "land" | "sea" | "corps";
  polity?: string;
  parentId?: string;
  burgId?: number;
  notes: string;
  archived?: boolean;
  simulate: boolean;
  generateSuccessors: boolean;
}
export interface RosterRole {
  referenceSeats?: Record<string, string>;
  referenceOnly?: boolean;
  id: string;
  organizationId: string;
  name: string;
  femaleName?: string;
  count: number;
  reason: string;
  roleClass: CharacterRoleClass;
  purposes?: RolePurpose[];
  majorLord?: boolean;
  occupation?: string;
  unresolved?: boolean;
  primarySkill: keyof CharacterSkills;
  entityType: TitleHolding["entityType"];
  entityId: number;
  landed: boolean;
  hereditary: boolean;
  termYears?: number;
  characterRole?: CharacterRole;
  regimentId?: number;
  simulate?: boolean;
  generateSuccessors?: boolean;
}
export interface RosterProtection {
  fields: string[];
  values: Record<string, unknown>;
  track: "none" | "branch" | "all" | "heir";
  watchAge?: number;
  stopBeforeDeath: boolean;
  stopOnBirth: boolean;
  stopOnAppointment: boolean;
  materializeDescendants: boolean;
}
export interface PersonSlot {
  referenceId?: number;
  unresolvedFamily?: { spouses: number; children: number; grandchildren: number; greatGrandchildren: number };
  id: string;
  organizationId: string;
  roleId?: string;
  ordinal?: number;
  generation: number;
  cultureId: number;
  raceId?: number;
  gender?: Gender;
  birthYear: number;
  deathYear?: number;
  cancelledBirth?: boolean;
  removedFromWorld?: boolean;
  retainedCharacterId?: number;
  retainedAssets?: Pick<import("../characterTypes").Character, "inventory" | "loadout">;
  plannedDeathYear: number;
  childPlan?: { birthYear: number; gender: Gender }[];
  characterId?: number;
  mode: RosterMode;
  notes: string;
  tags: string[];
  location?: { burgId?: number; editor?: "FMG" | "RE" | "CE"; x?: number; y?: number };
  protection: RosterProtection;
}
export interface RosterAppointment {
  roleId: string;
  ordinal?: number;
  slotId: string;
  startYear: number;
  endYear?: number;
}
export interface RosterFamilyRelation {
  parentId: string;
  childId: string;
  kind: "birth" | "adoption";
}
export interface RosterLink {
  fromId: string;
  toId: string;
  kind: "supervision" | "alliance" | "vassal" | "spouse";
}
export interface RosterStop {
  slotId: string;
  kind: "age" | "death" | "birth" | "appointment" | "extinction" | "conflict";
  year: number;
  message: string;
}
export interface WorldRoster {
  version: 1;
  seed: string;
  organizations: RosterOrganization[];
  roles: RosterRole[];
  slots: PersonSlot[];
  appointments: RosterAppointment[];
  family: RosterFamilyRelation[];
  links: RosterLink[];
  pending?: RosterStop;
  acknowledged: string[];
  remainingDays: number;
  lastYear: number;
  referenceProfile?: { id: string; commit: string; inputHash: string; year: number; month: number; day: number };
  presetPlans?: PresetPlan[];
  savedPresets?: SavedRosterPreset[];
  patronage?: PatronageContract[];
}
export interface RosterSelection {
  profile?: "master-20261022-v1" | "household-funded-v1";
  organizationId?: string;
  roleId?: string;
  slotIds?: string[];
  descendants?: boolean;
  limit?: number;
  mode?: RosterMode;
}
