/**
 * Module-level context holder for the nobility extension.
 * Populated once by init(api) in index.tsx; read by all nobility sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../../types/extension-api";
import type { State } from "../../types/models";
import type { ConflictAuthorization } from "./types";

let _api: ExtensionAPI | null = null;

export function initNobilityContext(api: ExtensionAPI): void {
  _api = api;
}

export function clearNobilityContext(): void {
  _api = null;
}

/** Supports pure generator helpers that are exercised without the extension lifecycle in unit tests. */
export function hasNobilityContext(): boolean {
  return _api !== null;
}

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[nobility] Extension context not initialized — call init(api) first");
  return _api;
}

export function getWorldContext() {
  return getApi().worldContext;
}

/**
 * Live simulation year. Falls back to generation options only when a minimal
 * test double omits simulationContext.
 */
export function getCurrentYear(): number {
  const year = _api?.simulationContext?.currentYear;
  if (typeof year === "number" && Number.isFinite(year)) return year;
  return Number(getWorldContext().options.year) || 1000;
}

type NobilitySlice = Record<string, unknown>;
type StateValueTable<T> = Record<number, T>;

function getStateId(state: State): number | null {
  return Number.isInteger(state.i) && state.i > 0 ? state.i : null;
}

function getNobilitySlice(): NobilitySlice | null {
  const simulation = _api?.simulationContext;
  if (!simulation?.extensions) return null;
  const existing = simulation.extensions.nobility;
  if (existing) return existing;
  const slice: NobilitySlice = {};
  simulation.extensions.nobility = slice;
  return slice;
}

function getStateValueTable<T>(field: string): StateValueTable<T> | null {
  const slice = getNobilitySlice();
  if (!slice) return null;
  const existing = slice[field];
  if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
    return existing as StateValueTable<T>;
  }
  const values: StateValueTable<T> = {};
  slice[field] = values;
  return values;
}

/** Nobility-owned ruler pointer, stored by state ID rather than on the map definition. */
export function getRulerId(state: State): number | undefined {
  const stateId = getStateId(state);
  const values = getStateValueTable<number>("rulerIdByState");
  if (stateId !== null && values) return values[stateId];
  return (state as unknown as Record<string, unknown>).rulerId as number | undefined;
}

export function setRulerId(state: State, rulerId: number | undefined): void {
  const stateId = getStateId(state);
  const values = getStateValueTable<number>("rulerIdByState");
  if (stateId !== null && values) {
    if (rulerId === undefined) delete values[stateId];
    else values[stateId] = rulerId;
    return;
  }
  const legacyState = state as unknown as Record<string, unknown>;
  if (rulerId === undefined) delete legacyState.rulerId;
  else legacyState.rulerId = rulerId;
}

/** Nobility-owned player conflict records, stored by state ID. */
export function getConflictAuthorizations(state: State): Record<number, ConflictAuthorization> {
  const stateId = getStateId(state);
  const values = getStateValueTable<Record<number, ConflictAuthorization>>("conflictAuthorizationsByState");
  if (stateId !== null && values) return values[stateId] ?? {};
  return ((state as unknown as Record<string, unknown>).conflictAuthorizations ?? {}) as Record<
    number,
    ConflictAuthorization
  >;
}

export function setConflictAuthorizations(state: State, authorizations: Record<number, ConflictAuthorization>): void {
  const stateId = getStateId(state);
  const values = getStateValueTable<Record<number, ConflictAuthorization>>("conflictAuthorizationsByState");
  if (stateId !== null && values) {
    values[stateId] = authorizations;
    return;
  }
  (state as unknown as Record<string, unknown>).conflictAuthorizations = authorizations;
}
