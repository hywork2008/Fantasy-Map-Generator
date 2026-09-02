import { describe, expect, it } from "vitest";
import { createDocument } from "./document";
import { DocumentHistory } from "./history";
import type { CityDocument, WardKind } from "./types";

function withFaceCount(document: CityDocument, marker: number): CityDocument {
  // A cheap, structurally valid mutation the tests can tell apart by identity.
  const next = structuredClone(document);
  next.frame = { ...next.frame, extentMeters: marker };
  return next;
}

/** Deterministic PRNG so a failing fuzz run is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Apply one structurally varied edit: a face property, a vertex move, an added
 * or removed mesh key (exercising key-order fidelity), a feature-group change,
 * or a frame tweak.
 */
function mutate(document: CityDocument, random: () => number, step: number): CityDocument {
  const next = structuredClone(document);
  const pick = <T>(values: T[]): T => values[Math.floor(random() * values.length)];
  const roll = random();
  if (roll < 0.3) {
    next.mesh.faces[pick(Object.keys(next.mesh.faces))].properties.ward = pick<WardKind | null>([
      "market",
      "park",
      "castle",
      null
    ]);
  } else if (roll < 0.55) {
    const vertex = next.mesh.vertices[pick(Object.keys(next.mesh.vertices))];
    vertex.point = [vertex.point[0] + (random() - 0.5), vertex.point[1] + (random() - 0.5)];
  } else if (roll < 0.72) {
    next.mesh.vertices[`fuzz-v${step}`] = { id: `fuzz-v${step}`, point: [step, -step], locked: false };
  } else if (roll < 0.85) {
    const injected = Object.keys(next.mesh.vertices).find(key => key.startsWith("fuzz-v"));
    if (injected) delete next.mesh.vertices[injected];
  } else if (roll < 0.95) {
    next.featureGroups.push({
      id: `fuzz-g${step}`,
      kind: "road",
      name: `Fuzz ${step}`,
      segments: [],
      style: { widthMeters: 5, color: "#000000" },
      locked: false
    });
  } else {
    next.frame = { ...next.frame, blockSizeMeters: next.frame.blockSizeMeters + 1 };
  }
  return next;
}

describe("DocumentHistory timeline", () => {
  it("records a labelled entry per commit and reports the cursor", () => {
    const base = createDocument("history-seed", 900, 110);
    const history = new DocumentHistory(base);
    history.commit(withFaceCount(base, 1), "Move vertex");
    history.commit(withFaceCount(base, 2), "Paint market ward");

    expect(history.entries.map(entry => entry.label)).toEqual(["Initial state", "Move vertex", "Paint market ward"]);
    expect(history.index).toBe(2);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("jumps to any recorded state and keeps later states redoable", () => {
    const base = createDocument("history-seed", 900, 110);
    const history = new DocumentHistory(base);
    history.commit(withFaceCount(base, 1), "Step 1");
    history.commit(withFaceCount(base, 2), "Step 2");

    const atStart = history.jumpTo(0);
    expect(atStart?.frame.extentMeters).toBe(900);
    expect(history.index).toBe(0);
    expect(history.canRedo).toBe(true);

    const backToLast = history.jumpTo(2);
    expect(backToLast?.frame.extentMeters).toBe(2);
    expect(history.canRedo).toBe(false);
  });

  it("ignores out-of-range or no-op jumps", () => {
    const base = createDocument("history-seed", 900, 110);
    const history = new DocumentHistory(base);
    history.commit(withFaceCount(base, 1), "Step 1");

    expect(history.jumpTo(1)).toBeNull();
    expect(history.jumpTo(-1)).toBeNull();
    expect(history.jumpTo(5)).toBeNull();
    expect(history.index).toBe(1);
  });

  it("drops the redo tail when committing after a jump", () => {
    const base = createDocument("history-seed", 900, 110);
    const history = new DocumentHistory(base);
    history.commit(withFaceCount(base, 1), "Step 1");
    history.commit(withFaceCount(base, 2), "Step 2");
    history.jumpTo(1);
    history.commit(withFaceCount(base, 3), "Step 3");

    expect(history.entries.map(entry => entry.label)).toEqual(["Initial state", "Step 1", "Step 3"]);
    expect(history.canRedo).toBe(false);
  });

  it("returns cloned snapshots so callers cannot mutate the timeline", () => {
    const base = createDocument("history-seed", 900, 110);
    const history = new DocumentHistory(base);
    history.commit(withFaceCount(base, 1), "Step 1");

    const first = history.jumpTo(0);
    if (first) first.frame.extentMeters = -999;
    expect(history.jumpTo(1)).not.toBeNull();
    expect(history.jumpTo(0)?.frame.extentMeters).toBe(900);
  });

  it("amendTop rewrites the current entry in place instead of pushing", () => {
    const base = createDocument("history-seed", 900, 110);
    const history = new DocumentHistory(base);
    history.commit(withFaceCount(base, 1), "Draw wall");
    const firstTime = history.entries[1].time;

    history.amendTop(withFaceCount(base, 2), "Draw wall");
    history.amendTop(withFaceCount(base, 3), "Draw wall");

    expect(history.entries).toHaveLength(2);
    expect(history.index).toBe(1);
    expect(history.entries[1].time).toBe(firstTime);
    // Undo lands on the pre-stroke state, so one drag is one undo...
    expect(history.jumpTo(0)?.frame.extentMeters).toBe(900);
    // ...and redo returns the final amended state, not an intermediate step.
    expect(history.jumpTo(1)?.frame.extentMeters).toBe(3);
  });

  it("amendTop keeps the existing label when none is given", () => {
    const base = createDocument("history-seed", 900, 110);
    const history = new DocumentHistory(base);
    history.commit(withFaceCount(base, 1), "Draw river");
    history.amendTop(withFaceCount(base, 2));

    expect(history.entries.map(entry => entry.label)).toEqual(["Initial state", "Draw river"]);
  });
});

describe("DocumentHistory delta reconstruction", () => {
  it("rebuilds every committed state exactly, key order included, across checkpoints", () => {
    const base = createDocument("history-fuzz", 700, 90);
    const history = new DocumentHistory(base, "Initial state", 7); // frequent checkpoints
    const random = seededRandom(0x1234abcd);
    const snapshots = [structuredClone(base)];

    let current = base;
    for (let step = 1; step <= 45; step += 1) {
      current = mutate(current, random, step);
      history.commit(current, `step ${step}`);
      snapshots.push(structuredClone(current));
    }
    expect(history.entries).toHaveLength(46);

    // JSON.stringify walks keys in insertion order, so an exact string match
    // also proves faces/edges/vertices kept their order through add + delete.
    const atZero = history.jumpTo(0);
    expect(JSON.stringify(atZero)).toBe(JSON.stringify(snapshots[0]));
    for (let index = 45; index >= 1; index -= 1) {
      expect(JSON.stringify(history.jumpTo(index))).toBe(JSON.stringify(snapshots[index]));
    }
    // A full walk back to the seed.
    expect(JSON.stringify(history.jumpTo(0))).toBe(JSON.stringify(snapshots[0]));
  });

  it("undo and redo step one entry at a time over a long timeline", () => {
    const base = createDocument("history-walk", 700, 90);
    const history = new DocumentHistory(base, "Initial state", 5);
    const random = seededRandom(99);
    let current = base;
    for (let step = 1; step <= 20; step += 1) {
      current = mutate(current, random, step);
      history.commit(current, `step ${step}`);
    }
    expect(history.index).toBe(20);
    for (let expected = 19; expected >= 0; expected -= 1) {
      expect(history.undo(current)?.frame).toBeDefined();
      expect(history.index).toBe(expected);
    }
    expect(history.undo(current)).toBeNull();
    for (let expected = 1; expected <= 20; expected += 1) {
      history.redo(current);
      expect(history.index).toBe(expected);
    }
    expect(history.redo(current)).toBeNull();
  });

  it("amendTop re-diffs correctly even when the entry sits on a checkpoint", () => {
    const base = createDocument("history-amend-cp", 700, 90);
    const history = new DocumentHistory(base, "Initial state", 4);
    let current = base;
    for (let step = 1; step <= 8; step += 1) {
      current = structuredClone(current);
      current.frame = { ...current.frame, blockSizeMeters: 90 + step };
      history.commit(current, "edit"); // entry 8 lands past checkpoints at 0/4/8
    }
    for (let stroke = 0; stroke < 6; stroke += 1) {
      current = structuredClone(current);
      current.frame = { ...current.frame, cityRadiusMeters: 500 + stroke };
      history.amendTop(current, "Draw wall");
    }
    expect(history.entries).toHaveLength(9);
    expect(history.entries[8].label).toBe("Draw wall");

    history.jumpTo(0);
    const atTop = history.jumpTo(8);
    expect(atTop?.frame.blockSizeMeters).toBe(98);
    expect(atTop?.frame.cityRadiusMeters).toBe(505);
    // The state before the stroke is untouched.
    expect(history.jumpTo(7)?.frame.cityRadiusMeters).toBe(base.frame.cityRadiusMeters);
  });

  it("drops the redo tail and its checkpoints when committing after a jump", () => {
    const base = createDocument("history-truncate", 700, 90);
    const history = new DocumentHistory(base, "Initial state", 3);
    const random = seededRandom(7);
    let current = base;
    for (let step = 1; step <= 12; step += 1) {
      current = mutate(current, random, step);
      history.commit(current, `step ${step}`);
    }
    history.jumpTo(4);
    const replacement = mutate(current, random, 99);
    history.commit(replacement, "diverge");

    expect(history.entries).toHaveLength(6);
    expect(history.index).toBe(5);
    expect(history.canRedo).toBe(false);
    expect(history.jumpTo(9)).toBeNull(); // the old tail is gone
    expect(JSON.stringify(history.jumpTo(0))).toBe(JSON.stringify(structuredClone(base)));
    expect(JSON.stringify(history.jumpTo(5))).toBe(JSON.stringify(replacement));
  });
});
