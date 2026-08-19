import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import type { AptitudeTier, BlacksmithingTechnique, BlacksmithingTechniqueLead } from "./individualSkillTypes";

/** A formal, city-based guild hall. Technique stock remains an independent practitioner measure. */
export interface GuildChapter {
  burgId: number;
  domain: CraftKnowledgeDomain;
  foundedYear: number;
  /** Reserved for a future multi-burg guild network. */
  status: "chapter" | "hq" | "branch";
  /** Last calculated placement suitability, normalized to 0..1. */
  suitability: number;
}

export type GuildPresenceStatus = "chapter" | "informal";

export interface BurgGuildListRow {
  domain: CraftKnowledgeDomain;
  status: GuildPresenceStatus;
  /** Live practitioner headcount driving this domain's technique (coverage = workers / 6). */
  workers: number;
  stock: number;
  bonus: number;
  treasury: number;
  suitability: number | null;
  foundedYear: number | null;
  masterCharacterId: number | null;
  masterName: string | null;
  masterProficiency: number | null;
  masterAptitude: AptitudeTier | null;
  masterTechniques: BlacksmithingTechnique[];
  masterReconstructionLeads: BlacksmithingTechniqueLead[];
}
