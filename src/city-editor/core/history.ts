import { type FixedApproachProvider, restoreFixedCrossingApproaches } from "./fixedApproachAdoption";
import { clone } from "./mesh";
import type { CityDocument, Edge, Face, Id, Vertex } from "./types";

export interface HistoryEntry {
  /** Human-readable name of the edit that produced this state. */
  label: string;
  /** Wall-clock time the state was recorded, for the History panel. */
  time: number;
}

/**
 * A linear history that stores a per-edit *delta* rather than a full document
 * snapshot. Full states are kept only at index 0 and every Nth entry
 * ("checkpoints"); any state is rebuilt by cloning the nearest earlier
 * checkpoint and replaying the deltas after it. `undo` / `redo` / `jumpTo`
 * therefore cost at most one checkpoint interval of small patch applications,
 * while a ward-paint or route-draw step costs only its handful of changed
 * mesh entries instead of ~1 MB per step.
 *
 * The public surface (`commit`, `amendTop`, `undo`, `redo`, `jumpTo`,
 * `entries`, `index`, `canUndo`, `canRedo`, `reset`) is unchanged from the
 * previous snapshot implementation.
 */
export class DocumentHistory {
  private readonly checkpointInterval: number;
  private checkpoints = new Map<number, CityDocument>();
  /** `patches[i]` transforms recorded state `i-1` into state `i`; `patches[0]`
   * is an unused placeholder for the seed. */
  private patches: (DocPatch | null)[] = [null];
  private entryList: HistoryEntry[] = [];
  private cursor = 0;
  private entryKeys: object[] = [{}];
  /** Rebuilt state at `cursor`, kept so `commit` can diff in O(changed keys). */
  private live: CityDocument;
  /** Rebuilt state at `cursor - 1`, the base an `amendTop` re-diffs against. */
  private base: CityDocument;

  constructor(
    initial: CityDocument,
    label = "Initial state",
    checkpointInterval?: number,
    private readonly fixedApproachProvider?: FixedApproachProvider
  ) {
    this.checkpointInterval = Math.max(2, Math.round(checkpointInterval ?? defaultCheckpointInterval(initial)));
    // `clone(initial)` copies the editable mesh and features. Surveyed rivers
    // and the other descriptor payloads stay shared; an edit replaces that
    // property instead of mutating it. From here on every mutator in
    // mesh.ts/features.ts (and CityEditorPage's own ward-paint copy-on-write)
    // treats a CityDocument as immutable — clone-then-return, never
    // mutate-in-place — so `seed` can safely be *shared* (not re-cloned)
    // across checkpoints/live/base below: nothing will ever touch it again
    // in place. See commit()/amendTop() for why this matters.
    const seed = clone(initial);
    this.checkpoints.set(0, seed);
    this.entryList = [{ label, time: Date.now() }];
    this.live = seed;
    this.base = seed;
  }

  commit(document: CityDocument, label = "Edit"): CityDocument {
    this.truncateAfter(this.cursor);
    const patch = diffDocument(this.live, document);
    this.cursor += 1;
    this.patches[this.cursor] = patch;
    this.entryKeys[this.cursor] = {};
    this.entryList[this.cursor] = { label, time: Date.now() };
    this.base = this.live;
    // No clone: `document` is never mutated in place after this point (every
    // caller is copy-on-write), so storing the reference directly is safe —
    // and it lets diffDocument's next call short-circuit unchanged records by
    // identity (previous.mesh.vertices === next.mesh.vertices, etc.) instead
    // of walking and JSON.stringify-comparing every entry. On a Large mesh a
    // single-cell ward paint touches one face; before this, every commit paid
    // for a full structuredClone of the whole document just to store `live`.
    this.live = document;
    this.checkpointIfDue();
    return document;
  }

  /**
   * Replace the current entry in place instead of pushing a new one, re-diffing
   * against the state before it. A drag that mutates the document many times
   * per gesture calls `commit` once and then `amendTop` for each further step,
   * so the whole stroke collapses to a single undo entry.
   */
  amendTop(document: CityDocument, label?: string): CityDocument {
    this.entryKeys[this.cursor] = {};
    if (this.cursor === 0) {
      // No entry to fold into: treat as reseeding the initial state.
      this.checkpoints.set(0, document);
      this.live = document;
      this.base = document;
      return document;
    }
    this.patches[this.cursor] = diffDocument(this.base, document);
    if (label !== undefined) this.entryList[this.cursor] = { ...this.entryList[this.cursor], label };
    this.live = document;
    this.checkpointIfDue();
    return document;
  }

  reset(document: CityDocument, label = "Initial state"): void {
    const seed = clone(document);
    this.checkpoints = new Map([[0, seed]]);
    this.patches = [null];
    this.entryKeys = [{}];
    this.entryList = [{ label, time: Date.now() }];
    this.cursor = 0;
    this.live = seed;
    this.base = seed;
  }

  undo(_current: CityDocument): CityDocument | null {
    return this.jumpTo(this.cursor - 1);
  }

  redo(_current: CityDocument): CityDocument | null {
    return this.jumpTo(this.cursor + 1);
  }

  /** Move to any recorded state. Returns null when the index is out of range
   * or already current, so callers can skip a needless redraw. */
  jumpTo(index: number): CityDocument | null {
    if (index < 0 || index >= this.patches.length || index === this.cursor) return null;
    this.live = this.reconstruct(index);
    this.base = index > 0 ? this.reconstruct(index - 1) : clone(this.live);
    this.cursor = index;
    const document = clone(this.live);
    if (this.fixedApproachProvider && document.fixedCrossingApproaches !== undefined) {
      const checked = restoreFixedCrossingApproaches(document, this.fixedApproachProvider);
      if ("document" in checked) return checked.document;
    }
    // A failed current check retains editable data without session authorization.
    return document;
  }

  /** Oldest state first; the entry at `index` is the one currently shown. */
  get entries(): HistoryEntry[] {
    return this.entryList.map(entry => ({ ...entry }));
  }

  /** Stable opaque identity for a recorded state; edits and branches get new keys. */
  get currentEntryKey(): object {
    return this.entryKeys[this.cursor];
  }

  get index(): number {
    return this.cursor;
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.patches.length - 1;
  }

  private checkpointIfDue(): void {
    // No clone: `this.live` is already an object nobody will mutate in place
    // (see commit()), so the checkpoint can share it directly.
    // reconstruct() clones a checkpoint before patching it, so the stored
    // reference itself is never touched.
    if (this.cursor % this.checkpointInterval === 0) this.checkpoints.set(this.cursor, this.live);
  }

  private truncateAfter(index: number): void {
    this.patches.length = index + 1;
    this.entryKeys.length = index + 1;
    this.entryList.length = index + 1;
    for (const key of [...this.checkpoints.keys()]) if (key > index) this.checkpoints.delete(key);
  }

  private reconstruct(index: number): CityDocument {
    let checkpoint = index;
    while (!this.checkpoints.has(checkpoint)) checkpoint -= 1;
    const document = clone(this.checkpoints.get(checkpoint) as CityDocument);
    for (let step = checkpoint + 1; step <= index; step += 1) {
      const patch = this.patches[step];
      if (patch) applyPatch(document, patch);
    }
    return document;
  }
}

/** Bigger meshes checkpoint less often so the retained snapshots stay bounded;
 * a small mesh can afford frequent checkpoints and keeps jumps short. */
function defaultCheckpointInterval(document: CityDocument): number {
  const size =
    Object.keys(document.mesh.vertices).length +
    Object.keys(document.mesh.edges).length +
    Object.keys(document.mesh.faces).length;
  return Math.max(20, Math.min(150, Math.round(size / 50)));
}

/** A key set to `null` was removed; otherwise it was added or changed. */
type RecordPatch<T> = Record<Id, T | null>;

/**
 * The forward-only change from one recorded state to the next. Only the touched
 * keys of the three mesh maps are stored; every other top-level key of the
 * document is diffed generically and kept whole when it differs, so a new
 * CityDocument field is recorded without touching this file.
 */
interface DocPatch {
  /** Top-level keys (other than `mesh`) added or changed, stored whole. */
  set?: Record<string, unknown>;
  /** Top-level keys (other than `mesh`) removed. */
  removed?: string[];
  vertices?: RecordPatch<Vertex>;
  edges?: RecordPatch<Edge>;
  faces?: RecordPatch<Face>;
}

function equal(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function diffRecord<T>(previous: Record<Id, T>, next: Record<Id, T>): RecordPatch<T> | undefined {
  // A copy-on-write edit (e.g. ward/sea painting) rebuilds only the mesh
  // records it actually touches, leaving the others as the exact same
  // reference. Vertices/edges are untouched by such an edit, so this turns
  // an O(mesh) walk-and-JSON.stringify into an O(1) check for them.
  if (previous === next) return undefined;
  const patch: RecordPatch<T> = {};
  let changed = false;
  for (const key of Object.keys(next)) {
    if (!(key in previous) || !equal(previous[key], next[key])) {
      patch[key] = clone(next[key]);
      changed = true;
    }
  }
  for (const key of Object.keys(previous)) {
    if (!(key in next)) {
      patch[key] = null;
      changed = true;
    }
  }
  return changed ? patch : undefined;
}

function diffDocument(previous: CityDocument, next: CityDocument): DocPatch {
  const patch: DocPatch = {};
  const prev = previous as unknown as Record<string, unknown>;
  const curr = next as unknown as Record<string, unknown>;
  for (const key of Object.keys(curr)) {
    if (key === "mesh" || curr[key] === undefined) continue;
    if (!(key in prev) || prev[key] === undefined || !equal(prev[key], curr[key])) {
      patch.set ??= {};
      patch.set[key] = clone(curr[key]);
    }
  }
  for (const key of Object.keys(prev)) {
    if (key === "mesh" || prev[key] === undefined) continue;
    if (curr[key] !== undefined) continue;
    patch.removed ??= [];
    patch.removed.push(key);
  }
  const vertices = diffRecord(previous.mesh.vertices, next.mesh.vertices);
  if (vertices) patch.vertices = vertices;
  const edges = diffRecord(previous.mesh.edges, next.mesh.edges);
  if (edges) patch.edges = edges;
  const faces = diffRecord(previous.mesh.faces, next.mesh.faces);
  if (faces) patch.faces = faces;
  return patch;
}

function applyRecord<T>(map: Record<Id, T>, patch: RecordPatch<T> | undefined): void {
  if (!patch) return;
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === null) delete map[key];
    else map[key] = clone(value);
  }
}

function applyPatch(document: CityDocument, patch: DocPatch): void {
  const target = document as unknown as Record<string, unknown>;
  if (patch.removed) for (const key of patch.removed) delete target[key];
  if (patch.set) for (const key of Object.keys(patch.set)) target[key] = clone(patch.set[key]);
  applyRecord(document.mesh.vertices, patch.vertices);
  applyRecord(document.mesh.edges, patch.edges);
  applyRecord(document.mesh.faces, patch.faces);
}
