import type { CharacterLanguageSkill } from "../../types/worldLanguages";

export type SpecializationAxis = "knowledge" | "practice" | "appraisal";
export type FamiliarityKind =
  | "terrain"
  | "climate"
  | "troop"
  | "region"
  | "culture"
  | "institution"
  | "weapon"
  | "artSchool"
  | "material"
  | "commandScale"
  | "languagePair";
export interface SpecializationDomain {
  domainId: string;
  knowledge?: number;
  practice?: number;
  appraisal?: number;
  aptitude?: "poor" | "ordinary" | "promising" | "gifted" | "exceptional";
  lastPracticedYear?: number;
  practiceRef?: { owner: "economy"; domain: string };
}
export interface SpecializationTarget {
  kind: FamiliarityKind;
  id: string;
}
export interface SpecializationFamiliarity extends SpecializationTarget {
  domainId: string;
  knowledge?: number;
  practice?: number;
  lastUpdatedYear?: number;
}
export interface SpecializationExperience {
  id: string;
  domainId: string;
  year: number;
  coverage: number; // Fraction of this year's total available time, across all activities.
  mode: "study" | "training" | "service" | "battle" | "appraisal";
  role: string;
  outcome: string;
  source: "simulation" | "editor";
  targets: SpecializationTarget[];
}
export interface CharacterSpecializationProfile {
  version: 1;
  domains: SpecializationDomain[];
  familiarities: SpecializationFamiliarity[];
  languages: CharacterLanguageSkill[];
  experience: SpecializationExperience[];
  /** Yearly ledgers are bounded; retain totals after old detailed events are retired. */
  experienceYears: Partial<Record<SpecializationExperience["mode"], number>>;
  lastDecayYear?: number;
  createdYear?: number;
  learningPlan?: SpecializationLearningPlan;
  learningYear?: number;
  learningCoverage?: number;
  serviceLearning?: { year: number; coverage: number; domainId: string; role: string };
}
export type PracticalSkillReader = (characterId: number, domain: string) => number | undefined;

export type SpecializationLearningPlan = { teacherId: number } & (
  | { kind: "domain"; domainId: string; axis: SpecializationAxis }
  | { kind: "language"; languageId: string; axis: "listening" | "speaking" | "reading" | "writing"; scriptId?: string }
);
