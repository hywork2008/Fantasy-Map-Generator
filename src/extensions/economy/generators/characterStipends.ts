import { getSolidarity } from "../../characters/backstoryProfile";
import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import type { State } from "../../hostTypes";
import { rand, rn } from "../../hostUtils";
import { CENTRAL_OFFICES } from "../../nobility/data/titleTable";
import { getRegimentCommander } from "../../nobility/generators/officerAssignment";
import { getRulerId } from "../../nobility/nobilityContext";
import { getGuildKnowledgeStocks, getMarkets, getWorldContext, setGuildKnowledgeStocks } from "../economyContext";
import { findApprentices, findMaster } from "./guildSuccession";
import {
  DEPARTMENT_BY_PRIMARY_SKILL,
  findLivingOfficeHolder,
  getCentralOfficePersonalStipend,
  getDepartmentBaselineAllocation,
  getFieldCommanderStipend,
  getMilitaryStructuralMultiplier,
  getRulerHouseholdStipend
} from "./treasuryAllocation";

/**
 * Personal stipends for non–central-budget roles (province lords, guild, market) and the
 * shared seed path for all paid characters.
 *
 * ## Target ladder (silver pieces / production cycle; ~12 cycles ≈ 1 year)
 *
 * | Role | Typical pay | Notes |
 * | :--- | ---: | :--- |
 * | Soldier (reference) | 0.12 | BASE_UPKEEP_PER_HEAD — not Character.wealth |
 * | Guild apprentice | 0.03–0.08 | Fixed age band; only if master–apprentice bond is good |
 * | Market rival | 0.30 | Fixed; market treasury is a ceiling only |
 * | Guild master | 0.35 | Fixed; guild treasury is a ceiling only |
 * | Market manager | 0.70 | Fixed |
 * | Field commander | 0.50–1.50 | Upkeep share with floor/cap (treasuryAllocation) |
 * | Province lord | 1.00 | Fixed from seated Burg treasury |
 * | Central office | 0.80–3.00 | Share of department budget with floor/cap |
 * | Ruler household | 1.00–5.00 | Share of income with floor/cap |
 *
 * Percentage draws against large institutional piles (burg/market/guild treasuries, full
 * department budgets) are avoided for *personal* pay — they made children richer than captains
 * and officers richer than small-realm kings. Pools only cap what can be funded this cycle.
 *
 * docs/plan/state-treasury-department-budget.md §7 item 7–8; docs/analytics/character-wealth-balance.md
 */

/** @deprecated Was 10% of burg treasury. Personal pay is now PROVINCE_LORD_STIPEND fixed. */
export const PROVINCE_LORD_STIPEND_RATE = 0;
/** Fixed personal stipend (SP / cycle) for a landed province lord, paid from their seated Burg. */
export const PROVINCE_LORD_STIPEND = 1.0;

/** @deprecated Was 5–10% of guild treasury. Personal pay is now GUILD_MASTER_STIPEND fixed. */
export const GUILD_MASTER_STIPEND_RATE = 0;
/** Fixed master stipend (SP / cycle). Above apprentices, below field-commander floor. */
export const GUILD_MASTER_STIPEND = 0.35;

/**
 * @deprecated Former wage share of guild treasury (was 3%). Pocket money is age-fixed; kept at 0.
 */
export const GUILD_APPRENTICE_STIPEND_RATE = 0;
/** @deprecated Percentage pocket money removed; kept at 0. */
export const GUILD_APPRENTICE_POCKET_RATE = 0;

export const GUILD_APPRENTICE_POCKET_SOLIDARITY_MIN = 20;

/**
 * Fixed pocket money (SP / cycle) by apprentice age — never a share of guild treasury.
 * Full bond, ~12 cycles/year: 12–14 → 0.36, 15–17 → 0.60, 18+ → 0.96 SP/year.
 */
export const GUILD_APPRENTICE_POCKET_BY_AGE = {
  child: 0.03,
  youth: 0.05,
  adult: 0.08
} as const;

export const GUILD_APPRENTICE_POCKET_MAX = GUILD_APPRENTICE_POCKET_BY_AGE.adult;

/** @deprecated Was 8% of market balance. Personal pay is now MARKET_MANAGER_STIPEND fixed. */
export const MARKET_MANAGER_STIPEND_RATE = 0;
/** Fixed market-manager stipend (SP / cycle). */
export const MARKET_MANAGER_STIPEND = 0.7;

/** @deprecated Was 3% of market balance. Personal pay is now MARKET_RIVAL_STIPEND fixed. */
export const MARKET_RIVAL_STIPEND_RATE = 0;
/** Fixed rival-merchant stipend (SP / cycle). Below manager, above apprentice pocket money. */
export const MARKET_RIVAL_STIPEND = 0.3;

/** Pay `desired` from `pool` without overdrawing. */
export function payFromPool(pool: number, desired: number): number {
  if (!(pool > 0) || !(desired > 0)) return 0;
  return rn(Math.min(pool, desired), 2);
}

export function apprenticePocketBaseByAge(age: number): number {
  if (age < 15) return GUILD_APPRENTICE_POCKET_BY_AGE.child;
  if (age < 18) return GUILD_APPRENTICE_POCKET_BY_AGE.youth;
  return GUILD_APPRENTICE_POCKET_BY_AGE.adult;
}

export function isGoodMasterApprenticeBond(master: Character, apprentice: Character): boolean {
  if (master.dead || apprentice.dead || master.i === apprentice.i) return false;
  const masterToApprentice = getSolidarity(master, apprentice.i);
  const apprenticeToMaster = getSolidarity(apprentice, master.i);
  return (
    masterToApprentice >= GUILD_APPRENTICE_POCKET_SOLIDARITY_MIN &&
    apprenticeToMaster >= GUILD_APPRENTICE_POCKET_SOLIDARITY_MIN
  );
}

/**
 * Optional apprentice pocket money: fixed age band × bond quality, funded by guild treasury
 * only as a ceiling. Cool/unknown bonds pay 0.
 */
export function computeApprenticePocketMoney(guildTreasury: number, master: Character, apprentice: Character): number {
  if (!(guildTreasury > 0) || !isGoodMasterApprenticeBond(master, apprentice)) return 0;

  const bond = Math.min(getSolidarity(master, apprentice.i), getSolidarity(apprentice, master.i));
  const quality = Math.min(1, Math.max(0, (bond - GUILD_APPRENTICE_POCKET_SOLIDARITY_MIN) / 60));
  const scale = 0.4 + 0.6 * quality;
  const desired = apprenticePocketBaseByAge(apprentice.age ?? 0) * scale;
  return payFromPool(guildTreasury, desired);
}

/** Fixed province-lord stipend limited by the seated Burg's treasury. */
export function computeProvinceLordStipend(burgTreasury: number): number {
  return payFromPool(burgTreasury, PROVINCE_LORD_STIPEND);
}

/** Fixed guild-master stipend limited by the domain guild treasury. */
export function computeGuildMasterStipend(guildTreasury: number): number {
  return payFromPool(guildTreasury, GUILD_MASTER_STIPEND);
}

/** Fixed market-manager stipend limited by market working capital. */
export function computeMarketManagerStipend(marketBalance: number): number {
  return payFromPool(marketBalance, MARKET_MANAGER_STIPEND);
}

/** Fixed rival-merchant stipend limited by market working capital. */
export function computeMarketRivalStipend(marketBalance: number): number {
  return payFromPool(marketBalance, MARKET_RIVAL_STIPEND);
}

/**
 * Pays each of `state`'s living, landed province lords a fixed stipend from their seated Burg's
 * treasury — never state.treasury. Vacant/unseated provinces pay nothing.
 */
export function payProvinceLordStipends(state: Pick<State, "i">): void {
  if (!state.i || !hasCharactersContext()) return;
  const { pack } = getWorldContext();
  if (!pack.provinces?.length) return;

  const characters = getCharacters();

  for (const province of pack.provinces) {
    if (!province?.i || province.removed || province.state !== state.i || !province.burg) continue;

    const burg = pack.burgs[province.burg];
    if (!burg || !(burg.treasury && burg.treasury > 0)) continue;

    const lord = characters.find(
      character =>
        !character.dead &&
        character.titles.some(holding => holding.entityType === "province" && holding.entityId === province.i)
    );
    if (!lord) continue;

    const amount = computeProvinceLordStipend(burg.treasury);
    if (!(amount > 0)) continue;

    burg.treasury = rn(burg.treasury - amount, 2);
    lord.wealth = rn((lord.wealth || 0) + amount, 2);
  }
}

/**
 * Pays each Burg+domain Guild Master a fixed stipend and optional apprentice pocket money from
 * that domain guild's private treasury.
 */
export function payGuildStipends(): void {
  if (!hasCharactersContext()) return;
  const stocks = getGuildKnowledgeStocks();
  if (!stocks.length) return;

  const characters = getCharacters();
  let changed = false;

  for (const entry of stocks) {
    if (!(entry.treasury > 0)) continue;

    const master = findMaster(characters, entry.burgId, entry.domain);
    if (!master) continue;

    const masterAmount = computeGuildMasterStipend(entry.treasury);
    if (masterAmount > 0) {
      entry.treasury = rn(entry.treasury - masterAmount, 2);
      master.wealth = rn((master.wealth || 0) + masterAmount, 2);
      changed = true;
    }

    for (const apprentice of findApprentices(characters, master.i, entry.burgId, entry.domain)) {
      if (apprentice.dead || !(entry.treasury > 0)) continue;
      const apprenticeAmount = computeApprenticePocketMoney(entry.treasury, master, apprentice);
      if (!(apprenticeAmount > 0)) continue;

      entry.treasury = rn(entry.treasury - apprenticeAmount, 2);
      apprentice.wealth = rn((apprentice.wealth || 0) + apprenticeAmount, 2);
      changed = true;
    }
  }

  if (changed) setGuildKnowledgeStocks(stocks);
}

/**
 * Pays each Market's manager and rivals fixed personal stipends from market working capital.
 */
export function payMarketStipends(): void {
  if (!hasCharactersContext()) return;
  const markets = getMarkets();
  if (!markets.length) return;

  const characters = getCharacters();

  for (const market of markets) {
    const treasury = market.marketTreasury;
    if (!treasury || !(treasury.balance > 0)) continue;

    const manager = characters.find(character => character.i === market.managerCharacterId && !character.dead);
    if (manager) {
      const amount = computeMarketManagerStipend(treasury.balance);
      if (amount > 0) {
        treasury.balance = rn(treasury.balance - amount, 2);
        manager.wealth = rn((manager.wealth || 0) + amount, 2);
      }
    }

    for (const rivalId of market.rivalCharacterIds ?? []) {
      if (!(treasury.balance > 0)) break;
      const rival = characters.find(character => character.i === rivalId && !character.dead);
      if (!rival) continue;

      const amount = computeMarketRivalStipend(treasury.balance);
      if (!(amount > 0)) continue;

      treasury.balance = rn(treasury.balance - amount, 2);
      rival.wealth = rn((rival.wealth || 0) + amount, 2);
    }
  }
}

/** Back-pay cycles for generation-time seed — shorter than the old 6–18 to avoid multi-year piles. */
const BACK_PAY_CYCLES_MIN = 4;
const BACK_PAY_CYCLES_MAX = 10;

function backPayCycles(): number {
  return rand(BACK_PAY_CYCLES_MIN, BACK_PAY_CYCLES_MAX);
}

/**
 * Seeds Character.wealth for paid roles still at 0 after generate, using the same per-cycle
 * formulas as live pay × a short random back-pay window. Never overwrites non-zero wealth.
 */
export function seedMissingCharacterWealth(): void {
  if (!hasCharactersContext()) return;
  const characters = getCharacters();
  const { pack } = getWorldContext();

  for (const state of pack.states ?? []) {
    if (!state.i || state.removed) continue;

    const population = (state.rural || 0) + (state.urban || 0);
    const income = (state.pollTax || 0) * population;
    const baseline = getDepartmentBaselineAllocation(state);

    const rulerId = getRulerId(state);
    const ruler = characters.find(character => character.i === rulerId && !character.dead);
    if (ruler && !ruler.wealth) {
      ruler.wealth = rn(getRulerHouseholdStipend(state, income) * backPayCycles(), 2);
    }

    for (const office of CENTRAL_OFFICES) {
      const departmentKey = office.primarySkill && DEPARTMENT_BY_PRIMARY_SKILL[office.primarySkill];
      if (!departmentKey) continue;

      const holder = findLivingOfficeHolder(characters, state.i, office.title);
      if (!holder || holder.wealth) continue;

      const structuralMultiplier = departmentKey === "marshalcy" ? getMilitaryStructuralMultiplier(state) : 1;
      const departmentBudget = rn(income * baseline[departmentKey] * structuralMultiplier, 2);
      holder.wealth = rn(getCentralOfficePersonalStipend(departmentBudget) * backPayCycles(), 2);
    }

    for (const regiment of state.military || []) {
      if (regiment.isCapitalGuard) continue;
      const commander = getRegimentCommander(characters, regiment);
      if (!commander || commander.wealth) continue;

      commander.wealth = rn(getFieldCommanderStipend(regiment) * backPayCycles(), 2);
    }
  }

  for (const province of pack.provinces ?? []) {
    if (!province?.i || province.removed || !province.burg) continue;
    const burg = pack.burgs[province.burg];
    if (!burg || !(burg.treasury && burg.treasury > 0)) continue;

    const lord = characters.find(
      character =>
        !character.dead &&
        character.titles.some(holding => holding.entityType === "province" && holding.entityId === province.i)
    );
    if (!lord || lord.wealth) continue;

    lord.wealth = rn(computeProvinceLordStipend(burg.treasury) * backPayCycles(), 2);
  }

  for (const entry of getGuildKnowledgeStocks()) {
    if (!(entry.treasury > 0)) continue;

    const master = findMaster(characters, entry.burgId, entry.domain);
    if (!master) continue;
    if (!master.wealth) master.wealth = rn(computeGuildMasterStipend(entry.treasury) * backPayCycles(), 2);

    for (const apprentice of findApprentices(characters, master.i, entry.burgId, entry.domain)) {
      if (apprentice.wealth || apprentice.dead) continue;
      const pocket = computeApprenticePocketMoney(entry.treasury, master, apprentice);
      if (!(pocket > 0)) continue;
      apprentice.wealth = rn(pocket * rand(2, 6), 2);
    }
  }

  for (const market of getMarkets()) {
    const balance = market.marketTreasury?.balance || 0;
    if (!(balance > 0)) continue;

    const manager = characters.find(character => character.i === market.managerCharacterId && !character.dead);
    if (manager && !manager.wealth) {
      manager.wealth = rn(computeMarketManagerStipend(balance) * backPayCycles(), 2);
    }

    for (const rivalId of market.rivalCharacterIds ?? []) {
      const rival = characters.find(character => character.i === rivalId && !character.dead);
      if (!rival || rival.wealth) continue;
      rival.wealth = rn(computeMarketRivalStipend(balance) * backPayCycles(), 2);
    }
  }
}
