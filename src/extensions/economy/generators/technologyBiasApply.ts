/**
 * Rebuilds the non-persistent extraWorkers scratchpad from seats and residues.
 * Not saved (docs/plan/player-character-technology-bias.md §5.4 / K18).
 */

import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import { rn } from "../../hostUtils";
import {
  getInstructionResidues,
  getPatronageDeposits,
  getResearchNamedSeats,
  getSimulationYear
} from "../economyContext";
import { SCHOLARLY_KNOWLEDGE_DOMAINS, type ScholarlyKnowledgeDomain } from "./academyKnowledgeTypes";
import { CRAFT_KNOWLEDGE_DOMAINS, type CraftKnowledgeDomain } from "./guildKnowledgeTypes";

/** Must match GUILD_SATURATION_WORKERS — imported by settlers, not here, to avoid a cycle. */
export const RESIDUE_GUILD_SATURATION_WORKERS = 6;
/** Must match ACADEMY_SATURATION_WORKERS. */
export const RESIDUE_ACADEMY_SATURATION_WORKERS = 8;

export const SEAT_WORKER_CAP = 3;
export const EXPERIMENT_RECORD_RATE_K = 0.5;
export const ENGINEERING_WORKSHOP_MIN = 60;
export const ENGINEERING_MASTER = 80;
export const ENGINEERING_GRANDMASTER = 95;

export interface ExtraWorkersEntry {
  burgId: number;
  domain: string;
  extraWorkers: number;
}

const SCHOLARLY_DOMAINS = new Set<string>(SCHOLARLY_KNOWLEDGE_DOMAINS);
const CRAFT_DOMAINS = new Set<string>(CRAFT_KNOWLEDGE_DOMAINS);

export function extraWorkersKey(burgId: number, domain: string): string {
  return `${burgId}:${domain}`;
}

export function isCraftKnowledgeDomain(domain: string): domain is CraftKnowledgeDomain {
  return CRAFT_DOMAINS.has(domain);
}

export function isScholarlyKnowledgeDomain(domain: string): domain is ScholarlyKnowledgeDomain {
  return SCHOLARLY_DOMAINS.has(domain);
}

export function extraWorkersFromEngineering(engineering: number | null | undefined): number {
  if (engineering === null || engineering === undefined || !Number.isFinite(engineering)) return 1;
  if (engineering < ENGINEERING_WORKSHOP_MIN) return 0;
  if (engineering < ENGINEERING_MASTER) return 1;
  if (engineering < ENGINEERING_GRANDMASTER) return 2;
  return SEAT_WORKER_CAP;
}

/** Seat-less callers get 0. Missing skills on a live seat use the 60-band floor. */
export function experimentRecordQuality(engineering: number | null | undefined): number {
  const used =
    engineering === null || engineering === undefined || !Number.isFinite(engineering)
      ? ENGINEERING_WORKSHOP_MIN
      : engineering;
  return clamp01((used - 50) / 50);
}

export function extraWorkersFromResidue(stock: number, saturation: number): number {
  if (!(stock > 0) || !(saturation > 0) || !Number.isFinite(stock) || !Number.isFinite(saturation)) return 0;
  return rn(Math.min(stock * saturation, saturation), 4);
}

function readCharacterEngineering(characterId: number): number | null {
  if (!hasCharactersContext()) return null;
  const value = getCharacters().find(character => character.i === characterId)?.skills?.engineering;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addExtraWorkers(
  byKey: Map<string, ExtraWorkersEntry>,
  burgId: number,
  domain: string,
  extraWorkers: number
): void {
  if (!(extraWorkers > 0) || !Number.isFinite(extraWorkers)) return;
  if (!isCraftKnowledgeDomain(domain) && !isScholarlyKnowledgeDomain(domain)) return;
  const key = extraWorkersKey(burgId, domain);
  const existing = byKey.get(key);
  if (existing) existing.extraWorkers += extraWorkers;
  else byKey.set(key, { burgId, domain, extraWorkers });
}

/**
 * Derived extraWorkers for this tick. Hire-researcher patronage is not included —
 * that mutates workshop.researchers in a later PR.
 */
export function getDerivedExtraWorkers(): Map<string, ExtraWorkersEntry> {
  const byKey = new Map<string, ExtraWorkersEntry>();

  for (const seat of getResearchNamedSeats()) {
    if (seat.role === "mineLaborer") {
      addExtraWorkers(byKey, seat.burgId, "metallurgy", 1);
      continue;
    }
    if (seat.role !== "workshopResearcher") continue;
    addExtraWorkers(
      byKey,
      seat.burgId,
      "naturalPhilosophy",
      extraWorkersFromEngineering(readCharacterEngineering(seat.characterId))
    );
  }

  for (const residue of getInstructionResidues()) {
    const saturation = isScholarlyKnowledgeDomain(residue.domain)
      ? RESIDUE_ACADEMY_SATURATION_WORKERS
      : RESIDUE_GUILD_SATURATION_WORKERS;
    addExtraWorkers(byKey, residue.burgId, residue.domain, extraWorkersFromResidue(residue.stock, saturation));
  }

  return byKey;
}

/** Best workshop-researcher quality at this burg, or 0 when no seat is present. */
/** Seat rescue toward trial utilization, capped at 0.35. */
export function trialSeatUtilizationBonus(mineOperationId: number): number {
  for (const seat of getResearchNamedSeats()) {
    if (seat.role !== "trialMachinist" || seat.mineOperationId !== mineOperationId) continue;
    const extra = extraWorkersFromEngineering(readCharacterEngineering(seat.characterId));
    return Math.min(0.15 * extra, 0.35);
  }
  return 0;
}

export function getWorkshopExperimentQuality(burgId: number): number {
  let best = 0;
  let hasSeat = false;
  for (const seat of getResearchNamedSeats()) {
    if (seat.role !== "workshopResearcher" || seat.burgId !== burgId) continue;
    hasSeat = true;
    const quality = experimentRecordQuality(readCharacterEngineering(seat.characterId));
    if (quality > best) best = quality;
  }
  return hasSeat ? best : 0;
}

/** Rate-side only — callers must keep applyKnowledgeEwma years as the Options speed. */
export function biasExperimentRecordRate(baseRate: number, burgId: number): number {
  const quality = getWorkshopExperimentQuality(burgId);
  if (quality <= 0) return baseRate;
  return clamp01(baseRate * (1 + EXPERIMENT_RECORD_RATE_K * quality));
}

export function getWorkshopPatronageAppliedGold(burgId: number, stateId: number, year = getSimulationYear()): number {
  let applied = 0;
  for (const deposit of getPatronageDeposits()) {
    if (deposit.kind !== "workshop") continue;
    if (deposit.burgId !== burgId || deposit.stateId !== stateId) continue;
    if (deposit.year !== year) continue;
    if (typeof deposit.gold === "number" && Number.isFinite(deposit.gold) && deposit.gold > 0) {
      applied += deposit.gold;
    }
  }
  return applied;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
