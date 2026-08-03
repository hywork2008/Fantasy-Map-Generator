import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import { getRulerId } from "../../nobility/nobilityContext";
import { getWorldContext } from "../economyContext";
import { getCouncilFactionShares } from "../generators/councilVotes";
import { peekCreditPoolBalance } from "../generators/creditPool";
import {
  getPrimaryMoneylenderLabel,
  getStateDebtInterestRate,
  resolveMoneylenderSyndicate,
  resolveStateBanker,
  updateMoneylenderSnapshot
} from "../generators/moneylenders";
import { type DebtNegotiationView, setDebtNegotiationState } from "../store/debtNegotiationState";

/**
 * PR-12 debt negotiation dialog — named Banker + syndicate terms for one state.
 */

export function openDebtNegotiation(stateId?: number): void {
  openDialog("debtNegotiation");
  refreshDebtNegotiation(stateId);
}

export function refreshDebtNegotiation(stateId?: number): void {
  const { pack } = getWorldContext();
  const states = pack.states ?? [];
  let state = stateId ? states[stateId] : undefined;
  if (!state?.i) {
    // Prefer a state with debt, else first non-neutral.
    state = states.find(s => s?.i && !s.removed && (s.publicDebt || 0) > 0) ?? states.find(s => s?.i && !s.removed);
  }
  if (!state?.i) {
    setDebtNegotiationState({ view: null });
    return;
  }

  updateMoneylenderSnapshot(state);
  const syndicate = resolveMoneylenderSyndicate(state);
  const banker = resolveStateBanker(state);
  const bankerId = banker?.i ?? syndicate.primary?.characterId ?? null;
  const members = syndicate.members.map(m => ({
    characterId: m.characterId,
    name: m.name,
    greed: m.greed,
    weight: m.weight,
    isBanker: m.characterId === bankerId
  }));

  const shares = state.councilFactionShares ?? getCouncilFactionShares(state);
  const notes: string[] = [];
  if (state.debtInDefault) notes.push("In default — renegotiation blocked until interest is current.");
  if (state.debtCoupRisk) notes.push("Coup risk active — assembly support is penalized.");
  if ((state.publicDebt || 0) <= 0) notes.push("No outstanding public debt (rate still previews future terms).");

  const view: DebtNegotiationView = {
    stateId: state.i,
    stateName: state.name || `State ${state.i}`,
    form: state.form || "—",
    publicDebt: rn(state.publicDebt || 0, 2),
    creditPoolBalance: peekCreditPoolBalance(state),
    debtInterestRate: rn(state.debtInterestRate ?? getStateDebtInterestRate(state), 4),
    debtRateNegotiation: rn(state.debtRateNegotiation || 0, 3),
    debtInDefault: Boolean(state.debtInDefault),
    debtCoupRisk: Boolean(state.debtCoupRisk),
    councilSupport: rn(state.councilSupport ?? 0, 1),
    councilLastDebtVoteYes: state.councilLastDebtVoteYes !== undefined ? rn(state.councilLastDebtVoteYes, 3) : null,
    factionShares: shares,
    bankerName: banker?.name ?? getPrimaryMoneylenderLabel(state),
    bankerId,
    members,
    canNegotiate: !state.debtInDefault && getRulerId(state) !== undefined,
    notes
  };

  setDebtNegotiationState({ view });
}
