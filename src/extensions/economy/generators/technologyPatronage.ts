/**
 * Ruler / merchant patronage for experimental workshops and steam-trial fuel.
 * Design: docs/plan/player-character-technology-bias.md K21–K22, §4–§5.
 */

import { rn } from "../../hostUtils";
import {
  getExperimentalWorkshops,
  getExperimentalWorkshopsLastSettledYear,
  getMarkets,
  getMineOperations,
  getPatronageDeposits,
  getSimulationYear,
  getSteamInstallationsLastSettledYear,
  getSteamPumpTrials,
  getWorldContext,
  setExperimentalWorkshops,
  setPatronageDeposits
} from "../economyContext";
import { findGood } from "./chemMedCommon";
import type { PatronageDeposit } from "./technologyBiasTypes";

const FUEL_COAL = 2;
const FUEL_TOOLS = 0.35;
const FUEL_IRON = 0.8;

export const FUND_WORKSHOP_DEFAULT = 16;
export const FUND_WORKSHOP_EFFECTIVE_CAP = 48;
export const WORKSHOP_RESEARCHER_HIRE_COST = 8;
export const WORKSHOP_HIRED_RESEARCHER_CAP = 4;
export const WORKSHOP_BASE_RESEARCHERS = 2;
export const STEWARDSHIP_EFFICIENCY_RANGE = 0.25;
export const FUEL_TRIAL_UTILIZATION_RESCUE_CAP = 0.35;

function nextDepositId(deposits: readonly PatronageDeposit[]): number {
  let max = 0;
  for (const deposit of deposits) max = Math.max(max, deposit.i);
  return max + 1;
}

function readStewardship(character: { skills?: { stewardship?: number } }): number {
  const value = character.skills?.stewardship;
  return typeof value === "number" && Number.isFinite(value) ? value : 50;
}

export function patronageEfficiency(stewardship: number): number {
  const clamped = Math.max(-1, Math.min(1, (stewardship - 50) / 50));
  return 1 + STEWARDSHIP_EFFICIENCY_RANGE * clamped;
}

export function landedStateIdForCharacter(character: {
  titles?: { landed?: boolean; entityType?: string; entityId?: number; endYear?: number }[];
}): number | null {
  const title = character.titles?.find(
    entry => entry.landed && entry.entityType === "state" && entry.endYear == null && typeof entry.entityId === "number"
  );
  return title?.entityId ?? null;
}

function debitPayer(
  character: {
    i: number;
    wealth?: number;
    titles?: { landed?: boolean; entityType?: string; entityId?: number; endYear?: number }[];
  },
  burgStateId: number,
  gold: number
): { ok: boolean; message: string } {
  if (!(gold > 0)) return { ok: true, message: "" };
  const ruled = landedStateIdForCharacter(character);
  if (ruled != null && ruled === burgStateId) {
    const state = getWorldContext().pack.states?.[burgStateId];
    if (!state?.i || state.removed) return { ok: false, message: "State treasury not found." };
    if ((state.treasury ?? 0) < gold) return { ok: false, message: "Not enough treasury." };
    state.treasury = rn((state.treasury ?? 0) - gold, 2);
    return { ok: true, message: "" };
  }
  if ((character.wealth ?? 0) < gold) return { ok: false, message: "Not enough personal wealth." };
  character.wealth = rn((character.wealth ?? 0) - gold, 2);
  return { ok: true, message: "" };
}

function requireCharacterAtBurg(
  characterId: number,
  burgId: number
): { ok: true; character: NonNullable<ReturnType<typeof findCharacter>> } | { ok: false; message: string } {
  const character = findCharacter(characterId);
  if (!character || character.dead) return { ok: false, message: "Character not found or dead." };
  if (character.location !== burgId) return { ok: false, message: "Character must be in this burg." };
  return { ok: true, character };
}

function findCharacter(characterId: number) {
  return getWorldContext().pack.characters?.find(entry => entry.i === characterId);
}

function burgState(burgId: number): number {
  return getWorldContext().pack.burgs?.[burgId]?.state ?? 0;
}

export function patronageFundedBurgId(stateId: number, year: number): number | null {
  const deposit = getPatronageDeposits().find(
    entry => entry.kind === "workshop" && entry.stateId === stateId && entry.year === year && (entry.gold ?? 0) > 0
  );
  return deposit?.burgId ?? null;
}

export function fundWorkshop(args: { characterId: number; burgId: number; amount?: number }): {
  ok: boolean;
  message: string;
} {
  const atBurg = requireCharacterAtBurg(args.characterId, args.burgId);
  if (!atBurg.ok) return atBurg;
  const paidGold = Math.max(1, Math.round(args.amount ?? FUND_WORKSHOP_DEFAULT));
  const efficiency = patronageEfficiency(readStewardship(atBurg.character));
  const appliedGold = Math.min(paidGold * efficiency, FUND_WORKSHOP_EFFECTIVE_CAP);
  const stateId = burgState(args.burgId);
  const paid = debitPayer(atBurg.character, stateId, paidGold);
  if (!paid.ok) return paid;

  const year = getSimulationYear();
  const alreadySettled = getExperimentalWorkshopsLastSettledYear() === year;
  const deposits = [...getPatronageDeposits()];
  deposits.push({
    i: nextDepositId(deposits),
    characterId: args.characterId,
    burgId: args.burgId,
    stateId,
    year: alreadySettled ? year + 1 : year,
    kind: "workshop",
    gold: rn(appliedGold, 2)
  });
  setPatronageDeposits(deposits);
  return { ok: true, message: `Funded workshop with ${paidGold} gold.` };
}

export function hireResearchers(args: { characterId: number; burgId: number; count?: number }): {
  ok: boolean;
  message: string;
} {
  const atBurg = requireCharacterAtBurg(args.characterId, args.burgId);
  if (!atBurg.ok) return atBurg;
  const requested = Math.max(1, Math.floor(args.count ?? 1));
  const workshop = getExperimentalWorkshops().find(entry => entry.active && entry.burgId === args.burgId);
  if (!workshop) return { ok: false, message: "No experimental workshop in this burg." };

  const room = Math.max(0, WORKSHOP_BASE_RESEARCHERS + WORKSHOP_HIRED_RESEARCHER_CAP - (workshop.researchers ?? 0));
  if (room <= 0) return { ok: false, message: "Workshop researcher roster is full." };

  const efficiency = patronageEfficiency(readStewardship(atBurg.character));
  const paidGold = requested * WORKSHOP_RESEARCHER_HIRE_COST;
  const hired = Math.min(room, Math.floor((paidGold * efficiency) / WORKSHOP_RESEARCHER_HIRE_COST));
  if (hired < 1) return { ok: false, message: "Stewardship is too low to hire a researcher." };
  const charge = hired * WORKSHOP_RESEARCHER_HIRE_COST;
  const paid = debitPayer(atBurg.character, burgState(args.burgId), charge);
  if (!paid.ok) return paid;

  const workshops = [...getExperimentalWorkshops()];
  const live = workshops.find(entry => entry.active && entry.burgId === args.burgId);
  if (!live) return { ok: false, message: "No experimental workshop in this burg." };
  live.researchers = (live.researchers ?? WORKSHOP_BASE_RESEARCHERS) + hired;
  setExperimentalWorkshops(workshops);
  return { ok: true, message: `Hired ${hired} researcher${hired === 1 ? "" : "s"}.` };
}

function marketUnitPrice(marketId: number, goodName: string): number {
  const good = findGood(goodName);
  if (!good) return 0;
  const market = getMarkets().find(entry => entry.i === marketId);
  const listed = market?.goods[good.i]?.price;
  if (typeof listed === "number" && Number.isFinite(listed) && listed > 0) return listed;
  return Number(good.value) || 0;
}

export function fuelTrial(args: { characterId: number; mineOperationId: number }): { ok: boolean; message: string } {
  const mine = getMineOperations().find(operation => operation.i === args.mineOperationId && operation.active);
  if (!mine) return { ok: false, message: "Active mine not found." };
  const atBurg = requireCharacterAtBurg(args.characterId, mine.burgId);
  if (!atBurg.ok) return atBurg;
  const trial = getSteamPumpTrials().find(
    entry =>
      entry.mineOperationId === args.mineOperationId && (entry.status === "building" || entry.status === "running")
  );
  if (!trial) return { ok: false, message: "No steam pump trial at this mine." };

  const coal = FUEL_COAL;
  const tools = FUEL_TOOLS;
  const iron = trial.status === "building" ? FUEL_IRON : 0;
  const gold = rn(
    coal * marketUnitPrice(mine.marketId, "Coal") +
      tools * marketUnitPrice(mine.marketId, "Tools") +
      iron * marketUnitPrice(mine.marketId, "Iron Ingot"),
    2
  );
  const paid = debitPayer(atBurg.character, burgState(mine.burgId), Math.max(gold, 0.01));
  if (!paid.ok) return paid;

  const year = getSimulationYear();
  const alreadySettled = getSteamInstallationsLastSettledYear() === year;
  const deposits = [...getPatronageDeposits()];
  deposits.push({
    i: nextDepositId(deposits),
    characterId: args.characterId,
    burgId: mine.burgId,
    stateId: burgState(mine.burgId),
    year: alreadySettled ? year + 1 : year,
    kind: "fuelTrial",
    gold,
    mineOperationId: args.mineOperationId,
    coal,
    tools,
    iron: iron || undefined
  });
  setPatronageDeposits(deposits);
  return { ok: true, message: "Reserved trial fuel for the next operating year." };
}

export function consumeFuelDepositsForMine(
  mineOperationId: number,
  year: number
): { coal: number; tools: number; iron: number } {
  const kept: PatronageDeposit[] = [];
  let coal = 0;
  let tools = 0;
  let iron = 0;
  for (const deposit of getPatronageDeposits()) {
    if (deposit.kind === "fuelTrial" && deposit.mineOperationId === mineOperationId && deposit.year === year) {
      coal += deposit.coal ?? 0;
      tools += deposit.tools ?? 0;
      iron += deposit.iron ?? 0;
      continue;
    }
    kept.push(deposit);
  }
  setPatronageDeposits(kept);
  return { coal, tools, iron };
}
