/**
 * Instruct / copy-notes missions and instruction residue.
 * Design: docs/plan/player-character-technology-bias.md K11–K20, §4, §7.
 */

import { getTechnologyDefinition } from "../../../generators/technologyDefinitions";
import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { getPersonalTechnologyKnowledge, setPersonalTechnologyKnowledge } from "../../characters/charactersContext";
import { applyKnowledgeEwma, rn } from "../../hostUtils";
import {
  getApi,
  getInstructionResidues,
  getResearchInstructMissions,
  getSimulationYear,
  getTechnologyHints,
  getWorldContext,
  setInstructionResidues,
  setResearchInstructMissions,
  setTechnologyHints
} from "../economyContext";
import { consumeNamed } from "./chemMedCommon";
import { characterHasEmploymentCommitment } from "./employmentCommitment";
import type { InstructionResidue, TechnologyHint, TechnologyInstructMission } from "./technologyBiasTypes";

export const INSTRUCT_HIRE_LAG_DAYS = 7;
export const INSTRUCT_MISSION_DAYS = 30;
export const COPY_NOTES_LAG_DAYS = 14;
export const COPY_NOTES_BOOKS = 0.1;
export const COPY_NOTES_PAPER = 0.2;
export const HINT_DURATION_YEARS = 3;
export const RESIDUE_DECAY_RATE = 0.15;
export const RESIDUE_PULSE_SOURCE = 0.6;
export const RESIDUE_PULSE_HOP1 = 0.3;
export const RESIDUE_PULSE_HOP2 = 0.15;
const MIN_TRACKED_STOCK = 0.001;
export const RESEARCH_ROLE_SOURCE = "economy";

const PRIMARY_DOMAIN_BY_TECH: Readonly<Record<string, string>> = {
  experimentalNaturalPhilosophy: "naturalPhilosophy",
  mineSurveyAndDrainage: "metallurgy",
  precisionBoringAndMeasurement: "metallurgy",
  coalFuelSupply: "administration",
  atmosphericSteamPumping: "metallurgy",
  condensateEfficiency: "metallurgy",
  laboratoryGlassware: "glassware",
  recordReplication: "printing",
  highTempFurnace: "metallurgy",
  improvedMining: "metallurgy"
};

function findCharacter(characterId: number) {
  return getWorldContext().pack.characters?.find(entry => entry.i === characterId);
}

function burgState(burgId: number): number {
  return getWorldContext().pack.burgs?.[burgId]?.state ?? 0;
}

function marketIdForBurg(burgId: number): number {
  return getWorldContext().pack.burgs?.[burgId]?.market ?? 0;
}

function characterKnows(characterId: number, technologyId: string): boolean {
  const known = getPersonalTechnologyKnowledge()[String(characterId)];
  if (known === "all") return true;
  return Array.isArray(known) && known.includes(technologyId);
}

function hintFirstEligibleYear(): number {
  const year = getSimulationYear();
  const last = getApi().simulationContext?.technology?.lastEvaluatedYear;
  return last === year ? year + 1 : year;
}

function addInstructRole(characterId: number, burgId: number, kind: "instructor" | "copyist"): void {
  const character = findCharacter(characterId);
  if (!character) return;
  if (!character.roles) character.roles = [];
  character.roles = character.roles.filter(
    role => !(role.source === RESEARCH_ROLE_SOURCE && (role.kind === "instructor" || role.kind === "copyist"))
  );
  character.roles.push({
    source: RESEARCH_ROLE_SOURCE,
    kind,
    entityType: "burg",
    entityId: burgId,
    label: kind === "instructor" ? "Instructor" : "Copyist"
  });
}

function removeInstructRole(characterId: number): void {
  const character = findCharacter(characterId);
  if (!character?.roles) return;
  character.roles = character.roles.filter(
    role => !(role.source === RESEARCH_ROLE_SOURCE && (role.kind === "instructor" || role.kind === "copyist"))
  );
}

function upsertResidue(burgId: number, domain: string, pulse: number, sourceCharacterId: number, year: number): void {
  const rows = [...getInstructionResidues()];
  const existing = rows.find(row => row.burgId === burgId && row.domain === domain);
  if (existing) {
    existing.stock = rn(Math.min(1, Math.max(existing.stock, pulse)), 4);
    existing.lastPulseYear = year;
    existing.sourceCharacterId = sourceCharacterId;
  } else {
    const created: InstructionResidue = {
      burgId,
      domain,
      stock: rn(Math.min(1, pulse), 4),
      sourceCharacterId,
      lastPulseYear: year
    };
    rows.push(created);
  }
  setInstructionResidues(rows);
}

function upsertHint(hint: TechnologyHint): void {
  const rows = getTechnologyHints().filter(
    row => !(row.stateId === hint.stateId && row.technologyId === hint.technologyId && row.burgId === hint.burgId)
  );
  rows.push(hint);
  setTechnologyHints(rows);
}

export function domainForTechnology(technologyId: string): string | null {
  if (PRIMARY_DOMAIN_BY_TECH[technologyId]) return PRIMARY_DOMAIN_BY_TECH[technologyId];
  const def = getTechnologyDefinition(technologyId);
  if (!def) return null;
  const fromKnown = Object.keys(def.known.min ?? {});
  if (fromKnown.includes("naturalPhilosophy")) return "naturalPhilosophy";
  if (fromKnown.includes("metallurgy")) return "metallurgy";
  if (fromKnown.includes("administration")) return "administration";
  if (fromKnown.includes("printing")) return "printing";
  if (fromKnown.includes("glassware")) return "glassware";
  return "naturalPhilosophy";
}

export function startInstructMission(args: { characterId: number; burgId: number; technologyIds: string[] }): {
  ok: boolean;
  message: string;
} {
  const character = findCharacter(args.characterId);
  if (!character || character.dead) return { ok: false, message: "Character not found or dead." };
  if (character.location !== args.burgId) return { ok: false, message: "Character must be in this burg." };
  if (characterHasEmploymentCommitment(args.characterId)) {
    return { ok: false, message: "Already committed to employment (construction, hunt, escort, or research)." };
  }
  const ids = [...new Set(args.technologyIds.filter(id => typeof id === "string" && id.length > 0))];
  if (ids.length < 1 || ids.length > 3) return { ok: false, message: "Choose 1 to 3 technologies to teach." };
  for (const id of ids) {
    if (!getTechnologyDefinition(id)) return { ok: false, message: `Unknown technology: ${id}.` };
    if (!characterKnows(args.characterId, id)) {
      return { ok: false, message: "Personal knowledge does not include that technology." };
    }
  }
  const missions = getResearchInstructMissions().filter(mission => mission.characterId !== args.characterId);
  const mission: TechnologyInstructMission = {
    characterId: args.characterId,
    burgId: args.burgId,
    stateId: burgState(args.burgId),
    kind: "teach",
    daysRemaining: INSTRUCT_HIRE_LAG_DAYS + INSTRUCT_MISSION_DAYS,
    technologyIds: ids
  };
  missions.push(mission);
  setResearchInstructMissions(missions);
  addInstructRole(args.characterId, args.burgId, "instructor");
  return { ok: true, message: `Teaching begins in ${INSTRUCT_HIRE_LAG_DAYS} days.` };
}

export function startCopyNotes(args: { characterId: number; burgId: number; technologyId: string }): {
  ok: boolean;
  message: string;
} {
  const character = findCharacter(args.characterId);
  if (!character || character.dead) return { ok: false, message: "Character not found or dead." };
  if (character.location !== args.burgId) return { ok: false, message: "Character must be in this burg." };
  if (characterHasEmploymentCommitment(args.characterId)) {
    return { ok: false, message: "Already committed to employment (construction, hunt, escort, or research)." };
  }
  if (!getTechnologyDefinition(args.technologyId)) return { ok: false, message: "Unknown technology." };
  const stateId = burgState(args.burgId);
  if (!isTechnologyStageAtLeast(getTechnologyStage(args.technologyId, stateId), "demonstrated")) {
    return { ok: false, message: "Local knowledge must be at least demonstrated." };
  }
  const marketId = marketIdForBurg(args.burgId);
  const books = consumeNamed(marketId, "Books", COPY_NOTES_BOOKS);
  const paper = consumeNamed(marketId, "Paper", COPY_NOTES_PAPER);
  if (books < COPY_NOTES_BOOKS || paper < COPY_NOTES_PAPER) {
    return { ok: false, message: "Not enough Books and Paper on the local market." };
  }
  const missions = getResearchInstructMissions().filter(mission => mission.characterId !== args.characterId);
  missions.push({
    characterId: args.characterId,
    burgId: args.burgId,
    stateId,
    kind: "copy",
    daysRemaining: COPY_NOTES_LAG_DAYS,
    technologyIds: [args.technologyId]
  });
  setResearchInstructMissions(missions);
  addInstructRole(args.characterId, args.burgId, "copyist");
  return { ok: true, message: `Copying notes. Ready in ${COPY_NOTES_LAG_DAYS} days.` };
}

export function cancelInstructMission(characterId: number): { ok: boolean; message: string } {
  const next = getResearchInstructMissions().filter(mission => mission.characterId !== characterId);
  if (next.length === getResearchInstructMissions().length) {
    return { ok: false, message: "No teaching or copy-notes mission." };
  }
  setResearchInstructMissions(next);
  removeInstructRole(characterId);
  return { ok: true, message: "Mission cancelled." };
}

function completeTeachPulse(mission: TechnologyInstructMission, spread: boolean): void {
  const year = getSimulationYear();
  const hops = spread ? nearbyBurgs(mission.burgId) : new Map([[mission.burgId, 0]]);
  const domains = new Set<string>();
  for (const id of mission.technologyIds) {
    const domain = domainForTechnology(id);
    if (domain) domains.add(domain);
  }
  for (const [burgId, hop] of hops) {
    const pulse = hop <= 0 ? RESIDUE_PULSE_SOURCE : hop === 1 ? RESIDUE_PULSE_HOP1 : RESIDUE_PULSE_HOP2;
    for (const domain of domains) upsertResidue(burgId, domain, pulse, mission.characterId, year);
  }
  const firstEligibleYear = hintFirstEligibleYear();
  const expiresAfterYear = firstEligibleYear + HINT_DURATION_YEARS - 1;
  for (const [burgId] of hops) {
    const stateId = burgState(burgId);
    for (const technologyId of mission.technologyIds) {
      upsertHint({
        stateId,
        technologyId,
        burgId,
        sourceCharacterId: mission.characterId,
        firstEligibleYear,
        expiresAfterYear
      });
    }
  }
}

function completeCopyNotes(mission: TechnologyInstructMission): void {
  const id = mission.technologyIds[0];
  if (!id) return;
  const knowledge = { ...getPersonalTechnologyKnowledge() };
  const key = String(mission.characterId);
  const current = knowledge[key];
  if (current === "all") return;
  const next = Array.isArray(current) ? [...current] : [];
  if (!next.includes(id)) next.push(id);
  knowledge[key] = next;
  setPersonalTechnologyKnowledge(knowledge);
}

export function tickInstructMissions(deltaDays: number, options?: { spreadNeighborhood?: boolean }): void {
  if (!(deltaDays > 0)) return;
  purgeInvalidInstructMissions();
  const remaining: TechnologyInstructMission[] = [];
  for (const mission of getResearchInstructMissions()) {
    const daysLeft = mission.daysRemaining - deltaDays;
    if (daysLeft > 0) {
      remaining.push({ ...mission, daysRemaining: daysLeft });
      continue;
    }
    if (mission.kind === "teach") completeTeachPulse(mission, Boolean(options?.spreadNeighborhood));
    else completeCopyNotes(mission);
    removeInstructRole(mission.characterId);
  }
  setResearchInstructMissions(remaining);
}

export function decayInstructionResidues(): void {
  const year = getSimulationYear();
  const next: InstructionResidue[] = [];
  for (const residue of getInstructionResidues()) {
    if (residue.lastPulseYear === year) {
      next.push(residue);
      continue;
    }
    const stock = rn(applyKnowledgeEwma(residue.stock, 0, RESIDUE_DECAY_RATE), 4);
    if (stock > MIN_TRACKED_STOCK) next.push({ ...residue, stock });
  }
  setInstructionResidues(next);
}

export function dropExpiredHints(year = getSimulationYear()): void {
  setTechnologyHints(getTechnologyHints().filter(hint => hint.expiresAfterYear >= year));
}

export function purgeInvalidInstructMissions(): void {
  const { pack } = getWorldContext();
  const byId = new Map((pack.characters ?? []).map(character => [character.i, character]));
  const valid = getResearchInstructMissions().filter(mission => {
    const character = byId.get(mission.characterId);
    if (!character || character.dead || character.location !== mission.burgId) {
      if (character) removeInstructRole(mission.characterId);
      return false;
    }
    return true;
  });
  setResearchInstructMissions(valid);
}

export function getCharacterInstructMission(characterId: number): TechnologyInstructMission | null {
  return getResearchInstructMissions().find(mission => mission.characterId === characterId) ?? null;
}

export function nearbyBurgs(sourceBurgId: number, maxHops = 2): Map<number, number> {
  const hops = new Map<number, number>([[sourceBurgId, 0]]);
  const adjacency = burgAdjacency();
  const queue = [sourceBurgId];
  while (queue.length) {
    const current = queue.shift();
    if (current == null) break;
    const currentHop = hops.get(current) ?? 0;
    if (currentHop >= maxHops) continue;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (hops.has(neighbor)) continue;
      hops.set(neighbor, currentHop + 1);
      queue.push(neighbor);
    }
  }
  const sourceMarket = getWorldContext().pack.burgs?.[sourceBurgId]?.market ?? 0;
  if (sourceMarket > 0) {
    for (const burg of getWorldContext().pack.burgs ?? []) {
      if (!burg?.i || burg.removed || burg.i === sourceBurgId) continue;
      if (burg.market === sourceMarket && !hops.has(burg.i)) hops.set(burg.i, 1);
    }
  }
  return hops;
}

function burgAdjacency(): Map<number, Set<number>> {
  const { pack } = getWorldContext();
  const cellToBurgs = new Map<number, number[]>();
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const cell = burg.cell;
    if (typeof cell !== "number") continue;
    const list = cellToBurgs.get(cell) ?? [];
    list.push(burg.i);
    cellToBurgs.set(cell, list);
  }
  const edges = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)?.add(b);
    edges.get(b)?.add(a);
  };
  for (const route of pack.routes ?? []) {
    if (route.merged) continue;
    if (route.group !== "roads" && route.group !== "trails") continue;
    if (route.navigation === "river") continue;
    const ordered: number[] = [];
    for (const point of route.points ?? []) {
      const cell = point[2];
      const burgs = cellToBurgs.get(cell);
      if (!burgs?.length) continue;
      for (const id of burgs) {
        if (ordered[ordered.length - 1] !== id) ordered.push(id);
      }
    }
    for (let i = 1; i < ordered.length; i++) addEdge(ordered[i - 1], ordered[i]);
  }
  return edges;
}
