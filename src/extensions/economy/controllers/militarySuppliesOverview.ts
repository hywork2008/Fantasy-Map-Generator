import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import { getGoods, getMetallurgAssetLedgers, getMilitaryResourceLedgers, getWorldContext } from "../economyContext";
import { isMountedUnit } from "../generators/militaryLogistics";
import {
  type MilitarySuppliesOverviewRow,
  setMilitarySuppliesOverviewState
} from "../store/militarySuppliesOverviewState";

type AssetGoodName = "Arms" | "Muskets" | "Artillery";

const ASSET_GOOD_NAMES = new Set<AssetGoodName>(["Arms", "Muskets", "Artillery"]);

/** Opens the national military equipment and ammunition stocks. */
export function open(): void {
  openDialog("militarySuppliesOverview");
  refreshMilitarySuppliesOverview();
}

/**
 * Reads existing Economy ledgers only. Durable equipment and finished ammunition are State-owned
 * stockpiles available for deployment; monthly delivery throughput is not presented as inventory.
 */
export function refreshMilitarySuppliesOverview(): void {
  const world = getWorldContext();
  const goodNameById = new Map(getGoods().map(good => [good.i, good.name]));
  const assetsByState = new Map<number, Partial<Record<AssetGoodName, number>>>();

  for (const asset of getMetallurgAssetLedgers()) {
    if (asset.ownerKind !== "state") continue;
    const goodName = goodNameById.get(asset.productGoodId);
    if (!goodName || !isAssetGoodName(goodName)) continue;
    const assets = assetsByState.get(asset.ownerId) ?? {};
    assets[goodName] = asset.serviceableUnits;
    assetsByState.set(asset.ownerId, assets);
  }

  const suppliesByState = new Map(getMilitaryResourceLedgers().map(ledger => [ledger.stateId, ledger.consumableStock]));
  const populationRate = Math.max(1, world.populationRate || 1);
  const rows: MilitarySuppliesOverviewRow[] = [];

  for (const state of world.pack.states) {
    if (!state?.i || state.removed) continue;
    const assets = assetsByState.get(state.i);
    const supplies = suppliesByState.get(state.i);
    rows.push({
      stateId: state.i,
      stateName: state.name || `State ${state.i}`,
      arms: rn(assets?.Arms ?? 0, 2),
      arrows: rn(supplies?.arrows ?? 0, 2),
      mounts: rn(getMountedHeadcount(state, populationRate), 2),
      muskets: rn(assets?.Muskets ?? 0, 2),
      bullets: rn(supplies?.bullets ?? 0, 2),
      artillery: rn(assets?.Artillery ?? 0, 2),
      gunpowder: rn(supplies?.gunpowder ?? 0, 2)
    });
  }

  setMilitarySuppliesOverviewState({
    rows: rows.toSorted((left, right) => left.stateName.localeCompare(right.stateName))
  });
}

function isAssetGoodName(goodName: string): goodName is AssetGoodName {
  return ASSET_GOOD_NAMES.has(goodName as AssetGoodName);
}

function getMountedHeadcount(
  state: { military?: Array<{ u?: Record<string, number> }> },
  populationRate: number
): number {
  let mounted = 0;
  for (const regiment of state.military ?? []) {
    for (const [unitName, count] of Object.entries(regiment.u ?? {})) {
      if (isMountedUnit(unitName)) mounted += count / populationRate;
    }
  }
  return mounted;
}
