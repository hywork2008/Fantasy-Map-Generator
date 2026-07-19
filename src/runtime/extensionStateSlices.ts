import type { ExtensionStateSlices, SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";

type ExtensionSliceDefinition = {
  readonly extensionId: string;
  readonly legacyTarget: "pack" | "cells";
  readonly legacyField: string;
  readonly defaultValue: () => unknown;
};

type ExtensionEntitySliceDefinition = {
  readonly extensionId: string;
  readonly legacyTarget: "burgs" | "states";
  readonly legacyField: string;
  readonly sliceField: string;
  readonly defaultValue: () => unknown;
};

/**
 * Machine-readable ownership inventory for extension fields that historically
 * augmented `PackedGraph`. Extension code receives its historical property
 * through the adapter below while the storage itself lives in one named slice.
 */
export const EXTENSION_SLICE_DEFINITIONS: readonly ExtensionSliceDefinition[] = [
  { extensionId: "characters", legacyTarget: "pack", legacyField: "characters", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "goods", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "markets", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "deals", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "caravans", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "nextCaravanId", defaultValue: () => 0 },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "burgMarketLedgers", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "merchantOrganizations", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "strategicProcurementOrders", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "strategicGoodsPolicies", defaultValue: () => [] },
  {
    extensionId: "economy",
    legacyTarget: "pack",
    legacyField: "nextStrategicProcurementOrderId",
    defaultValue: () => 0
  },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "strategicLaborMarkets", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "cells", legacyField: "good", defaultValue: () => new Uint16Array() },
  { extensionId: "economy", legacyTarget: "cells", legacyField: "market", defaultValue: () => new Uint16Array() }
];

/** Extension fields historically augmented onto individual core entities. */
export const EXTENSION_ENTITY_SLICE_DEFINITIONS: readonly ExtensionEntitySliceDefinition[] = [
  {
    extensionId: "economy",
    legacyTarget: "burgs",
    legacyField: "production",
    sliceField: "productionByBurg",
    defaultValue: () => []
  },
  {
    extensionId: "nobility",
    legacyTarget: "states",
    legacyField: "rulerId",
    sliceField: "rulerIdByState",
    defaultValue: () => undefined
  },
  {
    extensionId: "nobility",
    legacyTarget: "states",
    legacyField: "conflictAuthorizations",
    sliceField: "conflictAuthorizationsByState",
    defaultValue: () => ({})
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Archive ${name} must be a record`);
}

function assertArray(value: unknown, name: string): void {
  if (!Array.isArray(value)) throw new Error(`Archive ${name} must be an array`);
}

function assertNonNegativeInteger(value: unknown, name: string): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Archive ${name} must be a non-negative integer`);
  }
}

function assertEntityKeyedRecord(value: unknown, entities: readonly unknown[], name: string): void {
  assertRecord(value, name);
  for (const [rawId] of Object.entries(value)) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 0 || String(id) !== rawId || !entities[id]) {
      throw new Error(`Archive ${name} references missing entity ${rawId}`);
    }
  }
}

function assertOptionalArrayField(slice: Record<string, unknown>, field: string, extensionId: string): void {
  if (slice[field] !== undefined) assertArray(slice[field], `simulation.extensions.${extensionId}.${field}`);
}

/**
 * Validates the host-known extension slice fields before archive replacement.
 * Unknown extension ids remain opaque records until the registration seam can
 * supply their own validator; they are still required to have a safe container.
 */
export function assertValidExtensionStateSlices(world: WorldContext, simulation: SimulationContext): void {
  if (simulation.extensions === undefined) return;
  assertRecord(simulation.extensions, "simulation.extensions");
  for (const [extensionId, slice] of Object.entries(simulation.extensions)) {
    assertRecord(slice, `simulation.extensions.${extensionId}`);
  }

  const characters = simulation.extensions.characters;
  if (characters) assertOptionalArrayField(characters, "characters", "characters");

  const economy = simulation.extensions.economy;
  if (economy) {
    for (const field of [
      "goods",
      "markets",
      "deals",
      "caravans",
      "burgMarketLedgers",
      "merchantOrganizations",
      "strategicProcurementOrders",
      "strategicGoodsPolicies",
      "strategicLaborMarkets"
    ]) {
      assertOptionalArrayField(economy, field, "economy");
    }
    for (const field of ["nextCaravanId", "nextStrategicProcurementOrderId"]) {
      if (economy[field] !== undefined)
        assertNonNegativeInteger(economy[field], `simulation.extensions.economy.${field}`);
    }
    const cellCount = world.pack.cells.i?.length;
    for (const field of ["good", "market"]) {
      const column = economy[field];
      if (column === undefined) continue;
      if (!(column instanceof Uint16Array)) {
        throw new Error(`Archive simulation.extensions.economy.${field} must be a Uint16Array`);
      }
      if (cellCount !== undefined && column.length !== cellCount) {
        throw new Error(
          `Archive simulation.extensions.economy.${field} has length ${column.length}; expected ${cellCount}`
        );
      }
    }
    if (economy.productionByBurg !== undefined) {
      assertEntityKeyedRecord(
        economy.productionByBurg,
        world.pack.burgs,
        "simulation.extensions.economy.productionByBurg"
      );
      for (const [burgId, production] of Object.entries(economy.productionByBurg as Record<string, unknown>)) {
        assertArray(production, `simulation.extensions.economy.productionByBurg.${burgId}`);
      }
    }
  }

  const nobility = simulation.extensions.nobility;
  if (nobility) {
    for (const field of ["rulerIdByState", "conflictAuthorizationsByState"]) {
      const values = nobility[field];
      if (values === undefined) continue;
      assertEntityKeyedRecord(values, world.pack.states, `simulation.extensions.nobility.${field}`);
      if (field === "rulerIdByState") {
        for (const [stateId, rulerId] of Object.entries(values as Record<string, unknown>)) {
          assertNonNegativeInteger(rulerId, `simulation.extensions.nobility.rulerIdByState.${stateId}`);
        }
      }
    }
  }

  const shipbuilding = simulation.extensions.shipbuilding;
  if (shipbuilding?.runtimeState !== undefined) {
    assertRecord(shipbuilding.runtimeState, "simulation.extensions.shipbuilding.runtimeState");
    const runtimeState = shipbuilding.runtimeState;
    for (const field of ["queues", "surplusQueues", "stateTechPoints", "completedHulls", "hulls"]) {
      assertRecord(runtimeState[field], `simulation.extensions.shipbuilding.runtimeState.${field}`);
    }
    assertNonNegativeInteger(runtimeState.nextHullId, "simulation.extensions.shipbuilding.runtimeState.nextHullId");
  }
}

function getSlice(slices: ExtensionStateSlices, extensionId: string): Record<string, unknown> {
  const existing = slices[extensionId];
  if (existing) return existing;
  const slice: Record<string, unknown> = {};
  slices[extensionId] = slice;
  return slice;
}

function getLegacyTarget(
  world: WorldContext,
  target: ExtensionSliceDefinition["legacyTarget"]
): Record<string, unknown> | null {
  const legacyTarget = target === "pack" ? world.pack : world.pack.cells;
  return legacyTarget ? (legacyTarget as unknown as Record<string, unknown>) : null;
}

function getEntities(world: WorldContext, target: ExtensionEntitySliceDefinition["legacyTarget"]): unknown[] {
  const entities = target === "burgs" ? world.pack.burgs : world.pack.states;
  return entities ?? [];
}

function getEntityId(entity: Record<string, unknown>, index: number): number | null {
  const value = entity.i;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  return index > 0 ? index : null;
}

function getEntityValues(slice: Record<string, unknown>, field: string): Record<number, unknown> {
  const existing = slice[field];
  if (isRecord(existing)) return existing as Record<number, unknown>;
  const values: Record<number, unknown> = {};
  slice[field] = values;
  return values;
}

/**
 * Projects legacy extension fields from namespaced simulation slices. The
 * projection is reapplied after graph replacement and archive replacement;
 * assigning a legacy field updates only the extension's owned slice.
 */
export function bindExtensionStateSlices(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.extensions || !isRecord(simulation.extensions)) simulation.extensions = {};

  for (const definition of EXTENSION_SLICE_DEFINITIONS) {
    const target = getLegacyTarget(world, definition.legacyTarget);
    if (!target) continue;
    const descriptor = Object.getOwnPropertyDescriptor(target, definition.legacyField);
    const legacyValue = descriptor && "value" in descriptor ? descriptor.value : undefined;
    const slice = getSlice(simulation.extensions, definition.extensionId);
    const nextValue = legacyValue ?? slice[definition.legacyField] ?? definition.defaultValue();
    slice[definition.legacyField] = nextValue;

    Object.defineProperty(target, definition.legacyField, {
      configurable: true,
      enumerable: true,
      get: () => slice[definition.legacyField],
      set: value => {
        slice[definition.legacyField] = value;
      }
    });
  }

  for (const definition of EXTENSION_ENTITY_SLICE_DEFINITIONS) {
    const slice = getSlice(simulation.extensions, definition.extensionId);
    const values = getEntityValues(slice, definition.sliceField);

    getEntities(world, definition.legacyTarget).forEach((entity, index) => {
      if (!isRecord(entity)) return;
      const entityId = getEntityId(entity, index);
      if (entityId === null) return;
      const descriptor = Object.getOwnPropertyDescriptor(entity, definition.legacyField);
      const legacyValue = descriptor && "value" in descriptor ? descriptor.value : undefined;
      if (legacyValue !== undefined || !Object.hasOwn(values, entityId)) {
        values[entityId] = legacyValue ?? definition.defaultValue();
      }

      Object.defineProperty(entity, definition.legacyField, {
        configurable: true,
        enumerable: true,
        get: () => values[entityId],
        set: value => {
          values[entityId] = value;
        }
      });
    });
  }
}

/** Starts a fresh map without retaining prior-world extension state. */
export function resetExtensionStateSlices(simulation: SimulationContext): void {
  simulation.extensions = {};
}

/** Removes only mirrors whose namespaced slice was present in the snapshot. */
export function removeExtensionStateSliceMirrors(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.extensions || !isRecord(simulation.extensions)) return;

  for (const definition of EXTENSION_SLICE_DEFINITIONS) {
    const slice = simulation.extensions[definition.extensionId];
    if (!slice || !(definition.legacyField in slice)) continue;
    const target = getLegacyTarget(world, definition.legacyTarget);
    if (target) delete target[definition.legacyField];
  }

  for (const definition of EXTENSION_ENTITY_SLICE_DEFINITIONS) {
    const slice = simulation.extensions[definition.extensionId];
    if (!slice) continue;
    const values = slice[definition.sliceField];
    if (!isRecord(values)) continue;

    getEntities(world, definition.legacyTarget).forEach((entity, index) => {
      if (!isRecord(entity)) return;
      const entityId = getEntityId(entity, index);
      if (entityId !== null && Object.hasOwn(values, entityId)) delete entity[definition.legacyField];
    });
  }
}
