import { create } from "zustand";

export interface DebtNegotiationSyndicateMember {
  characterId: number;
  name: string;
  greed: number;
  weight: number;
  isBanker: boolean;
}

export interface DebtNegotiationView {
  stateId: number;
  stateName: string;
  form: string;
  publicDebt: number;
  creditPoolBalance: number;
  debtInterestRate: number;
  debtRateNegotiation: number;
  debtInDefault: boolean;
  debtCoupRisk: boolean;
  councilSupport: number;
  councilLastDebtVoteYes: number | null;
  factionShares: {
    court: number;
    merchants: number;
    military: number;
    clergy: number;
  } | null;
  bankerName: string;
  bankerId: number | null;
  members: DebtNegotiationSyndicateMember[];
  canNegotiate: boolean;
  notes: string[];
}

interface DebtNegotiationState {
  view: DebtNegotiationView | null;
}

export const useDebtNegotiationState = create<DebtNegotiationState>(() => ({ view: null }));

export const getDebtNegotiationState = useDebtNegotiationState.getState;
export const setDebtNegotiationState = useDebtNegotiationState.setState;
