import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getRulerId } from "../../nobility/nobilityContext";
import { getWorldContext } from "../economyContext";
import { canCouncilApproveDebtIssue, getCouncilSupport } from "./councilAssembly";
import { creditPoolCanLend, peekCreditPoolBalance } from "./creditPool";
import {
  adjustDomainLevyForCharacter,
  clampDomainLevyRate,
  cycleDomainFiscalPolicyForCharacter,
  type DomainFiscalPolicy,
  normalizeDomainFiscalPolicy,
  resolveDomainBurgForCharacter
} from "./domainFiscalPolicy";
import { getPrimaryMoneylenderLabel } from "./moneylenders";
import {
  issuePublicDebt,
  PUBLIC_DEBT_PLAYER_ISSUE_AMOUNT,
  PUBLIC_DEBT_PLAYER_REPAY_AMOUNT,
  repayPublicDebt
} from "./publicDebtActions";
import { sumDepartmentBalances } from "./treasuryAllocation";
import { isWarFootingActive, setWarFootingByPlayer } from "./warFooting";

/**
 * Multi-ledger PR-4 — fiscal authority view + first spend hooks.
 * docs/plan/multi-ledger-fiscal-architecture.md
 *
 * Does not implement full council/war-footing politics; only form-gated flags and a few
 * explicit cash movements so UI can show "what this person may spend" and exercise one path.
 */

export interface FiscalSpendableBreakdown {
  personal: number;
  household: number;
  public: number;
  departments: number;
  domain: number;
}

export interface FiscalAuthorityView {
  stateId: number;
  form: string;
  personalWealth: number;
  householdPurse: number;
  publicTreasury: number;
  departmentBalancesTotal: number;
  domainTreasury: number | null;
  /** Sum of ledgers this character is allowed to draw/spend under current form policy. */
  spendableAsRuler: number;
  spendableBreakdown: FiscalSpendableBreakdown;
  canDrawHouseholdToPersonal: boolean;
  canSpendPublicDirectly: boolean;
  canSpendDomain: boolean;
  /** Province lord may remit domain (L3b) cash to the state's public L2. */
  canRemitDomainToState: boolean;
  /** Living ruler may toggle war footing (PR-6). */
  canToggleWarFooting: boolean;
  warFooting: boolean;
  militaryMobilizationBoost: number;
  /** Outstanding public debt principal (PR-7). */
  publicDebt: number;
  /** PR-9 anonymous credit pool balance (moneylender v0). */
  creditPoolBalance: number;
  /** PR-10 primary named moneylender label. */
  primaryMoneylenderName: string;
  /** PR-10 effective monthly debt interest rate (fraction). */
  debtInterestRate: number | null;
  /** PR-8 assembly support 0–100. */
  councilSupport: number;
  canIssuePublicDebt: boolean;
  canRepayPublicDebt: boolean;
  /** Province lord may cycle domain fiscal policy (PR-7). */
  canSetDomainPolicy: boolean;
  domainFiscalPolicy: DomainFiscalPolicy | null;
  /** PR-8 domain levy multiplier. */
  domainLevyRate: number | null;
  domainWorksProgress: number | null;
  /** Human-readable policy notes for tooltips. */
  notes: string[];
}

export interface FiscalActionResult {
  ok: boolean;
  paid: number;
  error?: string;
}

/** Form-level policy for the experimental spend hooks (not full council simulation). */
export function getFormFiscalPolicy(form: string | undefined): {
  canDrawHouseholdToPersonal: boolean;
  canSpendPublicDirectly: boolean;
  notes: string[];
} {
  switch (form) {
    case "Republic":
      return {
        canDrawHouseholdToPersonal: false,
        canSpendPublicDirectly: false,
        notes: [
          "Republic: public and household ledgers require council authorization (not simulated yet).",
          "Personal wealth remains freely spendable."
        ]
      };
    case "Theocracy":
      return {
        canDrawHouseholdToPersonal: true,
        canSpendPublicDirectly: false,
        notes: [
          "Theocracy: limited household draws allowed; public treasury is not freely raided.",
          "Church department balances are not yet spendable from this UI."
        ]
      };
    case "Union":
      return {
        canDrawHouseholdToPersonal: true,
        canSpendPublicDirectly: false,
        notes: [
          "Union: thin central public purse — household draw only for now.",
          "Member-state treasuries stay separate."
        ]
      };
    case "Anarchy":
      return {
        canDrawHouseholdToPersonal: true,
        canSpendPublicDirectly: true,
        notes: ["Anarchy: war-chest and personal funds blur — public seizure to personal is allowed."]
      };
    case "Monarchy":
    default:
      return {
        canDrawHouseholdToPersonal: true,
        canSpendPublicDirectly: false,
        notes: [
          "Monarchy: crown household purse is the ruler's main institutional cash.",
          "Public treasury spending from this HUD is reserved (future political cost)."
        ]
      };
  }
}

function resolveDomainTreasury(character: Character | undefined): {
  amount: number | null;
  burgId: number | null;
} {
  if (!character) return { amount: null, burgId: null };
  const holding = character.titles?.find(t => t.endYear === undefined && t.entityType === "province");
  if (!holding) return { amount: null, burgId: null };
  const { pack } = getWorldContext();
  const province = pack.provinces?.[holding.entityId];
  const burgId = province?.burg;
  if (!burgId) return { amount: null, burgId: null };
  const burg = pack.burgs?.[burgId];
  if (!burg || burg.removed) return { amount: null, burgId: null };
  return { amount: rn(burg.treasury || 0, 2), burgId };
}

function isLivingRulerOf(state: State, characterId: number): boolean {
  if (!hasCharactersContext()) return false;
  const rulerId = getRulerId(state);
  if (rulerId !== characterId) return false;
  const ruler = getCharacters().find(c => c.i === characterId && !c.dead);
  return Boolean(ruler);
}

/**
 * Build a read-only authority snapshot for UI. `character` optional — when set, includes that
 * character's personal wealth and domain seat; ruler checks use the state's recorded ruler id.
 */
export function getFiscalAuthorityView(state: State, character?: Character): FiscalAuthorityView {
  const form = state.form || "Monarchy";
  const policy = getFormFiscalPolicy(form);
  const personalWealth = rn(character?.wealth || 0, 2);
  const householdPurse = rn(state.householdPurse || 0, 2);
  const publicTreasury = rn(state.treasury || 0, 2);
  const departmentBalancesTotal = sumDepartmentBalances(state.departmentBalances);
  const domain = resolveDomainTreasury(character);
  const canSpendDomain = domain.amount !== null && domain.amount > 0;
  const canRemitDomainToState = canSpendDomain;
  const domainBurg = character ? resolveDomainBurgForCharacter(character.i) : null;
  const canSetDomainPolicy = Boolean(domainBurg);
  const domainFiscalPolicy = domainBurg ? normalizeDomainFiscalPolicy(domainBurg.domainFiscalPolicy) : null;
  const isRuler = character ? isLivingRulerOf(state, character.i) : false;
  const canToggleWarFooting = isRuler;
  const warFooting = isWarFootingActive(state);
  const militaryMobilizationBoost = rn(state.militaryMobilizationBoost || 0, 3);
  const publicDebt = rn(state.publicDebt || 0, 2);
  const creditPoolBalance = peekCreditPoolBalance(state);
  const primaryMoneylenderName = getPrimaryMoneylenderLabel(state);
  const debtInterestRate = state.debtInterestRate !== undefined ? rn(state.debtInterestRate, 4) : null;
  const councilSupport =
    state.councilSupport !== undefined ? rn(state.councilSupport, 1) : getCouncilSupport(state).support;
  const canIssuePublicDebt =
    isRuler &&
    canCouncilApproveDebtIssue(state) &&
    form !== "Anarchy" &&
    form !== "Theocracy" &&
    creditPoolCanLend(state);
  const canRepayPublicDebt = isRuler && publicDebt > 0 && publicTreasury > 0;
  const domainLevyRate = domainBurg ? clampDomainLevyRate(domainBurg.domainLevyRate) : null;
  const domainWorksProgress = domainBurg ? rn(domainBurg.domainWorksProgress || 0, 1) : null;

  const householdSpendable = policy.canDrawHouseholdToPersonal ? householdPurse : 0;
  const publicSpendable = policy.canSpendPublicDirectly ? publicTreasury : 0;
  const domainSpendable = canSpendDomain ? domain.amount || 0 : 0;

  const spendableBreakdown: FiscalSpendableBreakdown = {
    personal: personalWealth,
    household: householdSpendable,
    public: publicSpendable,
    departments: 0, // department spend hooks deferred past PR-4
    domain: domainSpendable
  };

  const spendableAsRuler = rn(
    spendableBreakdown.personal +
      spendableBreakdown.household +
      spendableBreakdown.public +
      spendableBreakdown.departments +
      spendableBreakdown.domain,
    2
  );

  const notes = [...policy.notes];
  if (warFooting) {
    notes.push(
      militaryMobilizationBoost > 0
        ? `War footing ON — marshalcy-weighted budgets; mobilization boost +${rn(militaryMobilizationBoost * 100, 1)}%.`
        : "War footing ON — marshalcy-weighted budgets (no overfund boost yet)."
    );
  }
  if (publicDebt > 0) {
    notes.push(`Public debt ${publicDebt.toFixed(2)} SP (interest each tax cycle).`);
  }
  notes.push(`Credit pool ${creditPoolBalance.toFixed(2)} SP — led by ${primaryMoneylenderName}.`);
  if (debtInterestRate != null) {
    notes.push(`Debt interest ${(debtInterestRate * 100).toFixed(2)}%/cycle.`);
  }
  notes.push(`Assembly support ${councilSupport}/100.`);
  if (state.councilLastFailed) notes.push("Last wartime assembly vetoed part of revenue.");
  if (domainFiscalPolicy && domainFiscalPolicy !== "balanced") {
    notes.push(`Domain policy: ${domainFiscalPolicy}${domainLevyRate != null ? ` × levy ${domainLevyRate}` : ""}.`);
  }
  if (domainWorksProgress != null && domainWorksProgress > 0) {
    notes.push(`Domain works ${domainWorksProgress}/100.`);
  }

  return {
    stateId: state.i || 0,
    form,
    personalWealth,
    householdPurse,
    publicTreasury,
    departmentBalancesTotal,
    domainTreasury: domain.amount,
    spendableAsRuler,
    spendableBreakdown,
    canDrawHouseholdToPersonal: policy.canDrawHouseholdToPersonal,
    canSpendPublicDirectly: policy.canSpendPublicDirectly,
    canSpendDomain,
    canRemitDomainToState,
    canToggleWarFooting,
    warFooting,
    militaryMobilizationBoost,
    publicDebt,
    creditPoolBalance,
    primaryMoneylenderName,
    debtInterestRate,
    councilSupport,
    canIssuePublicDebt,
    canRepayPublicDebt,
    canSetDomainPolicy,
    domainFiscalPolicy,
    domainLevyRate,
    domainWorksProgress,
    notes
  };
}

/** Max single household→personal draw per action (silver pieces). */
export const HOUSEHOLD_DRAW_ACTION_CAP = 5;

/**
 * Ruler draws cash from L1 household purse into personal L0 wealth.
 * Blocked by form policy (e.g. Republic) or if the character is not the living ruler.
 */
export function drawHouseholdPurseToPersonal(state: State, characterId: number, amount: number): FiscalActionResult {
  if (!(amount > 0)) return { ok: false, paid: 0, error: "Amount must be positive" };
  if (!state.i) return { ok: false, paid: 0, error: "Invalid state" };

  const policy = getFormFiscalPolicy(state.form);
  if (!policy.canDrawHouseholdToPersonal) {
    return {
      ok: false,
      paid: 0,
      error: `${state.form || "This polity"} does not allow free household draws (council / form policy).`
    };
  }
  if (!isLivingRulerOf(state, characterId)) {
    return { ok: false, paid: 0, error: "Only the living ruler may draw the household purse" };
  }

  const character = getCharacters().find(c => c.i === characterId && !c.dead);
  if (!character) return { ok: false, paid: 0, error: "Character not found" };

  const purse = state.householdPurse || 0;
  const paid = rn(Math.min(amount, purse, HOUSEHOLD_DRAW_ACTION_CAP), 2);
  if (!(paid > 0)) return { ok: false, paid: 0, error: "Household purse is empty" };

  state.householdPurse = rn(purse - paid, 2);
  character.wealth = rn((character.wealth || 0) + paid, 2);
  return { ok: true, paid };
}

/** Max single public→personal seizure (Anarchy) per action. */
export const PUBLIC_SEIZE_ACTION_CAP = 5;

/**
 * Anarchy (and other forms with canSpendPublicDirectly): move public L2 cash into personal L0.
 */
export function seizePublicTreasuryToPersonal(state: State, characterId: number, amount: number): FiscalActionResult {
  if (!(amount > 0)) return { ok: false, paid: 0, error: "Amount must be positive" };
  if (!state.i) return { ok: false, paid: 0, error: "Invalid state" };

  const policy = getFormFiscalPolicy(state.form);
  if (!policy.canSpendPublicDirectly) {
    return {
      ok: false,
      paid: 0,
      error: `${state.form || "This polity"} does not allow direct public-treasury spending from the ruler HUD.`
    };
  }
  if (!isLivingRulerOf(state, characterId)) {
    return { ok: false, paid: 0, error: "Only the living ruler may seize the public treasury" };
  }

  const character = getCharacters().find(c => c.i === characterId && !c.dead);
  if (!character) return { ok: false, paid: 0, error: "Character not found" };

  const publicBal = state.treasury || 0;
  const paid = rn(Math.min(amount, publicBal, PUBLIC_SEIZE_ACTION_CAP), 2);
  if (!(paid > 0)) return { ok: false, paid: 0, error: "Public treasury is empty" };

  state.treasury = rn(publicBal - paid, 2);
  character.wealth = rn((character.wealth || 0) + paid, 2);
  return { ok: true, paid };
}

/** Max domain expenditure per action (consumed, not transferred to personal). */
export const DOMAIN_SPEND_ACTION_CAP = 5;

/**
 * Province lord spends domain (burg) treasury on local outlays — cash is consumed (L3b sink),
 * modelling domain investment / largesse without a full construction pipeline.
 */
export function spendDomainTreasury(characterId: number, amount: number): FiscalActionResult {
  if (!(amount > 0)) return { ok: false, paid: 0, error: "Amount must be positive" };
  if (!hasCharactersContext()) return { ok: false, paid: 0, error: "Characters unavailable" };

  const character = getCharacters().find(c => c.i === characterId && !c.dead);
  if (!character) return { ok: false, paid: 0, error: "Character not found" };

  const domain = resolveDomainTreasury(character);
  if (domain.burgId === null || domain.amount === null) {
    return { ok: false, paid: 0, error: "Character has no provincial domain seat" };
  }

  const { pack } = getWorldContext();
  const burg = pack.burgs?.[domain.burgId];
  if (!burg || burg.removed) return { ok: false, paid: 0, error: "Domain burg missing" };

  const paid = rn(Math.min(amount, burg.treasury || 0, DOMAIN_SPEND_ACTION_CAP), 2);
  if (!(paid > 0)) return { ok: false, paid: 0, error: "Domain treasury is empty" };

  burg.treasury = rn((burg.treasury || 0) - paid, 2);
  return { ok: true, paid };
}

/** Max domain → state L2 remit per action (province lord contribution). */
export const DOMAIN_REMIT_ACTION_CAP = 5;

/**
 * Province lord remits domain (L3b burg) cash into the owning state's public L2 treasury.
 * Models feudal aid / contribution without a full council pipeline (PR-6 domain policy).
 */
export function remitDomainToStateTreasury(characterId: number, amount: number): FiscalActionResult {
  if (!(amount > 0)) return { ok: false, paid: 0, error: "Amount must be positive" };
  if (!hasCharactersContext()) return { ok: false, paid: 0, error: "Characters unavailable" };

  const character = getCharacters().find(c => c.i === characterId && !c.dead);
  if (!character) return { ok: false, paid: 0, error: "Character not found" };

  const domain = resolveDomainTreasury(character);
  if (domain.burgId === null || domain.amount === null) {
    return { ok: false, paid: 0, error: "Character has no provincial domain seat" };
  }

  const { pack } = getWorldContext();
  const burg = pack.burgs?.[domain.burgId];
  if (!burg || burg.removed) return { ok: false, paid: 0, error: "Domain burg missing" };

  const stateId = burg.state;
  const state = stateId ? pack.states?.[stateId] : undefined;
  if (!state?.i) return { ok: false, paid: 0, error: "Domain has no owning state" };

  const paid = rn(Math.min(amount, burg.treasury || 0, DOMAIN_REMIT_ACTION_CAP), 2);
  if (!(paid > 0)) return { ok: false, paid: 0, error: "Domain treasury is empty" };

  burg.treasury = rn((burg.treasury || 0) - paid, 2);
  state.treasury = rn((state.treasury || 0) + paid, 2);
  return { ok: true, paid };
}

/**
 * Living ruler toggles war footing on their state (PR-6 policy lever; PR-7 player lock).
 */
export function toggleWarFootingForRuler(
  state: State,
  characterId: number
): FiscalActionResult & { warFooting?: boolean } {
  if (!state.i) return { ok: false, paid: 0, error: "Invalid state" };
  if (!isLivingRulerOf(state, characterId)) {
    return { ok: false, paid: 0, error: "Only the living ruler may set war footing" };
  }
  const next = setWarFootingByPlayer(state, !isWarFootingActive(state));
  return { ok: true, paid: 0, warFooting: next };
}

/**
 * Province lord cycles domain fiscal policy: balanced → extract → fortify → balanced (PR-7).
 */
export function cycleDomainPolicyForLord(characterId: number): FiscalActionResult & { policy?: DomainFiscalPolicy } {
  const result = cycleDomainFiscalPolicyForCharacter(characterId);
  if (!result.ok) return { ok: false, paid: 0, error: result.error };
  return { ok: true, paid: 0, policy: result.policy };
}

/** Province lord adjusts domain levy intensity (PR-8). */
export function adjustDomainLevyForLord(
  characterId: number,
  direction: 1 | -1
): FiscalActionResult & { levyRate?: number } {
  const result = adjustDomainLevyForCharacter(characterId, direction);
  if (!result.ok) return { ok: false, paid: 0, error: result.error };
  return { ok: true, paid: 0, levyRate: result.levyRate };
}

/** Living ruler issues public debt into L2 (PR-8; assembly-gated). */
export function issuePublicDebtForRuler(
  state: State,
  characterId: number,
  amount = PUBLIC_DEBT_PLAYER_ISSUE_AMOUNT
): FiscalActionResult {
  if (!isLivingRulerOf(state, characterId)) {
    return { ok: false, paid: 0, error: "Only the living ruler may issue public debt" };
  }
  const result = issuePublicDebt(state, amount);
  return { ok: result.ok, paid: result.amount, error: result.error };
}

/** Living ruler repays public debt from L2 (PR-8). */
export function repayPublicDebtForRuler(
  state: State,
  characterId: number,
  amount = PUBLIC_DEBT_PLAYER_REPAY_AMOUNT
): FiscalActionResult {
  if (!isLivingRulerOf(state, characterId)) {
    return { ok: false, paid: 0, error: "Only the living ruler may repay public debt" };
  }
  const result = repayPublicDebt(state, amount);
  return { ok: result.ok, paid: result.amount, error: result.error };
}
