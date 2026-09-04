/**
 * Technique stocks (guild, academy, state secret, martial), employment records, and the hire boards.
 *
 * Split out of the former single 2,452-line `economyContext.ts`, which had grown into a
 * 410-export module every one of this extension's ~180 files imported. `economyContext.ts` is now
 * a re-export barrel over these domain modules, so the public API is unchanged and no call site
 * moved. docs/plan/economy-coupling-audit.md T3.
 */

/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { AcademyKnowledgeStock } from "../generators/academyKnowledgeTypes";
import type { AdministrationEmploymentRecord } from "../generators/administrationEmployment";
import type { ConstructionHireApplication, ConstructionNamedSeat } from "../generators/constructionHireTypes";
import type { CraftEmploymentRecord } from "../generators/craftEmployment";
import type {
  EscortActiveContract,
  EscortCooldowns,
  EscortHireApplication,
  EscortJobPosting
} from "../generators/escortHireTypes";
import type { GreatLibraryProject } from "../generators/greatLibraryTypes";
import type { GuildChapter } from "../generators/guildChapterTypes";
import type { CraftDomainEmploymentRecord, GuildKnowledgeStock } from "../generators/guildKnowledgeTypes";
import type { CharacterDomainSkill } from "../generators/individualSkillTypes";
import type { MartialDisciplineStock } from "../generators/martialDisciplineTypes";
import type { BasicEmploymentSummaryRecord } from "../generators/serviceEmployment";
import type { StateSecretStock } from "../generators/stateSecretTypes";
import type {
  InstructionResidue,
  PatronageDeposit,
  ResearchHireApplication,
  ResearchNamedSeat,
  TechnologyHint,
  TechnologyInstructMission
} from "../generators/technologyBiasTypes";
import type {
  CullActiveContract,
  CullCooldowns,
  CullHireApplication,
  CullJobPosting
} from "../generators/threatCullHireTypes";
import {
  getEconomySlice,
  getLegacyPackFields,
  getSliceArray,
  getSliceNumber,
  setSliceArray,
  setSliceNumber
} from "./economyApi";

/** Pending construction hire applications (Phase 2 lag). */
export function getConstructionHireApplications(): ConstructionHireApplication[] {
  return getSliceArray<ConstructionHireApplication>("constructionHireApplications");
}

export function setConstructionHireApplications(apps: readonly ConstructionHireApplication[]): void {
  setSliceArray("constructionHireApplications", apps);
}

/** Named characters on construction seats (Phase 3). */
export function getConstructionNamedSeats(): ConstructionNamedSeat[] {
  return getSliceArray<ConstructionNamedSeat>("constructionNamedSeats");
}

export function setConstructionNamedSeats(seats: readonly ConstructionNamedSeat[]): void {
  setSliceArray("constructionNamedSeats", seats);
}

/** Threat cull / pest job postings (docs/plan/player-threat-cull-jobs.md PR-2). */
export function getCullJobPostings(): CullJobPosting[] {
  return getSliceArray<CullJobPosting>("cullJobPostings");
}

export function setCullJobPostings(posts: readonly CullJobPosting[]): void {
  setSliceArray("cullJobPostings", posts);
}

export function getCullHireApplications(): CullHireApplication[] {
  return getSliceArray<CullHireApplication>("cullHireApplications");
}

export function setCullHireApplications(apps: readonly CullHireApplication[]): void {
  setSliceArray("cullHireApplications", apps);
}

export function getCullActiveContracts(): CullActiveContract[] {
  return getSliceArray<CullActiveContract>("cullActiveContracts");
}

export function setCullActiveContracts(contracts: readonly CullActiveContract[]): void {
  setSliceArray("cullActiveContracts", contracts);
}

export function getCullCooldowns(): CullCooldowns {
  const slice = getEconomySlice();
  const value = slice ? slice.cullCooldowns : getLegacyPackFields().cullCooldowns;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as CullCooldowns;
  }
  return {};
}

export function setCullCooldowns(cooldowns: CullCooldowns): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.cullCooldowns = cooldowns;
    return;
  }
  getLegacyPackFields().cullCooldowns = cooldowns;
}

/** Escort (護衛) job board — all culture sets. */
export function getEscortJobPostings(): EscortJobPosting[] {
  return getSliceArray<EscortJobPosting>("escortJobPostings");
}

export function setEscortJobPostings(posts: readonly EscortJobPosting[]): void {
  setSliceArray("escortJobPostings", posts);
}

export function getEscortHireApplications(): EscortHireApplication[] {
  return getSliceArray<EscortHireApplication>("escortHireApplications");
}

export function setEscortHireApplications(apps: readonly EscortHireApplication[]): void {
  setSliceArray("escortHireApplications", apps);
}

export function getEscortActiveContracts(): EscortActiveContract[] {
  return getSliceArray<EscortActiveContract>("escortActiveContracts");
}

export function setEscortActiveContracts(contracts: readonly EscortActiveContract[]): void {
  setSliceArray("escortActiveContracts", contracts);
}

export function getEscortCooldowns(): EscortCooldowns {
  const slice = getEconomySlice();
  const value = slice ? slice.escortCooldowns : getLegacyPackFields().escortCooldowns;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as EscortCooldowns;
  }
  return {};
}

export function setEscortCooldowns(cooldowns: EscortCooldowns): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.escortCooldowns = cooldowns;
    return;
  }
  getLegacyPackFields().escortCooldowns = cooldowns;
}

/** Player technology-bias SoT (docs/plan/player-character-technology-bias.md). Derived contributions are not persisted. */
export function getResearchHireApplications(): ResearchHireApplication[] {
  return getSliceArray<ResearchHireApplication>("researchHireApplications");
}

export function setResearchHireApplications(apps: readonly ResearchHireApplication[]): void {
  setSliceArray("researchHireApplications", apps);
}

export function getResearchNamedSeats(): ResearchNamedSeat[] {
  return getSliceArray<ResearchNamedSeat>("researchNamedSeats");
}

export function setResearchNamedSeats(seats: readonly ResearchNamedSeat[]): void {
  setSliceArray("researchNamedSeats", seats);
}

export function getResearchInstructMissions(): TechnologyInstructMission[] {
  return getSliceArray<TechnologyInstructMission>("researchInstructMissions");
}

export function setResearchInstructMissions(missions: readonly TechnologyInstructMission[]): void {
  setSliceArray("researchInstructMissions", missions);
}

export function getInstructionResidues(): InstructionResidue[] {
  return getSliceArray<InstructionResidue>("instructionResidues");
}

export function setInstructionResidues(residues: readonly InstructionResidue[]): void {
  setSliceArray("instructionResidues", residues);
}

export function getTechnologyHints(): TechnologyHint[] {
  return getSliceArray<TechnologyHint>("technologyHints");
}

export function setTechnologyHints(hints: readonly TechnologyHint[]): void {
  setSliceArray("technologyHints", hints);
}

export function getPatronageDeposits(): PatronageDeposit[] {
  return getSliceArray<PatronageDeposit>("patronageDeposits");
}

export function setPatronageDeposits(deposits: readonly PatronageDeposit[]): void {
  setSliceArray("patronageDeposits", deposits);
}

/** Burg-scoped guild technique stocks, one entry per (burgId, domain) (docs/plan/knowledge-guild-system.md §6, §9 Phase 1). */
export function getGuildKnowledgeStocks(): GuildKnowledgeStock[] {
  return getSliceArray<GuildKnowledgeStock>("guildKnowledgeStocks");
}

export function setGuildKnowledgeStocks(stocks: readonly GuildKnowledgeStock[]): void {
  setSliceArray("guildKnowledgeStocks", stocks);
}

/** Formal guild halls, distinct from practitioner-driven GuildKnowledgeStock entries. */
export function getGuildChapters(): GuildChapter[] {
  return getSliceArray<GuildChapter>("guildChapters");
}

export function setGuildChapters(chapters: readonly GuildChapter[]): void {
  setSliceArray("guildChapters", chapters);
}

/** Practical skills for the small set of Economy-owned master/apprentice characters. */
export function getIndividualSkills(): CharacterDomainSkill[] {
  return getSliceArray<CharacterDomainSkill>("individualSkills");
}

export function setIndividualSkills(skills: readonly CharacterDomainSkill[]): void {
  setSliceArray("individualSkills", skills);
}

/** Burg-scoped academy/chancery technique stocks, one entry per (burgId, domain) (docs/plan/knowledge-guild-system.md §6, §9 Phase 3). */
export function getAcademyKnowledgeStocks(): AcademyKnowledgeStock[] {
  return getSliceArray<AcademyKnowledgeStock>("academyKnowledgeStocks");
}

export function setAcademyKnowledgeStocks(stocks: readonly AcademyKnowledgeStock[]): void {
  setSliceArray("academyKnowledgeStocks", stocks);
}

/** One State's royal-patronage library project, at most one active (non-"ruined") per State (docs/plan/great-library.md Persistence). */
export function getGreatLibraryProjects(): GreatLibraryProject[] {
  return getSliceArray<GreatLibraryProject>("greatLibraryProjects");
}

export function setGreatLibraryProjects(projects: readonly GreatLibraryProject[]): void {
  setSliceArray("greatLibraryProjects", projects);
}

/** Monotonic id allocator for new GreatLibraryProject records; starts at 1 (docs/plan/great-library.md Persistence). */
export function getGreatLibraryNextId(): number {
  const value = getSliceNumber("greatLibraryNextId");
  return value > 0 ? value : 1;
}

export function setGreatLibraryNextId(id: number): void {
  setSliceNumber("greatLibraryNextId", id);
}

/** State-scoped national-secret technique stocks, one entry per (stateId, domain) (docs/plan/knowledge-guild-system.md §6, §9 Phase 4). */
export function getStateSecretStocks(): StateSecretStock[] {
  return getSliceArray<StateSecretStock>("stateSecretStocks");
}

export function setStateSecretStocks(stocks: readonly StateSecretStock[]): void {
  setSliceArray("stateSecretStocks", stocks);
}

/** State-scoped standing-army training stocks, one entry per (stateId, domain) (docs/plan/knowledge-guild-system.md §6, §9 Phase 5). */
export function getMartialDisciplineStocks(): MartialDisciplineStock[] {
  return getSliceArray<MartialDisciplineStock>("martialDisciplineStocks");
}

export function setMartialDisciplineStocks(stocks: readonly MartialDisciplineStock[]): void {
  setSliceArray("martialDisciplineStocks", stocks);
}

export function getAdministrationEmployment(): AdministrationEmploymentRecord[] {
  return getSliceArray<AdministrationEmploymentRecord>("administrationEmployment");
}

export function setAdministrationEmployment(records: readonly AdministrationEmploymentRecord[]): void {
  setSliceArray("administrationEmployment", records);
}

export function getBasicEmploymentSummary(): BasicEmploymentSummaryRecord[] {
  return getSliceArray<BasicEmploymentSummaryRecord>("basicEmploymentSummary");
}

export function setBasicEmploymentSummary(records: readonly BasicEmploymentSummaryRecord[]): void {
  setSliceArray("basicEmploymentSummary", records);
}

export function getCraftEmploymentRecords(): CraftEmploymentRecord[] {
  return getSliceArray<CraftEmploymentRecord>("craftEmployment");
}

export function setCraftEmploymentRecords(records: readonly CraftEmploymentRecord[]): void {
  setSliceArray("craftEmployment", records);
}

/** Domain-split counterpart of `craftEmployment` (docs/plan/knowledge-guild-system.md §9 Phase 2). */
export function getCraftDomainEmploymentRecords(): CraftDomainEmploymentRecord[] {
  return getSliceArray<CraftDomainEmploymentRecord>("craftDomainEmployment");
}

export function setCraftDomainEmploymentRecords(records: readonly CraftDomainEmploymentRecord[]): void {
  setSliceArray("craftDomainEmployment", records);
}
