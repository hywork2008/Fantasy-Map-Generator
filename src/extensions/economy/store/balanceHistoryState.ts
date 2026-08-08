import { create } from "zustand";
import type { BalanceSnapshot } from "../generators/balanceSnapshot";
import type { GoodBalanceInterval, GoodFlowAttribution } from "../generators/goodsBalanceLedger";

/**
 * Session-scoped time series of `BalanceSnapshot`s for the Balance History dialog/CSV export
 * (`controllers/balance-history.ts`). Not persisted into the map save file or `localStorage` —
 * a fresh map (or a reload) starts an empty history, matching `useDebugSnapshotState`'s scope.
 */
interface BalanceHistoryState {
  snapshots: BalanceSnapshot[];
  intervals: GoodBalanceInterval[];
  attributions: GoodFlowAttribution[];
  addSnapshot: (snapshot: BalanceSnapshot) => void;
  addGoodsBalance: (intervals: readonly GoodBalanceInterval[], attributions: readonly GoodFlowAttribution[]) => void;
  clear: () => void;
}

export const useBalanceHistoryState = create<BalanceHistoryState>(set => ({
  snapshots: [],
  intervals: [],
  attributions: [],
  addSnapshot: snapshot => set(state => ({ snapshots: [...state.snapshots, snapshot] })),
  addGoodsBalance: (intervals, attributions) =>
    set(state => ({
      intervals: [...state.intervals, ...intervals],
      attributions: [...state.attributions, ...attributions]
    })),
  clear: () => set({ snapshots: [], intervals: [], attributions: [] })
}));
