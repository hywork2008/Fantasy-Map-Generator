import { describe, expect, it } from "vitest";
import { addOpening, moveBoundary, removeOpening, updateOpening, updateSpace } from "./commands";
import { validateDocument } from "./document";
import { generateDungeon } from "./gen/pipeline";
import { boundaryPoints, distance, hasLocks } from "./geometry";
import { DungeonHistory } from "./history";
import { DEFAULT_SETTINGS, type DungeonDocument } from "./types";

function fixture(): DungeonDocument {
  const result = generateDungeon(DEFAULT_SETTINGS);
  if (!result.ok) throw new Error("Fixture failed");
  return result.document;
}
describe("dungeon edit transactions", () => {
  it("adds, moves and removes a door without mutating the input, then undo/redoes geometry", () => {
    const document = fixture();
    const level = document.levels[0];
    const used = new Set(Object.values(level.openings).map(item => item.boundaryId));
    const wall = Object.values(level.boundaries).find(
      edge => edge.barrier === "wall" && !used.has(edge.id) && distance(...boundaryPoints(level, edge)) > 5
    )!;
    const result = addOpening(document, wall.id, 2.5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const openingId = Object.keys(result.document.levels[0].openings).find(id => !Object.hasOwn(level.openings, id))!;
    expect(Object.hasOwn(level.openings, openingId)).toBe(false);
    const moved = updateOpening(result.document, openingId, { offsetMeters: 1, widthMeters: 1 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const removed = removeOpening(moved.document, openingId);
    expect(removed.ok).toBe(true);
    const history = new DungeonHistory(document);
    history.commit(result.document, "add");
    history.commit(moved.document, "move");
    expect(history.undo()).toEqual(result.document);
    expect(history.redo()).toEqual(moved.document);
  });
  it("rejects opening overlap and out-of-bounds edits atomically", () => {
    const document = fixture();
    const before = JSON.stringify(document);
    const opening = document.levels[0].openings["o-1"];
    expect(addOpening(document, opening.boundaryId, opening.offsetMeters + opening.widthMeters / 2).ok).toBe(false);
    expect(updateOpening(document, opening.id, { widthMeters: 100 }).ok).toBe(false);
    expect(updateOpening(document, opening.id, { offsetMeters: Number.NaN }).ok).toBe(false);
    expect(moveBoundary(document, "b-1", -1000).ok).toBe(false);
    expect(JSON.stringify(document)).toBe(before);
  });
  it("moving a shared wall updates both spaces while keeping the whole document valid", () => {
    const document = fixture();
    const wall = Object.values(document.levels[0].boundaries).find(edge => {
      if (!edge.leftSpaceId || !edge.rightSpaceId) return false;
      return (
        document.levels[0].spaces[edge.leftSpaceId].kind === "room" &&
        document.levels[0].spaces[edge.rightSpaceId].kind === "room"
      );
    })!;
    const result = moveBoundary(document, wall.id, 0.25);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.levels[0].vertices[wall.a].point).not.toEqual(document.levels[0].vertices[wall.a].point);
    expect(validateDocument(result.document)).toEqual([]);
  });
  it("locks prevent physical and label edits until explicitly unlocked", () => {
    const document = fixture();
    const locked = updateSpace(document, "s-1", { locked: true });
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    expect(hasLocks(locked.document)).toBe(true);
    expect(updateSpace(locked.document, "s-1", { label: "changed" }).ok).toBe(false);
    const boundaryId = locked.document.levels[0].spaces["s-1"].boundaryRefs[0].boundaryId;
    expect(moveBoundary(locked.document, boundaryId, 0.25).ok).toBe(false);
    expect(updateSpace(locked.document, "s-1", { locked: false }).ok).toBe(true);
  });
});
