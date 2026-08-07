import { create } from "zustand";
import type { BalanceSnapshot } from "../generators/balanceSnapshot";

/**
 * Session-scoped time series of `BalanceSnapshot`s for the Balance History dialog/CSV export
 * (`controllers/balance-history.ts`). Not persisted into the map save file or `localStorage` —
 * a fresh map (or a reload) starts an empty history, matching `useDebugSnapshotState`'s scope.
 */
interface BalanceHistoryState {
  snapshots: BalanceSnapshot[];
  addSnapshot: (snapshot: BalanceSnapshot) => void;
  clear: () => void;
}

export const useBalanceHistoryState = create<BalanceHistoryState>(set => ({
  snapshots: [],
  addSnapshot: snapshot => set(state => ({ snapshots: [...state.snapshots, snapshot] })),
  clear: () => set({ snapshots: [] })
}));
