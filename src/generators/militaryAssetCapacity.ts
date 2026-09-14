import type { MilitaryRegiment, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";

export interface MountedCapacityRequest {
  stateId: number;
  /** Set by Economy only when live livestock data is available for this state. */
  capacity?: number;
  handled: boolean;
}

export interface FleetCapacityRequest {
  stateId: number;
  /** Number of configured fleet units that the state's completed navy can crew. */
  capacity?: number;
  handled: boolean;
}

function requestCapacity<T extends MountedCapacityRequest | FleetCapacityRequest>(
  eventName: string,
  detail: T
): number | undefined {
  document.dispatchEvent(new CustomEvent(eventName, { detail }));
  if (!detail.handled || detail.capacity === undefined || !Number.isFinite(detail.capacity)) return undefined;
  return Math.max(0, Math.floor(detail.capacity));
}

/** Requests the number of mounted soldiers that can be kept under arms by a state. */
export function requestMountedCapacity(stateId: number): number | undefined {
  return requestCapacity("fmg:economy-mounted-capacity-request", { stateId, handled: false });
}

/** Requests the number of configured fleet units that completed state hulls can crew. */
export function requestFleetCapacity(stateId: number): number | undefined {
  return requestCapacity("fmg:shipbuilding-fleet-capacity-request", { stateId, handled: false });
}

/**
 * Restrict a group of unit types without discarding its intended establishment. Callers provide
 * the shared capacity in the same units stored in MilitaryRegiment.u.
 */
export function constrainRegimentUnits(state: State, unitNames: ReadonlySet<string>, capacity: number): boolean {
  let remaining = Math.max(0, capacity);
  let changed = false;

  for (const regiment of state.military ?? []) {
    for (const unitName of unitNames) {
      const active = Math.max(0, regiment.u[unitName] ?? 0);
      const target = Math.max(active, regiment.plannedU?.[unitName] ?? 0);
      if (!(target > 0)) continue;

      const allowed = Math.min(target, remaining);
      remaining -= allowed;
      const activeDelta = allowed - active;
      const hasDormantTarget = regiment.plannedU?.[unitName] !== undefined;
      if (!activeDelta && (!hasDormantTarget || allowed < target)) continue;

      if (allowed < target) {
        regiment.plannedU = { ...(regiment.plannedU ?? {}), [unitName]: target };
      } else if (hasDormantTarget) {
        const plannedU = { ...regiment.plannedU };
        delete plannedU[unitName];
        regiment.plannedU = Object.keys(plannedU).length ? plannedU : undefined;
      }
      if (allowed > 0) regiment.u[unitName] = allowed;
      else delete regiment.u[unitName];
      regiment.a = Math.max(0, regiment.a + activeDelta);
      regiment.t = Math.max(0, regiment.t + activeDelta);
      changed = true;
    }
  }

  return changed;
}

function findNavalAnchorCell(state: State, pack: PackedGraph): number {
  for (const burg of pack.burgs ?? []) {
    if (burg && burg.state === state.i && burg.port && pack.cells.haven?.[burg.cell]) {
      return burg.cell;
    }
  }
  if (state.center && pack.cells.haven?.[state.center]) {
    return state.center;
  }
  return state.center || 0;
}

/**
 * Reconciles state fleet units with completed state navy hulls.
 * Unlike land units constrained by an intended establishment ceiling,
 * completed state navy hulls directly determine active fleet strength.
 */
export function reconcileFleetUnits(
  state: State,
  fleetUnitNames: ReadonlySet<string>,
  capacity: number,
  pack?: PackedGraph
): boolean {
  const primaryUnit = fleetUnitNames.values().next().value;
  if (!primaryUnit) return false;

  let changed = false;
  const regiments = state.military ?? [];
  const navalRegiments = regiments.filter(
    r =>
      r.n === 1 ||
      Object.keys(r.u).some(u => fleetUnitNames.has(u)) ||
      Object.keys(r.plannedU ?? {}).some(u => fleetUnitNames.has(u))
  );

  if (navalRegiments.length > 0) {
    let remaining = Math.max(0, capacity);
    for (let i = 0; i < navalRegiments.length; i++) {
      const reg = navalRegiments[i];
      const isLast = i === navalRegiments.length - 1;
      const active = reg.u[primaryUnit] ?? 0;
      const target = Math.max(active, reg.plannedU?.[primaryUnit] ?? 0);

      const allocated = isLast ? remaining : Math.min(target > 0 ? target : remaining, remaining);
      remaining = Math.max(0, remaining - allocated);

      const delta = allocated - active;
      if (delta !== 0 || reg.plannedU?.[primaryUnit] !== undefined) {
        if (allocated > 0) {
          reg.u[primaryUnit] = allocated;
        } else {
          delete reg.u[primaryUnit];
        }

        if (allocated < target) {
          reg.plannedU = { ...(reg.plannedU ?? {}), [primaryUnit]: target };
        } else if (reg.plannedU?.[primaryUnit] !== undefined) {
          const plannedU = { ...reg.plannedU };
          delete plannedU[primaryUnit];
          reg.plannedU = Object.keys(plannedU).length ? plannedU : undefined;
        }

        reg.a = Math.max(0, reg.a + delta);
        reg.t = Math.max(0, reg.t + delta);
        changed = true;
      }
    }
  } else if (capacity > 0 && pack) {
    const anchorCell = findNavalAnchorCell(state, pack);
    const havenCell = pack.cells.haven?.[anchorCell] || anchorCell;
    const [x, y] = pack.cells.p[havenCell] ?? pack.cells.p[anchorCell] ?? [0, 0];
    const newReg: MilitaryRegiment = {
      i: regiments.length ? Math.max(...regiments.map(r => r.i)) + 1 : 0,
      t: capacity,
      a: capacity,
      s: 0,
      cell: anchorCell,
      x,
      y,
      bx: x,
      by: y,
      u: { [primaryUnit]: capacity },
      n: 1,
      type: "naval",
      name: "Fleet",
      state: state.i,
      homeProvince: pack.cells.province?.[anchorCell] ?? 0,
      quality: 1,
      formation: "line"
    };
    if (!state.military) state.military = [];
    state.military.push(newReg);
    changed = true;
  }

  return changed;
}
