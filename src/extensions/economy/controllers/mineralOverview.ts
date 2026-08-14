import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import { getMineOperations, getMineralDeposits, getWorldContext } from "../economyContext";
import {
  FUEL_MINERAL_COMMODITIES,
  type MineralCommodity,
  type MineralDeposit,
  ORE_COMMODITIES
} from "../generators/mineralResources";
import {
  type MineralCommodityOverviewRow,
  type MineralDepositOverviewRow,
  type MineralOverviewStateOption,
  type MineralSupplyStatus,
  setMineralOverviewState
} from "../store/mineralOverviewState";

const ALL_MINERAL_COMMODITIES: readonly MineralCommodity[] = [...ORE_COMMODITIES, ...FUEL_MINERAL_COMMODITIES];

/**
 * Read-only resource audit for map makers. It exposes generated deposits even before prospecting,
 * while retaining discovery and mine-operation state so geological potential is not confused with supply.
 */
export function open(): void {
  openDialog("mineralOverview");
  refreshMineralOverview();
}

export function refreshMineralOverview(stateId: number | null = null): void {
  const world = getWorldContext();
  const states = getStateOptions(world.pack.states);
  const stateNameById = new Map(states.map(state => [state.id, state.name]));
  const cellStates = world.pack.cells.state;
  const deposits = getMineralDeposits();
  const filteredDeposits =
    stateId === null ? deposits : deposits.filter(deposit => cellStates[deposit.cell] === stateId);
  const operationsByDeposit = new Map(getMineOperations().map(operation => [operation.depositId, operation]));

  const commodities = ALL_MINERAL_COMMODITIES.map(commodity =>
    buildCommodityRow(commodity, filteredDeposits, operationsByDeposit)
  );
  const depositRows = filteredDeposits
    .map(deposit =>
      buildDepositRow(
        deposit,
        operationsByDeposit,
        world.pack.burgs,
        cellStates[deposit.cell],
        stateNameById.get(cellStates[deposit.cell])
      )
    )
    .toSorted((left, right) => right.annualOutputTons - left.annualOutputTons || left.id - right.id);

  setMineralOverviewState({ commodities, deposits: depositRows, states });
}

function getStateOptions(
  states: readonly { i: number; name: string; removed?: boolean }[]
): MineralOverviewStateOption[] {
  return states
    .filter(state => state.i && !state.removed)
    .map(state => ({ id: state.i, name: state.name || `State ${state.i}` }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

function buildCommodityRow(
  commodity: MineralCommodity,
  deposits: readonly MineralDeposit[],
  operationsByDeposit: ReadonlyMap<
    number,
    { active: boolean; annualOutputTons: Partial<Record<MineralCommodity, number>> }
  >
): MineralCommodityOverviewRow {
  const matchingDeposits = deposits.filter(deposit => deposit.commodities.includes(commodity));
  const discoveredCount = matchingDeposits.filter(deposit => deposit.discovered).length;
  const activeMineCount = matchingDeposits.filter(deposit => operationsByDeposit.get(deposit.i)?.active).length;
  const exhaustedCount = matchingDeposits.filter(deposit => deposit.exhausted).length;
  const reserveTons = sumYields(matchingDeposits, commodity, "reserveTons");
  const annualCapacityTons = sumYields(matchingDeposits, commodity, "annualCapacityTons");
  const annualOutputTons = matchingDeposits.reduce(
    (total, deposit) => total + (operationsByDeposit.get(deposit.i)?.annualOutputTons[commodity] ?? 0),
    0
  );

  return {
    commodity,
    depositCount: matchingDeposits.length,
    discoveredCount,
    activeMineCount,
    reserveTons: rn(reserveTons, 2),
    annualCapacityTons: rn(annualCapacityTons, 2),
    annualOutputTons: rn(annualOutputTons, 2),
    status: getStatus(matchingDeposits.length, discoveredCount, activeMineCount, exhaustedCount)
  };
}

function buildDepositRow(
  deposit: MineralDeposit,
  operationsByDeposit: ReadonlyMap<
    number,
    { active: boolean; burgId: number; annualOutputTons: Partial<Record<MineralCommodity, number>> }
  >,
  burgs: readonly { i?: number; name?: string; removed?: boolean }[],
  stateId: number,
  stateName: string | undefined
): MineralDepositOverviewRow {
  const operation = operationsByDeposit.get(deposit.i);
  const burg = operation?.burgId ? burgs[operation.burgId] : undefined;
  const exhaustedCount = deposit.exhausted ? 1 : 0;
  const reserveTons = deposit.yields.reduce((total, yieldInfo) => total + yieldInfo.reserveTons, 0);
  const annualCapacityTons = deposit.yields.reduce(
    (total, yieldInfo) => total + (yieldInfo.reserveTons > 0 ? yieldInfo.annualCapacityTons : 0),
    0
  );
  const annualOutputTons = Object.values(operation?.annualOutputTons ?? {}).reduce(
    (total, output) => total + (output ?? 0),
    0
  );

  return {
    id: deposit.i,
    cell: deposit.cell,
    stateId,
    stateName: stateName ?? "Unclaimed",
    districtType: deposit.type,
    primaryCommodity: deposit.primaryCommodity,
    commodities: deposit.commodities.join(", "),
    burgName: burg?.i && !burg.removed ? burg.name || `Burg ${burg.i}` : "—",
    depth: deposit.depth,
    richness: deposit.richness,
    discovered: deposit.discovered,
    status: getStatus(1, deposit.discovered ? 1 : 0, operation?.active ? 1 : 0, exhaustedCount),
    reserveTons: rn(reserveTons, 2),
    annualCapacityTons: rn(annualCapacityTons, 2),
    annualOutputTons: rn(annualOutputTons, 2)
  };
}

function sumYields(
  deposits: readonly MineralDeposit[],
  commodity: MineralCommodity,
  field: "reserveTons" | "annualCapacityTons"
): number {
  return deposits.reduce(
    (total, deposit) =>
      total +
      deposit.yields
        .filter(yieldInfo => yieldInfo.commodity === commodity)
        .reduce(
          (sum, yieldInfo) =>
            sum + (field === "annualCapacityTons" && yieldInfo.reserveTons <= 0 ? 0 : yieldInfo[field]),
          0
        ),
    0
  );
}

function getStatus(
  depositCount: number,
  discoveredCount: number,
  activeMineCount: number,
  exhaustedCount: number
): MineralSupplyStatus {
  if (depositCount === 0) return "absent";
  if (activeMineCount > 0) return "active";
  if (exhaustedCount === depositCount) return "exhausted";
  if (discoveredCount === 0) return "unprospected";
  return "idle";
}
