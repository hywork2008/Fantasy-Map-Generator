import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { getTreasuryAllocationSnapshots } from "../generators/treasuryAllocation";
import { setTreasuryOverviewState, type TreasuryOverviewRow } from "../store/treasuryOverviewState";

/**
 * Debug/transparency view over every State's last treasury department allocation
 * (docs/plan/state-treasury-department-budget.md §3/§4/§7). Reads the snapshot
 * allocateTreasury() already computed during the last collectTaxes() cycle — it does not
 * recompute anything live, since allocateTreasury() has side effects (household stipend
 * payment, militaryDiscontent update) that must only run once per real cycle.
 */
export function open(): void {
  openDialog("treasuryOverview");
  refreshTreasuryOverview();
}

export function refreshTreasuryOverview(): void {
  const world = getWorldContext();
  const states = world.pack.states ?? [];

  const rows: TreasuryOverviewRow[] = [];
  for (const snapshot of getTreasuryAllocationSnapshots()) {
    const state = states[snapshot.stateId];
    if (!state?.i || state.removed) continue;

    rows.push({
      id: state.i,
      stateName: state.name || `State ${state.i}`,
      form: state.form || "—",
      domesticIncome: rn(snapshot.domesticIncome, 2),
      household: snapshot.household,
      marshalcy: snapshot.marshalcy,
      militaryFundingRatio: snapshot.militaryFundingRatio,
      militaryDiscontent: rn(state.militaryDiscontent || 0, 2),
      chancery: snapshot.chancery,
      stewardship: snapshot.stewardship,
      spymastery: snapshot.spymastery,
      ecclesiastica: snapshot.ecclesiastica
    });
  }

  rows.sort((a, b) => b.marshalcy - a.marshalcy);
  setTreasuryOverviewState({ rows });
}
