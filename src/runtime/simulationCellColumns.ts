import type { SimulationCellColumns, SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { PackedGraphCells } from "../types/PackedGraph";

type LegacyCellColumn =
  | "pop"
  | "capacity"
  | "children"
  | "maleAdults"
  | "femaleAdults"
  | "elders"
  | "danger"
  | "forestStock";
type DynamicColumn = Float32Array | Uint8Array;

type DynamicColumnDefinition = {
  readonly legacyField: LegacyCellColumn;
  readonly simulationField: keyof SimulationCellColumns;
  readonly create: (length: number) => DynamicColumn;
};

/**
 * The Phase 8 ownership map for cell columns that have a live simulation value.
 * Keep this list as the one compatibility adapter surface: new code must use
 * `simulationContext.cells`, never add another `pack.cells` dynamic field.
 */
export const SIMULATION_CELL_COLUMN_DEFINITIONS: readonly DynamicColumnDefinition[] = [
  { legacyField: "pop", simulationField: "population", create: length => new Float32Array(length) },
  { legacyField: "capacity", simulationField: "carryingCapacity", create: length => new Float32Array(length) },
  { legacyField: "children", simulationField: "children", create: length => new Float32Array(length) },
  { legacyField: "maleAdults", simulationField: "maleAdults", create: length => new Float32Array(length) },
  { legacyField: "femaleAdults", simulationField: "femaleAdults", create: length => new Float32Array(length) },
  { legacyField: "elders", simulationField: "elders", create: length => new Float32Array(length) },
  { legacyField: "danger", simulationField: "danger", create: length => new Uint8Array(length) },
  { legacyField: "forestStock", simulationField: "forestStock", create: length => new Float32Array(length) }
];

function isCompatibleColumn(
  value: unknown,
  length: number,
  create: DynamicColumnDefinition["create"]
): value is SimulationCellColumns[keyof SimulationCellColumns] {
  const type = create(0).constructor.name;
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    value.constructor.name === type &&
    (value as unknown as { readonly length: number }).length === length
  );
}

function readLegacyColumn(cells: PackedGraphCells, field: LegacyCellColumn): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(cells, field);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function createEmptySimulationColumns(): SimulationCellColumns {
  return {
    population: new Float32Array(),
    carryingCapacity: new Float32Array(),
    children: new Float32Array(),
    maleAdults: new Float32Array(),
    femaleAdults: new Float32Array(),
    elders: new Float32Array(),
    danger: new Uint8Array(),
    forestStock: new Float32Array()
  };
}

/**
 * Connects legacy `pack.cells` names to the simulation-owned columns.
 *
 * Existing writers can continue assigning `pack.cells.pop` during the
 * migration, but the assignment immediately replaces the simulation column.
 * The adapter is reapplied whenever a legacy operation replaces `pack.cells`.
 */
export function bindSimulationCellColumns(world: WorldContext, simulation: SimulationContext): void {
  const cells = world.pack.cells;
  // Narrow fixtures and pre-generation contexts do not have a pack topology
  // yet. There is no dynamic column to own until `cells.i` exists.
  if (!cells) return;
  const indices = cells.i as unknown;
  if (!ArrayBuffer.isView(indices) || indices instanceof DataView) return;
  const length = (indices as unknown as { readonly length: number }).length;
  // Schema 1 archives created before Phase 8 have their dynamic columns only
  // under pack.cells. Materialize the new owner before adopting those values.
  if (!simulation.cells) simulation.cells = createEmptySimulationColumns();
  const simulationColumns = simulation.cells as Record<keyof SimulationCellColumns, DynamicColumn>;

  for (const definition of SIMULATION_CELL_COLUMN_DEFINITIONS) {
    const legacyValue = readLegacyColumn(cells, definition.legacyField);
    const simulationValue = simulationColumns[definition.simulationField];
    const isNewForestStock =
      definition.legacyField === "forestStock" &&
      !isCompatibleColumn(legacyValue, length, definition.create) &&
      !isCompatibleColumn(simulationValue, length, definition.create);
    const next = isCompatibleColumn(legacyValue, length, definition.create)
      ? legacyValue
      : isCompatibleColumn(simulationValue, length, definition.create)
        ? simulationValue
        : definition.create(length);

    // Archives written before forestStock existed have the static capacity but
    // no live timber column. Treat them as intact forest instead of silently
    // turning every historical forest cell into bare land on load.
    if (isNewForestStock) {
      const stock = next as Float32Array;
      const capacity = cells.forestCover;
      for (let cellId = 0; cellId < length; cellId++) {
        stock[cellId] = Math.max(0, Math.min(1, capacity?.[cellId] ?? 0));
      }
    }

    simulationColumns[definition.simulationField] = next;
    Object.defineProperty(cells, definition.legacyField, {
      configurable: true,
      enumerable: true,
      get: () => simulationColumns[definition.simulationField],
      set: value => {
        if (!isCompatibleColumn(value, cells.i.length, definition.create)) {
          throw new TypeError(`pack.cells.${definition.legacyField} must match the current topology cell count`);
        }
        simulationColumns[definition.simulationField] = value;
      }
    });
  }
}

/** Removes compatibility mirror values from an archive map payload. */
export function removeSimulationCellColumnMirrors(world: WorldContext, simulation: SimulationContext): void {
  const cells = world.pack.cells;
  if (!cells) return;
  const indices = cells.i as unknown;
  if (!ArrayBuffer.isView(indices) || indices instanceof DataView || !simulation.cells) return;
  const length = (indices as unknown as { readonly length: number }).length;
  const simulationColumns = simulation.cells as Record<keyof SimulationCellColumns, DynamicColumn>;
  if (
    !SIMULATION_CELL_COLUMN_DEFINITIONS.every(definition =>
      isCompatibleColumn(simulationColumns[definition.simulationField], length, definition.create)
    )
  ) {
    return;
  }
  const legacyCells = cells as unknown as Record<string, unknown>;
  for (const definition of SIMULATION_CELL_COLUMN_DEFINITIONS) delete legacyCells[definition.legacyField];
}
