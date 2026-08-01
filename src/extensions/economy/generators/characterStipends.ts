import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { State } from "../../hostTypes";
import { rand, rn } from "../../hostUtils";
import { CENTRAL_OFFICES } from "../../nobility/data/titleTable";
import { getRegimentCommander } from "../../nobility/generators/officerAssignment";
import { getRulerId } from "../../nobility/nobilityContext";
import { getGuildKnowledgeStocks, getMarkets, getWorldContext, setGuildKnowledgeStocks } from "../economyContext";
import { findApprentices, findMaster } from "./guildSuccession";
import { getRegimentMilitaryUpkeep } from "./militaryLogistics";
import {
  DEPARTMENT_BY_PRIMARY_SKILL,
  FIELD_COMMANDER_STIPEND_RATE,
  findLivingOfficeHolder,
  getDepartmentBaselineAllocation,
  getHouseholdStipendRate,
  getMilitaryStructuralMultiplier
} from "./treasuryAllocation";

/**
 * docs/plan/state-treasury-department-budget.md §7 item 7 — stipends for the character roles
 * that §2's CENTRAL_OFFICES mapping doesn't cover: province lords, field/fleet officers (see
 * treasuryAllocation.ts for the latter — kept there since it deducts from state.treasury and
 * needs to appear in TreasuryAllocationBreakdown), and the economy extension's own guild/market
 * roles. Each pays from the pool the user specified rather than state.treasury:
 *   - Province lords ← the Burg they are seated in (province.burg's burg.treasury)
 *   - Guild Master/Apprentice ← that domain guild's own per-Burg treasury (guildKnowledge)
 *   - Market Manager/Rival Merchant ← that Market's own working capital (marketTreasury.balance)
 * All four rates below are placeholders, not yet balance-tuned, matching the existing
 * "Placeholder" convention in guildTreasury.ts/foodProduction.ts.
 */
export const PROVINCE_LORD_STIPEND_RATE = 0.1;
export const GUILD_MASTER_STIPEND_RATE = 0.1;
export const GUILD_APPRENTICE_STIPEND_RATE = 0.03;
export const MARKET_MANAGER_STIPEND_RATE = 0.08;
export const MARKET_RIVAL_STIPEND_RATE = 0.03;

/**
 * Pays each of `state`'s living, landed province lords (provinceLordGenerator.ts's sparse
 * frontier assignment) a stipend out of their own seated Burg's treasury — never state.treasury,
 * per the user's explicit "属州領主はBurgsから" direction. An unseated/removed province, a
 * Burg-less province, or a currently vacant lordship simply pays nothing; the money stays with
 * the Burg instead of disappearing, same degrade pattern as the central-office stipends.
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

    const amount = rn(burg.treasury * PROVINCE_LORD_STIPEND_RATE, 2);
    if (!(amount > 0)) continue;

    burg.treasury = rn(burg.treasury - amount, 2);
    lord.wealth = rn((lord.wealth || 0) + amount, 2);
  }
}

/**
 * Pays each Burg+domain's Guild Master (guildSuccession.ts) and its living apprentices a
 * stipend out of that domain guild's own private treasury (guildTreasury.ts) — never
 * burg.treasury or state.treasury, per "ギルド/商人系称号はGuildsやMarketsから". A domain with
 * no settled master yet, or a master with no apprentices, simply pays less; the remainder stays
 * banked in the guild's own treasury.
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

    const masterAmount = rn(entry.treasury * GUILD_MASTER_STIPEND_RATE, 2);
    if (masterAmount > 0) {
      entry.treasury = rn(entry.treasury - masterAmount, 2);
      master.wealth = rn((master.wealth || 0) + masterAmount, 2);
      changed = true;
    }

    for (const apprentice of findApprentices(characters, master.i, entry.burgId, entry.domain)) {
      if (!(entry.treasury > 0)) break;
      const apprenticeAmount = rn(entry.treasury * GUILD_APPRENTICE_STIPEND_RATE, 2);
      if (!(apprenticeAmount > 0)) continue;

      entry.treasury = rn(entry.treasury - apprenticeAmount, 2);
      apprentice.wealth = rn((apprentice.wealth || 0) + apprenticeAmount, 2);
      changed = true;
    }
  }

  if (changed) setGuildKnowledgeStocks(stocks);
}

/**
 * Pays each Market's manager (marketManagers.ts — also holds the "Merchant Company Head" role,
 * merchantOrganizations.ts, since the chairperson is the same character) and its rival merchants
 * a stipend out of that Market's own working capital — never burg.treasury or state.treasury.
 * A Market with an empty/negative balance, no living manager, or no rivals simply pays less.
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
      const amount = rn(treasury.balance * MARKET_MANAGER_STIPEND_RATE, 2);
      if (amount > 0) {
        treasury.balance = rn(treasury.balance - amount, 2);
        manager.wealth = rn((manager.wealth || 0) + amount, 2);
      }
    }

    for (const rivalId of market.rivalCharacterIds ?? []) {
      if (!(treasury.balance > 0)) break;
      const rival = characters.find(character => character.i === rivalId && !character.dead);
      if (!rival) continue;

      const amount = rn(treasury.balance * MARKET_RIVAL_STIPEND_RATE, 2);
      if (!(amount > 0)) continue;

      treasury.balance = rn(treasury.balance - amount, 2);
      rival.wealth = rn((rival.wealth || 0) + amount, 2);
    }
  }
}

/** How many cycles' worth of a role's stipend rate to fabricate as pre-existing savings. */
const BACK_PAY_CYCLES_MIN = 6;
const BACK_PAY_CYCLES_MAX = 18;

function backPayCycles(): number {
  return rand(BACK_PAY_CYCLES_MIN, BACK_PAY_CYCLES_MAX);
}

/**
 * docs/plan/state-treasury-department-budget.md §7 item 8 — fabricates a starting
 * Character.wealth for every paid role at generation time, so a character has spendable money
 * immediately after "Generate" without needing to Advance Time first (the same idea as
 * STARTING_BURG_TREASURY_PER_POPULATION/foodProduction.ts seeding a fresh Burg's treasury, or
 * Markets.generate() seeding marketTreasury.balance as a share of Burg treasury). Estimates each
 * role's typical per-cycle stipend from data already computed by economy's own initial
 * generation pass (state.pollTax, burg.treasury, guild/market treasuries — all seeded before
 * nobility's map-ready task runs, since map-ready tasks are awaited sequentially in registration
 * order and economy registers first) and multiplies by a random back-pay factor. Only ever
 * touches a character whose wealth is still exactly 0 (never yet paid a real stipend), so it is
 * safe to call again after a "regenerate" — it will only fill genuinely fresh characters, never
 * overwrite money a character has already earned or spent.
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
      ruler.wealth = rn(income * getHouseholdStipendRate(state) * backPayCycles(), 2);
    }

    for (const office of CENTRAL_OFFICES) {
      const departmentKey = office.primarySkill && DEPARTMENT_BY_PRIMARY_SKILL[office.primarySkill];
      if (!departmentKey) continue;

      const holder = findLivingOfficeHolder(characters, state.i, office.title);
      if (!holder || holder.wealth) continue;

      const structuralMultiplier = departmentKey === "marshalcy" ? getMilitaryStructuralMultiplier(state) : 1;
      holder.wealth = rn(income * baseline[departmentKey] * structuralMultiplier * backPayCycles(), 2);
    }

    for (const regiment of state.military || []) {
      if (regiment.isCapitalGuard) continue;
      const commander = getRegimentCommander(characters, regiment);
      if (!commander || commander.wealth) continue;

      commander.wealth = rn(getRegimentMilitaryUpkeep(regiment) * FIELD_COMMANDER_STIPEND_RATE * backPayCycles(), 2);
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

    lord.wealth = rn(burg.treasury * PROVINCE_LORD_STIPEND_RATE * backPayCycles(), 2);
  }

  for (const entry of getGuildKnowledgeStocks()) {
    if (!(entry.treasury > 0)) continue;

    const master = findMaster(characters, entry.burgId, entry.domain);
    if (!master) continue;
    if (!master.wealth) master.wealth = rn(entry.treasury * GUILD_MASTER_STIPEND_RATE * backPayCycles(), 2);

    for (const apprentice of findApprentices(characters, master.i, entry.burgId, entry.domain)) {
      if (apprentice.wealth) continue;
      apprentice.wealth = rn(entry.treasury * GUILD_APPRENTICE_STIPEND_RATE * backPayCycles(), 2);
    }
  }

  for (const market of getMarkets()) {
    const balance = market.marketTreasury?.balance || 0;
    if (!(balance > 0)) continue;

    const manager = characters.find(character => character.i === market.managerCharacterId && !character.dead);
    if (manager && !manager.wealth) {
      manager.wealth = rn(balance * MARKET_MANAGER_STIPEND_RATE * backPayCycles(), 2);
    }

    for (const rivalId of market.rivalCharacterIds ?? []) {
      const rival = characters.find(character => character.i === rivalId && !character.dead);
      if (!rival || rival.wealth) continue;
      rival.wealth = rn(balance * MARKET_RIVAL_STIPEND_RATE * backPayCycles(), 2);
    }
  }
}
