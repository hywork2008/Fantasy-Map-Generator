/** Read-only reconciliation of source withdrawals and actual rural market credits. */
import { getLivestockDispatchTable } from "../../src/extensions/economy/context/cellTables";
import { animalsPerMarketHead } from "../../src/extensions/economy/generators/liveAnimalScale";
import { livestockFeedPeriod } from "../../src/extensions/economy/generators/livestockFeedState";

export function observeLivestockDispatch(arrivals: Record<string, number>, seen: Set<string>) {
  const period = livestockFeedPeriod();
  const bySpecies: Record<string, { dispatchedHeads: number; arrivedHeads: number;
    trackedHeads: number; untrackedHeads: number; herdDebitHeads: number;
    maxCellErrorHeads: number; cells: number }> = {};
  const row = (name: string) => bySpecies[name] ??= { dispatchedHeads: 0,
    arrivedHeads: arrivals[name] ?? 0, trackedHeads: 0, untrackedHeads: 0,
    herdDebitHeads: 0, maxCellErrorHeads: 0, cells: 0 };
  for (const name of Object.keys(arrivals)) row(name);
  for (const [key, state] of Object.entries(getLivestockDispatchTable() ?? {})) {
    const identity = `${period}:${key}`;
    if (state.period !== period || !state.observation || seen.has(identity)) continue;
    seen.add(identity);
    const name = key.slice(key.indexOf(":") + 1);
    const totals = row(name);
    const observation = state.observation;
    totals.cells++;
    totals.dispatchedHeads += observation.marketUnits * animalsPerMarketHead(name);
    if (observation.stockTracked) {
      totals.trackedHeads += observation.heads;
      const debit = observation.herdBeforeHeads! - observation.herdAfterHeads!;
      totals.herdDebitHeads += debit;
      totals.maxCellErrorHeads = Math.max(totals.maxCellErrorHeads, Math.abs(debit - observation.heads));
    } else totals.untrackedHeads += observation.heads;
  }
  return { period, bySpecies };
}
