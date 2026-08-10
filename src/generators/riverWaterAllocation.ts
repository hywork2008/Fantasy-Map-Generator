import type { PackedGraph, PackedGraphCells } from "../types/PackedGraph";

export type AnnualWater = number;

export interface RiverIntake {
  readonly riverCellId: number;
  /** 0 for a bank cell, 1 for an immediately adjacent field. */
  readonly hops: number;
}

export interface RiverWaterNetworkInput {
  readonly pack: Readonly<Pick<PackedGraph, "cells" | "rivers">>;
  /** Converts the generator's relative flux into the shared annual water unit. */
  readonly annualWaterPerFlux: number;
}

export interface RiverWaterNetwork {
  readonly annualWaterPerFlux: number;
  readonly intakeByFieldCell: readonly (RiverIntake | null)[];
  readonly diagnostics: readonly RiverWaterDiagnostic[];
  /** Internal topology is exposed read-only for diagnostics and future navigation consumers. */
  readonly downstreamByCell: Int32Array;
  readonly topologicalOrder: readonly number[];
  readonly naturalFlowByCell: Float64Array;
  readonly available: boolean;
}

export interface RiverWithdrawal {
  readonly id: string;
  readonly intake: RiverIntake;
  readonly beneficiaryCellId: number;
  readonly requestedWithdrawal: AnnualWater;
  readonly maximumWithdrawal: AnnualWater;
  readonly conveyanceEfficiency: number;
  /** Smaller values receive water first; equal priorities are rationed proportionally. */
  readonly priority: number;
}

export interface RiverWaterAllocationPolicy {
  /** Fraction of natural through-flow which always remains in the channel. */
  readonly environmentalFlowReserve: number;
}

export interface RiverWithdrawalAllocation {
  readonly id: string;
  readonly beneficiaryCellId: number;
  readonly requestedWithdrawal: AnnualWater;
  readonly withdrawnWater: AnnualWater;
  readonly deliveredWater: AnnualWater;
  readonly unmetWater: AnnualWater;
  readonly reason?: "unreachable" | "invalid" | "insufficientFlow";
}

export interface RiverWaterDiagnostic {
  readonly code: "missingTopology" | "reconstructedTopology" | "cycle" | "invalidFlow" | "invalidWithdrawal";
  readonly cellId?: number;
  readonly withdrawalId?: string;
}

export interface RiverWaterAllocation {
  readonly status: "complete" | "degraded" | "unavailable";
  readonly allocations: readonly RiverWithdrawalAllocation[];
  readonly residualFlowByCell: Float32Array;
  readonly withdrawnFlowByCell: Float32Array;
  readonly diagnostics: readonly RiverWaterDiagnostic[];
}

/**
 * Builds the directed river ledger once after generation or load. River cells
 * and their immediate land neighbours can be intake sites; canal routing is a
 * later concern and deliberately remains outside this module.
 */
export function compileRiverWaterNetwork(input: RiverWaterNetworkInput): RiverWaterNetwork {
  const { cells } = input.pack;
  const count = cells.i.length;
  const diagnostics: RiverWaterDiagnostic[] = [];
  const hasPersistedTopology = cells.riverDownstream?.length === count;
  const downstreamByCell = hasPersistedTopology
    ? (cells.riverDownstream?.slice() ?? buildRiverDownstream(cells, input.pack.rivers))
    : buildRiverDownstream(cells, input.pack.rivers);
  if (!hasPersistedTopology) diagnostics.push({ code: "reconstructedTopology" });

  const riverCells = new Set<number>();
  for (const cellId of cells.i) {
    if (isLandRiverCell(cells, cellId)) riverCells.add(cellId);
  }

  const incoming = Array.from({ length: count }, () => [] as number[]);
  for (const cellId of riverCells) {
    const downstream = downstreamByCell[cellId] ?? -1;
    if (downstream < 0) continue;
    if (!riverCells.has(downstream)) {
      diagnostics.push({ code: "missingTopology", cellId });
      downstreamByCell[cellId] = -1;
      continue;
    }
    incoming[downstream]!.push(cellId);
  }

  const indegree = new Int32Array(count);
  for (const cellId of riverCells) indegree[cellId] = incoming[cellId]!.length;
  const ready = [...riverCells].filter(cellId => indegree[cellId] === 0).sort((a, b) => a - b);
  const topologicalOrder: number[] = [];
  while (ready.length) {
    const cellId = ready.shift()!;
    topologicalOrder.push(cellId);
    const downstream = downstreamByCell[cellId] ?? -1;
    if (downstream < 0) continue;
    indegree[downstream] -= 1;
    if (indegree[downstream] === 0) {
      ready.push(downstream);
      ready.sort((a, b) => a - b);
    }
  }
  if (topologicalOrder.length !== riverCells.size) diagnostics.push({ code: "cycle" });

  const naturalFlowByCell = new Float64Array(count);
  for (const cellId of riverCells) {
    const flux = cells.fl[cellId] ?? 0;
    if (!Number.isFinite(flux) || flux < 0) diagnostics.push({ code: "invalidFlow", cellId });
    naturalFlowByCell[cellId] = Math.max(0, Number.isFinite(flux) ? flux : 0) * Math.max(0, input.annualWaterPerFlux);
  }

  const intakeByFieldCell: (RiverIntake | null)[] = Array.from({ length: count }, () => null);
  for (const riverCellId of riverCells) intakeByFieldCell[riverCellId] = { riverCellId, hops: 0 };
  for (const fieldCellId of cells.i) {
    if (intakeByFieldCell[fieldCellId] || (cells.h[fieldCellId] ?? 0) < 20) continue;
    const candidate = (cells.c?.[fieldCellId] ?? [])
      .filter(cellId => riverCells.has(cellId))
      .sort((left, right) => naturalFlowByCell[right]! - naturalFlowByCell[left]! || left - right)[0];
    if (candidate !== undefined) intakeByFieldCell[fieldCellId] = { riverCellId: candidate, hops: 1 };
  }

  return {
    annualWaterPerFlux: Math.max(0, input.annualWaterPerFlux),
    intakeByFieldCell,
    diagnostics,
    downstreamByCell,
    topologicalOrder,
    naturalFlowByCell,
    available: !diagnostics.some(diagnostic => diagnostic.code === "missingTopology" || diagnostic.code === "cycle")
  };
}

/** Resolves every withdrawal in one upstream-to-downstream pass without mutating map state. */
export function allocateRiverWater(
  network: RiverWaterNetwork,
  withdrawals: readonly RiverWithdrawal[],
  policy: RiverWaterAllocationPolicy
): RiverWaterAllocation {
  const count = network.naturalFlowByCell.length;
  const residualFlowByCell = new Float32Array(count);
  const withdrawnFlowByCell = new Float32Array(count);
  const diagnostics = [...network.diagnostics];
  const allocations = new Map<string, RiverWithdrawalAllocation>();

  for (const withdrawal of withdrawals) {
    if (!isValidWithdrawal(withdrawal, count)) {
      diagnostics.push({ code: "invalidWithdrawal", withdrawalId: withdrawal.id });
      allocations.set(withdrawal.id, emptyAllocation(withdrawal, "invalid"));
    }
  }
  if (!network.available) {
    for (const withdrawal of withdrawals) {
      if (!allocations.has(withdrawal.id)) allocations.set(withdrawal.id, emptyAllocation(withdrawal, "unreachable"));
    }
    return {
      status: "unavailable",
      allocations: withdrawals.map(withdrawal => allocations.get(withdrawal.id)!),
      residualFlowByCell,
      withdrawnFlowByCell,
      diagnostics
    };
  }

  const withdrawalsByIntake = new Map<number, RiverWithdrawal[]>();
  for (const withdrawal of withdrawals) {
    if (allocations.has(withdrawal.id)) continue;
    const entries = withdrawalsByIntake.get(withdrawal.intake.riverCellId) ?? [];
    entries.push(withdrawal);
    withdrawalsByIntake.set(withdrawal.intake.riverCellId, entries);
  }

  const incomingResidual = new Float64Array(count);
  const incomingNatural = new Float64Array(count);
  for (const cellId of network.topologicalOrder) {
    const natural = network.naturalFlowByCell[cellId] ?? 0;
    const localNatural = Math.max(0, natural - incomingNatural[cellId]!);
    const available = incomingResidual[cellId]! + localNatural;
    const reserve = natural * clamp(policy.environmentalFlowReserve, 0, 1);
    const granted = distributeAtIntake(
      withdrawalsByIntake.get(cellId) ?? [],
      Math.max(0, available - reserve),
      allocations
    );
    withdrawnFlowByCell[cellId] = granted;
    const residual = Math.max(0, available - granted);
    residualFlowByCell[cellId] = residual;
    const downstream = network.downstreamByCell[cellId] ?? -1;
    if (downstream >= 0) {
      incomingResidual[downstream] += residual;
      incomingNatural[downstream] += natural;
    }
  }

  for (const withdrawal of withdrawals) {
    if (!allocations.has(withdrawal.id)) allocations.set(withdrawal.id, emptyAllocation(withdrawal, "unreachable"));
  }
  const status = diagnostics.length ? "degraded" : "complete";
  return {
    status,
    allocations: withdrawals.map(withdrawal => allocations.get(withdrawal.id)!),
    residualFlowByCell,
    withdrawnFlowByCell,
    diagnostics
  };
}

/** Builds a canonical downstream column from generated or manually edited river paths. */
export function buildRiverDownstream(
  cells: Pick<PackedGraphCells, "i" | "h">,
  rivers: PackedGraph["rivers"]
): Int32Array {
  const downstream = new Int32Array(cells.i.length).fill(-1);
  for (const river of rivers) {
    let previous = -1;
    for (const cellId of river.cells) {
      if (cellId < 0 || cellId >= cells.i.length || (cells.h[cellId] ?? 0) < 20) {
        previous = -1;
        continue;
      }
      if (previous >= 0 && (downstream[previous] < 0 || downstream[previous] === cellId)) downstream[previous] = cellId;
      previous = cellId;
    }
  }
  return downstream;
}

function distributeAtIntake(
  entries: readonly RiverWithdrawal[],
  available: number,
  allocations: Map<string, RiverWithdrawalAllocation>
): number {
  let remaining = available;
  const priorities = [...new Set(entries.map(entry => entry.priority))].sort((a, b) => a - b);
  for (const priority of priorities) {
    const group = entries
      .filter(entry => entry.priority === priority)
      .sort((left, right) => left.id.localeCompare(right.id));
    const requested = group.map(entry => Math.min(entry.requestedWithdrawal, entry.maximumWithdrawal));
    const totalRequested = requested.reduce((sum, value) => sum + value, 0);
    const ratio = totalRequested > 0 ? Math.min(1, remaining / totalRequested) : 0;
    group.forEach((entry, index) => {
      const withdrawnWater = requested[index]! * ratio;
      const deliveredWater = withdrawnWater * entry.conveyanceEfficiency;
      allocations.set(entry.id, {
        id: entry.id,
        beneficiaryCellId: entry.beneficiaryCellId,
        requestedWithdrawal: entry.requestedWithdrawal,
        withdrawnWater,
        deliveredWater,
        unmetWater: Math.max(0, entry.requestedWithdrawal - withdrawnWater),
        reason: withdrawnWater + 1e-9 < entry.requestedWithdrawal ? "insufficientFlow" : undefined
      });
      remaining -= withdrawnWater;
    });
  }
  return Math.max(0, available - remaining);
}

function emptyAllocation(
  withdrawal: RiverWithdrawal,
  reason: RiverWithdrawalAllocation["reason"]
): RiverWithdrawalAllocation {
  return {
    id: withdrawal.id,
    beneficiaryCellId: withdrawal.beneficiaryCellId,
    requestedWithdrawal: withdrawal.requestedWithdrawal,
    withdrawnWater: 0,
    deliveredWater: 0,
    unmetWater: Math.max(0, withdrawal.requestedWithdrawal),
    reason
  };
}

function isLandRiverCell(cells: Pick<PackedGraphCells, "r" | "h">, cellId: number): boolean {
  return Boolean(cells.r[cellId]) && (cells.h[cellId] ?? 0) >= 20;
}

function isValidWithdrawal(withdrawal: RiverWithdrawal, cellCount: number): boolean {
  return (
    withdrawal.intake.riverCellId >= 0 &&
    withdrawal.intake.riverCellId < cellCount &&
    withdrawal.beneficiaryCellId >= 0 &&
    withdrawal.beneficiaryCellId < cellCount &&
    Number.isFinite(withdrawal.requestedWithdrawal) &&
    withdrawal.requestedWithdrawal >= 0 &&
    Number.isFinite(withdrawal.maximumWithdrawal) &&
    withdrawal.maximumWithdrawal >= 0 &&
    Number.isFinite(withdrawal.conveyanceEfficiency) &&
    withdrawal.conveyanceEfficiency > 0 &&
    withdrawal.conveyanceEfficiency <= 1 &&
    Number.isFinite(withdrawal.priority)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
