import { isLichState } from "../../characters/lichPolicy";
import { densityForState, shouldGenerateSparseRole } from "../../characters/raceRoster";
import { analyzeFrontiers, getProvinceThreats } from "../../hostCore";
import { assignGaelicProvinceLords, pruneStaleHoldings, regimeForState } from "../holdings/assignGaelicHoldings";
import { getCurrentYear, getWorldContext } from "../nobilityContext";
import { Characters } from "./characterLifecycle";

/**
 * Assigns provincial lords. A Gaelic state (name base 22, medieval) gets a holding
 * ledger even when it has no frontier. Every other state keeps one lord on each
 * province that `getProvinceThreats()` flags, and leaves interior provinces unnamed.
 *
 * Safe to call repeatedly. Frontier provinces that already have a living lord are
 * left untouched. A Gaelic ledger refills a dead holder and keeps the same cells.
 */
export function assignProvinceLords(): void {
  const { pack } = getWorldContext();
  const characters = pack.characters;
  if (!characters || !pack.states?.length || !pack.provinces?.length) return;

  const currentYear = getCurrentYear();
  const states = pack.states.filter(s => s.i && !s.removed);
  const isGaelic = (state: (typeof states)[number]): boolean =>
    !isLichState(pack.races, pack.cultures, state) && regimeForState(state) === "gaelicProvincial";
  pruneStaleHoldings(new Set(states.filter(isGaelic).map(state => state.i)));
  const frontierMap = analyzeFrontiers(pack, currentYear);

  for (const state of states) {
    if (isLichState(pack.races, pack.cultures, state)) continue;
    if (isGaelic(state) && assignGaelicProvinceLords(state, frontierMap.get(state.i))) {
      continue;
    }

    const segments = frontierMap.get(state.i);
    if (!segments?.length) continue;

    const threats = getProvinceThreats(pack, segments);
    // Long-lived mono courts cannot staff every march — thin frontier lord density.
    const density = densityForState(state, pack);

    for (const provinceId of threats.keys()) {
      if (!provinceId) continue; // 0 = "no province" (states with too few burgs to have any)

      const province = pack.provinces[provinceId];
      if (!province || province.removed || province.state !== state.i) continue;

      const hasLivingLord = characters.some(
        c => !c.dead && c.titles.some(t => t.entityType === "province" && t.entityId === provinceId)
      );
      if (hasLivingLord) continue;
      if (!shouldGenerateSparseRole(density)) continue;

      Characters.createProvinceLord(state, province);
    }
  }
}
