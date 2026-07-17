import type { ExtensionStateSlices, SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";

type ExtensionSliceDefinition = {
  readonly extensionId: string;
  readonly legacyTarget: "pack" | "cells";
  readonly legacyField: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
): Record<string, unknown> {
  return (target === "pack" ? world.pack : world.pack.cells) as unknown as Record<string, unknown>;
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
    delete getLegacyTarget(world, definition.legacyTarget)[definition.legacyField];
  }
}
