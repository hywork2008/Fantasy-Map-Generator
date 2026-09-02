import { clone } from "./mesh";
import type { CityDocument, CityElement, CityGate, Edge, Face, Id, Vertex } from "./types";

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
  /** Rebuilt state at `cursor`, kept so `commit` can diff in O(changed keys). */
  private live: CityDocument;
  /** Rebuilt state at `cursor - 1`, the base an `amendTop` re-diffs against. */
  private base: CityDocument;

  constructor(initial: CityDocument, label = "Initial state", checkpointInterval?: number) {
    this.checkpointInterval = Math.max(2, Math.round(checkpointInterval ?? defaultCheckpointInterval(initial)));
    // `clone(initial)` gives this history its own object graph, independent of
    // whatever the caller does with `initial` afterwards. From here on every
    // mutator in mesh.ts/features.ts (and CityEditorPage's own ward-paint
    // copy-on-write) treats a CityDocument as immutable — clone-then-return,
    // never mutate-in-place — so `seed` can safely be *shared* (not
    // re-cloned) across checkpoints/live/base below: nothing will ever touch
    // it again in place. See commit()/amendTop() for why this matters.
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
    return clone(this.live);
  }

  /** Oldest state first; the entry at `index` is the one currently shown. */
  get entries(): HistoryEntry[] {
    return this.entryList.map(entry => ({ ...entry }));
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
 * keys of the three mesh maps are stored; the small top-level sections are kept
 * whole when they differ.
 */
interface DocPatch {
  frame?: CityDocument["frame"];
  vertices?: RecordPatch<Vertex>;
  edges?: RecordPatch<Edge>;
  faces?: RecordPatch<Face>;
  featureGroups?: CityDocument["featureGroups"];
  gates?: CityGate[];
  elements?: CityElement[];
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
  if (!equal(previous.frame, next.frame)) patch.frame = clone(next.frame);
  const vertices = diffRecord(previous.mesh.vertices, next.mesh.vertices);
  if (vertices) patch.vertices = vertices;
  const edges = diffRecord(previous.mesh.edges, next.mesh.edges);
  if (edges) patch.edges = edges;
  const faces = diffRecord(previous.mesh.faces, next.mesh.faces);
  if (faces) patch.faces = faces;
  if (!equal(previous.featureGroups, next.featureGroups)) patch.featureGroups = clone(next.featureGroups);
  const previousGates = previous.gates ?? [];
  const nextGates = next.gates ?? [];
  if (!equal(previousGates, nextGates)) patch.gates = clone(nextGates);
  const previousElements = previous.elements ?? [];
  const nextElements = next.elements ?? [];
  if (!equal(previousElements, nextElements)) patch.elements = clone(nextElements);
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
  if (patch.frame) document.frame = clone(patch.frame);
  applyRecord(document.mesh.vertices, patch.vertices);
  applyRecord(document.mesh.edges, patch.edges);
  applyRecord(document.mesh.faces, patch.faces);
  if (patch.featureGroups) document.featureGroups = clone(patch.featureGroups);
  if (patch.gates) document.gates = clone(patch.gates);
  if (patch.elements) document.elements = clone(patch.elements);
}
