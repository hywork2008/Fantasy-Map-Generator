import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { PresentationData } from "./presentationData";

/** Immutable values that may cross from the host runtime into a dynamic extension. */
export type ExtensionReadValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | ExtensionReadRecord
  | ExtensionReadList
  | ExtensionReadNumericColumn;

/** A frozen plain-record snapshot with no mutable object reachable from it. */
export interface ExtensionReadRecord {
  has(key: string): boolean;
  get(key: string): ExtensionReadValue;
  keys(): readonly string[];
  entries(): IterableIterator<readonly [string, ExtensionReadValue]>;
}

/** An immutable entity-table / sequence facade. */
export interface ExtensionReadList {
  readonly length: number;
  get(index: number): ExtensionReadValue;
  values(): IterableIterator<ExtensionReadValue>;
  entries(): IterableIterator<readonly [number, ExtensionReadValue]>;
}

/** A copied dense numeric column; its backing TypedArray never leaves the host. */
export interface ExtensionReadNumericColumn {
  readonly length: number;
  get(index: number): number | undefined;
  copyRange(start?: number, end?: number): readonly number[];
}

/** Immutable dynamic-extension snapshot, refreshed after every runtime commit. */
export interface ExtensionWorldReadView {
  readonly revision: number;
  readonly topicRevisions: Readonly<Record<string, number>>;
  readonly world: ExtensionReadRecord;
  readonly simulation: ExtensionReadRecord;
  readonly presentation: ExtensionReadRecord;
}

type NumericTypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float16Array
  | Float32Array
  | Float64Array;

function isNumericTypedArray(value: unknown): value is NumericTypedArray {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

class SnapshotRecord implements ExtensionReadRecord {
  readonly #values = new Map<string, ExtensionReadValue>();

  static fromObject(value: object, seen: WeakMap<object, ExtensionReadValue>): ExtensionReadRecord {
    const record = new SnapshotRecord();
    seen.set(value, record);
    for (const [key, entry] of Object.entries(value)) record.#values.set(key, snapshotValue(entry, seen));
    return Object.freeze(record);
  }

  has(key: string): boolean {
    return this.#values.has(key);
  }

  get(key: string): ExtensionReadValue {
    return this.#values.get(key);
  }

  keys(): readonly string[] {
    return Object.freeze([...this.#values.keys()]);
  }

  *entries(): IterableIterator<readonly [string, ExtensionReadValue]> {
    for (const entry of this.#values) yield Object.freeze([entry[0], entry[1]] as const);
  }
}

class SnapshotList implements ExtensionReadList {
  readonly #values: ExtensionReadValue[] = [];

  static fromIterable(
    value: Iterable<unknown>,
    source: object,
    seen: WeakMap<object, ExtensionReadValue>
  ): ExtensionReadList {
    const list = new SnapshotList();
    seen.set(source, list);
    for (const entry of value) list.#values.push(snapshotValue(entry, seen));
    return Object.freeze(list);
  }

  static fromMap(value: Map<unknown, unknown>, seen: WeakMap<object, ExtensionReadValue>): ExtensionReadList {
    const list = new SnapshotList();
    seen.set(value, list);
    for (const [key, entry] of value) {
      const pair = new SnapshotList();
      pair.#values.push(snapshotValue(key, seen), snapshotValue(entry, seen));
      list.#values.push(Object.freeze(pair));
    }
    return Object.freeze(list);
  }

  get length(): number {
    return this.#values.length;
  }

  get(index: number): ExtensionReadValue {
    return Number.isInteger(index) && index >= 0 ? this.#values[index] : undefined;
  }

  *values(): IterableIterator<ExtensionReadValue> {
    yield* this.#values;
  }

  *entries(): IterableIterator<readonly [number, ExtensionReadValue]> {
    for (const [index, value] of this.#values.entries()) yield Object.freeze([index, value] as const);
  }
}

class SnapshotNumericColumn implements ExtensionReadNumericColumn {
  readonly #values: readonly number[];

  constructor(source: NumericTypedArray) {
    this.#values = Object.freeze(Array.from(source));
  }

  get length(): number {
    return this.#values.length;
  }

  get(index: number): number | undefined {
    return Number.isInteger(index) && index >= 0 ? this.#values[index] : undefined;
  }

  copyRange(start = 0, end = this.#values.length): readonly number[] {
    return Object.freeze(this.#values.slice(start, end));
  }
}

function snapshotValue(value: unknown, seen: WeakMap<object, ExtensionReadValue>): ExtensionReadValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();

  const objectValue = value as object;
  const prior = seen.get(objectValue);
  if (prior) return prior;

  if (isNumericTypedArray(value)) {
    const column = Object.freeze(new SnapshotNumericColumn(value));
    seen.set(objectValue, column);
    return column;
  }
  if (Array.isArray(value) || value instanceof Set) {
    return SnapshotList.fromIterable(value, objectValue, seen);
  }
  if (value instanceof Map) {
    return SnapshotList.fromMap(value, seen);
  }

  return SnapshotRecord.fromObject(objectValue, seen);
}

function snapshotRecord(value: object): ExtensionReadRecord {
  const snapshot = snapshotValue(value, new WeakMap());
  if (snapshot instanceof SnapshotRecord) return snapshot;
  throw new Error("Expected a record while building a dynamic extension read model");
}

export function createExtensionWorldReadView(
  revision: number,
  topicRevisions: Readonly<Record<string, number>>,
  world: WorldContext,
  simulation: SimulationContext,
  presentation: PresentationData
): ExtensionWorldReadView {
  return Object.freeze({
    revision,
    topicRevisions: Object.freeze({ ...topicRevisions }),
    world: snapshotRecord(world),
    simulation: snapshotRecord(simulation),
    presentation: snapshotRecord(presentation)
  });
}
