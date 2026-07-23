import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import {
  createExtensionWorldReadView,
  type ExtensionReadList,
  type ExtensionReadNumericColumn,
  type ExtensionReadRecord,
  type ExtensionReadValue
} from "./extensionReadModel";
import { createPresentationData } from "./presentationData";

function asRecord(value: ExtensionReadValue): ExtensionReadRecord {
  if (!value || typeof value !== "object" || !("get" in value) || !("keys" in value)) {
    throw new Error("Expected ExtensionReadRecord");
  }
  return value as ExtensionReadRecord;
}

function asList(value: ExtensionReadValue): ExtensionReadList {
  if (!value || typeof value !== "object" || !("values" in value) || !("length" in value)) {
    throw new Error("Expected ExtensionReadList");
  }
  return value as ExtensionReadList;
}

function asColumn(value: ExtensionReadValue): ExtensionReadNumericColumn {
  if (!value || typeof value !== "object" || !("copyRange" in value)) {
    throw new Error("Expected ExtensionReadNumericColumn");
  }
  return value as ExtensionReadNumericColumn;
}

const MUTABLE_HOST_TYPES = new Set([
  "Array",
  "Object",
  "Map",
  "Set",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "ArrayBuffer",
  "DataView"
]);

/**
 * Depth-first walk of a public read model. Fails if a host-mutable value
 * (plain Array/Object/Map/Set/TypedArray/ArrayBuffer) is reachable.
 */
function assertNoMutableHostValue(value: ExtensionReadValue, path: string, seen: Set<object>): void {
  if (value === null || value === undefined) return;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return;

  if (typeof value !== "object") {
    throw new Error(`Unexpected primitive type at ${path}: ${typeof value}`);
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) return;
  seen.add(objectValue);

  const ctor = objectValue.constructor?.name ?? "Object";
  // Snapshot facades use custom classes (SnapshotRecord / List / NumericColumn).
  // Reject only host mutable built-ins that must never cross the dynamic boundary.
  if (MUTABLE_HOST_TYPES.has(ctor)) {
    throw new Error(`Mutable host ${ctor} reachable at ${path}`);
  }

  expect(Object.isFrozen(objectValue), `unfrozen facade at ${path}`).toBe(true);

  if ("copyRange" in objectValue && typeof (objectValue as ExtensionReadNumericColumn).copyRange === "function") {
    const column = objectValue as ExtensionReadNumericColumn;
    const copy = column.copyRange();
    expect(Array.isArray(copy) || Object.isFrozen(copy)).toBe(true);
    expect("buffer" in objectValue).toBe(false);
    return;
  }

  if ("keys" in objectValue && typeof (objectValue as ExtensionReadRecord).keys === "function") {
    const record = objectValue as ExtensionReadRecord;
    for (const key of record.keys()) {
      assertNoMutableHostValue(record.get(key), `${path}.${key}`, seen);
    }
    return;
  }

  if ("values" in objectValue && typeof (objectValue as ExtensionReadList).values === "function") {
    const list = objectValue as ExtensionReadList;
    let index = 0;
    for (const entry of list.values()) {
      assertNoMutableHostValue(entry, `${path}[${index}]`, seen);
      index++;
    }
  }
}

describe("public extension read model immutability (P3-3 / §12.4)", () => {
  it("never exposes mutable records, collections, or raw buffers from read()", () => {
    const heights = new Uint8Array([1, 2, 3]);
    const population = new Float32Array([9, 8]);
    const notes = [{ id: "n1", name: "Note", legend: "L" }];
    const world = {
      seed: "s",
      mapId: 1,
      pack: {
        burgs: [{ i: 1, name: "Alder", tags: new Set(["port"]) }],
        cells: { h: heights, routes: { 0: { 1: 2 } } },
        markers: []
      },
      grid: { points: [[0, 0]], meta: new Map([["k", "v"]]) },
      notes,
      options: { year: 1000 }
    } as unknown as WorldContext;
    const simulation = {
      currentYear: 1000,
      cells: { population },
      extensions: { economy: { goods: [{ i: 1 }] } },
      rng: { algorithm: "alea-0.9", seed: "x", state: [1, 2, 3, 4], streams: {} }
    } as unknown as SimulationContext;
    const presentation = createPresentationData();
    presentation.styles["#ocean"] = { fill: "#00f" };

    const view = createExtensionWorldReadView(7, { "map.settlements": 3 }, world, simulation, presentation);

    expect(Object.isFrozen(view)).toBe(true);
    expect(view.revision).toBe(7);

    assertNoMutableHostValue(view.world, "world", new Set());
    assertNoMutableHostValue(view.simulation, "simulation", new Set());
    assertNoMutableHostValue(view.presentation, "presentation", new Set());

    // Host mutation must not rewrite a prior snapshot leaf.
    heights[0] = 99;
    population[0] = 0;
    notes[0].name = "Mutated";
    const pack = asRecord(view.world.get("pack"));
    const cells = asRecord(pack.get("cells"));
    expect(asColumn(cells.get("h")).get(0)).toBe(1);
    const simCells = asRecord(view.simulation.get("cells"));
    expect(asColumn(simCells.get("population")).get(0)).toBe(9);
    const noteList = asList(view.world.get("notes"));
    expect(asRecord(noteList.get(0)).get("name")).toBe("Note");

    // Facades refuse collection mutation APIs.
    const burgs = asList(pack.get("burgs"));
    expect("push" in burgs).toBe(false);
    expect("splice" in burgs).toBe(false);
    expect(Array.isArray(burgs)).toBe(false);
  });

  it("copies numeric columns so callers cannot reach the host TypedArray buffer", () => {
    const source = new Float32Array([1.5, 2.5, 3.5]);
    const world = { pack: { cells: { pop: source } } } as unknown as WorldContext;
    const simulation = { cells: {} } as unknown as SimulationContext;
    const view = createExtensionWorldReadView(0, {}, world, simulation, createPresentationData());

    const column = asColumn(asRecord(asRecord(view.world.get("pack")).get("cells")).get("pop"));
    const range = column.copyRange(0, 2);
    expect(range).toEqual([1.5, 2.5]);
    expect(Object.isFrozen(range)).toBe(true);

    source[0] = 100;
    expect(column.get(0)).toBe(1.5);
    expect(column.copyRange()).toEqual([1.5, 2.5, 3.5]);
  });
});
