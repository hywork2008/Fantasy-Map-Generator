import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import type { AptitudeTier, BlacksmithingTechnique } from "./individualSkillTypes";

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
}
