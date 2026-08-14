import type { State } from "../types/models";

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
