import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getRulerId } from "../../nobility/nobilityContext";
import { getWorldContext } from "../economyContext";
import { getCouncilSupport } from "./councilAssembly";
import { isCouncilLineApproved } from "./councilBudget";
import { creditPoolCanLend, peekCreditPoolBalance } from "./creditPool";
import { canIssueDebtWhileNotInDefault } from "./debtDefault";
import {
  adjustDomainLevyForCharacter,
  clampDomainLevyRate,
  cycleDomainFiscalPolicyForCharacter,
  cycleDomainWorksTargetForCharacter,
  type DomainFiscalPolicy,
  type DomainWorksTarget,
  fundDomainWorksForCharacter,
  normalizeDomainFiscalPolicy,
  normalizeDomainWorksTarget,
  resolveDomainBurgForCharacter
} from "./domainFiscalPolicy";
import {
  canIssueForeignDebt,
  FOREIGN_DEBT_ISSUE_AMOUNT,
  issueForeignOrBondDebt,
  sumForeignDebtPrincipal
} from "./foreignDebt";
import { getPrimaryMoneylenderLabel, negotiateDebtInterestRate, resolveStateBanker } from "./moneylenders";
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
  /** PR-11 relative rate negotiation modifier. */
  debtRateNegotiation: number;
  /** PR-11 public debt default flag. */
  debtInDefault: boolean;
  /** PR-12 debt coup-risk sticky flag. */
  debtCoupRisk: boolean;
  /** PR-14 post-coup legitimacy 0–100 (null if none). */
  coupLegitimacy: number | null;
  /** PR-14 civil unrest after coup. */
  civilUnrest: boolean;
  /** PR-13 foreign debt principal (外債). */
  foreignDebt: number;
  /** PR-14 any foreign loan in default. */
  foreignDebtInDefault: boolean;
  /** PR-8 assembly support 0–100. */
  councilSupport: number;
  /** PR-12 last debt-issue vote yes share 0–1. */
  councilLastDebtVoteYes: number | null;
  /** PR-13 assembly session number. */
  councilSessionNumber: number;
  canIssuePublicDebt: boolean;
  canRepayPublicDebt: boolean;
  canNegotiateDebtRate: boolean;
  canIssueForeignDebt: boolean;
  /** Province lord may cycle domain fiscal policy (PR-7). */
  canSetDomainPolicy: boolean;
  domainFiscalPolicy: DomainFiscalPolicy | null;
  /** PR-8 domain levy multiplier. */
  domainLevyRate: number | null;
  domainWorksProgress: number | null;
  /** PR-12 next fortify construction target. */
  domainWorksTarget: DomainWorksTarget | null;
  canFundDomainWorks: boolean;
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
  const warFooting = isWarFootingActive(state);
  // PR-11: peacetime war footing needs assembly warFooting line; wartime always ok for ruler.
  const canToggleWarFooting =
    isRuler && (warFooting || stateHasEnemy(state) || isCouncilLineApproved(state, "warFooting"));
  const militaryMobilizationBoost = rn(state.militaryMobilizationBoost || 0, 3);
  const publicDebt = rn(state.publicDebt || 0, 2);
  const creditPoolBalance = peekCreditPoolBalance(state);
  const primaryMoneylenderName = getPrimaryMoneylenderLabel(state);
  const debtInterestRate = state.debtInterestRate !== undefined ? rn(state.debtInterestRate, 4) : null;
  const debtRateNegotiation = rn(state.debtRateNegotiation || 0, 3);
  const debtInDefault = Boolean(state.debtInDefault);
  const debtCoupRisk = Boolean(state.debtCoupRisk);
  const coupLegitimacy = state.coupLegitimacy !== undefined ? rn(state.coupLegitimacy, 1) : null;
  const civilUnrest = Boolean(state.civilUnrest);
  const foreignDebt = sumForeignDebtPrincipal(state);
  const foreignDebtInDefault = Boolean(state.foreignDebtInDefault);
  const councilSupport =
    state.councilSupport !== undefined ? rn(state.councilSupport, 1) : getCouncilSupport(state).support;
  const councilLastDebtVoteYes =
    state.councilLastDebtVoteYes !== undefined ? rn(state.councilLastDebtVoteYes, 3) : null;
  const councilSessionNumber = state.councilSessionNumber || 0;
  const canIssuePublicDebt =
    isRuler &&
    form !== "Anarchy" &&
    form !== "Theocracy" &&
    creditPoolCanLend(state) &&
    canIssueDebtWhileNotInDefault(state) &&
    isCouncilLineApproved(state, "debtIssue");
  const canRepayPublicDebt = isRuler && publicDebt > 0 && publicTreasury > 0;
  const canNegotiateDebtRate = isRuler && !debtInDefault && (publicDebt > 0 || creditPoolBalance > 0);
  const canIssueForeignDebtFlag = isRuler && canIssueForeignDebt(state);
  const domainLevyRate = domainBurg ? clampDomainLevyRate(domainBurg.domainLevyRate) : null;
  const domainWorksProgress = domainBurg ? rn(domainBurg.domainWorksProgress || 0, 1) : null;
  const domainWorksTarget = domainBurg ? normalizeDomainWorksTarget(domainBurg.domainWorksTarget) : null;
  const canFundDomainWorks = Boolean(domainBurg && (domainBurg.treasury || 0) > 0);

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
  if (foreignDebt > 0) {
    notes.push(`Foreign debt ${foreignDebt.toFixed(2)} SP (外債 — Ally/Friendly creditors).`);
  }
  if (debtInDefault) notes.push("IN DEFAULT — new borrowing frozen until interest is current.");
  if (foreignDebtInDefault) notes.push("FOREIGN DEBT DEFAULT — creditor diplomacy chilled.");
  if (debtCoupRisk) notes.push("DEBT COUP RISK — military restiveness / merchant mutiny.");
  if (state.lastDebtCoup?.newRulerName) {
    notes.push(`Last debt coup: ${state.lastDebtCoup.newRulerName} replaced ${state.lastDebtCoup.oldRulerName}.`);
  }
  if (coupLegitimacy != null) {
    notes.push(`Coup legitimacy ${coupLegitimacy}/100${civilUnrest ? " — civil unrest active" : ""}.`);
  }
  if (councilSessionNumber > 0) notes.push(`Assembly sessions logged: ${councilSessionNumber}.`);
  const banker = resolveStateBanker(state);
  notes.push(`Credit pool ${creditPoolBalance.toFixed(2)} SP — Banker: ${banker?.name ?? primaryMoneylenderName}.`);
  if (debtInterestRate != null) {
    notes.push(
      `Debt interest ${(debtInterestRate * 100).toFixed(2)}%/cycle` +
        (debtRateNegotiation !== 0 ? ` (nego ${debtRateNegotiation > 0 ? "+" : ""}${debtRateNegotiation})` : "") +
        "."
    );
  }
  notes.push(`Assembly support ${councilSupport}/100.`);
  if (councilLastDebtVoteYes != null) {
    notes.push(`Last debt-issue vote yes ${(councilLastDebtVoteYes * 100).toFixed(0)}%.`);
  }
  if (state.councilApprovals) {
    const a = state.councilApprovals;
    notes.push(
      `Council lines: debt ${a.debtIssue ? "OK" : "no"}, war ${a.warFooting ? "OK" : "no"}, tax ${a.extraordinaryTax ? "OK" : "no"}.`
    );
  }
  if (state.councilLastFailed) notes.push("Last wartime assembly vetoed part of revenue.");
  if (domainFiscalPolicy && domainFiscalPolicy !== "balanced") {
    notes.push(`Domain policy: ${domainFiscalPolicy}${domainLevyRate != null ? ` × levy ${domainLevyRate}` : ""}.`);
  }
  if (domainWorksProgress != null && domainWorksProgress > 0) {
    notes.push(`Domain works ${domainWorksProgress}/100 → ${domainWorksTarget ?? "walls"}.`);
  }
  if (state.domainPollTaxMultiplier != null && state.domainPollTaxMultiplier !== 1) {
    notes.push(`Domain levy poll mult ×${state.domainPollTaxMultiplier.toFixed(2)}.`);
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
    debtRateNegotiation,
    debtInDefault,
    debtCoupRisk,
    coupLegitimacy,
    civilUnrest,
    foreignDebt,
    foreignDebtInDefault,
    councilSupport,
    councilLastDebtVoteYes,
    councilSessionNumber,
    canIssuePublicDebt,
    canRepayPublicDebt,
    canNegotiateDebtRate,
    canIssueForeignDebt: canIssueForeignDebtFlag,
    canSetDomainPolicy,
    domainFiscalPolicy,
    domainLevyRate,
    domainWorksProgress,
    domainWorksTarget,
    canFundDomainWorks,
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
  const turningOn = !isWarFootingActive(state);
  if (turningOn && !stateHasEnemy(state) && !isCouncilLineApproved(state, "warFooting")) {
    return { ok: false, paid: 0, error: "Assembly has not approved peacetime war footing" };
  }
  const next = setWarFootingByPlayer(state, turningOn);
  return { ok: true, paid: 0, warFooting: next };
}

/** PR-11: living ruler negotiates debt interest terms with the moneylender syndicate. */
export function negotiateDebtRateForRuler(
  state: State,
  characterId: number,
  direction: 1 | -1
): FiscalActionResult & { rate?: number; negotiation?: number } {
  if (!isLivingRulerOf(state, characterId)) {
    return { ok: false, paid: 0, error: "Only the living ruler may negotiate debt terms" };
  }
  const result = negotiateDebtInterestRate(state, direction);
  if (!result.ok) return { ok: false, paid: result.bribePaid || 0, error: result.error };
  return {
    ok: true,
    paid: result.bribePaid || 0,
    rate: result.rate,
    negotiation: result.negotiation
  };
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

/** Province lord cycles next construction works target (PR-12). */
export function cycleDomainWorksTargetForLord(
  characterId: number
): FiscalActionResult & { target?: DomainWorksTarget } {
  const result = cycleDomainWorksTargetForCharacter(characterId);
  if (!result.ok) return { ok: false, paid: 0, error: result.error };
  return { ok: true, paid: 0, target: result.target };
}

/** Province lord funds domain construction works from L3b (PR-12). */
export function fundDomainWorksForLord(
  characterId: number,
  amount = 5
): FiscalActionResult & { progress?: number; completed?: boolean; target?: DomainWorksTarget } {
  const result = fundDomainWorksForCharacter(characterId, amount);
  if (!result.ok) return { ok: false, paid: 0, error: result.error };
  return {
    ok: true,
    paid: result.spent || 0,
    progress: result.progress,
    completed: result.completed,
    target: result.target
  };
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

/** Living ruler draws a foreign loan (外債) from an Ally/Friendly creditor (PR-13). */
export function issueForeignDebtForRuler(
  state: State,
  characterId: number,
  amount = FOREIGN_DEBT_ISSUE_AMOUNT
): FiscalActionResult & { creditorName?: string } {
  if (!isLivingRulerOf(state, characterId)) {
    return { ok: false, paid: 0, error: "Only the living ruler may issue foreign debt" };
  }
  const result = issueForeignOrBondDebt(state, amount);
  return {
    ok: result.ok,
    paid: result.amount,
    error: result.error,
    creditorName: result.creditorName
  };
}
