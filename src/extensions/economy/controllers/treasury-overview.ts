import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { State } from "../../hostTypes";
import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import { getRulerId } from "../../nobility/nobilityContext";
import { getWorldContext } from "../economyContext";
import { peekCreditPoolBalance } from "../generators/creditPool";
import { getTreasuryAllocationSnapshots, sumDepartmentBalances } from "../generators/treasuryAllocation";
import { setTreasuryOverviewState, type TreasuryOverviewRow } from "../store/treasuryOverviewState";

/**
 * Debug/transparency view over every State's last treasury department allocation
 * (docs/plan/state-treasury-department-budget.md §3/§4/§7) plus multi-ledger PR-1 stocks
 * (docs/plan/multi-ledger-fiscal-architecture.md): public treasury vs ruler personal wealth.
 * Reads the snapshot allocateTreasury() already computed during the last collectTaxes() cycle —
 * it does not recompute allocation live (side effects: stipends, militaryDiscontent).
 */
export function open(): void {
  openDialog("treasuryOverview");
  refreshTreasuryOverview();
}

function resolveRulerPersonalWealth(state: State): number {
  if (!state.i || !hasCharactersContext()) return 0;
  const rulerId = getRulerId(state);
  if (rulerId === undefined) return 0;
  const ruler = getCharacters().find(character => character.i === rulerId && !character.dead);
  return rn(ruler?.wealth || 0, 2);
}

export function refreshTreasuryOverview(): void {
  const world = getWorldContext();
  const states = world.pack.states ?? [];

  const rows: TreasuryOverviewRow[] = [];
  for (const snapshot of getTreasuryAllocationSnapshots()) {
    const state = states[snapshot.stateId];
    if (!state?.i || state.removed) continue;

    const nominalDepartments = rn(
      snapshot.marshalcy + snapshot.chancery + snapshot.stewardship + snapshot.spymastery + snapshot.ecclesiastica,
      2
    );

    rows.push({
      id: state.i,
      stateName: state.name || `State ${state.i}`,
      form: state.form || "—",
      domesticIncome: rn(snapshot.domesticIncome, 2),
      publicTreasury: rn(state.treasury || 0, 2),
      householdPurse: rn(state.householdPurse || 0, 2),
      rulerPersonal: resolveRulerPersonalWealth(state),
      nominalDepartments,
      departmentBalancesStock: sumDepartmentBalances(state.departmentBalances),
      household: snapshot.household,
      officeStipendsPaid: snapshot.officeStipendsPaid,
      marshalcy: snapshot.marshalcy,
      militaryFundingRatio: snapshot.militaryFundingRatio,
      militaryDiscontent: rn(state.militaryDiscontent || 0, 2),
      warFooting: Boolean(state.warFooting),
      militaryMobilizationBoost: rn(state.militaryMobilizationBoost || 0, 3),
      publicDebt: rn(state.publicDebt || 0, 2),
      creditPoolBalance: peekCreditPoolBalance(state),
      councilSupport: rn(state.councilSupport ?? 0, 1),
      lastTaxFarmLeak: rn(state.lastTaxFarmLeak || 0, 2),
      chancery: snapshot.chancery,
      stewardship: snapshot.stewardship,
      spymastery: snapshot.spymastery,
      ecclesiastica: snapshot.ecclesiastica
    });
  }

  rows.sort((a, b) => b.publicTreasury - a.publicTreasury || b.marshalcy - a.marshalcy);
  setTreasuryOverviewState({ rows });
}
