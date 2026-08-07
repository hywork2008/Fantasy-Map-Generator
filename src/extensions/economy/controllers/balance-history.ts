/**
 * Balance History — orchestrates capturing `BalanceSnapshot`s (balanceSnapshot.ts) into
 * `useBalanceHistoryState` and exporting the accumulated time series as CSV. Capture points, both
 * wired up in `index.tsx`:
 *   - `recordInitialBalanceSnapshot()`: called at the end of the "economy.initialization"
 *     map-ready task (fresh generation / regenerate map, once Goods/Markets/Production/Fauna have
 *     settled) and at the end of the `fmg:world-loaded` handler (a saved map was loaded). Either
 *     way it clears any previous map's history first and records the "Initial Generation" row.
 *   - `recordAdvanceBalanceSnapshot()`: called on `fmg:time-advance-completed` (host,
 *     `src/generators/timeEngine.ts`) — one row per completed Advance Day/Month/Year action
 *     (button click or `window.fmg.actions.advanceTime()` call), not per calendar day — see that
 *     event's doc-comment for why.
 */

import { downloadFile, getFileName, rn } from "../../hostUtils";
import { type BalanceSnapshot, captureBalanceSnapshot } from "../generators/balanceSnapshot";
import { useBalanceHistoryState } from "../store/balanceHistoryState";

/** Clears any prior map's history and records the first row for the map that just became ready. */
export function recordInitialBalanceSnapshot(): void {
  useBalanceHistoryState.getState().clear();
  useBalanceHistoryState.getState().addSnapshot(captureBalanceSnapshot("Initial Generation"));
}

/** Records one row for a just-completed Advance Time action. */
export function recordAdvanceBalanceSnapshot(): void {
  const snapshot = captureBalanceSnapshot("Advance Time");
  useBalanceHistoryState.getState().addSnapshot(snapshot);
}

export function clearBalanceHistory(): void {
  useBalanceHistoryState.getState().clear();
}

/** Union of a per-snapshot dynamic column's keys across the whole history, in first-seen order. */
function collectColumnKeys(
  snapshots: readonly BalanceSnapshot[],
  pick: (s: BalanceSnapshot) => Record<string, number>
) {
  const keys = new Set<string>();
  for (const snapshot of snapshots) {
    for (const key of Object.keys(pick(snapshot))) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function csvCell(value: unknown): string {
  return typeof value === "number" ? String(rn(value, 2)) : String(value);
}

/**
 * Downloads the accumulated Balance History as CSV. Goods/Fauna get one column per name/species
 * seen in *any* snapshot (a Good added mid-session, e.g. by regenerating Goods, still gets a full
 * column with 0 for earlier rows) rather than a fixed schema, since the enabled Goods/species set
 * is generation-dependent.
 */
export function downloadBalanceHistoryCsv(): void {
  const snapshots = useBalanceHistoryState.getState().snapshots;
  if (snapshots.length === 0) return;

  const goodNames = collectColumnKeys(snapshots, s => s.goods.byGood);
  const speciesNames = collectColumnKeys(snapshots, s => s.fauna.bySpecies);

  const headers = [
    "Label",
    "Year",
    "Month",
    "Day",
    "Tick",
    "Population Total",
    "Population Urban",
    "Population Rural",
    "Urbanization Rate (%)",
    "Goods Total Stock",
    "Fauna Wild Total",
    "Fauna Domesticated Total",
    "Fauna At-Risk Species Count",
    "Total State Treasury",
    "Nutrition Kcal Coverage (%)",
    "Nutrition Protein Coverage (%)",
    ...goodNames.map(name => `Goods: ${name}`),
    ...speciesNames.map(name => `Fauna: ${name}`)
  ];

  const rows = snapshots.map(snapshot => {
    const fixed = [
      snapshot.label,
      snapshot.year,
      snapshot.month,
      snapshot.day,
      snapshot.tickCount,
      snapshot.population.total,
      snapshot.population.urban,
      snapshot.population.rural,
      snapshot.population.urbanizationRate * 100,
      snapshot.goods.totalStock,
      snapshot.fauna.wildTotal,
      snapshot.fauna.domesticatedTotal,
      snapshot.fauna.atRiskSpeciesCount,
      snapshot.totalStateTreasury,
      snapshot.nutrition.kcalCoverageRatio * 100,
      snapshot.nutrition.proteinCoverageRatio * 100
    ];
    const goodsCells = goodNames.map(name => snapshot.goods.byGood[name] ?? 0);
    const speciesCells = speciesNames.map(name => snapshot.fauna.bySpecies[name] ?? 0);
    return [...fixed, ...goodsCells, ...speciesCells].map(csvCell).join(",");
  });

  const csv = `${headers.join(",")}\n${rows.join("\n")}\n`;
  downloadFile(csv, `${getFileName("BalanceHistory")}.csv`);
}
