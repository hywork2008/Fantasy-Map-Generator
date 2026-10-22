import type { SimulationExtensionAPI } from "../../../types/extension-api";
import { getSimulationCharacters as getCharacters } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { registerCharacterFinance } from "../../characters/financialLifecycle";
import { isReferenceEvaluation } from "../../characters/reference/evaluation";
import { readReference } from "../../characters/reference/model";
import { buildWorldRoster } from "../../characters/roster/build";
import { readRoster } from "../../characters/roster/runtime";
import type { PersonSlot, RosterRole, WorldRoster } from "../../characters/roster/types";
import {
  getApi,
  getBurgMarketLedgers,
  getGuildKnowledgeStocks,
  getMarkets,
  getWorldContext,
  isEconomyContextReady
} from "../economyContext";
import { creditHouseholdWealth, debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import {
  LIVING_COST_BY_TIER,
  type LifestyleTier,
  SURPLUS_WEALTH_SPEND_SHARE,
  WEALTH_RESERVE_YEARS,
  WEALTH_UPKEEP_MAX_MULT,
  WEALTH_UPKEEP_RATE
} from "./characterLivingCosts";
import { buyCharacterLuxuries, characterLuxuryBudget } from "./characterLuxuryPurchases";
import { isLuxuryValueDemandEnabled } from "./luxuryDemand";
import { nominal } from "./moneyScale";
import {
  createPersonalCashState,
  extractCash,
  minor,
  type PersonalCashAccount,
  type PersonalCashPool,
  type PersonalCashState,
  poolBalance,
  previewCash,
  rangeBalance,
  splitCashRange,
  transferPersonalCash,
  validatePersonalCash
} from "./personalCashLedger";
import {
  DEPARTMENT_BY_PRIMARY_SKILL,
  getCentralOfficePersonalStipend,
  getDepartmentBaselineAllocation,
  getFieldCommanderStipend,
  getRulerHouseholdStipend
} from "./treasuryAllocation";

export function readPersonalCash(): PersonalCashState | undefined {
  if (!isEconomyContextReady()) return undefined;
  return getApi().simulationContext?.extensions?.economy?.personalCash as PersonalCashState | undefined;
}
function ledger(): PersonalCashState {
  const extensions = getApi().simulationContext.extensions;
  extensions.economy ??= {};
  const existing = readPersonalCash();
  if (existing) return existing;
  const state = createPersonalCashState();
  extensions.economy.personalCash = state;
  return state;
}
const bindings = new WeakMap<Character, PersonalCashAccount>();
function bind(character: Character, account: PersonalCashAccount): void {
  character.cashAccountId = account.id;
  if (bindings.get(character) === account && Object.getOwnPropertyDescriptor(character, "wealth")?.get) return;
  Object.defineProperty(character, "wealth", {
    enumerable: true,
    configurable: true,
    get: () => account.balance / 100,
    set: (value: number) => {
      account.balance = minor(value);
    }
  });
  bindings.set(character, account);
}
function accountForSlot(slot: PersonSlot): PersonalCashAccount {
  const s = ledger();
  const previous = Object.values(s.accounts).find(a => a.ownerSlotId === slot.id);
  if (previous) return previous;
  const pool = slot.roleId && s.pools[slot.roleId];
  // A successor's salary must not leave the original occupant on the abstract payroll.
  if (pool && slot.generation > 0 && slot.ordinal !== undefined) retireInitialOccupant(slot, pool);
  const initial = slot.generation === 0 && slot.ordinal !== undefined && pool && !pool.owners[String(slot.ordinal)];
  const id = `person:${slot.id}`;
  const org = readRoster()?.organizations.find(o => o.id === slot.organizationId);
  const account: PersonalCashAccount = {
    id,
    ownerSlotId: slot.id,
    characterId: slot.characterId,
    stateId: getWorldContext().pack.burgs[slot.location?.burgId ?? org?.burgId ?? 0]?.state ?? org?.stateId ?? 0,
    burgId: slot.location?.burgId ?? org?.burgId,
    balance: initial ? extractCash(pool, slot.ordinal!) : 0,
    status: slot.deathYear === undefined ? "active" : "estate",
    managed: true,
    initialized: true
  };
  s.accounts[id] = account;
  if (initial) pool.owners[String(slot.ordinal)] = id;
  return account;
}
/** Preserve the predecessor's private cash separately from the successor's pay. */
function retireInitialOccupant(slot: PersonSlot, pool: PersonalCashPool): void {
  const ordinal = slot.ordinal!;
  if (pool.owners[String(ordinal)]) return;
  const original = readRoster()?.slots.find(
    p => p.roleId === slot.roleId && p.ordinal === ordinal && p.generation === 0
  );
  if (original) {
    const account = accountForSlot(original);
    if (!pool.owners[String(ordinal)]) {
      account.balance += extractCash(pool, ordinal);
      pool.owners[String(ordinal)] = account.id;
    }
    return;
  }
  const s = ledger(),
    id = `cohort:${pool.roleId}:${ordinal}`;
  s.accounts[id] = {
    id,
    stateId: pool.stateId,
    burgId: pool.burgId,
    balance: extractCash(pool, ordinal),
    status: "estate",
    managed: true,
    initialized: true
  };
  pool.owners[String(ordinal)] = id;
}
export function synchronizePersonalCash(characters: Character[]): void {
  const s = ledger();
  for (const c of characters) {
    let account = c.cashAccountId ? s.accounts[c.cashAccountId] : undefined;
    if (!account) {
      const id = `legacy:${s.nextLegacyId++}`;
      account = {
        id,
        ownerSlotId: c.rosterSlotId,
        characterId:
          c.rosterSlotId?.startsWith("master:") && !readRoster()?.slots.some(s => s.characterId === c.i)
            ? undefined
            : c.i,
        stateId: getWorldContext().pack.burgs[c.location ?? 0]?.state ?? c.state ?? 0,
        burgId: c.location,
        balance: minor(Math.max(0, c.wealth || 0)),
        status: c.dead ? "estate" : "active",
        managed: false,
        initialized: true
      };
      s.accounts[id] = account;
    }
    account.ownerSlotId ??= c.rosterSlotId;
    if (c.dead && account.status === "active") account.status = "estate";
    bind(c, account);
  }
}
export function personalCashTotal(): number {
  const s = readPersonalCash();
  if (!s) return 0;
  return (
    (Object.values(s.accounts).reduce((sum, a) => sum + a.balance, 0) +
      Object.values(s.pools).reduce((sum, p) => sum + poolBalance(p), 0)) /
    100
  );
}
export function isManagedCash(character: Character): boolean {
  return !!(character.cashAccountId && readPersonalCash()?.accounts[character.cashAccountId]?.managed);
}
function tier(role: RosterRole): LifestyleTier {
  const p = role.purposes ?? [];
  if (p.includes("headOfState")) return "ruler";
  if (p.includes("centralExecutive") || p.includes("headOfGovernment")) return "centralOffice";
  if (p.includes("unitCommander")) return "fieldCommander";
  if (p.includes("secularLord") || p.includes("territorialAdministrator")) return "provinceLord";
  if (p.includes("guildHead")) return "guildMaster";
  if (p.includes("marketHead") || p.includes("companyHead")) return "marketManager";
  if (p.includes("marketMerchant")) return "marketRival";
  return "common";
}
/** Pure role-based target; no Character, title display or materialization order is consulted. */
export function personalRoleStipend(role: RosterRole, roster: WorldRoster): number {
  const org = roster.organizations.find(o => o.id === role.organizationId);
  const state = getWorldContext().pack.states[org?.stateId ?? 0];
  const income = state ? (state.pollTax || 0) * ((state.rural || 0) + (state.urban || 0)) : 0;
  const p = role.purposes ?? [];
  if (p.includes("headOfState") && state) return getRulerHouseholdStipend(state, income);
  if ((p.includes("centralExecutive") || p.includes("headOfGovernment")) && state) {
    const department = DEPARTMENT_BY_PRIMARY_SKILL[role.primarySkill];
    return getCentralOfficePersonalStipend(
      income * (department ? getDepartmentBaselineAllocation(state)[department] : 0)
    );
  }
  if (p.includes("unitCommander")) {
    const regiment = state?.military?.find(r => r.i === role.regimentId);
    return regiment ? getFieldCommanderStipend(regiment) : nominal(1.5);
  }
  if (p.includes("secularLord") || p.includes("territorialAdministrator")) return nominal(3);
  if (p.includes("guildHead")) return nominal(1.05);
  if (p.includes("marketHead") || p.includes("companyHead")) return nominal(2.1);
  if (p.includes("marketMerchant")) return nominal(0.9);
  // Unpaid offices have no stipend-based starting cash target.
  return 0;
}
export function initializeRosterCash(roster: WorldRoster): void {
  const current = ledger();
  if (readReference(getApi().simulationContext)) {
    synchronizePersonalCash(getCharacters());
    current.initialized = true;
    return;
  }
  if (current.initialized) {
    ensureCurrentPools(roster);
    return;
  }
  synchronizePersonalCash(getCharacters());
  const s = structuredClone(current);
  const funding: { burgId: number; amount: number; refund: number }[] = [];
  const groups = new Map<number, RosterRole[]>();
  const orgs = new Map(roster.organizations.map(o => [o.id, o]));
  for (const role of roster.roles) {
    const org = orgs.get(role.organizationId);
    if (!org || org.archived || role.count < 1 || role.unresolved) continue;
    const burgId = org.burgId || getWorldContext().pack.states[org.stateId]?.capital;
    if (!burgId || !getWorldContext().pack.burgs.some(b => b?.i === burgId && !b.removed)) continue;
    const roles = groups.get(burgId) ?? [];
    roles.push(role);
    groups.set(burgId, roles);
  }
  for (const [burgId, roles] of groups) {
    // Stable rounding order; every paid office shares a shortage, rather than
    // letting the ruler consume the entire private household allocation first.
    roles.sort((a, b) => a.id.localeCompare(b.id));
    const desires = roles.map(role => minor(personalRoleStipend(role, roster) * 6) * role.count);
    const desired = desires.reduce((a, b) => a + b, 0);
    // Private cash remains private: no draw from the public treasury, no issuance.
    const available = minor(getHouseholdWealth(burgId));
    const budget = Math.min(desired, Math.floor(available / 4));
    const paid = budget;
    const payment = { burgId, amount: paid, refund: 0 };
    funding.push(payment);
    const allocations = new Map<string, number>();
    let prefix = 0;
    for (const [index, role] of roles.entries()) {
      const amount = desired
        ? Number((BigInt(paid) * BigInt(prefix + desires[index])) / BigInt(desired)) -
          Number((BigInt(paid) * BigInt(prefix)) / BigInt(desired))
        : 0;
      allocations.set(role.id, amount);
      prefix += desires[index];
    }
    for (const role of roles) {
      const amount = allocations.get(role.id) ?? 0;
      const org = orgs.get(role.organizationId)!;
      const pool: PersonalCashPool = {
        roleId: role.id,
        stateId: getWorldContext().pack.burgs[burgId]?.state ?? org.stateId,
        burgId,
        count: role.count,
        ranges: [{ start: 0, end: role.count, numerator: amount, denominator: role.count, offset: 0, delta: 0 }],
        owners: {}
      };
      s.pools[role.id] = pool;
      if (!s.preparedRoles.includes(role.id)) s.preparedRoles.push(role.id);
      // Migrated, already existing people keep their actual balance, including an intentional zero.
      for (const a of roster.appointments.filter(a => a.roleId === role.id && a.endYear === undefined)) {
        const slot = roster.slots.find(slot => slot.id === a.slotId);
        const account = Object.values(s.accounts).find(account => account.ownerSlotId === slot?.id);
        if (account && a.ordinal !== undefined) {
          const unused = extractCash(pool, a.ordinal);
          if (account.managed) account.balance += unused;
          else payment.refund += unused;
          pool.owners[String(a.ordinal)] = account.id;
        }
      }
    }
  }
  s.initialized = true;
  validatePersonalCash(s);
  // All arithmetic, role validation and allocation has finished before touching a payer.
  const wallets = funding.map(payment => {
    const wallet = getBurgMarketLedgers().find(l => l.burgId === payment.burgId)!;
    const balance = minor(wallet.householdWealth ?? 0);
    if (balance < payment.amount) throw Error("Initial personal cash funding changed");
    return { wallet, balance: (balance - payment.amount + payment.refund) / 100 };
  });
  for (const { wallet, balance } of wallets) wallet.householdWealth = balance;
  // Preserve account object identity: Character accessors may already be bound to it.
  for (const [id, account] of Object.entries(s.accounts)) Object.assign(current.accounts[id], account);
  current.pools = s.pools;
  current.preparedRoles = s.preparedRoles;
  current.initialized = true;
}
/** New institutions begin with zero cash; appointment is not retroactive issuance. */
function ensureCurrentPools(roster: WorldRoster): void {
  if (readReference(getApi().simulationContext)) return;
  const s = ledger();
  for (const role of roster.roles) {
    const org = roster.organizations.find(o => o.id === role.organizationId);
    if (!org || org.archived || role.count < 1 || role.unresolved || s.pools[role.id]) continue;
    const burgId = org.burgId || getWorldContext().pack.states[org.stateId]?.capital;
    s.pools[role.id] = {
      roleId: role.id,
      stateId: getWorldContext().pack.burgs[burgId ?? 0]?.state ?? org.stateId,
      burgId,
      count: role.count,
      ranges: [{ start: 0, end: role.count, numerator: 0, denominator: role.count, offset: 0, delta: 0 }],
      owners: {}
    };
    if (!s.preparedRoles.includes(role.id)) s.preparedRoles.push(role.id);
  }
}
function receiveHousehold(amount: number, burgId?: number, stateId = 0): void {
  if (amount <= 0) return;
  if (burgId && getWorldContext().pack.burgs.some(b => b?.i === burgId && !b.removed)) {
    creditHouseholdWealth(burgId, amount / 100);
    return;
  }
  const s = ledger(),
    id = `custody:${stateId}`;
  s.accounts[id] ??= { id, stateId, balance: 0, status: "active", managed: false, initialized: true };
  s.accounts[id].balance += amount;
}
/** Keep unknown heirs' estates intact. Known descendants can inherit without generating a Character. */
export function settlePersonalEstates(): void {
  const s = readPersonalCash(),
    roster = readRoster();
  if (!s || !roster) return;
  for (const account of Object.values(s.accounts)) {
    if (account.status !== "estate" || account.balance <= 0 || !account.ownerSlotId) continue;
    const childIds = roster.family.filter(f => f.parentId === account.ownerSlotId).map(f => f.childId);
    const children = roster.slots.filter(
      slot =>
        childIds.includes(slot.id) &&
        slot.deathYear === undefined &&
        !slot.removedFromWorld &&
        !slot.cancelledBirth &&
        slot.birthYear <= getApi().simulationContext.currentYear
    );
    if (!children.length) continue;
    const livingRecord = getCharacters().find(c => c.cashAccountId === account.id);
    if (livingRecord?.roles?.some(r => r.kind === "guildMaster" && r.endYear === undefined)) continue;
    const amount = account.balance;
    const distribution = children
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((child, index) => ({
        target: accountForSlot(child),
        share:
          Number((BigInt(amount) * BigInt(index + 1)) / BigInt(children.length)) -
          Number((BigInt(amount) * BigInt(index)) / BigInt(children.length))
      }));
    for (const { target, share } of distribution)
      if (target.id === account.id || !Number.isSafeInteger(target.balance + share))
        throw Error("Invalid estate distribution");
    // Commit the entire synchronous batch after validation. A zero source balance is the
    // replay guard; later receipts are a new batch, without an ever-growing receipt log.
    for (const { target, share } of distribution) target.balance += share;
    account.balance = 0;
    for (const key of Object.keys(s.transactions))
      if (key.startsWith(`estate:${account.id}:`)) delete s.transactions[key];
  }
}
function spendingForCash(tierName: LifestyleTier, balance: number) {
  const wealth = balance / 100,
    base = nominal(LIVING_COST_BY_TIER[tierName]);
  const lifestyle = minor(base + Math.min(wealth * WEALTH_UPKEEP_RATE, base * WEALTH_UPKEEP_MAX_MULT)) / 100;
  const surplus = Math.max(0, wealth - lifestyle - lifestyle * 12 * WEALTH_RESERVE_YEARS) * SURPLUS_WEALTH_SPEND_SHARE;
  return { lifestyle, surplus, paid: Math.min(balance, minor(lifestyle + surplus)) };
}
/** Financial cadence is independent of memo/AI mode and runs once per production month. */
export function settleRosterCash(): void {
  const s = readPersonalCash(),
    roster = readRoster();
  if (!s?.initialized || !roster) return;
  getCharacters();
  const clock = getApi().simulationContext,
    key = `${clock.currentYear}:${clock.currentMonth}`;
  if (s.lastCycle === key) return;
  s.lastCycle = key;
  ensureCurrentPools(roster);
  // Resolve retired cohorts before inheritance, independently of detail generation timing.
  for (const appointment of roster.appointments) {
    if (appointment.endYear !== undefined) continue;
    const slot = roster.slots.find(p => p.id === appointment.slotId);
    const pool = s.pools[appointment.roleId];
    if (pool && slot && slot.generation > 0 && slot.ordinal !== undefined) {
      retireInitialOccupant(slot, pool);
      accountForSlot(slot);
    }
  }
  settlePersonalEstates();
  for (const pool of Object.values(s.pools)) {
    const role = roster.roles.find(r => r.id === pool.roleId),
      org = roster.organizations.find(o => o.id === role?.organizationId);
    if (!role || !org || org.archived) continue;
    const wage = minor(personalRoleStipend(role, roster));
    splitCashRange(pool, role.count);
    const count = pool.ranges.filter(r => r.end <= role.count).reduce((n, r) => n + r.end - r.start, 0);
    const active = Object.values(s.accounts).filter(
      a =>
        a.managed &&
        a.status === "active" &&
        a.ownerSlotId &&
        roster.appointments.some(
          p =>
            p.roleId === role.id &&
            (p.ordinal ?? 0) < role.count &&
            p.slotId === a.ownerSlotId &&
            p.endYear === undefined
        )
    );
    const total = count + active.length;
    if (!total && !pool.ranges.length) continue;
    const candidateState = getWorldContext().pack.states[org.stateId];
    const state = candidateState && !candidateState.removed ? candidateState : undefined;
    const department = DEPARTMENT_BY_PRIMARY_SKILL[role.primarySkill];
    const market = getMarkets().find(m => m.i === role.characterRole?.entityId);
    const guild = getGuildKnowledgeStocks().find(
      g => g.burgId === pool.burgId && g.domain === role.characterRole?.domain
    );
    let source: { get: () => number; set: (value: number) => void } | undefined;
    if (role.purposes?.includes("headOfState") && state)
      source = {
        get: () => state.householdPurse || 0,
        set: value => {
          state.householdPurse = value;
        }
      };
    else if (role.purposes?.some(p => p === "centralExecutive" || p === "headOfGovernment") && state && department)
      source = {
        get: () => state.departmentBalances?.[department] || 0,
        set: value => {
          if (state.departmentBalances) state.departmentBalances[department] = value;
        }
      };
    else if (role.purposes?.includes("unitCommander") && state)
      source = {
        get: () => Math.max(0, state.departmentBalances?.marshalcy || 0) + Math.max(0, state.treasury || 0),
        set: value => {
          const marshal = Math.max(0, state.departmentBalances?.marshalcy || 0),
            treasury = Math.max(0, state.treasury || 0);
          const paid = minor(marshal + treasury) - minor(value),
            first = Math.min(minor(marshal), paid);
          if (state.departmentBalances) state.departmentBalances.marshalcy = (minor(marshal) - first) / 100;
          state.treasury = (minor(treasury) - (paid - first)) / 100;
        }
      };
    else if (role.purposes?.includes("guildHead") && guild)
      source = {
        get: () => guild.treasury || 0,
        set: value => {
          guild.treasury = value;
        }
      };
    else if (role.purposes?.some(p => p === "marketHead" || p === "marketMerchant") && market?.marketTreasury)
      source = {
        get: () => market.marketTreasury!.balance || 0,
        set: value => {
          market.marketTreasury!.balance = value;
        }
      };
    else if (pool.burgId) {
      const burg = getWorldContext().pack.burgs[pool.burgId];
      if (burg)
        source = {
          get: () => burg.treasury || 0,
          set: value => {
            burg.treasury = value;
          }
        };
    }
    // Equal funded per-person pay; undistributed cents stay with the payer.
    const funded = source ? Math.min(wage, Math.floor(minor(Math.max(0, source.get())) / Math.max(1, total))) : 0;
    if (source && funded) source.set((minor(source.get()) - funded * total) / 100);
    for (const range of pool.ranges) if (range.end <= role.count) range.delta += funded;
    for (const account of active) account.balance += funded;
    for (const range of pool.ranges) {
      const before = rangeBalance(range),
        low = Math.floor(range.numerator / range.denominator) + range.delta;
      const currentTier = range.end <= role.count ? tier(role) : "common";
      const lowAfter = low - spendingForCash(currentTier, low).paid,
        highAfter = low + 1 - spendingForCash(currentTier, low + 1).paid;
      range.numerator = highAfter === lowAfter ? 0 : range.numerator % range.denominator;
      range.delta = lowAfter;
      receiveHousehold(before - rangeBalance(range), pool.burgId, pool.stateId);
    }
    // Lifestyle is charged once per person, below, even if they hold several offices.
  }
  for (const account of Object.values(s.accounts)) {
    if (!account.managed || account.status !== "active" || !account.ownerSlotId) continue;
    const roles = roster.appointments
      .filter(a => a.slotId === account.ownerSlotId && a.endYear === undefined)
      .flatMap(a => roster.roles.filter(r => r.id === a.roleId));
    const best = roles.reduce<LifestyleTier>(
      (best, role) => (LIVING_COST_BY_TIER[tier(role)] > LIVING_COST_BY_TIER[best] ? tier(role) : best),
      "common"
    );
    const spending = spendingForCash(best, account.balance);
    account.balance -= spending.paid;
    const person = getCharacters().find(c => c.cashAccountId === account.id && !c.dead);
    const luxury =
      person && isLuxuryValueDemandEnabled()
        ? minor(
            buyCharacterLuxuries(
              person,
              best,
              Math.min(spending.paid / 100, characterLuxuryBudget(best, spending.lifestyle, spending.surplus))
            )
          )
        : 0;
    receiveHousehold(spending.paid - luxury, account.burgId, account.stateId);
  }
}
function removeCharacter(character: Character): void {
  synchronizePersonalCash([character]);
  const account = ledger().accounts[character.cashAccountId!];
  account.characterId = undefined;
  const slot = readRoster()?.slots.find(p => p.id === character.rosterSlotId);
  if (slot) {
    slot.characterId = undefined;
    slot.retainedCharacterId = character.i;
  }
  // The cash owner survives detail pruning. Estates remain countable even without a Character.
  if (character.dead) account.status = "estate";
}
function cancelPerson(slot: PersonSlot, recipientSlotId?: string): void {
  const account = accountForSlot(slot),
    s = ledger();
  if (account.status === "cancelled") return;
  if (recipientSlotId) {
    const target = readRoster()?.slots.find(p => p.id === recipientSlotId);
    if (
      !target ||
      target.id === slot.id ||
      target.removedFromWorld ||
      target.deathYear !== undefined ||
      target.birthYear > getApi().simulationContext.currentYear
    )
      throw Error("Invalid cash recipient");
    transferPersonalCash(s, `cancel:${slot.id}`, account, accountForSlot(target), account.balance);
  } else {
    receiveHousehold(account.balance, account.burgId, account.stateId);
    account.balance = 0;
  }
  account.status = "cancelled";
}
export function previewLegacyCashCorrection() {
  const s = readPersonalCash(),
    roster = readRoster();
  const rows: { id: string; burgId: number; amount: number }[] = [];
  const groups = new Map<number, { id: string; target: number }[]>();
  for (const account of Object.values(s?.accounts ?? {})) {
    if (
      account.balance !== 0 ||
      account.status !== "active" ||
      account.fundingCorrected ||
      !account.ownerSlotId ||
      !account.burgId
    )
      continue;
    const slot = roster?.slots.find(slot => slot.id === account.ownerSlotId);
    if (!slot || slot.removedFromWorld || slot.deathYear !== undefined) continue;
    const roles = roster!.appointments
      .filter(a => a.slotId === slot.id && a.endYear === undefined)
      .flatMap(a => roster!.roles.filter(r => r.id === a.roleId));
    const target = Math.max(0, ...roles.map(role => minor(personalRoleStipend(role, roster!) * 6)));
    if (!target) continue;
    const group = groups.get(account.burgId) ?? [];
    group.push({ id: account.id, target });
    groups.set(account.burgId, group);
  }
  for (const [burgId, entries] of groups) {
    const available = minor(Math.max(0, getBurgMarketLedgers().find(l => l.burgId === burgId)?.householdWealth ?? 0));
    const wanted = entries.reduce((sum, e) => sum + e.target, 0),
      budget = Math.min(wanted, Math.floor(available / 4));
    let prefix = 0;
    for (const entry of entries.sort((a, b) => a.id.localeCompare(b.id))) {
      const amount =
        Number((BigInt(budget) * BigInt(prefix + entry.target)) / BigInt(wanted)) -
        Number((BigInt(budget) * BigInt(prefix)) / BigInt(wanted));
      prefix += entry.target;
      if (amount > 0) rows.push({ id: entry.id, burgId, amount });
    }
  }
  return { count: rows.length, amount: rows.reduce((sum, r) => sum + r.amount, 0) / 100, token: JSON.stringify(rows) };
}
export function applyLegacyCashCorrection(token: string): void {
  getCharacters();
  const preview = previewLegacyCashCorrection();
  if (preview.token !== token) throw Error("Correction preview changed. Review current balances again.");
  const rows = JSON.parse(token) as { id: string; burgId: number; amount: number }[];
  for (const row of rows) {
    const paid = minor(debitHouseholdWealth(row.burgId, row.amount / 100));
    if (paid !== row.amount) throw Error("Correction funding changed");
    const account = ledger().accounts[row.id];
    account.balance += paid;
    account.fundingCorrected = true;
  }
}
export function registerPersonalCash(api: SimulationExtensionAPI): () => void {
  if (isReferenceEvaluation()) return () => {};
  const unregister = registerCharacterFinance({
    synchronize: characters => {
      if (isEconomyContextReady()) synchronizePersonalCash(characters);
    },
    materialize: (character, slot) => {
      if (!api.isExtensionEnabled("economy")) return;
      const account = accountForSlot(slot);
      account.characterId = character.i;
      bind(character, account);
    },
    rosterReady: roster => {
      if (readPersonalCash()?.initialized) ensureCurrentPools(roster);
    },
    canRemove: character => {
      const retained = readRoster()?.slots.find(s => s.id === character.rosterSlotId)?.retainedAssets;
      if (character.roles?.some(r => r.endYear === undefined)) return false;
      const retainedMatches =
        retained &&
        JSON.stringify(retained) === JSON.stringify({ inventory: character.inventory, loadout: character.loadout });
      return !!retainedMatches || (!Object.values(character.inventory ?? {}).some(n => n > 0) && !character.loadout);
    },
    describe: slot => {
      const s = readPersonalCash();
      if (!s) return undefined;
      const account = slot && Object.values(s.accounts).find(a => a.ownerSlotId === slot.id);
      return {
        total: personalCashTotal(),
        abstract: Object.values(s.pools).reduce((sum, p) => sum + poolBalance(p), 0) / 100,
        estates:
          Object.values(s.accounts)
            .filter(a => a.status === "estate")
            .reduce((sum, a) => sum + a.balance, 0) / 100,
        balance: account
          ? account.balance / 100
          : slot?.roleId && slot.generation === 0 && slot.ordinal !== undefined && s.pools[slot.roleId]
            ? previewCash(s.pools[slot.roleId], slot.ordinal) / 100
            : undefined
      };
    },
    previewCorrection: previewLegacyCashCorrection,
    applyCorrection: applyLegacyCashCorrection,
    remove: removeCharacter,
    cancel: cancelPerson
  });
  const onLoaded = () => {
    if (api.isExtensionEnabled("economy") && api.isExtensionEnabled("characters"))
      initializeRosterCash(buildWorldRoster());
  };
  api.events.addEventListener("fmg:world-loaded", onLoaded);
  const unregisterTask = api.registerMapReadyTask({
    id: "economy.personalCash",
    label: "Preparing personal assets",
    dependsOn: ["economy.initialization", "nobility.initialization", "characters.roster"],
    run: context => {
      if (context.isCurrent() && api.isExtensionEnabled("economy") && api.isExtensionEnabled("characters"))
        initializeRosterCash(buildWorldRoster());
    }
  });
  return () => {
    api.events.removeEventListener("fmg:world-loaded", onLoaded);
    unregisterTask();
    unregister();
  };
}

export function preserveGuildPrivateEstate(character: Character, amount: number): void {
  const s = readPersonalCash();
  if (!s || !(amount > 0)) return;
  synchronizePersonalCash([character]);
  const old = s.accounts[character.cashAccountId!],
    id = `heirs:${old.id}`;
  if (s.accounts[id]) {
    s.accounts[id].balance += minor(amount);
    return;
  }
  s.accounts[id] = {
    id,
    ownerSlotId: old.ownerSlotId,
    stateId: old.stateId,
    burgId: old.burgId,
    balance: minor(amount),
    status: "estate",
    managed: false,
    initialized: true
  };
}
