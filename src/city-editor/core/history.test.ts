import { describe, expect, it } from "vitest";
import { createDocument } from "./document";
import { DocumentHistory } from "./history";
import type { CityDocument } from "./types";

function withFaceCount(document: CityDocument, marker: number): CityDocument {
  // A cheap, structurally valid mutation the tests can tell apart by identity.
  const next = structuredClone(document);
  next.frame = { ...next.frame, extentMeters: marker };
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
});
